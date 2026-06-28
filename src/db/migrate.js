import { getPool } from './pool.js';
import { logger } from '../utils/logger.js';

// Skema tabel. Dijalankan saat startup; idempotent (CREATE TABLE IF NOT EXISTS).
const STATEMENTS = [
    // Registry akun WhatsApp (satu baris per akun/sesi).
    `CREATE TABLE IF NOT EXISTS sessions (
        id              VARCHAR(64)   NOT NULL,
        name            VARCHAR(191)  NOT NULL,
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
        PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // Auth state Baileys (creds + signal keys) per akun.
    `CREATE TABLE IF NOT EXISTS auth_state (
        session_id  VARCHAR(64)  NOT NULL,
        data_key    VARCHAR(255) NOT NULL,
        data_value  LONGTEXT     NOT NULL,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, data_key),
        CONSTRAINT fk_auth_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // State percakapan (flow bot) per akun + jid.
    `CREATE TABLE IF NOT EXISTS conversations (
        session_id  VARCHAR(64)  NOT NULL,
        jid         VARCHAR(191) NOT NULL,
        step        VARCHAR(64)  NULL,
        data        JSON         NULL,
        updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, jid),
        CONSTRAINT fk_conv_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,

    // Log pesan/aktivitas per akun.
    `CREATE TABLE IF NOT EXISTS logs (
        id          BIGINT       NOT NULL AUTO_INCREMENT,
        session_id  VARCHAR(64)  NOT NULL,
        type        VARCHAR(32)  NOT NULL,
        jid         VARCHAR(191) NULL,
        payload     JSON         NULL,
        created_at  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_logs_session_created (session_id, created_at),
        CONSTRAINT fk_logs_session FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci`,
];

export async function migrate() {
    const pool = getPool();
    for (const sql of STATEMENTS) {
        await pool.query(sql);
    }
    logger.info('✅ Database migrated (tables ready)');
}
