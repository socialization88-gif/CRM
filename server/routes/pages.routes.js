const express = require('express');
const {
  deletePage,
  getPages,
  patchPageStatus,
  publishPage,
  serveRegisteredPage,
} = require('../controllers/pages.controller');

function createPagesRoutes(ctx) {
  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, ctx)).catch(next);

  router.get('/register', asyncRoute(serveRegisteredPage));

  router.post('/api/pages/publish', ctx.requireAuth, ctx.requireRole(['admin']), asyncRoute(publishPage));
  router.get('/api/pages', ctx.requireAuth, ctx.requireRole(['admin']), asyncRoute(getPages));
  router.patch('/api/pages/:page_id/status', ctx.requireAuth, ctx.requireRole(['admin']), asyncRoute(patchPageStatus));
  router.delete('/api/pages/:page_id', ctx.requireAuth, ctx.requireRole(['admin']), asyncRoute(deletePage));

  return router;
}

module.exports = createPagesRoutes;
