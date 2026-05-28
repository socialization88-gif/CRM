const { Pool } = require('pg');
const { v2: cloudinary } = require('cloudinary');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is missing from .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

if (process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

function cloudinaryOptimized(url) {
  if (!url) return '';
  if (!url.includes('res.cloudinary.com')) return url;
  if (url.includes('/upload/f_auto,q_auto/')) return url;
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.app_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'executor')),
      active BOOLEAN NOT NULL DEFAULT TRUE,
      profile_row_id TEXT UNIQUE,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query("ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS profile_row_id TEXT UNIQUE");
  await pool.query("ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("DELETE FROM public.app_users WHERE role = 'user'");
  await pool.query('ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check');
  await pool.query("ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'executor'))");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.app_settings (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_by TEXT REFERENCES public.app_users(id) ON DELETE SET NULL,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.dataset_row_events (
      id BIGSERIAL PRIMARY KEY,
      dataset_id INTEGER NOT NULL,
      row_id TEXT NOT NULL,
      row_number INTEGER,
      event_type TEXT NOT NULL CHECK (event_type IN ('assignment', 'profile_update', 'call_update', 'image_upload', 'history_clear')),
      actor_id TEXT REFERENCES public.app_users(id) ON DELETE SET NULL,
      actor_name TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      changes JSONB NOT NULL DEFAULT '{}'::jsonb,
      notes TEXT NOT NULL DEFAULT '',
      deleted_at TIMESTAMP WITHOUT TIME ZONE,
      deleted_by TEXT REFERENCES public.app_users(id) ON DELETE SET NULL,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataset_rows_dataset_row_idx
    ON public.dataset_rows (dataset_id, row_number, id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataset_rows_assigned_to_idx
    ON public.dataset_rows ((data->>'assigned_to'))
    WHERE dataset_id = 2
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataset_rows_profile_class_idx
    ON public.dataset_rows ((data->>'profile_classification'))
    WHERE dataset_id = 2
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataset_row_events_row_idx
    ON public.dataset_row_events (dataset_id, row_id, deleted_at, created_at DESC)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS dataset_row_events_actor_idx
    ON public.dataset_row_events (actor_id, created_at DESC)
  `);

  await pool.query(`
    INSERT INTO public.app_settings (key, value)
    VALUES ('permission_settings', '{"executive_can_edit_personal_data": true}'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `);
}

module.exports = pool;
module.exports.pool = pool;
module.exports.cloudinary = cloudinary;
module.exports.cloudinaryOptimized = cloudinaryOptimized;
module.exports.initDatabase = initDatabase;
