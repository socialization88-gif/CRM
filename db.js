const db = require('./server/config/database');
const publicPages = require('./server/models/publicPage.model');

const pool = db.pool || db;

module.exports = pool;
module.exports.pool = pool;
module.exports.initDatabase = db.initDatabase;
module.exports.publicPages = publicPages;
