import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(ROOT, 'public');
const DATA_DIR = join(ROOT, 'data');
const DB_PATH = join(DATA_DIR, 'sertifikasi.db');
const PORT = Number(process.env.PORT || 3000);
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const sessions = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');
db.exec(await readFile(join(ROOT, 'schema.sql'), 'utf8'));

function ensureSchemaColumns() {
  const columns = new Set(db.prepare("PRAGMA table_info('skema')").all().map((column) => column.name));
  const additions = [
    ['deskripsi', "TEXT NOT NULL DEFAULT ''"],
    ['classroom_url', "TEXT NOT NULL DEFAULT ''"],
    ['detail_pelaksanaan', "TEXT NOT NULL DEFAULT ''"],
  ];
  for (const [name, definition] of additions) {
    if (!columns.has(name)) db.exec(`ALTER TABLE skema ADD COLUMN ${name} ${definition}`);
  }
}

ensureSchemaColumns();

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, storedHash] = String(stored || '').split(':');
  if (!salt || !storedHash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(storedHash, 'hex');
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function seedDatabase() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (Number(userCount) === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    insertUser.run('Administrator Sertifikasi', 'admin@sertifikasi.local', hashPassword('Admin123!'), 'admin');
    insertUser.run('Calon Peserta', 'user@sertifikasi.local', hashPassword('User123!'), 'user');
  }

  const schemaCount = db.prepare('SELECT COUNT(*) AS count FROM skema').get().count;
  if (Number(schemaCount) === 0) {
    const insertSchema = db.prepare(
      'INSERT INTO skema (kode_skema, nama_skema, kategori, level, durasi_jam, status) VALUES (?, ?, ?, ?, ?, ?)'
    );
    insertSchema.run('SKM-K3-001', 'Ahli Keselamatan dan Kesehatan Kerja', 'Keselamatan Kerja', 'Madya', 24, 'Aktif');
    insertSchema.run('SKM-DIG-002', 'Digital Marketing Specialist', 'Pemasaran Digital', 'Junior', 16, 'Aktif');
    insertSchema.run('SKM-IT-003', 'Junior Web Developer', 'Teknologi Informasi', 'Junior', 32, 'Aktif');
    insertSchema.run('SKM-MNJ-004', 'Manajemen Administrasi Perkantoran', 'Manajemen', 'Terampil', 16, 'Aktif');
  }

  const participantCount = db.prepare('SELECT COUNT(*) AS count FROM peserta').get().count;
  if (Number(participantCount) === 0) {
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@sertifikasi.local');
    const schemas = db.prepare('SELECT id, kode_skema FROM skema ORDER BY id').all();
    const insertParticipant = db.prepare(
      `INSERT INTO peserta
        (nomor_pendaftaran, nama_lengkap, nik, email, no_hp, skema_id, tanggal_pendaftaran, status, user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const today = new Date().toISOString().slice(0, 10);
    insertParticipant.run('REG-2026-0001', 'Siti Rahmawati', '3273014501900001', 'siti.rahmawati@mail.com', '081234567890', schemas[0].id, today, 'Diverifikasi', admin.id);
    insertParticipant.run('REG-2026-0002', 'Budi Santoso', '3273014501900002', 'budi.santoso@mail.com', '082234567891', schemas[1].id, today, 'Menunggu', admin.id);
    insertParticipant.run('REG-2026-0003', 'Nadia Putri', '3273014501900003', 'nadia.putri@mail.com', '083334567892', schemas[2].id, today, 'Lulus', admin.id);
  }
}

seedDatabase();

function json(res, status, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function error(res, status, message, details = undefined) {
  json(res, status, { ok: false, message, ...(details ? { details } : {}) });
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return Object.fromEntries(
    raw.split(';').filter(Boolean).map((part) => {
      const index = part.indexOf('=');
      if (index < 0) return [part.trim(), ''];
      return [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())];
    })
  );
}

function getSession(req) {
  const token = parseCookies(req).sid;
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function setSessionCookie(token) {
  return `sid=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

function clearSessionCookie() {
  return 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

function createSession(userId) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function publicUser(user) {
  return { id: user.id, full_name: user.full_name, email: user.email, role: user.role };
}

function currentUser(req) {
  const session = getSession(req);
  if (!session) return null;
  const user = db.prepare('SELECT id, full_name, email, role FROM users WHERE id = ?').get(session.userId);
  return user ? { ...user, sessionToken: session.token } : null;
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    error(res, 401, 'Sesi Anda belum aktif. Silakan masuk terlebih dahulu.');
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    error(res, 403, 'Akses ini hanya tersedia untuk admin.');
    return null;
  }
  return user;
}

async function readBody(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 1024 * 1024) throw new Error('Ukuran data terlalu besar.');
  }
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    throw new Error('Format JSON tidak valid.');
  }
}

function clean(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function requireFields(body, fields) {
  for (const field of fields) {
    if (!clean(body[field])) return `Kolom ${field.replaceAll('_', ' ')} wajib diisi.`;
  }
  return null;
}

function normalizeClassroomUrl(value) {
  const raw = clean(value, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== 'classroom.google.com') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function makeRegistrationNumber() {
  const year = new Date().getFullYear();
  const row = db.prepare("SELECT nomor_pendaftaran FROM peserta WHERE nomor_pendaftaran LIKE ? ORDER BY id DESC LIMIT 1").get(`REG-${year}-%`);
  const lastNumber = row ? Number(String(row.nomor_pendaftaran).split('-').at(-1)) || 0 : 0;
  return `REG-${year}-${String(lastNumber + 1).padStart(4, '0')}`;
}

function getSchemas(includeInactive = false, userId = null) {
  if (includeInactive) {
    return db.prepare('SELECT id, kode_skema, nama_skema, kategori, level, durasi_jam, deskripsi, classroom_url, detail_pelaksanaan, status, created_at, updated_at FROM skema ORDER BY id DESC').all();
  }
  const fields = 'id, kode_skema, nama_skema, kategori, level, durasi_jam, deskripsi, status, created_at, updated_at';
  if (userId) {
    return db.prepare(`SELECT ${fields} FROM skema WHERE status = 'Aktif' OR id IN (SELECT skema_id FROM peserta WHERE user_id = ?) ORDER BY nama_skema COLLATE NOCASE ASC`).all(userId);
  }
  return db.prepare(`SELECT ${fields} FROM skema WHERE status = 'Aktif' ORDER BY nama_skema COLLATE NOCASE ASC`).all();
}

function serializeParticipant(row) {
  const result = {
    id: row.id,
    nomor_pendaftaran: row.nomor_pendaftaran,
    nama_lengkap: row.nama_lengkap,
    nik: row.nik,
    email: row.email,
    no_hp: row.no_hp,
    skema_id: row.skema_id,
    kode_skema: row.kode_skema,
    nama_skema: row.nama_skema,
    tanggal_pendaftaran: row.tanggal_pendaftaran,
    status: row.status,
  };
  if (Object.hasOwn(row, 'deskripsi')) result.deskripsi = row.deskripsi || '';
  if (Object.hasOwn(row, 'classroom_url')) {
    const hasLearningAccess = row.status === 'Diverifikasi' || row.status === 'Lulus';
    result.classroom_url = hasLearningAccess ? row.classroom_url || '' : '';
    result.detail_pelaksanaan = hasLearningAccess ? row.detail_pelaksanaan || '' : '';
  }
  return result;
}

async function handleApi(req, res, pathname, url) {
  const method = req.method || 'GET';

  if (pathname === '/api/signup' && method === 'POST') {
    const body = await readBody(req);
    const fullName = clean(body.full_name, 120);
    const email = clean(body.email, 190).toLowerCase();
    const password = String(body.password || '');

    if (fullName.length < 2) return error(res, 422, 'Nama lengkap minimal 2 karakter.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(res, 422, 'Format email belum benar.');
    if (password.length < 8 || password.length > 128) return error(res, 422, 'Kata sandi harus terdiri dari 8–128 karakter.');
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      return error(res, 422, 'Kata sandi harus memuat huruf kecil, huruf besar, dan angka.');
    }

    try {
      const result = db.prepare(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (?, ?, ?, 'user')"
      ).run(fullName, email, hashPassword(password));
      const user = db.prepare('SELECT id, full_name, email, role FROM users WHERE id = ?').get(Number(result.lastInsertRowid));
      const token = createSession(user.id);
      return json(res, 201, { ok: true, message: 'Akun berhasil dibuat.', user: publicUser(user), redirect: '/user.html' }, {
        'Set-Cookie': setSessionCookie(token),
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return error(res, 409, 'Email tersebut sudah terdaftar. Silakan masuk.');
      throw err;
    }
  }

  if (pathname === '/api/login' && method === 'POST') {
    const body = await readBody(req);
    const email = clean(body.email, 190).toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) return error(res, 422, 'Email dan kata sandi wajib diisi.');
    const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return error(res, 401, 'Email atau kata sandi tidak sesuai.');
    }
    const token = createSession(user.id);
    return json(res, 200, { ok: true, user: publicUser(user), redirect: user.role === 'admin' ? '/admin.html' : '/user.html' }, {
      'Set-Cookie': setSessionCookie(token),
    });
  }

  if (pathname === '/api/logout' && method === 'POST') {
    const session = getSession(req);
    if (session) sessions.delete(session.token);
    return json(res, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (pathname === '/api/me' && method === 'GET') {
    const user = currentUser(req);
    return json(res, 200, { ok: true, authenticated: Boolean(user), user: user ? publicUser(user) : null });
  }

  if (pathname === '/api/schemas' && method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    return json(res, 200, { ok: true, data: getSchemas(user.role === 'admin', user.role === 'user' ? user.id : null) });
  }

  if (pathname === '/api/schemas' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const requiredError = requireFields(body, ['kode_skema', 'nama_skema', 'kategori', 'level', 'durasi_jam']);
    if (requiredError) return error(res, 422, requiredError);
    const kode = clean(body.kode_skema, 30).toUpperCase();
    const name = clean(body.nama_skema, 180);
    const kategori = clean(body.kategori, 100);
    const level = clean(body.level, 60);
    const duration = Number(body.durasi_jam);
    const description = clean(body.deskripsi, 1000);
    const classroomUrl = normalizeClassroomUrl(body.classroom_url);
    const executionDetails = clean(body.detail_pelaksanaan, 2000);
    const status = body.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
    if (!Number.isInteger(duration) || duration < 1 || duration > 1000) return error(res, 422, 'Durasi harus berupa angka bulat 1–1000 jam.');
    if (classroomUrl === null) return error(res, 422, 'Link harus menggunakan alamat https://classroom.google.com/.');
    try {
      const result = db.prepare(
        'INSERT INTO skema (kode_skema, nama_skema, kategori, level, durasi_jam, deskripsi, classroom_url, detail_pelaksanaan, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(kode, name, kategori, level, duration, description, classroomUrl, executionDetails, status);
      const schema = db.prepare('SELECT * FROM skema WHERE id = ?').get(Number(result.lastInsertRowid));
      return json(res, 201, { ok: true, message: 'Skema berhasil ditambahkan.', data: schema });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return error(res, 409, 'Kode skema sudah digunakan.');
      throw err;
    }
  }

  const schemaMatch = pathname.match(/^\/api\/schemas\/(\d+)$/);
  if (schemaMatch && method === 'PUT') {
    if (!requireAdmin(req, res)) return;
    const schemaId = Number(schemaMatch[1]);
    const body = await readBody(req);
    const requiredError = requireFields(body, ['kode_skema', 'nama_skema', 'kategori', 'level', 'durasi_jam']);
    if (requiredError) return error(res, 422, requiredError);
    const kode = clean(body.kode_skema, 30).toUpperCase();
    const duration = Number(body.durasi_jam);
    const classroomUrl = normalizeClassroomUrl(body.classroom_url);
    const status = body.status === 'Nonaktif' ? 'Nonaktif' : 'Aktif';
    if (!Number.isInteger(duration) || duration < 1 || duration > 1000) return error(res, 422, 'Durasi harus berupa angka bulat 1–1000 jam.');
    if (classroomUrl === null) return error(res, 422, 'Link harus menggunakan alamat https://classroom.google.com/.');
    try {
      const result = db.prepare(
        `UPDATE skema SET kode_skema = ?, nama_skema = ?, kategori = ?, level = ?, durasi_jam = ?, deskripsi = ?, classroom_url = ?, detail_pelaksanaan = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(kode, clean(body.nama_skema, 180), clean(body.kategori, 100), clean(body.level, 60), duration, clean(body.deskripsi, 1000), classroomUrl, clean(body.detail_pelaksanaan, 2000), status, schemaId);
      if (!result.changes) return error(res, 404, 'Skema tidak ditemukan.');
      return json(res, 200, { ok: true, message: 'Skema berhasil diperbarui.', data: db.prepare('SELECT * FROM skema WHERE id = ?').get(schemaId) });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return error(res, 409, 'Kode skema sudah digunakan.');
      throw err;
    }
  }

  if (schemaMatch && method === 'DELETE') {
    if (!requireAdmin(req, res)) return;
    const schemaId = Number(schemaMatch[1]);
    try {
      const result = db.prepare('DELETE FROM skema WHERE id = ?').run(schemaId);
      if (!result.changes) return error(res, 404, 'Skema tidak ditemukan.');
      return json(res, 200, { ok: true, message: 'Skema berhasil dihapus.' });
    } catch (err) {
      if (String(err.message).includes('FOREIGN KEY')) return error(res, 409, 'Skema tidak dapat dihapus karena sudah dipakai peserta. Anda dapat mengubah statusnya menjadi Nonaktif.');
      throw err;
    }
  }

  if (pathname === '/api/participants' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const search = clean(url.searchParams.get('search'), 100);
    const status = clean(url.searchParams.get('status'), 30);
    let query = `SELECT p.*, s.kode_skema, s.nama_skema
      FROM peserta p JOIN skema s ON s.id = p.skema_id WHERE 1 = 1`;
    const params = [];
    if (search) {
      query += ' AND (p.nama_lengkap LIKE ? COLLATE NOCASE OR p.nomor_pendaftaran LIKE ? COLLATE NOCASE OR p.email LIKE ? COLLATE NOCASE)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }
    if (status && ['Menunggu', 'Diverifikasi', 'Lulus', 'Ditolak'].includes(status)) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    query += ' ORDER BY p.id DESC';
    const rows = db.prepare(query).all(...params).map(serializeParticipant);
    return json(res, 200, { ok: true, data: rows });
  }

  if (pathname === '/api/participants' && method === 'POST') {
    const user = requireUser(req, res);
    if (!user) return;
    const body = await readBody(req);
    const requiredError = requireFields(body, ['nama_lengkap', 'nik', 'email', 'no_hp', 'skema_id']);
    if (requiredError) return error(res, 422, requiredError);
    const name = clean(body.nama_lengkap, 160);
    const nik = clean(body.nik, 32);
    const email = clean(body.email, 190).toLowerCase();
    const phone = clean(body.no_hp, 30);
    const schemaId = Number(body.skema_id);
    if (!/^\d{8,32}$/.test(nik)) return error(res, 422, 'NIK harus berupa 8–32 digit angka.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return error(res, 422, 'Format email belum benar.');
    if (!Number.isInteger(schemaId)) return error(res, 422, 'Skema sertifikasi belum dipilih.');
    const schema = db.prepare('SELECT id, status FROM skema WHERE id = ?').get(schemaId);
    if (!schema || (user.role !== 'admin' && schema.status !== 'Aktif')) return error(res, 422, 'Skema sertifikasi tidak tersedia.');
    if (user.role !== 'admin') {
      const existing = db.prepare("SELECT id FROM peserta WHERE user_id = ? AND skema_id = ? AND status IN ('Menunggu', 'Diverifikasi', 'Lulus') LIMIT 1").get(user.id, schemaId);
      if (existing) return error(res, 409, 'Anda sudah terdaftar pada skema ini.');
    }
    try {
      const result = db.prepare(
        `INSERT INTO peserta (nomor_pendaftaran, nama_lengkap, nik, email, no_hp, skema_id, status, user_id)
         VALUES (?, ?, ?, ?, ?, ?, 'Menunggu', ?)`
      ).run(makeRegistrationNumber(), name, nik, email, phone, schemaId, user.id);
      const row = db.prepare(`SELECT p.*, s.kode_skema, s.nama_skema FROM peserta p JOIN skema s ON s.id = p.skema_id WHERE p.id = ?`).get(Number(result.lastInsertRowid));
      return json(res, 201, { ok: true, message: 'Pendaftaran berhasil dikirim.', data: serializeParticipant(row) });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) return error(res, 409, 'Data dengan identitas tersebut sudah terdaftar.');
      throw err;
    }
  }

  const participantStatusMatch = pathname.match(/^\/api\/participants\/(\d+)\/status$/);
  if (participantStatusMatch && method === 'PATCH') {
    if (!requireAdmin(req, res)) return;
    const body = await readBody(req);
    const statuses = ['Menunggu', 'Diverifikasi', 'Lulus', 'Ditolak'];
    if (!statuses.includes(body.status)) return error(res, 422, 'Status peserta tidak valid.');
    if (body.status === 'Diverifikasi' || body.status === 'Lulus') {
      const access = db.prepare(`SELECT s.classroom_url, s.detail_pelaksanaan FROM peserta p JOIN skema s ON s.id = p.skema_id WHERE p.id = ?`).get(Number(participantStatusMatch[1]));
      if (!access) return error(res, 404, 'Peserta tidak ditemukan.');
      if (!access.classroom_url || !access.detail_pelaksanaan) {
        return error(res, 422, 'Lengkapi link Google Classroom dan detail pelaksanaan pada data skema sebelum memverifikasi peserta.');
      }
    }
    const result = db.prepare('UPDATE peserta SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(body.status, Number(participantStatusMatch[1]));
    if (!result.changes) return error(res, 404, 'Peserta tidak ditemukan.');
    return json(res, 200, { ok: true, message: 'Status peserta diperbarui.' });
  }

  if (pathname === '/api/my-registrations' && method === 'GET') {
    const user = requireUser(req, res);
    if (!user) return;
    const rows = db.prepare(`SELECT p.*, s.kode_skema, s.nama_skema, s.deskripsi, s.classroom_url, s.detail_pelaksanaan FROM peserta p JOIN skema s ON s.id = p.skema_id WHERE p.user_id = ? ORDER BY p.id DESC`).all(user.id).map(serializeParticipant);
    return json(res, 200, { ok: true, data: rows });
  }

  if (pathname === '/api/stats' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const count = (sql, ...params) => Number(db.prepare(sql).get(...params).count);
    return json(res, 200, {
      ok: true,
      data: {
        totalPeserta: count('SELECT COUNT(*) AS count FROM peserta'),
        menunggu: count("SELECT COUNT(*) AS count FROM peserta WHERE status = 'Menunggu'"),
        diverifikasi: count("SELECT COUNT(*) AS count FROM peserta WHERE status = 'Diverifikasi'"),
        lulus: count("SELECT COUNT(*) AS count FROM peserta WHERE status = 'Lulus'"),
        totalSkema: count('SELECT COUNT(*) AS count FROM skema'),
      },
    });
  }

  error(res, 404, 'Endpoint tidak ditemukan.');
}

async function serveStatic(req, res, pathname) {
  let filePath = pathname === '/' ? join(PUBLIC_DIR, 'login.html') : join(PUBLIC_DIR, pathname.replace(/^\//, ''));
  filePath = normalize(filePath);
  if (!filePath.startsWith(PUBLIC_DIR + sep) && filePath !== PUBLIC_DIR) return error(res, 403, 'Akses ditolak.');
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) return redirect(res, '/');
    const body = await readFile(filePath);
    const type = mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch {
    error(res, 404, 'Halaman tidak ditemukan.');
  }
}

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname, url);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) error(res, 500, 'Terjadi kesalahan pada server.');
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Portal Sertifikasi berjalan di http://localhost:${PORT}`);
  console.log('Admin: admin@sertifikasi.local / Admin123!');
  console.log('User : user@sertifikasi.local / User123!');
});

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt < now) sessions.delete(token);
  }
}, 15 * 60 * 1000).unref();

process.on('SIGINT', () => {
  db.close();
  server.close(() => process.exit(0));
});
