const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const PAGE_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function sanitizePageId(pageId) {
  const value = String(pageId || '').trim();
  return PAGE_ID_PATTERN.test(value) ? value : '';
}

function sanitizeText(value, maxLength) {
  const cleaned = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, maxLength);
}

function normalizePublicFilePath(realFilePath, publicDir) {
  const value = String(realFilePath || '').trim().replace(/\\/g, '/');
  if (!value || !value.startsWith('/')) {
    throw new Error('real_file_path must start with /');
  }
  if (value.includes('\0')) {
    throw new Error('Invalid file path');
  }

  const relativePath = value.replace(/^\/+/, '');
  const resolvedPath = path.resolve(publicDir, relativePath);
  const safeRoot = path.resolve(publicDir);
  const insidePublicDir = resolvedPath === safeRoot || resolvedPath.startsWith(safeRoot + path.sep);

  if (!insidePublicDir) {
    throw new Error('File path is outside the public directory');
  }
  if (path.extname(resolvedPath).toLowerCase() !== '.html') {
    throw new Error('Only HTML files can be published');
  }

  const normalizedPublicPath = '/' + path.relative(safeRoot, resolvedPath).replace(/\\/g, '/');
  return { resolvedPath, publicPath: normalizedPublicPath };
}

async function assertPublishableFile(realFilePath, publicDir) {
  const normalized = normalizePublicFilePath(realFilePath, publicDir);
  let stat;
  try {
    stat = await fs.stat(normalized.resolvedPath);
  } catch {
    throw new Error('Real file does not exist');
  }
  if (!stat.isFile()) {
    throw new Error('Real file path must point to a file');
  }
  return normalized;
}

async function generateUniquePageId(pool) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const pageId = crypto.randomBytes(4).toString('hex');
    const exists = await pool.query('SELECT 1 FROM public.public_pages WHERE page_id = $1 LIMIT 1', [pageId]);
    if (!exists.rowCount) return pageId;
  }
  throw new Error('Unable to generate a unique page ID');
}

function publicPageFromRow(row, publicUrl) {
  return {
    page_id: row.page_id,
    page_name: row.page_name || '',
    page_type: row.page_type || '',
    is_active: Boolean(row.is_active),
    public_url: publicUrl,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function ensurePublicPagesTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.public_pages (
      id SERIAL PRIMARY KEY,
      page_id VARCHAR(100) UNIQUE NOT NULL,
      page_name VARCHAR(255),
      real_file_path TEXT NOT NULL,
      page_type VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS public_pages_active_page_id_idx
    ON public.public_pages (page_id)
    WHERE is_active = true
  `);
}

async function createPublicPage(pool, payload, publicDir) {
  await ensurePublicPagesTable(pool);
  const { publicPath } = await assertPublishableFile(payload.real_file_path, publicDir);
  const pageId = await generateUniquePageId(pool);
  const pageName = sanitizeText(payload.page_name, 255) || null;
  const pageType = sanitizeText(payload.page_type, 100) || null;

  const result = await pool.query(
    `INSERT INTO public.public_pages (page_id, page_name, real_file_path, page_type)
     VALUES ($1, $2, $3, $4)
     RETURNING id, page_id, page_name, real_file_path, page_type, is_active, created_at, updated_at`,
    [pageId, pageName, publicPath, pageType]
  );

  return result.rows[0];
}

async function getActivePublicPage(pool, pageId) {
  const cleanPageId = sanitizePageId(pageId);
  if (!cleanPageId) return null;
  await ensurePublicPagesTable(pool);
  const result = await pool.query(
    `SELECT id, page_id, page_name, real_file_path, page_type, is_active, created_at, updated_at
     FROM public.public_pages
     WHERE page_id = $1 AND is_active = true
     LIMIT 1`,
    [cleanPageId]
  );
  return result.rows[0] || null;
}

async function listPublicPages(pool) {
  await ensurePublicPagesTable(pool);
  const result = await pool.query(
    `SELECT page_id, page_name, page_type, is_active, created_at, updated_at
     FROM public.public_pages
     ORDER BY created_at DESC, id DESC`
  );
  return result.rows;
}

async function updatePublicPageStatus(pool, pageId, isActive) {
  const cleanPageId = sanitizePageId(pageId);
  if (!cleanPageId) return null;
  await ensurePublicPagesTable(pool);
  const result = await pool.query(
    `UPDATE public.public_pages
     SET is_active = $2, updated_at = NOW()
     WHERE page_id = $1
     RETURNING page_id, page_name, page_type, is_active, created_at, updated_at`,
    [cleanPageId, Boolean(isActive)]
  );
  return result.rows[0] || null;
}

async function deactivatePublicPage(pool, pageId) {
  return updatePublicPageStatus(pool, pageId, false);
}

module.exports = {
  assertPublishableFile,
  createPublicPage,
  deactivatePublicPage,
  ensurePublicPagesTable,
  getActivePublicPage,
  listPublicPages,
  normalizePublicFilePath,
  publicPageFromRow,
  sanitizePageId,
  updatePublicPageStatus,
};
