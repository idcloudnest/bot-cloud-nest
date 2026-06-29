import { $, setText } from '../core/dom.js';
import { store } from '../core/store.js';
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
    const featureStore = $('#featureStoreInput');
    const featureGroup = $('#featureGroupInput');

    if (ignoreGroups) ignoreGroups.checked = Boolean(settings.ignoreGroups);
    if (ignorePrivates) ignorePrivates.checked = Boolean(settings.ignorePrivates);
    if (logLimit) logLimit.value = settings.logLimit || 100;

    const features = settings.features || {};
    if (featureStore) featureStore.checked = features.store !== false;
    if (featureGroup) featureGroup.checked = features.group !== false;

    setText($('#logLimitText'), `Max ${settings.logLimit || 100} logs in memory`);
}

export function initSettings() {
    ['#botNameInput', '#ignoreGroupsInput', '#ignorePrivatesInput', '#logLimitInput', '#featureStoreInput', '#featureGroupInput'].forEach((selector) => {
        const el = $(selector);
        if (!el) return;
        el.addEventListener('input', markDirty);
        el.addEventListener('change', markDirty);
    });

    $('#settingsForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const id = store.getCurrent();
        if (!id) return;

        const logLimit = Number($('#logLimitInput')?.value || 100);
        if (logLimit < MIN_LIMIT || logLimit > MAX_LIMIT) {
            showToast(`Log limit must be between ${MIN_LIMIT} and ${MAX_LIMIT}.`, 'error');
            return;
        }

        const name = $('#botNameInput')?.value.trim();
        if (!name) {
            showToast('Bot name is required.', 'error');
            return;
        }

        try {
            // Rename the bot (if changed) then save settings.
            const renamed = await api.renameSession(id, name);
            setText($('#currentAccountName'), renamed.name);
            setText($('#navAccountName'), renamed.name);

            const result = await api.updateSettings(id, {
                ignoreGroups: $('#ignoreGroupsInput').checked,
                ignorePrivates: $('#ignorePrivatesInput').checked,
                logLimit,
                features: {
                    store: $('#featureStoreInput').checked,
                    group: $('#featureGroupInput').checked,
                },
            });
            renderSettings(result);
            markSaved();
            showToast(`Settings saved for "${renamed.name}".`, 'success');
        } catch (error) {
            showToast(error.message || 'Failed to update settings.', 'error');
        }
    });
}
