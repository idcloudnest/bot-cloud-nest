import mysql from 'mysql2/promise';
import { config } from '../config.js';

let pool = null;

/** Get the MySQL connection pool (created once, lazily). */
export function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: config.db.host,
            port: config.db.port,
            database: config.db.database,
            user: config.db.user,
            password: config.db.password,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            charset: 'utf8mb4_general_ci',
            timezone: 'Z',
        });
    }
    return pool;
}

/** Run a query and return the rows. */
export async function query(sql, params = []) {
    const [rows] = await getPool().execute(sql, params);
    return rows;
}

export async function closePool() {
    if (pool) {
        await pool.end();
        pool = null;
    }
}
