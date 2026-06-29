import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';

import { config } from '../config.js';
import * as userRepo from '../db/repositories/user.repo.js';
import * as sessionRepo from '../db/repositories/session.repo.js';
import { logger } from '../utils/logger.js';

const COOKIE_NAME = 'cn_session';
const { jwtSecret, sessionDays, cookieSecure, googleClientId } = config.auth;
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// --- Token + cookie helpers ---

function signToken(user) {
    return jwt.sign({ uid: user.id }, jwtSecret, { expiresIn: `${sessionDays}d` });
}

function setAuthCookie(res, user) {
    res.cookie(COOKIE_NAME, signToken(user), {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: 'lax',
        maxAge: sessionDays * 24 * 60 * 60 * 1000,
        path: '/',
    });
}

function clearAuthCookie(res) {
    res.clearCookie(COOKIE_NAME, { path: '/' });
}

/** Verify a JWT string and return the fresh user (or null). */
async function userFromToken(token) {
    if (!token) return null;
    try {
        const { uid } = jwt.verify(token, jwtSecret);
        return await userRepo.getById(uid);
    } catch {
        return null;
    }
}

// Minimal cookie-header parser (for Socket.IO handshakes).
function parseCookies(header = '') {
    return Object.fromEntries(
        header.split(';').map((part) => {
            const idx = part.indexOf('=');
            if (idx === -1) return [part.trim(), ''];
            return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
        }).filter(([k]) => k),
    );
}

// --- Express middleware ---

/** Populate req.user from the cookie (null if not authenticated). Never blocks. */
export async function attachUser(req, _res, next) {
    req.user = await userFromToken(req.cookies?.[COOKIE_NAME]);
    next();
}

/** Guard for API routes: returns 401 JSON when not authenticated. */
export function requireAuth(req, res, next) {
    if (!req.user) {
        res.status(401).json({ error: 'Authentication required.' });
        return;
    }
    next();
}

/** Guard for HTML pages: redirect to /login when not authenticated. */
export function requireAuthPage(req, res, next) {
    if (!req.user) {
        res.redirect('/login');
        return;
    }
    next();
}

/** Authenticate a Socket.IO connection from its cookie. Returns user or null. */
export async function authenticateSocket(socket) {
    const cookies = parseCookies(socket.handshake.headers.cookie || '');
    return userFromToken(cookies[COOKIE_NAME]);
}

// --- Auth service ---

async function registerWithPassword({ email, password, name }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(name || '').trim() || cleanEmail.split('@')[0];

    if (!EMAIL_RE.test(cleanEmail)) throw new Error('A valid email is required.');
    if (!password || password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (await userRepo.findByEmail(cleanEmail)) throw new Error('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, 10);
    return userRepo.create({ email: cleanEmail, name: cleanName, passwordHash, role: 'user' });
}

async function loginWithPassword({ email, password }) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    const row = await userRepo.findRawByEmail(cleanEmail);
    if (!row || !row.password_hash) throw new Error('Invalid email or password.');

    const ok = await bcrypt.compare(String(password || ''), row.password_hash);
    if (!ok) throw new Error('Invalid email or password.');

    return userRepo.getById(row.id);
}

async function loginWithGoogle(credential) {
    if (!googleClient) throw new Error('Google Sign-In is not configured.');

    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
        throw new Error('Google account email could not be verified.');
    }

    const email = payload.email.toLowerCase();
    const googleId = payload.sub;
    const name = payload.name || email.split('@')[0];
    const avatar = payload.picture || null;

    // Match by google_id first, then by email (link), otherwise create.
    let row = await userRepo.findByGoogleId(googleId);
    if (row) return userRepo.getById(row.id);

    const existing = await userRepo.findRawByEmail(email);
    if (existing) return userRepo.linkGoogle(existing.id, googleId, avatar);

    return userRepo.create({ email, name, googleId, avatar, role: 'user' });
}

// --- Profile service (authenticated) ---

/** Verify a Google credential and return its payload (no DB side effects). */
async function verifyGoogleCredential(credential) {
    if (!googleClient) throw new Error('Google Sign-In is not configured.');
    if (!credential) throw new Error('Missing Google credential.');
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: googleClientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.email_verified) {
        throw new Error('Google account email could not be verified.');
    }
    return payload;
}

/** Update the current user's name and/or email. */
async function updateProfile(userId, { name, email }) {
    const patch = {};

    if (name !== undefined) {
        const cleanName = String(name).trim();
        if (!cleanName) throw new Error('Name cannot be empty.');
        patch.name = cleanName;
    }

    if (email !== undefined) {
        const cleanEmail = String(email).trim().toLowerCase();
        if (!EMAIL_RE.test(cleanEmail)) throw new Error('A valid email is required.');
        const owner = await userRepo.findRawByEmail(cleanEmail);
        if (owner && owner.id !== userId) throw new Error('That email is already in use.');
        patch.email = cleanEmail;
    }

    if (!Object.keys(patch).length) throw new Error('Nothing to update.');
    return userRepo.updateProfile(userId, patch);
}

/**
 * Set or change the current user's password.
 * - If the user already has a password, currentPassword is required and verified.
 * - If not (e.g. Google-only account), it sets the password without a current one.
 */
async function changePassword(userId, { currentPassword, newPassword }) {
    if (!newPassword || String(newPassword).length < 6) {
        throw new Error('New password must be at least 6 characters.');
    }

    const row = await userRepo.getRawById(userId);
    if (!row) throw new Error('User not found.');

    if (row.password_hash) {
        const ok = await bcrypt.compare(String(currentPassword || ''), row.password_hash);
        if (!ok) throw new Error('Current password is incorrect.');
    }

    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    return userRepo.setPassword(userId, passwordHash);
}

/** Link a Google account to the current user. */
async function linkGoogleAccount(userId, credential) {
    const payload = await verifyGoogleCredential(credential);
    const googleId = payload.sub;

    const owner = await userRepo.findByGoogleId(googleId);
    if (owner && owner.id !== userId) {
        throw new Error('This Google account is already linked to another user.');
    }

    return userRepo.linkGoogle(userId, googleId, payload.picture || null);
}

/** Unlink Google. Requires a password to remain so the user keeps a way in. */
async function unlinkGoogleAccount(userId) {
    const row = await userRepo.getRawById(userId);
    if (!row) throw new Error('User not found.');
    if (!row.google_id) throw new Error('No Google account is linked.');
    if (!row.password_hash) {
        throw new Error('Set a password first so you can still sign in after unlinking Google.');
    }
    return userRepo.unlinkGoogle(userId);
}

// --- Routes ---

export function registerAuthRoutes(app) {
    const handler = (fn) => (req, res) => {
        Promise.resolve(fn(req, res)).catch((error) => {
            res.status(400).json({ error: error.message });
        });
    };

    // Public config for the login page (what auth methods are enabled).
    app.get('/auth/config', (_req, res) => {
        res.json({
            googleClientId: config.auth.googleClientId || null,
            allowRegistration: config.auth.allowRegistration,
        });
    });

    app.get('/auth/me', (req, res) => {
        res.json({ user: req.user || null });
    });

    app.post('/auth/register', handler(async (req, res) => {
        if (!config.auth.allowRegistration) {
            res.status(403).json({ error: 'Registration is disabled.' });
            return;
        }
        const user = await registerWithPassword(req.body || {});
        setAuthCookie(res, user);
        res.status(201).json({ user });
    }));

    app.post('/auth/login', handler(async (req, res) => {
        const user = await loginWithPassword(req.body || {});
        setAuthCookie(res, user);
        res.json({ user });
    }));

    app.post('/auth/google', handler(async (req, res) => {
        const user = await loginWithGoogle(req.body?.credential);
        setAuthCookie(res, user);
        res.json({ user });
    }));

    app.post('/auth/logout', (_req, res) => {
        clearAuthCookie(res);
        res.json({ ok: true });
    });

    // ===== Profile (authenticated) =====

    app.patch('/auth/profile', requireAuth, handler(async (req, res) => {
        const user = await updateProfile(req.user.id, req.body || {});
        res.json({ user });
    }));

    app.post('/auth/password', requireAuth, handler(async (req, res) => {
        const user = await changePassword(req.user.id, req.body || {});
        res.json({ user });
    }));

    app.post('/auth/google/link', requireAuth, handler(async (req, res) => {
        const user = await linkGoogleAccount(req.user.id, req.body?.credential);
        res.json({ user });
    }));

    app.post('/auth/google/unlink', requireAuth, handler(async (req, res) => {
        const user = await unlinkGoogleAccount(req.user.id);
        res.json({ user });
    }));
}

// --- Seed superadmin on startup ---

export async function seedSuperadmin() {
    const { superadminEmail, superadminPassword, superadminName } = config.auth;
    const email = superadminEmail.toLowerCase();

    const existing = await userRepo.findRawByEmail(email);
    if (existing) {
        // Ensure the role is superadmin (in case it was created as a normal user).
        return existing;
    }

    const passwordHash = await bcrypt.hash(superadminPassword, 10);
    const admin = await userRepo.create({
        email,
        name: superadminName,
        passwordHash,
        role: 'superadmin',
    });
    // Adopt any pre-existing unowned bots so the superadmin can manage them.
    const adopted = await sessionRepo.assignOwnerWhereNull(admin.id);
    logger.info(`👑 Superadmin seeded (${email})${adopted ? `, adopted ${adopted} existing bot(s)` : ''}`);
    return admin;
}

export function isGoogleEnabled() {
    return Boolean(googleClient);
}
