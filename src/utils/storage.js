import fs from 'node:fs';
import path from 'node:path';

const storageDir = path.resolve('storage');

export function ensureStorageDir() {
    if (!fs.existsSync(storageDir)) {
        fs.mkdirSync(storageDir, { recursive: true });
    }
}

export function readJson(filename, fallback) {
    try {
        ensureStorageDir();

        const filePath = path.join(storageDir, filename);

        if (!fs.existsSync(filePath)) {
            return fallback;
        }

        const raw = fs.readFileSync(filePath, 'utf-8');

        if (!raw) {
            return fallback;
        }

        return JSON.parse(raw);
    } catch (error) {
        console.error(`Failed read storage ${filename}:`, error.message);
        return fallback;
    }
}

export function writeJson(filename, data) {
    try {
        ensureStorageDir();

        const filePath = path.join(storageDir, filename);
        const tempPath = `${filePath}.tmp`;

        fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
        fs.renameSync(tempPath, filePath);
    } catch (error) {
        console.error(`Failed write storage ${filename}:`, error.message);
    }
}
