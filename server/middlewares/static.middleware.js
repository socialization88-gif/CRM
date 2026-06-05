const express = require('express');
const path = require('path');
function configureStatic(app, rootDir) {
  app.use(express.static(path.join(rootDir, 'public')));
  app.use('/assets', express.static(path.join(rootDir, 'assets')));
  app.use('/pages/auth', express.static(path.join(rootDir, 'public', 'pages', 'auth')));
  app.use('/src', express.static(path.join(rootDir, 'public', 'pages', 'auth')));
  app.use('/features/admin', express.static(path.join(rootDir, 'public', 'features', 'admin')));
  app.use('/admin', express.static(path.join(rootDir, 'public', 'features', 'admin')));
}
module.exports = { configureStatic };
