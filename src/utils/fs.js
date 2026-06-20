// src/utils/fs.js
import fs from "fs/promises";

export async function removeDirSafe(path) {
    try {
        await fs.rm(path, {
            recursive: true,
            force: true
        });
    } catch (error) {
        console.error(`[FS] Failed to remove ${path}:`, error.message);
    }
}
