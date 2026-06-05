const createAuthRoutes = require('./auth.routes');
const createDatasetRoutes = require('./dataset.routes');
const createExecutiveRequestsRoutes = require('./executiveRequests.routes');
const createPagesRoutes = require('./pages.routes');
const createSettingsRoutes = require('./settings.routes');
const createSystemRoutes = require('./system.routes');
const createTasksRoutes = require('./tasks.routes');
const createUsersRoutes = require('./users.routes');

function registerRoutes(app, ctx) {
  app.use(createSystemRoutes(ctx));
  app.use(createAuthRoutes(ctx));
  app.use(createExecutiveRequestsRoutes(ctx));
  app.use(createPagesRoutes(ctx));
  app.use(createUsersRoutes(ctx));
  app.use(createTasksRoutes(ctx));
  app.use(createDatasetRoutes(ctx));
  app.use(createSettingsRoutes(ctx));
}

module.exports = { registerRoutes };
