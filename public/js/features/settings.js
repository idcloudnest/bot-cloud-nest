import { $, setText } from '../core/dom.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';

const MIN_LIMIT = 10;
const MAX_LIMIT = 1000;

const saveButton = () => $('#saveSettingsButton');

function markDirty() {
    const btn = saveButton();
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = 'Save Settings';
}

function markSaved() {
    const btn = saveButton();
    if (!btn) return;
    btn.disabled = true;
    btn.textContent = 'Saved ✓';
}

export function renderSettings(settings = {}) {
    const ignoreGroups = $('#ignoreGroupsInput');
    const ignorePrivates = $('#ignorePrivatesInput');
    const logLimit = $('#logLimitInput');

    if (ignoreGroups) ignoreGroups.checked = Boolean(settings.ignoreGroups);
    if (ignorePrivates) ignorePrivates.checked = Boolean(settings.ignorePrivates);
    if (logLimit) logLimit.value = settings.logLimit || 100;

    setText($('#logLimitText'), `Max ${settings.logLimit || 100} logs in memory`);
}

export function initSettings() {
    ['#ignoreGroupsInput', '#ignorePrivatesInput', '#logLimitInput'].forEach((selector) => {
        const el = $(selector);
        if (!el) return;
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
    });

    $('#settingsForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const logLimit = Number($('#logLimitInput')?.value || 100);
        if (logLimit < MIN_LIMIT || logLimit > MAX_LIMIT) {
            showToast(`Log limit harus antara ${MIN_LIMIT} sampai ${MAX_LIMIT}.`, 'error');
            return;
        }

        try {
            const result = await api.updateSettings({
                ignoreGroups: $('#ignoreGroupsInput').checked,
                ignorePrivates: $('#ignorePrivatesInput').checked,
                logLimit,
            });
            renderSettings(result);
            markSaved();
            showToast(`Settings tersimpan. Log limit: ${result.logLimit}.`, 'success');
        } catch (error) {
            showToast(error.message || 'Gagal update settings.', 'error');
        }
    });
}
