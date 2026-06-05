require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const db = require('./config/database');
const env = require('./config/env');
const { configureStatic } = require('./middlewares/static.middleware');
const { errorHandler, notFound } = require('./middlewares/error.middleware');
const { createContext } = require('./legacy/context');
const { registerRoutes } = require('./routes');

const pool = db.pool || db;
const { initDatabase } = db;
const rootDir = path.join(__dirname, '..');

function createApp() {
  const app = express();
  const ctx = createContext({ pool, rootDir, env });
  app.set('trust proxy', true);
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  configureStatic(app, rootDir);
  registerRoutes(app, ctx);
  app.get(/.*/, notFound(path.join(rootDir, 'public', 'index.html')));
  app.use(errorHandler);
  return { app, ctx };
}

module.exports = { createApp, initDatabase, env };
