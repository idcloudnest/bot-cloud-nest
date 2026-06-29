import { getPool } from './pool.js';
import { logger } from '../utils/logger.js';

// Table schema. Run at startup; idempotent (CREATE TABLE IF NOT EXISTS).
const STATEMENTS = [
    // Application users (dashboard login). Owns WhatsApp accounts.
    `CREATE TABLE IF NOT EXISTS users (
        id            VARCHAR(40)   NOT NULL,
        email         VARCHAR(191)  NOT NULL,
        name          VARCHAR(191)  NOT NULL,
        password_hash VARCHAR(255)  NULL,
        google_id     VARCHAR(64)   NULL,
        avatar        VARCHAR(512)  NULL,
        role          VARCHAR(20)   NOT NULL DEFAULT 'user',
        created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email),
        UNIQUE KEY uq_users_google (google_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // WhatsApp account registry (one row per account/session).
    `CREATE TABLE IF NOT EXISTS sessions (
        id              VARCHAR(64)   NOT NULL,
        name            VARCHAR(191)  NOT NULL,
        owner_id        VARCHAR(40)   NULL,
        connection      VARCHAR(32)   NOT NULL DEFAULT 'idle',
        connected       TINYINT(1)    NOT NULL DEFAULT 0,
        message         VARCHAR(255)  NULL,
        last_error      TEXT          NULL,
        device          JSON          NULL,
        ignore_groups   TINYINT(1)    NOT NULL DEFAULT 0,
        ignore_privates TINYINT(1)    NOT NULL DEFAULT 0,
        log_limit       INT           NOT NULL DEFAULT 100,
        created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_sessions_owner (owner_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // Baileys auth state (creds + signal keys) per account.
    `CREATE TABLE IF NOT EXISTS auth_state (
        session_id  VARCHAR(64)  NOT NULL,
        data_key    VARCHAR(255) NOT NULL,
        data_value  LONGTEXT     NOT NULL,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, data_key),
        CONSTRAINT fk_auth_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // Conversation state (bot flow) per account + jid.
    `CREATE TABLE IF NOT EXISTS conversations (
        session_id  VARCHAR(64)  NOT NULL,
        jid         VARCHAR(191) NOT NULL,
        step        VARCHAR(64)  NULL,
        data        JSON         NULL,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, jid),
        CONSTRAINT fk_conv_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // Message/activity log per account.
    `CREATE TABLE IF NOT EXISTS logs (
        id          VARCHAR(32)  NOT NULL,
        session_id  VARCHAR(64)  NOT NULL,
        type        VARCHAR(32)  NOT NULL,
        jid         VARCHAR(191) NULL,
        payload     JSON         NULL,
        created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_logs_session_created (session_id, created_at),
        CONSTRAINT fk_logs_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // Group moderation: per (account, group, user) warning counter.
    `CREATE TABLE IF NOT EXISTS group_warnings (
        session_id  VARCHAR(64)  NOT NULL,
        group_jid   VARCHAR(191) NOT NULL,
        user_jid    VARCHAR(191) NOT NULL,
        count       INT          NOT NULL DEFAULT 0,
        reason      VARCHAR(255) NULL,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, group_jid, user_jid),
        CONSTRAINT fk_warn_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // Group moderation: blacklisted users (auto-kicked if they rejoin).
    `CREATE TABLE IF NOT EXISTS group_blacklist (
        session_id  VARCHAR(64)  NOT NULL,
        group_jid   VARCHAR(191) NOT NULL,
        user_jid    VARCHAR(191) NOT NULL,
        reason      VARCHAR(255) NULL,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, group_jid, user_jid),
        CONSTRAINT fk_blacklist_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
];

/**
 * Migrate the old `logs` table: change the id column from BIGINT AUTO_INCREMENT
 * to VARCHAR (id generated by the application). Idempotent: only runs while the
 * column is still auto_increment / an integer type.
 */
async function migrateLogsIdColumn(pool) {
    const [rows] = await pool.query(
        `SELECT DATA_TYPE AS dataType, EXTRA AS extra
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'logs' AND COLUMN_NAME = 'id'
         LIMIT 1`,
    );
    const col = rows[0];
    if (!col) return;

    const isAutoIncrement = String(col.extra || '').toLowerCase().includes('auto_increment');
    const isIntType = String(col.dataType || '').toLowerCase().includes('int');
    if (isAutoIncrement || isIntType) {
        // Drop AUTO_INCREMENT + change type to VARCHAR(32). Old numeric ids are
        // automatically converted to strings.
        await pool.query('ALTER TABLE logs MODIFY id VARCHAR(32) NOT NULL');
        logger.info('🔧 Migration: logs.id column changed to VARCHAR (generated id)');
    }
}

/** Add the sessions.owner_id column to pre-existing databases (idempotent). */
async function migrateSessionsOwnerColumn(pool) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'owner_id'
         LIMIT 1`,
    );
    if (rows.length === 0) {
        await pool.query('ALTER TABLE sessions ADD COLUMN owner_id VARCHAR(40) NULL AFTER name');
        await pool.query('ALTER TABLE sessions ADD KEY idx_sessions_owner (owner_id)');
        logger.info('🔧 Migration: sessions.owner_id column added');
    }
}

/** Add the sessions.features column to pre-existing databases (idempotent). */
async function migrateSessionsFeaturesColumn(pool) {
    const [rows] = await pool.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sessions' AND COLUMN_NAME = 'features'
         LIMIT 1`,
    );
    if (rows.length === 0) {
        await pool.query('ALTER TABLE sessions ADD COLUMN features JSON NULL AFTER log_limit');
        logger.info('🔧 Migration: sessions.features column added');
    }
}

export async function migrate() {
    const pool = getPool();
    for (const sql of STATEMENTS) {
        await pool.query(sql);
    }
    await migrateLogsIdColumn(pool);
    await migrateSessionsOwnerColumn(pool);
    await migrateSessionsFeaturesColumn(pool);
    logger.info('✅ Database migrated (tables ready)');
}
