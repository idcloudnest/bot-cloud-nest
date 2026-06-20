import fs from "fs/promises";
import path from "path";

export async function removeDirSafe(dirPath) {
    try {
        // 1. Cek isi dari folder tersebut
        const files = await fs.readdir(dirPath);

        // 2. Loop dan hapus file/folder di dalamnya satu per satu
        for (const file of files) {
            const currentPath = path.join(dirPath, file);
            await fs.rm(currentPath, {
                recursive: true,
                force: true
            });
        }

        console.log(`[FS] Sukses membersihkan isi folder (Docker Safe): ${dirPath}`);
    } catch (error) {
        // Jika folder kebetulan memang tidak ada (ENOENT), abaikan saja
        if (error.code !== 'ENOENT') {
            console.error(`[FS] Gagal membersihkan ${dirPath}:`, error.message);
        }
    }
}
