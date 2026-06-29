import { $, setText, toggle } from '../core/dom.js';
import { store } from '../core/store.js';
import { api } from '../core/api.js';
import { showToast } from '../ui/toast.js';

const COLORS = {
    accent: '#2563eb',
    success: '#16a34a',
    danger: '#dc2626',
    warning: '#d97706',
    info: '#0ea5e9',
    grid: 'rgba(100, 116, 139, 0.15)',
    text: '#64748b',
};

const TYPE_COLOR = {
    incoming: COLORS.info,
    outgoing: COLORS.success,
    system: COLORS.warning,
    error: COLORS.danger,
};

const TYPE_LABEL = {
    incoming: 'Incoming',
    outgoing: 'Outgoing',
    system: 'System',
    error: 'Error',
};

let days = 14;
let loading = false;
const charts = {};

/** Format 'YYYY-MM-DD' -> 'DD/MM'. */
function shortDate(iso) {
    const [, m, d] = iso.split('-');
    return `${d}/${m}`;
}

/** Show the dashboard view. */
export function showDashboardView() {
    store.setView('dashboard');

    toggle($('#emptyState'), false, 'grid');
    toggle($('#accountView'), false, 'grid');
    toggle($('#accountsListView'), false, 'grid');
    toggle($('#profileView'), false, 'grid');
    toggle($('#dashboardView'), true, 'grid');

    toggle($('#statusPill'), false, 'inline-flex');
    toggle($('#statusUpdatedAt'), false, 'flex');
    toggle($('#btnDeleteAccount'), false, 'inline-flex');
    toggle($('#accountIdLine'), false, 'block');
    toggle($('#accountMenu'), false, 'grid');
    setText($('#currentAccountName'), 'Dashboard');

    loadDashboard();
}

/** Reload data only if currently in the dashboard view. */
export function refreshDashboard() {
    if (store.getView() === 'dashboard') loadDashboard();
}

async function loadDashboard() {
    if (loading) return;
    loading = true;
    try {
        const data = await api.dashboard(days);
        renderSummary(data.summary);
        renderCharts(data);
    } catch (error) {
        showToast(error.message || 'Failed to load dashboard.', 'error');
    } finally {
        loading = false;
    }
}

function renderSummary(s = {}) {
    setText($('#statTotalAccounts'), s.totalAccounts ?? 0);
    setText($('#statConnected'), s.connectedAccounts ?? 0);
    setText($('#statMessagesToday'), s.messagesToday ?? 0);
    setText($('#statIncomingToday'), s.incomingToday ?? 0);
    setText($('#statOutgoingToday'), s.outgoingToday ?? 0);
    setText($('#statErrorsToday'), s.errorsToday ?? 0);
    setText($('#statConversations'), s.activeConversations ?? 0);
}

function baseOptions(extra = {}) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
            legend: { labels: { color: COLORS.text, usePointStyle: true, boxWidth: 8 } },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: COLORS.text } },
            y: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.text, precision: 0 } },
        },
        ...extra,
    };
}

function upsertChart(key, canvasId, config) {
    if (typeof window.Chart === 'undefined') return;
    if (charts[key]) {
        charts[key].data = config.data;
        charts[key].options = config.options;
        charts[key].update();
        return;
    }
    const canvas = $(`#${canvasId}`);
    if (canvas) charts[key] = new window.Chart(canvas, config);
}

function renderCharts(data) {
    const labels = data.series.map((p) => shortDate(p.date));

    // Incoming & outgoing messages (line).
    upsertChart('messages', 'chartMessages', {
        type: 'line',
        data: {
            labels,
            datasets: [
                lineDataset('Incoming', data.series.map((p) => p.incoming), COLORS.info),
                lineDataset('Outgoing', data.series.map((p) => p.outgoing), COLORS.success),
            ],
        },
        options: baseOptions(),
    });

    // Errors per day (bar).
    upsertChart('errors', 'chartErrors', {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                label: 'Error',
                data: data.series.map((p) => p.error),
                backgroundColor: COLORS.danger,
                borderRadius: 6,
                maxBarThickness: 28,
            }],
        },
        options: baseOptions({ plugins: { legend: { display: false } } }),
    });

    // Log type distribution (donut).
    const breakdown = data.breakdown.length ? data.breakdown : [{ type: 'none', total: 0 }];
    upsertChart('types', 'chartTypes', {
        type: 'doughnut',
        data: {
            labels: breakdown.map((b) => TYPE_LABEL[b.type] || b.type),
            datasets: [{
                data: breakdown.map((b) => b.total),
                backgroundColor: breakdown.map((b) => TYPE_COLOR[b.type] || COLORS.text),
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: { legend: { position: 'bottom', labels: { color: COLORS.text, usePointStyle: true, boxWidth: 8 } } },
        },
    });

    // Top accounts (horizontal bar).
    upsertChart('top', 'chartTopAccounts', {
        type: 'bar',
        data: {
            labels: data.topAccounts.map((a) => a.name),
            datasets: [{
                label: 'Total messages',
                data: data.topAccounts.map((a) => a.total),
                backgroundColor: COLORS.accent,
                borderRadius: 6,
                maxBarThickness: 26,
            }],
        },
        options: baseOptions({
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { beginAtZero: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.text, precision: 0 } },
                y: { grid: { display: false }, ticks: { color: COLORS.text } },
            },
        }),
    });
}

function lineDataset(label, values, color) {
    return {
        label,
        data: values,
        borderColor: color,
        backgroundColor: `${color}22`,
        fill: true,
        tension: 0.35,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
    };
}

export function initDashboard() {
    $('#dashRange')?.addEventListener('change', (e) => {
        days = Number(e.target.value) || 14;
        loadDashboard();
    });
}
