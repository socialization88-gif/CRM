const path = require('path');
const {
  assertPublishableFile,
  createPublicPage,
  deactivatePublicPage,
  getActivePublicPage,
  listPublicPages,
  publicPageFromRow,
  sanitizePageId,
  updatePublicPageStatus,
} = require('../models/publicPage.model');

function requestOrigin(req) {
  return req.protocol + '://' + req.get('host');
}

function publicUrlFor(req, pageId) {
  return requestOrigin(req) + '/register?id=' + encodeURIComponent(pageId);
}

function publicDirFromRoot(rootDir) {
  return path.join(rootDir, 'public');
}

function cleanNotFound(res, rootDir) {
  return res.status(404).sendFile(path.join(rootDir, 'public', '404.html'));
}

async function serveRegisteredPage(req, res, ctx) {
  const pageId = sanitizePageId(req.query.id);
  if (!pageId) return cleanNotFound(res, ctx.rootDir);

  const page = await getActivePublicPage(ctx.pool, pageId);
  if (!page) return cleanNotFound(res, ctx.rootDir);

  try {
    const file = await assertPublishableFile(page.real_file_path, publicDirFromRoot(ctx.rootDir));
    return res.sendFile(file.resolvedPath);
  } catch {
    return cleanNotFound(res, ctx.rootDir);
  }
}

async function publishPage(req, res, ctx) {
  try {
    const page = await createPublicPage(ctx.pool, req.body || {}, publicDirFromRoot(ctx.rootDir));
    res.status(201).json({
      ok: true,
      success: true,
      page_id: page.page_id,
      public_url: publicUrlFor(req, page.page_id),
    });
  } catch (error) {
    res.status(400).json({
      ok: false,
      success: false,
      message: error.message || 'Page publish failed',
    });
  }
}

async function getPages(req, res, ctx) {
  try {
    const rows = await listPublicPages(ctx.pool);
    res.json({
      ok: true,
      success: true,
      pages: rows.map((row) => publicPageFromRow(row, publicUrlFor(req, row.page_id))),
    });
  } catch (error) {
    res.status(500).json({ ok: false, success: false, message: 'Published pages load failed' });
  }
}

async function patchPageStatus(req, res, ctx) {
  const pageId = sanitizePageId(req.params.page_id);
  if (!pageId) {
    return res.status(404).json({ ok: false, success: false, message: 'Page not found' });
  }

  const requested = req.body?.is_active ?? req.body?.active;
  if (typeof requested !== 'boolean') {
    return res.status(400).json({ ok: false, success: false, message: 'is_active boolean is required' });
  }

  try {
    const page = await updatePublicPageStatus(ctx.pool, pageId, requested);
    if (!page) return res.status(404).json({ ok: false, success: false, message: 'Page not found' });
    res.json({
      ok: true,
      success: true,
      page: publicPageFromRow(page, publicUrlFor(req, page.page_id)),
    });
  } catch (error) {
    res.status(500).json({ ok: false, success: false, message: 'Page status update failed' });
  }
}

async function deletePage(req, res, ctx) {
  const pageId = sanitizePageId(req.params.page_id);
  if (!pageId) {
    return res.status(404).json({ ok: false, success: false, message: 'Page not found' });
  }

  try {
    const page = await deactivatePublicPage(ctx.pool, pageId);
    if (!page) return res.status(404).json({ ok: false, success: false, message: 'Page not found' });
    res.json({
      ok: true,
      success: true,
      message: 'Page deactivated',
      page: publicPageFromRow(page, publicUrlFor(req, page.page_id)),
    });
  } catch (error) {
    res.status(500).json({ ok: false, success: false, message: 'Page delete failed' });
  }
}

module.exports = {
  deletePage,
  getPages,
  patchPageStatus,
  publishPage,
  serveRegisteredPage,
};
