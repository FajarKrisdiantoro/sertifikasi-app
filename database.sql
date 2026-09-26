-- Alias portable untuk database Sertifikasi (SQLite).
-- File ini sama dengan schema.sql dan dapat dibuka/import sebagai definisi database.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS skema (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_skema TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nama_skema TEXT NOT NULL,
  kategori TEXT NOT NULL,
  level TEXT NOT NULL,
  durasi_jam INTEGER NOT NULL DEFAULT 8 CHECK (durasi_jam > 0),
  deskripsi TEXT NOT NULL DEFAULT '',
  classroom_url TEXT NOT NULL DEFAULT '',
  detail_pelaksanaan TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Nonaktif')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS peserta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomor_pendaftaran TEXT NOT NULL UNIQUE COLLATE NOCASE,
  nama_lengkap TEXT NOT NULL,
  nik TEXT NOT NULL,
  email TEXT NOT NULL,
  no_hp TEXT NOT NULL,
  skema_id INTEGER NOT NULL,
  tanggal_pendaftaran TEXT NOT NULL DEFAULT (date('now')),
  status TEXT NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Diverifikasi', 'Lulus', 'Ditolak')),
  user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (skema_id) REFERENCES skema(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_peserta_nama ON peserta(nama_lengkap COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_peserta_skema ON peserta(skema_id);
CREATE INDEX IF NOT EXISTS idx_peserta_status ON peserta(status);
