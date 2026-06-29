// Login / register page logic. Standalone (not part of the dashboard bundle).

const $ = (sel) => document.querySelector(sel);

const errorBox = $('#authError');
const loginForm = $('#loginForm');
const registerForm = $('#registerForm');
const tabLogin = $('#tabLogin');
const tabRegister = $('#tabRegister');

function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
}

function setLoading(form, loading) {
    const btn = form.querySelector('.auth-submit');
    if (!btn) return;
    btn.classList.toggle('is-loading', loading);
    btn.disabled = loading;
}

function setMode(mode) {
    const isLogin = mode === 'login';
    tabLogin.classList.toggle('is-active', isLogin);
    tabRegister.classList.toggle('is-active', !isLogin);
    loginForm.hidden = !isLogin;
    registerForm.hidden = isLogin;
    showError('');
}

async function postJSON(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`);
    return data;
}

function goToDashboard() {
    window.location.href = '/';
}

tabLogin.addEventListener('click', () => setMode('login'));
tabRegister.addEventListener('click', () => setMode('register'));

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    setLoading(loginForm, true);
    try {
        await postJSON('/auth/login', {
            email: $('#loginEmail').value.trim(),
            password: $('#loginPassword').value,
        });
        goToDashboard();
    } catch (err) {
        showError(err.message);
        setLoading(loginForm, false);
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    setLoading(registerForm, true);
    try {
        await postJSON('/auth/register', {
            name: $('#regName').value.trim(),
            email: $('#regEmail').value.trim(),
            password: $('#regPassword').value,
        });
        goToDashboard();
    } catch (err) {
        showError(err.message);
        setLoading(registerForm, false);
    }
});

// --- Optional Google Sign-In ---

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

async function handleGoogleCredential(response) {
    showError('');
    try {
        await postJSON('/auth/google', { credential: response.credential });
        goToDashboard();
    } catch (err) {
        showError(err.message);
    }
}

async function init() {
    let cfg = { googleClientId: null, allowRegistration: true };
    try {
        const res = await fetch('/auth/config');
        cfg = await res.json();
    } catch { /* use defaults */ }

    if (!cfg.allowRegistration) {
        tabRegister.hidden = true;
    }

    if (cfg.googleClientId) {
        try {
            await loadScript('https://accounts.google.com/gsi/client');
            window.google.accounts.id.initialize({
                client_id: cfg.googleClientId,
                callback: handleGoogleCredential,
            });
            window.google.accounts.id.renderButton($('#googleBtn'), {
                theme: 'outline',
                size: 'large',
                width: 320,
                text: 'continue_with',
            });
            $('#googleWrap').hidden = false;
        } catch {
            // Google script blocked/unavailable — silently keep email login only.
        }
    }
}

init();
