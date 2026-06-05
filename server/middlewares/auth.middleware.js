function createAuthMiddleware(ctx) {
  return { requireAuth: ctx.requireAuth, requireRole: ctx.requireRole };
}
module.exports = { createAuthMiddleware };
