require('dotenv').config();

const { createApp, initDatabase, env } = require('./server/app');

const { app, ctx } = createApp();
let httpServer = null;
let startupInProgress = false;

process.on('unhandledRejection', (error) => { console.error('Unhandled rejection:', error); });
process.on('uncaughtException', (error) => { console.error('Uncaught exception:', error); });

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function listenOnPort(port, host) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, host);
    const cleanup = () => { server.removeListener('error', onError); server.removeListener('listening', onListening); };
    const onError = (error) => { cleanup(); reject(error); };
    const onListening = () => { cleanup(); resolve(server); };
    server.once('error', onError);
    server.once('listening', onListening);
  });
}

async function start() {
  if (startupInProgress || httpServer) return;
  startupInProgress = true;
  while (!httpServer) {
    try {
      await initDatabase();
      await ctx.seedDefaultUsers();
      await ctx.backfillRoleDetailsSchema();
      await ctx.initializeLangChainAgent();
      let listenPort = env.PORT;
      for (let attempt = 0; attempt < env.PORT_RETRY_LIMIT; attempt += 1) {
        try {
          httpServer = await listenOnPort(listenPort, env.HOST);
          httpServer.on('error', (error) => { console.error('HTTP server error:', error); });
          console.log('Server running on http://' + env.HOST + ':' + listenPort);
          console.log('Dataset ' + env.DATASET_ID + ' is served with server-side pagination');
          startupInProgress = false;
          return;
        } catch (error) {
          if ((error.code === 'EACCES' || error.code === 'EADDRINUSE') && attempt < env.PORT_RETRY_LIMIT - 1) {
            console.warn('Port ' + listenPort + ' unavailable (' + error.code + '), trying ' + (listenPort + 1) + '...');
            listenPort += 1;
            continue;
          }
          throw error;
        }
      }
      throw new Error('Unable to bind a server port after ' + env.PORT_RETRY_LIMIT + ' attempts starting from ' + env.PORT + '.');
    } catch (error) {
      console.error('Startup failed:', error);
      console.log('Retrying server startup in ' + env.STARTUP_RETRY_MS + 'ms...');
      await delay(env.STARTUP_RETRY_MS);
    }
  }
  startupInProgress = false;
}

if (require.main === module) {
  start().catch((error) => { console.error('Startup failed:', error); });
}

module.exports = { app, start };
