import dotenv from 'dotenv';

dotenv.config();

export const config = {
    appPort: Number(process.env.APP_PORT || 3000),
    botName: process.env.BOT_NAME || 'Cloud Nest Bot',
    ignoreGroups: process.env.IGNORE_GROUPS === 'true',
    ignorePrivates: process.env.IGNORE_PRIVATES === 'true',
    logLimit: Number(process.env.LOG_LIMIT || 100),
    // QR scan timeout (seconds). Default 60s. Minimum 10s.
    qrTimeoutMs: Math.max(Number(process.env.QR_TIMEOUT_SECONDS || 60), 10) * 1000,
    // Authentication.
    auth: {
        jwtSecret: process.env.JWT_SECRET || 'change-me-in-production-please',
        // Cookie lifetime in days.
        sessionDays: Number(process.env.SESSION_DAYS || 7),
        cookieSecure: process.env.COOKIE_SECURE === 'true',
        // Seed superadmin (created on startup if it doesn't exist yet).
        superadminEmail: process.env.SUPERADMIN_EMAIL || 'admin@example.com',
        superadminPassword: process.env.SUPERADMIN_PASSWORD || 'admin123',
        superadminName: process.env.SUPERADMIN_NAME || 'Super Admin',
        // Allow public self-registration of regular users.
        allowRegistration: process.env.ALLOW_REGISTRATION !== 'false',
        // Google Sign-In (optional). Set GOOGLE_CLIENT_ID to enable.
        googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    },
    db: {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 3306),
        database: process.env.DB_DATABASE || 'bot_cloud_nest',
        user: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || '',
    },
};
