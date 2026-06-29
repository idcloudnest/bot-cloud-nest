// Account profile management: edit name/email, set/change password,
// link/unlink Google.

import { $, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';
import { renderSidebarUser } from './session-user.js';

let googleClientId = null;
let googleReady = false; // GIS script loaded + initialized
let initialized = false;

/** Show the profile view (mode 'profile'). */
export function showProfileView() {
    store.setView('profile');

    toggle($('#emptyState'), false, 'grid');
    toggle($('#accountView'), false, 'grid');
    toggle($('#accountsListView'), false, 'grid');
    toggle($('#dashboardView'), false, 'grid');
    toggle($('#profileView'), true, 'grid');

    // Topbar: hide per-account widgets.
    toggle($('#statusPill'), false, 'inline-flex');
    toggle($('#statusUpdatedAt'), false, 'flex');
    toggle($('#btnDeleteAccount'), false, 'inline-flex');
    toggle($('#accountIdLine'), false, 'block');
    toggle($('#accountMenu'), false, 'grid');
    setText($('#currentAccountName'), 'Account Profile');

    renderProfile();
    setupGoogle();
}

/** Apply the current user to all profile widgets. */
function renderProfile() {
    const user = store.getUser();
    if (!user) return;

    // Header.
    setText($('#profileDisplayName'), user.name || user.email);
    setText($('#profileDisplayEmail'), user.email);
    setText($('#profileRoleBadge'), user.role === 'superadmin' ? 'Superadmin' : 'User');

    const avatar = $('#profileAvatar');
    if (avatar) {
        if (user.avatar) {
            avatar.style.backgroundImage = `url("${user.avatar}")`;
            avatar.textContent = '';
        } else {
            avatar.style.backgroundImage = '';
            avatar.textContent = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
        }
    }

    // Status badges.
    const pwBadge = $('#profilePasswordBadge');
    if (pwBadge) {
        pwBadge.textContent = user.hasPassword ? 'Password set' : 'No password';
        pwBadge.className = `pill ${user.hasPassword ? 'pill-success' : 'pill-warning'}`;
    }
    const gBadge = $('#profileGoogleBadge');
    if (gBadge) {
        gBadge.textContent = user.hasGoogle ? 'Google linked' : 'Google not linked';
        gBadge.className = `pill ${user.hasGoogle ? 'pill-success' : 'pill-warning'}`;
    }

    // Profile form fields.
    const nameInput = $('#profileName');
    const emailInput = $('#profileEmail');
    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';

    // Password card adapts to whether a password exists.
    const hasPw = user.hasPassword;
    setText($('#passwordCardTitle'), hasPw ? 'Change Password' : 'Set Password');
    setText($('#passwordCardHint'), hasPw
        ? 'Enter your current password and a new one.'
        : 'Set a password so you can sign in with email + password.');
    setText($('#passwordSubmit'), hasPw ? 'Change Password' : 'Set Password');
    toggle($('#currentPasswordField'), hasPw, 'grid');

    // Google connection card.
    renderGoogleState();
}

function renderGoogleState() {
    const user = store.getUser();
    const linked = Boolean(user?.hasGoogle);
    const configured = Boolean(googleClientId);

    const badge = $('#googleStateBadge');
    if (badge) {
        badge.textContent = linked ? 'Connected' : 'Not connected';
        badge.className = `pill ${linked ? 'pill-success' : 'pill-warning'}`;
    }

    toggle($('#googleLinkedBox'), linked, 'flex');
    toggle($('#googleUnlinkedBox'), !linked, 'grid');

    // When not linked: show the GIS button (if configured) or a hint.
    if (!linked) {
        toggle($('#profileGoogleBtn'), configured, 'block');
        toggle($('#googleLinkHint'), configured, 'block');
        toggle($('#googleDisabledHint'), !configured, 'block');
    }
}

// --- Google Identity Services (link flow) ---

function loadScript(src) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) return resolve();
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function setupGoogle() {
    // Already prepared or no client id -> just refresh the visible state.
    if (googleReady || googleClientId === '') {
        renderGoogleState();
        return;
    }

    try {
        const cfg = await api.authConfig();
        googleClientId = cfg.googleClientId || '';
    } catch {
        googleClientId = '';
    }

    renderGoogleState();
    if (!googleClientId) return;

    try {
        await loadScript('https://accounts.google.com/gsi/client');
        window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: handleGoogleCredential,
        });
        window.google.accounts.id.renderButton($('#profileGoogleBtn'), {
            theme: 'outline',
            size: 'large',
            width: 280,
            text: 'continue_with',
        });
        googleReady = true;
    } catch {
        // Script blocked — leave the hint visible.
    }
}

async function handleGoogleCredential(response) {
    setFeedback('#googleFeedback', '');
    try {
        const { user } = await api.linkGoogle(response.credential);
        applyUser(user);
        showToast('Google account linked.', 'success');
    } catch (err) {
        setFeedback('#googleFeedback', err.message, true);
        showToast(err.message || 'Failed to link Google.', 'error');
    }
}

// --- Helpers ---

function setFeedback(sel, message, isError = false) {
    const el = $(sel);
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('feedback-error', Boolean(message) && isError);
    el.classList.toggle('feedback-ok', Boolean(message) && !isError);
}

/** Update store + every place the user is displayed. */
function applyUser(user) {
    if (!user) return;
    store.setUser(user);
    renderSidebarUser(user);
    renderProfile();
}

// --- Init: wire forms ---

export function initProfile() {
    if (initialized) return;
    initialized = true;

    // Sidebar chip -> open profile.
    $('#sidebarUser')?.addEventListener('click', (e) => {
        if (e.target.closest('#logoutButton')) return; // don't hijack logout
        window.location.hash = '#profile';
    });

    // Profile details.
    $('#profileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        setFeedback('#profileFeedback', '');
        const name = $('#profileName').value.trim();
        const email = $('#profileEmail').value.trim();
        try {
            const { user } = await api.updateProfile({ name, email });
            applyUser(user);
            setFeedback('#profileFeedback', 'Profile updated.');
            showToast('Profile updated.', 'success');
        } catch (err) {
            setFeedback('#profileFeedback', err.message, true);
            showToast(err.message || 'Failed to update profile.', 'error');
        }
    });

    // Password.
    $('#passwordForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        setFeedback('#passwordFeedback', '');
        const hasPw = Boolean(store.getUser()?.hasPassword);
        const currentPassword = $('#currentPassword').value;
        const newPassword = $('#newPassword').value;
        const confirmPassword = $('#confirmPassword').value;

        if (newPassword.length < 6) {
            setFeedback('#passwordFeedback', 'New password must be at least 6 characters.', true);
            return;
        }
        if (newPassword !== confirmPassword) {
            setFeedback('#passwordFeedback', 'Password confirmation does not match.', true);
            return;
        }

        try {
            const body = { newPassword };
            if (hasPw) body.currentPassword = currentPassword;
            const { user } = await api.changePassword(body);
            applyUser(user);
            $('#passwordForm').reset();
            setFeedback('#passwordFeedback', hasPw ? 'Password changed.' : 'Password set.');
            showToast('Password saved.', 'success');
        } catch (err) {
            setFeedback('#passwordFeedback', err.message, true);
            showToast(err.message || 'Failed to save password.', 'error');
        }
    });

    // Unlink Google.
    $('#googleUnlinkBtn')?.addEventListener('click', async () => {
        setFeedback('#googleFeedback', '');
        try {
            const { user } = await api.unlinkGoogle();
            applyUser(user);
            showToast('Google account unlinked.', 'success');
        } catch (err) {
            setFeedback('#googleFeedback', err.message, true);
            showToast(err.message || 'Failed to unlink Google.', 'error');
        }
    });
}
