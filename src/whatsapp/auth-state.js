import { initAuthCreds, BufferJSON, proto } from '@whiskeysockets/baileys';
import * as authRepo from '../db/repositories/auth.repo.js';

/**
 * Auth state Baileys yang disimpan di MySQL (pengganti useMultiFileAuthState).
 * Setiap akun (sessionId) punya creds + signal keys sendiri di tabel auth_state.
 */
export async function useMySQLAuthState(sessionId) {
    const writeData = (key, data) =>
        authRepo.setValue(sessionId, key, JSON.stringify(data, BufferJSON.replacer));

    const readData = async (key) => {
        const raw = await authRepo.getValue(sessionId, key);
        return raw ? JSON.parse(raw, BufferJSON.reviver) : null;
    };

    const removeData = (key) => authRepo.removeValue(sessionId, key);

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        }),
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category of Object.keys(data)) {
                        for (const id of Object.keys(data[category])) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(key, value) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                },
            },
        },
        saveCreds: () => writeData('creds', creds),
        clearAuth: () => authRepo.clear(sessionId),
    };
}
