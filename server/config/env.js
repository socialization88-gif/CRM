require('dotenv').config();

const env = {
  PORT: Number(process.env.PORT || 3000),
  HOST: String(process.env.HOST || '127.0.0.1'),
  PORT_RETRY_LIMIT: Number(process.env.PORT_RETRY_LIMIT || 300),
  DATASET_ID: Number(process.env.DATASET_ID || 2),
  STARTUP_RETRY_MS: Math.max(1000, Number(process.env.STARTUP_RETRY_MS || 5000)),
  TOKEN_TTL_SECONDS: 60 * 60 * 12,
  RESET_PASSWORD_TTL_SECONDS: 60 * 30,
  MAX_PAGE_SIZE: 500,
};

module.exports = env;
