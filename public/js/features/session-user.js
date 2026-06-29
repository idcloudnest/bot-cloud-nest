import { $, setText } from '../core/dom.js';
import { store } from '../core/store.js';

/** Render the sidebar user chip from a user object. */
export function renderSidebarUser(user) {
    if (!user) return;
    setText($('#userName'), user.name || user.email);
    setText($('#userEmail'), user.role === 'superadmin' ? 'Superadmin' : user.email);

    const avatar = $('#userAvatar');
    if (avatar) {
        if (user.avatar) {
            avatar.style.backgroundImage = `url("${user.avatar}")`;
            avatar.textContent = '';
        } else {
            avatar.style.backgroundImage = '';
            avatar.textContent = (user.name || user.email || '?').trim().charAt(0).toUpperCase();
        }
    }
}

/** Load the current user and render the sidebar user chip. Redirect to login if not authed. */
export async function initSessionUser() {
    let user = null;
    try {
        const res = await fetch('/auth/me');
        const data = await res.json();
        user = data.user;
    } catch {
        // ignore — handled below
    }

    if (!user) {
        window.location.href = '/login';
        return;
    }

    store.setUser(user);
    renderSidebarUser(user);

    $('#logoutButton')?.addEventListener('click', async () => {
        try {
            await fetch('/auth/logout', { method: 'POST' });
        } finally {
            window.location.href = '/login';
        }
    });
}
