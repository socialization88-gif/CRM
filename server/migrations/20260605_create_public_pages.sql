CREATE TABLE IF NOT EXISTS public.public_pages (
  id SERIAL PRIMARY KEY,
  page_id VARCHAR(100) UNIQUE NOT NULL,
  page_name VARCHAR(255),
  real_file_path TEXT NOT NULL,
  page_type VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS public_pages_active_page_id_idx
ON public.public_pages (page_id)
WHERE is_active = true;
