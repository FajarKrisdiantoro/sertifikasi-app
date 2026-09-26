(function () {
  async function api(path, options = {}) {
    const config = { credentials: 'same-origin', ...options };
    if (config.body && typeof config.body !== 'string') {
      config.headers = { 'Content-Type': 'application/json', ...(config.headers || {}) };
      config.body = JSON.stringify(config.body);
    }
    const response = await fetch(path, config);
    const payload = await response.json().catch(() => ({ ok: false, message: 'Respons server tidak dapat dibaca.' }));
    if (!response.ok) {
      const err = new Error(payload.message || 'Permintaan tidak berhasil.');
      err.status = response.status;
      err.payload = payload;
      if (response.status === 401) window.location.replace('/login.html');
      throw err;
    }
    return payload;
  }

  async function requireRole(role) {
    const result = await api('/api/me');
    if (!result.authenticated) {
      window.location.replace('/login.html');
      return null;
    }
    if (role && result.user.role !== role) {
      window.location.replace(result.user.role === 'admin' ? '/admin.html' : '/user.html');
      return null;
    }
    return result.user;
  }

  async function logout() {
    try { await api('/api/logout', { method: 'POST' }); } catch (_) { /* tetap arahkan ke login */ }
    window.location.replace('/login.html');
  }

  function initials(name) {
    return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value, options = {}) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', ...options }).format(date);
  }

  function statusClass(status) {
    return `status-${String(status).toLowerCase().replaceAll(' ', '-')}`;
  }

  function debounce(fn, wait = 300) {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn(...args), wait);
    };
  }

  function toast(message, type = 'success', title = type === 'error' ? 'Terjadi kendala' : 'Berhasil') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.innerHTML = `<span class="toast-icon">${type === 'error' ? '!' : '✓'}</span><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(message)}</small></span><button type="button" aria-label="Tutup">×</button>`;
    node.querySelector('button').addEventListener('click', () => node.remove());
    container.append(node);
    setTimeout(() => node.remove(), 4500);
  }

  function setButtonLoading(button, loading, label) {
    if (!button) return;
    if (loading) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span>${escapeHtml(label || 'Memproses…')}</span>`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  }

  window.App = { api, requireRole, logout, initials, escapeHtml, formatDate, statusClass, debounce, toast, setButtonLoading };
})();
