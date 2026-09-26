(async function () {
  const user = await App.requireRole('user');
  if (!user) return;

  const $ = (selector) => document.querySelector(selector);
  const state = { user, schemas: [], registrations: [], selectedSchema: null };
  const catalogView = $('#schema-catalog-view');
  const registrationView = $('#registration-view');
  const successPanel = $('#user-success-panel');
  const detailModal = $('#schema-detail-modal');
  const grid = $('#user-schema-grid');
  const form = $('#user-registration-form');
  const alert = $('#user-registration-alert');
  const submit = $('#user-registration-submit');

  $('#user-top-name').textContent = user.full_name.split(' ')[0];
  $('#user-avatar').textContent = App.initials(user.full_name);
  $('#user-name').value = user.full_name;
  $('#user-email').value = user.email;
  $('#logout-button')?.addEventListener('click', App.logout);

  function schemaIcon(schema) {
    const text = `${schema.nama_skema} ${schema.kategori}`.toLowerCase();
    if (text.includes('cloud')) return '☁';
    if (text.includes('mobile')) return '▣';
    if (text.includes('web') || text.includes('developer')) return '</>';
    if (text.includes('desain') || text.includes('grafik')) return '▤';
    if (text.includes('marketing') || text.includes('pemasaran')) return '✦';
    if (text.includes('k3') || text.includes('keselamatan')) return '♢';
    if (text.includes('manajemen') || text.includes('administrasi')) return '▦';
    return '◈';
  }

  function schemaDescription(schema) {
    const text = `${schema.nama_skema} ${schema.kategori}`.toLowerCase();
    if (text.includes('digital') || text.includes('marketing')) {
      return `Skema ini memvalidasi kemampuan peserta dalam merencanakan, menjalankan, dan mengevaluasi strategi pemasaran digital melalui kanal yang relevan.`;
    }
    if (text.includes('web') || text.includes('developer')) {
      return `Skema ini mengukur kompetensi pengembangan aplikasi web, mulai dari memahami kebutuhan, membangun fitur, hingga melakukan pengujian dasar.`;
    }
    if (text.includes('k3') || text.includes('keselamatan')) {
      return `Skema ini memvalidasi pengetahuan dan keterampilan dalam mengidentifikasi risiko, menerapkan prosedur keselamatan, serta mendukung budaya kerja yang aman.`;
    }
    if (text.includes('manajemen') || text.includes('administrasi')) {
      return `Skema ini mengukur kemampuan mengelola pekerjaan administrasi, mengatur dokumen, dan menjalankan proses kerja secara tertib dan profesional.`;
    }
    return `Skema ${schema.nama_skema} dirancang untuk mengukur kompetensi profesional peserta sesuai bidang ${schema.kategori}. Peserta akan mengikuti proses asesmen berdasarkan standar yang berlaku.`;
  }

  function registrationForSchema(schemaId) {
    return state.registrations.find((registration) => String(registration.skema_id) === String(schemaId)) || null;
  }

  function hasLearningAccess(registration) {
    return registration?.status === 'Diverifikasi' || registration?.status === 'Lulus';
  }

  function blocksNewRegistration(registration) {
    return registration && registration.status !== 'Ditolak';
  }

  function schemaCardMarkup(schema) {
    const icon = App.escapeHtml(schemaIcon(schema));
    const name = App.escapeHtml(schema.nama_skema);
    const category = App.escapeHtml(schema.kategori);
    const level = App.escapeHtml(schema.level);
    const code = App.escapeHtml(schema.kode_skema);
    const registration = registrationForSchema(schema.id);
    const accessible = hasLearningAccess(registration);
    const cardClass = accessible ? ' schema-card-verified' : registration ? ' schema-card-registered' : '';
    const status = registration ? `<span class="schema-card-status">${App.escapeHtml(registration.status)}</span>` : '';
    const action = accessible ? 'Lihat pelaksanaan' : registration ? 'Lihat status' : 'Lihat detail';
    return `<button class="schema-card${cardClass}" type="button" data-schema-id="${schema.id}" aria-label="${action} ${name}"><span class="schema-card-topline"><span class="schema-card-ribbon">${code}</span>${status}</span><span class="schema-card-art"><span class="schema-card-spark spark-one"></span><span class="schema-card-spark spark-two"></span><span class="schema-card-icon">${icon}</span></span><span class="schema-card-title">${name}</span><span class="schema-card-category">${category}</span><span class="schema-card-meta"><span>${level}</span><span>${App.escapeHtml(schema.durasi_jam)} jam</span></span><span class="schema-card-action">${action} <b>↗</b></span></button>`;
  }

  function renderSchemaCards() {
    const empty = $('#schema-grid-empty');
    $('#schema-count-label').textContent = `${state.schemas.length} skema`;
    if (!state.schemas.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    grid.innerHTML = state.schemas.map(schemaCardMarkup).join('');
  }

  function populateSchemaSelect(selectedId = '') {
    const select = $('#user-schema');
    const available = state.schemas.filter((schema) => !blocksNewRegistration(registrationForSchema(schema.id)));
    select.innerHTML = '<option value="">Pilih skema sertifikasi</option>' + available.map((schema) => `<option value="${schema.id}" ${String(schema.id) === String(selectedId) ? 'selected' : ''}>${App.escapeHtml(schema.kode_skema)} — ${App.escapeHtml(schema.nama_skema)} (${App.escapeHtml(schema.durasi_jam)} jam)</option>`).join('');
  }

  function fillDetail(schema) {
    state.selectedSchema = schema;
    const registration = registrationForSchema(schema.id);
    const accessible = hasLearningAccess(registration);
    const statusBox = $('#detail-registration-status');
    const accessPanel = $('#verified-access');
    const statusNote = $('#registration-status-note');
    const registerButton = $('#detail-register-button');
    const classroomLink = $('#detail-classroom-link');
    const classroomUnavailable = $('#classroom-unavailable');
    $('#detail-schema-icon').textContent = schemaIcon(schema);
    $('#detail-schema-code').textContent = schema.kode_skema;
    $('#detail-schema-title').textContent = schema.nama_skema;
    $('#detail-schema-category').textContent = schema.kategori;
    $('#detail-schema-level').textContent = schema.level;
    $('#detail-schema-duration').textContent = `${schema.durasi_jam} jam`;
    $('#detail-schema-description').textContent = schema.deskripsi || schemaDescription(schema);
    $('#detail-modal-kicker').textContent = accessible ? 'AKSES SKEMA TERVERIFIKASI' : 'DETAIL SKEMA SERTIFIKASI';

    statusBox.hidden = !registration;
    if (registration) {
      const statusBadge = $('#detail-status-badge');
      statusBadge.textContent = registration.status;
      statusBadge.className = `status-badge ${App.statusClass(registration.status)}`;
      $('#detail-registration-number').textContent = registration.nomor_pendaftaran;
    }

    accessPanel.hidden = !accessible;
    statusNote.hidden = !registration || accessible;
    registerButton.hidden = Boolean(registration && registration.status !== 'Ditolak');
    registerButton.innerHTML = registration?.status === 'Ditolak' ? 'Daftar ulang <span>↗</span>' : 'Daftar pada skema ini <span>↗</span>';

    if (accessible) {
      $('#detail-execution').textContent = registration.detail_pelaksanaan || 'Detail pelaksanaan belum ditambahkan oleh admin.';
      const hasClassroom = Boolean(registration.classroom_url);
      classroomLink.hidden = !hasClassroom;
      classroomUnavailable.hidden = hasClassroom;
      if (hasClassroom) classroomLink.href = registration.classroom_url;
      else classroomLink.removeAttribute('href');
    } else if (registration) {
      const rejected = registration.status === 'Ditolak';
      $('#registration-status-title').textContent = rejected ? 'Pendaftaran belum dapat diterima' : 'Pendaftaran sedang diproses';
      $('#registration-status-copy').textContent = rejected
        ? 'Periksa kembali data Anda, lalu gunakan tombol Daftar ulang bila ingin mengirim pendaftaran baru.'
        : 'Akses detail pelaksanaan dan Google Classroom akan tersedia setelah pendaftaran diverifikasi admin.';
    }
  }

  function openDetail(schema) {
    fillDetail(schema);
    detailModal.hidden = false;
    document.body.classList.add('detail-open');
    setTimeout(() => $('#schema-detail-close').focus(), 40);
  }

  function closeDetail() {
    detailModal.hidden = true;
    document.body.classList.remove('detail-open');
  }

  function updateUrl(url) {
    window.history.pushState({}, '', url);
  }

  function showCatalog(updateHistory = true) {
    closeDetail();
    catalogView.hidden = false;
    registrationView.hidden = true;
    successPanel.hidden = true;
    if (updateHistory) window.history.pushState({}, '', '/user.html');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showRegistration(schemaId, updateHistory = true) {
    const schema = state.schemas.find((item) => String(item.id) === String(schemaId));
    if (!schema) {
      showCatalog(false);
      return;
    }
    if (blocksNewRegistration(registrationForSchema(schema.id))) {
      openDetail(schema);
      return;
    }
    state.selectedSchema = schema;
    populateSchemaSelect(schema.id);
    $('#selected-schema-name').textContent = schema.nama_skema;
    $('#selected-schema-chip').title = `${schema.kode_skema} · ${schema.level} · ${schema.durasi_jam} jam`;
    catalogView.hidden = true;
    registrationView.hidden = false;
    successPanel.hidden = true;
    closeDetail();
    if (updateHistory) updateUrl(`/user.html?schema=${encodeURIComponent(schema.id)}#pendaftaran`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showSuccess(registrationNumber) {
    $('#success-registration-code').textContent = registrationNumber;
    catalogView.hidden = true;
    registrationView.hidden = true;
    successPanel.hidden = false;
    window.history.replaceState({}, '', `/user.html#berhasil`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showAlert(message, type = 'error') {
    alert.textContent = message;
    alert.className = `form-alert${type === 'success' ? ' success' : ''}`;
    alert.hidden = false;
  }

  async function loadSchemas() {
    try {
      const [schemaResult, registrationResult] = await Promise.all([
        App.api('/api/schemas'),
        App.api('/api/my-registrations'),
      ]);
      state.schemas = schemaResult.data;
      state.registrations = registrationResult.data;
      renderSchemaCards();
      const requestedSchema = new URLSearchParams(window.location.search).get('schema');
      if (requestedSchema) showRegistration(requestedSchema, false);
    } catch (err) {
      grid.innerHTML = `<div class="schema-grid-error"><span>!</span><p>${App.escapeHtml(err.message)}</p><button class="secondary-button" type="button" id="retry-schemas">Coba lagi</button></div>`;
      $('#retry-schemas')?.addEventListener('click', loadSchemas);
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    alert.hidden = true;
    if (!form.reportValidity()) return;
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.skema_id = Number(payload.skema_id);
    App.setButtonLoading(submit, true, 'Mengirim…');
    try {
      const result = await App.api('/api/participants', { method: 'POST', body: payload });
      state.registrations.unshift(result.data);
      renderSchemaCards();
      showSuccess(result.data.nomor_pendaftaran);
      App.toast('Pendaftaran Anda berhasil dikirim.');
    } catch (err) {
      showAlert(err.message);
    } finally {
      App.setButtonLoading(submit, false);
    }
  });

  grid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-schema-id]');
    if (!card) return;
    const schema = state.schemas.find((item) => String(item.id) === String(card.dataset.schemaId));
    if (schema) openDetail(schema);
  });
  $('#detail-register-button').addEventListener('click', () => {
    if (state.selectedSchema) showRegistration(state.selectedSchema.id);
  });
  $('#schema-detail-close').addEventListener('click', closeDetail);
  detailModal.addEventListener('click', (event) => { if (event.target === detailModal) closeDetail(); });
  $('#back-to-schemas').addEventListener('click', () => showCatalog());
  $('#back-to-schemas-bottom').addEventListener('click', () => showCatalog());
  $('#new-registration-button').addEventListener('click', () => {
    form.reset();
    $('#user-name').value = user.full_name;
    $('#user-email').value = user.email;
    alert.hidden = true;
    showCatalog();
  });
  $('#user-schema').addEventListener('change', (event) => {
    const schema = state.schemas.find((item) => String(item.id) === String(event.target.value));
    if (schema) {
      state.selectedSchema = schema;
      $('#selected-schema-name').textContent = schema.nama_skema;
    }
  });
  window.addEventListener('popstate', () => {
    const requestedSchema = new URLSearchParams(window.location.search).get('schema');
    if (requestedSchema) showRegistration(requestedSchema, false);
    else showCatalog(false);
  });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !detailModal.hidden) closeDetail(); });

  $('#user-name').value = user.full_name;
  $('#user-email').value = user.email;
  await loadSchemas();
})();
