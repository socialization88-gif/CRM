const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.warn('WARNING: DATABASE_URL is missing from .env');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function initDatabase() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
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
      reset_password_token_hash TEXT,
      reset_password_token_expires_at TIMESTAMP WITHOUT TIME ZONE,
      created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query("ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS profile_row_id TEXT UNIQUE");
  await pool.query("ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb");
  await pool.query("ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS reset_password_token_hash TEXT");
  await pool.query("ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS reset_password_token_expires_at TIMESTAMP WITHOUT TIME ZONE");

  await pool.query("UPDATE public.app_users SET role = 'executor' WHERE role = 'executive'");
  await pool.query("DELETE FROM public.app_users WHERE role NOT IN ('admin', 'executor')");

  await pool.query('ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check');
  await pool.query("ALTER TABLE public.app_users ADD CONSTRAINT app_users_role_check CHECK (role IN ('admin', 'executor'))");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.executive_account_requests (
      id BIGSERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      requested_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reviewed_at TIMESTAMP WITHOUT TIME ZONE,
      reviewed_by TEXT REFERENCES public.app_users(id) ON DELETE SET NULL,
      created_user_id TEXT REFERENCES public.app_users(id) ON DELETE SET NULL,
      review_notes TEXT NOT NULL DEFAULT ''
    )
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS executive_account_requests_status_idx ON public.executive_account_requests (status, requested_at DESC)");
  await pool.query("CREATE INDEX IF NOT EXISTS executive_account_requests_email_idx ON public.executive_account_requests (LOWER(email))");
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS executive_account_requests_pending_email_unique
    ON public.executive_account_requests (LOWER(email))
    WHERE status = 'pending'
  `);

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
      event_type TEXT NOT NULL CHECK (event_type IN ('assignment', 'profile_update', 'call_update', 'history_clear')),
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
    CREATE TABLE IF NOT EXISTS public.ai_chat_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content_html TEXT NOT NULL DEFAULT '',
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
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
    CREATE INDEX IF NOT EXISTS ai_chat_messages_session_idx
    ON public.ai_chat_messages (user_id, session_id, created_at DESC, id DESC)
  `);

  await pool.query("UPDATE public.dataset_rows SET data = data - 'image_url', updated_at = CURRENT_TIMESTAMP WHERE data ? 'image_url'");
  await pool.query("UPDATE public.app_users SET metadata = metadata - 'image_url', updated_at = CURRENT_TIMESTAMP WHERE metadata ? 'image_url'");

  await pool.query(`
    INSERT INTO public.app_settings (key, value)
    VALUES ('permission_settings', '{"admin_create_accounts": true, "admin_assign_profiles": true, "admin_configure_ai": true, "admin_manage_permissions": true, "admin_view_dashboard": true, "admin_rw_all_profiles": true, "admin_use_ai_chat": true, "admin_clear_history": true, "exec_view_assigned_profiles": true, "exec_view_client_details": true, "exec_update_stage_remarks": true, "executive_can_edit_personal_data": false, "exec_manage_attendance": true}'::jsonb)
    ON CONFLICT (key) DO NOTHING;
  `);

  await pool.query(`
    INSERT INTO public.app_settings (key, value)
    VALUES ('ai_settings', '{"activeProvider":"openai","providers":{}}'::jsonb)
    ON CONFLICT (key) DO NOTHING
  `);
}

module.exports = pool;
module.exports.pool = pool;
module.exports.initDatabase = initDatabase;
