(async function () {
  const user = await App.requireRole('admin');
  if (!user) return;

  const state = { user, schemas: [], participants: [], activeView: 'overview' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function setText(selector, value) { const element = $(selector); if (element) element.textContent = value; }
  function showAlert(element, message, type = 'error') { if (!element) return; element.textContent = message; element.className = `form-alert${type === 'success' ? ' success' : ''}`; element.hidden = false; }
  function hideAlert(element) { if (element) element.hidden = true; }

  function initialiseShell() {
    const initials = App.initials(user.full_name);
    setText('#profile-name', user.full_name);
    setText('#profile-email', user.email);
    setText('#top-user-name', user.full_name.split(' ')[0]);
    setText('#heading-name', user.full_name.split(' ')[0]);
    setText('#profile-avatar', initials);
    setText('#top-avatar', initials);
    setText('#today-label', new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date()));

    $('#menu-toggle')?.addEventListener('click', () => $('#sidebar').classList.add('open'));
    $('#sidebar-close')?.addEventListener('click', () => $('#sidebar').classList.remove('open'));
    $('#logout-button')?.addEventListener('click', App.logout);
    $('#profile-trigger')?.addEventListener('click', App.logout);
    $$('.nav-item[data-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.goView)));
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        showView('participants');
        $('#participant-search')?.focus();
      }
      if (event.key === 'Escape') closeSchemaModal();
    });
  }

  function showView(viewName) {
    const view = $(`#view-${viewName}`);
    if (!view) return;
    state.activeView = viewName;
    $$('.view').forEach((section) => section.classList.toggle('active', section === view));
    $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('active', button.dataset.view === viewName));
    setText('#breadcrumb-current', view.dataset.title || 'Overview');
    $('#sidebar')?.classList.remove('open');
    if (viewName === 'participants') loadParticipants();
    if (viewName === 'schemas') loadSchemas();
  }

  async function loadStats() {
    try {
      const result = await App.api('/api/stats');
      const stats = result.data;
      setText('#stat-total', stats.totalPeserta);
      setText('#stat-waiting', stats.menunggu);
      setText('#stat-verified', stats.diverifikasi);
      setText('#stat-schemas', stats.totalSkema);
      setText('#participant-nav-count', stats.totalPeserta);
      setText('#schema-total-label', `${stats.totalSkema} skema`);
      setText('#schema-active-label', `${state.schemas.filter((schema) => schema.status === 'Aktif').length} aktif`);
      setText('#schema-inactive-label', `${state.schemas.filter((schema) => schema.status === 'Nonaktif').length} nonaktif`);
      const total = Math.max(stats.totalPeserta, 1);
      $('#stat-waiting-line').style.width = `${Math.min(100, Math.round((stats.menunggu / total) * 100))}%`;
      $('#stat-verified-line').style.width = `${Math.min(100, Math.round((stats.diverifikasi / total) * 100))}%`;
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  function participantMarkup(row, compact = false) {
    const safeName = App.escapeHtml(row.nama_lengkap);
    const safeSchema = App.escapeHtml(row.nama_skema);
    const initials = App.escapeHtml(App.initials(row.nama_lengkap));
    const badge = `<span class="status-badge ${App.statusClass(row.status)}">${App.escapeHtml(row.status)}</span>`;
    if (compact) {
      return `<tr><td><div class="participant-cell"><span class="participant-avatar">${initials}</span><span><strong>${safeName}</strong><small>${App.escapeHtml(row.nomor_pendaftaran)}</small></span></div></td><td><div class="schema-cell"><strong>${safeSchema}</strong><small>${App.escapeHtml(row.kode_skema)}</small></div></td><td>${App.formatDate(row.tanggal_pendaftaran)}</td><td>${badge}</td></tr>`;
    }
    return `<tr><td><span class="code-text">${App.escapeHtml(row.nomor_pendaftaran)}</span></td><td><div class="participant-cell"><span class="participant-avatar">${initials}</span><span><strong>${safeName}</strong><small>NIK ${App.escapeHtml(row.nik)}</small></span></div></td><td><div class="schema-cell"><strong>${safeSchema}</strong><small>${App.escapeHtml(row.kode_skema)}</small></div></td><td><div class="contact-cell"><span>${App.escapeHtml(row.email)}</span><span>${App.escapeHtml(row.no_hp)}</span></div></td><td>${App.formatDate(row.tanggal_pendaftaran)}</td><td><select class="status-select participant-status-select ${App.statusClass(row.status)}" data-id="${row.id}" aria-label="Status ${safeName}"><option ${row.status === 'Menunggu' ? 'selected' : ''}>Menunggu</option><option ${row.status === 'Diverifikasi' ? 'selected' : ''}>Diverifikasi</option><option ${row.status === 'Lulus' ? 'selected' : ''}>Lulus</option><option ${row.status === 'Ditolak' ? 'selected' : ''}>Ditolak</option></select></td><td class="align-right"><div class="row-actions"><button class="row-button" type="button" data-copy-code="${App.escapeHtml(row.nomor_pendaftaran)}" title="Salin nomor">⧉</button></div></td></tr>`;
  }

  function renderParticipantTable(rows, target, compact = false) {
    const tableBody = $(target);
    if (!tableBody) return;
    if (!rows.length) {
      tableBody.innerHTML = `<tr><td colspan="${compact ? 4 : 7}" class="table-empty">Belum ada data peserta yang sesuai.</td></tr>`;
      return;
    }
    tableBody.innerHTML = rows.map((row) => participantMarkup(row, compact)).join('');
  }

  async function loadParticipants() {
    const query = new URLSearchParams();
    const activeSearch = state.activeView === 'overview' ? $('#overview-participant-search') : $('#participant-search');
    const search = activeSearch?.value.trim();
    const status = $('#participant-status-filter')?.value;
    if (search) query.set('search', search);
    if (status) query.set('status', status);
    const body = $('#participants-body');
    if (body) body.innerHTML = '<tr><td colspan="7" class="table-loading">Memuat data…</td></tr>';
    try {
      const result = await App.api(`/api/participants?${query.toString()}`);
      state.participants = result.data;
      renderParticipantTable(state.participants, '#participants-body');
      setText('#participant-result-count', `${state.participants.length} peserta`);
      renderParticipantTable(state.participants, '#recent-participants-body', true);
      await loadStats();
    } catch (err) {
      if (body) body.innerHTML = `<tr><td colspan="7" class="table-empty">${App.escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadSchemas() {
    const body = $('#schemas-body');
    if (body) body.innerHTML = '<tr><td colspan="7" class="table-loading">Memuat data…</td></tr>';
    try {
      const result = await App.api('/api/schemas');
      state.schemas = result.data;
      renderSchemas();
      populateSchemaSelect($('#admin-schema'));
      await loadStats();
    } catch (err) {
      if (body) body.innerHTML = `<tr><td colspan="7" class="table-empty">${App.escapeHtml(err.message)}</td></tr>`;
    }
  }

  function renderSchemas() {
    const search = ($('#schema-search')?.value || '').trim().toLowerCase();
    const rows = state.schemas.filter((schema) => !search || [schema.kode_skema, schema.nama_skema, schema.kategori, schema.level].some((value) => String(value).toLowerCase().includes(search)));
    const body = $('#schemas-body');
    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="7" class="table-empty">Belum ada skema yang sesuai.</td></tr>';
      return;
    }
    body.innerHTML = rows.map((schema) => `<tr><td><span class="code-text">${App.escapeHtml(schema.kode_skema)}</span></td><td><div class="schema-cell"><strong>${App.escapeHtml(schema.nama_skema)}</strong><small>Dibuat ${App.formatDate(String(schema.created_at).slice(0, 10))}</small></div></td><td>${App.escapeHtml(schema.kategori)}</td><td>${App.escapeHtml(schema.level)}</td><td>${App.escapeHtml(schema.durasi_jam)} jam</td><td><span class="status-badge ${App.statusClass(schema.status)}">${App.escapeHtml(schema.status)}</span></td><td class="align-right"><div class="row-actions"><button class="row-button" type="button" data-edit-schema="${schema.id}">Edit</button><button class="row-button danger" type="button" data-delete-schema="${schema.id}">Hapus</button></div></td></tr>`).join('');
    setText('#schema-total-label', `${state.schemas.length} skema`);
    setText('#schema-active-label', `${state.schemas.filter((schema) => schema.status === 'Aktif').length} aktif`);
    setText('#schema-inactive-label', `${state.schemas.filter((schema) => schema.status === 'Nonaktif').length} nonaktif`);
  }

  function populateSchemaSelect(select) {
    if (!select) return;
    const active = state.schemas.filter((schema) => schema.status === 'Aktif');
    select.innerHTML = '<option value="">Pilih skema sertifikasi</option>' + active.map((schema) => `<option value="${schema.id}">${App.escapeHtml(schema.kode_skema)} — ${App.escapeHtml(schema.nama_skema)}</option>`).join('');
  }

  function openSchemaModal(schema = null) {
    const modal = $('#schema-modal');
    modal.hidden = false;
    setText('#schema-modal-kicker', schema ? 'EDIT SKEMA' : 'SKEMA BARU');
    setText('#schema-modal-title', schema ? 'Ubah skema' : 'Tambah skema');
    setText('#schema-submit-label', schema ? 'Simpan perubahan' : 'Simpan skema');
    $('#schema-id').value = schema?.id || '';
    $('#schema-code').value = schema?.kode_skema || '';
    $('#schema-name').value = schema?.nama_skema || '';
    $('#schema-category').value = schema?.kategori || '';
    $('#schema-level').value = schema?.level || '';
    $('#schema-duration').value = schema?.durasi_jam || 8;
    $('#schema-description').value = schema?.deskripsi || '';
    $('#schema-classroom-url').value = schema?.classroom_url || '';
    $('#schema-execution-details').value = schema?.detail_pelaksanaan || '';
    $('#schema-status').value = schema?.status || 'Aktif';
    hideAlert($('#schema-alert'));
    setTimeout(() => $('#schema-code').focus(), 50);
  }
  function closeSchemaModal() { const modal = $('#schema-modal'); if (modal) modal.hidden = true; }

  async function saveSchema(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const id = $('#schema-id').value;
    const payload = {
      kode_skema: $('#schema-code').value,
      nama_skema: $('#schema-name').value,
      kategori: $('#schema-category').value,
      level: $('#schema-level').value,
      durasi_jam: Number($('#schema-duration').value),
      deskripsi: $('#schema-description').value,
      classroom_url: $('#schema-classroom-url').value,
      detail_pelaksanaan: $('#schema-execution-details').value,
      status: $('#schema-status').value,
    };
    const submit = form.querySelector('button[type="submit"]');
    App.setButtonLoading(submit, true, 'Menyimpan…');
    hideAlert($('#schema-alert'));
    try {
      const result = await App.api(id ? `/api/schemas/${id}` : '/api/schemas', { method: id ? 'PUT' : 'POST', body: payload });
      closeSchemaModal();
      App.toast(result.message);
      await loadSchemas();
    } catch (err) {
      showAlert($('#schema-alert'), err.message);
    } finally {
      App.setButtonLoading(submit, false);
    }
  }

  async function deleteSchema(id) {
    const schema = state.schemas.find((item) => item.id === id);
    if (!schema || !window.confirm(`Hapus skema “${schema.nama_skema}”?`)) return;
    try {
      const result = await App.api(`/api/schemas/${id}`, { method: 'DELETE' });
      App.toast(result.message);
      await loadSchemas();
    } catch (err) { App.toast(err.message, 'error'); }
  }

  async function submitRegistration(event) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const submit = $('#admin-registration-submit');
    const alert = $('#admin-registration-alert');
    hideAlert(alert);
    const payload = Object.fromEntries(new FormData(form).entries());
    payload.skema_id = Number(payload.skema_id);
    App.setButtonLoading(submit, true, 'Menyimpan…');
    try {
      const result = await App.api('/api/participants', { method: 'POST', body: payload });
      form.reset();
      showAlert(alert, `${result.message} Nomor pendaftaran: ${result.data.nomor_pendaftaran}`, 'success');
      App.toast('Data peserta berhasil disimpan.');
      await loadParticipants();
      await loadStats();
    } catch (err) { showAlert(alert, err.message); } finally { App.setButtonLoading(submit, false); }
  }

  async function updateParticipantStatus(select) {
    const id = select.dataset.id;
    try {
      const result = await App.api(`/api/participants/${id}/status`, { method: 'PATCH', body: { status: select.value } });
      select.className = `status-select participant-status-select ${App.statusClass(select.value)}`;
      App.toast(result.message);
      await loadStats();
    } catch (err) { App.toast(err.message, 'error'); await loadParticipants(); }
  }

  function bindEvents() {
    $('#participant-search')?.addEventListener('input', App.debounce((event) => {
      const overviewSearch = $('#overview-participant-search');
      if (overviewSearch) overviewSearch.value = event.target.value;
      loadParticipants();
    }, 260));
    $('#overview-participant-search')?.addEventListener('input', App.debounce((event) => {
      const participantSearch = $('#participant-search');
      if (participantSearch) participantSearch.value = event.target.value;
      loadParticipants();
    }, 260));
    $('#participant-status-filter')?.addEventListener('change', loadParticipants);
    $('#refresh-participants')?.addEventListener('click', loadParticipants);
    $('#schema-search')?.addEventListener('input', App.debounce(renderSchemas, 180));
    $('#add-schema-button')?.addEventListener('click', () => openSchemaModal());
    $('#schema-modal-close')?.addEventListener('click', closeSchemaModal);
    $('#schema-cancel')?.addEventListener('click', closeSchemaModal);
    $('#schema-modal')?.addEventListener('click', (event) => { if (event.target.id === 'schema-modal') closeSchemaModal(); });
    $('#schema-form')?.addEventListener('submit', saveSchema);
    $('#admin-registration-form')?.addEventListener('submit', submitRegistration);
    document.addEventListener('change', (event) => {
      if (event.target.matches('.participant-status-select')) updateParticipantStatus(event.target);
    });
    document.addEventListener('click', async (event) => {
      const edit = event.target.closest('[data-edit-schema]');
      if (edit) openSchemaModal(state.schemas.find((schema) => schema.id === Number(edit.dataset.editSchema)));
      const remove = event.target.closest('[data-delete-schema]');
      if (remove) deleteSchema(Number(remove.dataset.deleteSchema));
      const copy = event.target.closest('[data-copy-code]');
      if (copy) {
        await navigator.clipboard?.writeText(copy.dataset.copyCode);
        App.toast('Nomor pendaftaran disalin.');
      }
    });
  }

  initialiseShell();
  bindEvents();
  await loadSchemas();
  await loadParticipants();
  await loadStats();
})();
