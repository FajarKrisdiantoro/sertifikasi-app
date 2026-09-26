(async function () {
  const form = document.getElementById('signup-form');
  const fullName = document.getElementById('full-name');
  const email = document.getElementById('signup-email');
  const password = document.getElementById('signup-password');
  const confirmPassword = document.getElementById('confirm-password');
  const guidance = document.getElementById('password-guidance');
  const alert = document.getElementById('signup-alert');
  const submit = document.getElementById('signup-submit');

  const existing = await fetch('/api/me', { credentials: 'same-origin' }).then((res) => res.json()).catch(() => null);
  if (existing?.authenticated) {
    window.location.replace(existing.user.role === 'admin' ? '/admin.html' : '/user.html');
    return;
  }

  function passwordIsStrong(value) {
    return value.length >= 8 && value.length <= 128 && /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value);
  }

  function showAlert(message) {
    alert.textContent = message;
    alert.hidden = false;
  }

  document.querySelectorAll('[data-toggle-password]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = document.getElementById(button.dataset.togglePassword);
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      button.textContent = shown ? 'Tampilkan' : 'Sembunyikan';
      button.setAttribute('aria-pressed', String(!shown));
    });
  });

  password.addEventListener('input', () => {
    const valid = passwordIsStrong(password.value);
    guidance.classList.toggle('valid', valid);
    guidance.textContent = valid
      ? 'Kata sandi memenuhi persyaratan.'
      : 'Minimal 8 karakter dengan huruf besar, huruf kecil, dan angka.';
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    confirmPassword.setCustomValidity('');

    if (!form.reportValidity()) return;
    if (!passwordIsStrong(password.value)) {
      showAlert('Gunakan kata sandi minimal 8 karakter yang memuat huruf besar, huruf kecil, dan angka.');
      password.focus();
      return;
    }
    if (password.value !== confirmPassword.value) {
      confirmPassword.setCustomValidity('Konfirmasi kata sandi tidak sama.');
      confirmPassword.reportValidity();
      return;
    }

    submit.disabled = true;
    submit.innerHTML = '<span>Membuat akun…</span><span class="button-arrow">···</span>';
    try {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          full_name: fullName.value,
          email: email.value,
          password: password.value,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Akun tidak berhasil dibuat.');
      window.location.replace(result.redirect || '/user.html');
    } catch (err) {
      showAlert(err.message);
      submit.disabled = false;
      submit.innerHTML = '<span>Buat akun</span><span class="button-arrow">↗</span>';
    }
  });

  confirmPassword.addEventListener('input', () => confirmPassword.setCustomValidity(''));
})();
