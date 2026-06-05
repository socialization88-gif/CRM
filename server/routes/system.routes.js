const express = require('express');

function createSystemRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    router.get('/', (req, res) => {
      res.sendFile(path.join(rootDir, 'public', 'index.html'));
    });
    
    router.get('/api/health', async (req, res) => {
      try {
        const [dbTime, rowCount] = await Promise.all([
          pool.query('SELECT NOW() AS now'),
          pool.query('SELECT COUNT(*)::int AS total FROM public.dataset_rows WHERE dataset_id = $1', [DATASET_ID]),
        ]);
        res.json({
          ok: true,
          message: 'Backend and Neon connected',
          dataset_id: DATASET_ID,
          total_rows: rowCount.rows[0].total,
          database_time: dbTime.rows[0].now,
        });
      } catch (error) {
        console.error('Health error:', error);
        res.status(500).json({ ok: false, message: 'Database connection failed', error: error.message });
      }
    });
  }
  return router;
}

module.exports = createSystemRoutes;
