(async function () {
  const form = document.getElementById('login-form');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const alert = document.getElementById('login-alert');
  const submit = document.getElementById('login-submit');
  const toggle = document.getElementById('toggle-password');

  const existing = await fetch('/api/me', { credentials: 'same-origin' }).then((res) => res.json()).catch(() => null);
  if (existing?.authenticated) {
    window.location.replace(existing.user.role === 'admin' ? '/admin.html' : '/user.html');
    return;
  }

  toggle.addEventListener('click', () => {
    const shown = password.type === 'text';
    password.type = shown ? 'password' : 'text';
    toggle.textContent = shown ? 'Tampilkan' : 'Sembunyikan';
  });

  document.querySelectorAll('.demo-account').forEach((button) => {
    button.addEventListener('click', () => {
      email.value = button.dataset.email;
      password.value = button.dataset.password;
      alert.hidden = true;
      email.focus();
    });
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!form.reportValidity()) return;
    submit.disabled = true;
    submit.innerHTML = '<span>Memeriksa akun…</span><span class="button-arrow">···</span>';
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.value, password: password.value }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Login tidak berhasil.');
      window.location.replace(result.redirect);
    } catch (err) {
      alert.textContent = err.message;
      alert.hidden = false;
      submit.disabled = false;
      submit.innerHTML = '<span>Masuk ke dashboard</span><span class="button-arrow">↗</span>';
    }
  });
})();
