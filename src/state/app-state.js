import { EventEmitter } from 'node:events';
import { readJson, writeJson } from '../utils/storage.js';
import { getAllSessions } from '../services/session.service.js';

const emitter = new EventEmitter();

const MIN_LOG_LIMIT = 10;
const MAX_LOG_LIMIT = 1000;
const DEFAULT_LOG_LIMIT = 100;

function normalizeLogLimit(value, fallback = 100) {
    const numberValue = Number(value);

    if (!Number.isFinite(numberValue)) return fallback;

    return Math.min(
        MAX_LOG_LIMIT,
        Math.max(MIN_LOG_LIMIT, Math.trunc(numberValue))
    );
}

const persistedState = readJson('app-state.json', {
    logs: [],
    settings: {},
});
function persistState() {
    writeJson('app-state.json', {
        logs: state.logs,
        settings: state.settings,
    });
}

const startedAt = new Date().toISOString();

const state = {
    status: {
        connection: 'starting',
        connected: false,
        message: 'Starting bot...',
        startedAt,
        updatedAt: startedAt,
        lastError: null,
        device: null,
    },
    qr: null,
    logs: persistedState.logs || [],
    settings: {
        ignoreGroups:
            persistedState.settings?.ignoreGroups ??
            process.env.IGNORE_GROUPS === 'true',

        ignorePrivates:
            persistedState.settings?.ignorePrivates ??
            process.env.IGNORE_PRIVATES === 'true',

        logLimit: normalizeLogLimit(
            persistedState.settings?.logLimit ||
            process.env.LOG_LIMIT ||
            DEFAULT_LOG_LIMIT
        ),
    },
};

function trimLogs() {
    state.logs = state.logs.slice(0, state.settings.logLimit);
}

export function onState(event, listener) {
    emitter.on(event, listener);
}

export function getState() {
    return {
        status: { ...state.status },
        qr: state.qr,
        logs: getLogs(),
        settings: getSettings(),
    };
}

export function getSettings() {
    return { ...state.settings };
}

export function updateSettings(payload = {}) {
    const previousLogLimit = state.settings.logLimit;

    if (typeof payload.ignoreGroups === 'boolean') {
        state.settings.ignoreGroups = payload.ignoreGroups;
    }

    if (typeof payload.ignorePrivates === 'boolean') {
        state.settings.ignorePrivates = payload.ignorePrivates;
    }

    if (payload.logLimit !== undefined) {
        state.settings.logLimit = normalizeLogLimit(
            payload.logLimit,
            state.settings.logLimit
        );
    }

    trimLogs();
    persistState();

    emitter.emit('settings', getSettings());

    if (previousLogLimit !== state.settings.logLimit) {
        emitter.emit('logs:init', getLogs());
    }

    return getSettings();
}

export function setStatus(payload = {}) {
    state.status = {
        ...state.status,
        ...payload,
        updatedAt: new Date().toISOString(),
    };

    emitter.emit('status', state.status);
    emitter.emit('state', getState());

    return state.status;
}

export function setQr(qr) {
    const updatedAt = new Date().toISOString()
    state.qr = qr;
    state.updatedAt = updatedAt;

    emitter.emit('qr', {
        qr,
        updatedAt,
        timeoutMs: qr?.timeoutMs,
        expireAt: qr?.expireAt || null
    });

    return state.qr;
}

export function notifySessionsUpdate() {
    emitter.emit('sessions:update', getAllSessions());
}

export function addLog(type, payload) {
    const item = {
        id: crypto.randomUUID(),
        type,
        payload,
        timestamp: new Date().toISOString(),
    };

    state.logs.unshift(item);
    trimLogs();
    persistState();

    emitter.emit('log', item);

    return item;
}

export function getLogs() {
    return [...state.logs];
}



export function clearLogs() {
    const clearedCount = state.logs.length;

    state.logs = [];
    persistState();

    const payload = {
        ok: true,
        clearedCount,
        timestamp: new Date().toISOString(),
    };

    emitter.emit('logs:clear', payload);

    return payload;
}

export function deleteMultipleLogs(ids) {
    const initialLength = state.logs.length;

    // Buang log yang ID-nya ada di dalam array 'ids'
    state.logs = state.logs.filter((log) => !ids.includes(log.id));

    if (state.logs.length !== initialLength) {
        persistState();
        emitter.emit('logs:deleted_multiple', { ids }); // Beritahu frontend
        return true;
    }
    return false;
}
