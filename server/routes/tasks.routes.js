const express = require('express');

function createTasksRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    router.get('/api/dashboard/overview', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_view_dashboard) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const overview = await queryOverviewDashboard();
        res.json({ ok: true, overview });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Overview dashboard load failed', error: error.message });
      }
    });
    
    router.get('/api/dashboard/executive', requireAuth, requireRole(['executor']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.exec_view_assigned_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const overview = await queryExecutiveDashboard(req.user, req.query.date);
        res.json({ ok: true, overview });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Executive dashboard load failed', error: error.message });
      }
    });
    
    router.get('/api/analytics/assignments', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_view_dashboard) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const [executives, unassigned, total] = await Promise.all([
          pool.query(`
            SELECT
              u.id,
              u.name,
              u.email,
              u.active,
              COUNT(r.id)::int AS assigned_count,
              COUNT(r.id) FILTER (
                WHERE LOWER(COALESCE(r.data->>'task_status', '')) IN ('completed', 'handled')
                   OR LOWER(COALESCE(r.data->>'Stage', '')) IN ('completed', 'handled')
              )::int AS completed_count,
              CASE
                WHEN COUNT(r.id) = 0 THEN 0
                ELSE ROUND((COUNT(r.id) FILTER (
                  WHERE LOWER(COALESCE(r.data->>'task_status', '')) IN ('completed', 'handled')
                     OR LOWER(COALESCE(r.data->>'Stage', '')) IN ('completed', 'handled')
                )::numeric / COUNT(r.id)::numeric) * 100, 2)
              END AS completion_percentage
            FROM public.app_users u
            LEFT JOIN public.dataset_rows r
              ON r.dataset_id = $1 AND r.data->>'assigned_to' = u.id
            WHERE u.role = 'executor' AND u.active = TRUE
            GROUP BY u.id, u.name, u.email, u.active
            ORDER BY assigned_count DESC, u.name
          `, [DATASET_ID]),
          pool.query(`
            SELECT COUNT(*)::int AS count
            FROM public.dataset_rows
            WHERE dataset_id = $1 AND COALESCE(data->>'assigned_to', '') = ''
          `, [DATASET_ID]),
          pool.query('SELECT COUNT(*)::int AS count FROM public.dataset_rows WHERE dataset_id = $1', [DATASET_ID]),
        ]);
        res.json({
          ok: true,
          total: total.rows[0].count,
          unassigned: unassigned.rows[0].count,
          executives: executives.rows,
        });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Assignment analytics load failed', error: error.message });
      }
    });
    
    router.post('/api/tasks/assign', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_assign_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const ids = Array.isArray(req.body.row_ids) ? req.body.row_ids : [req.body.row_id];
        const rowIds = ids.map((id) => String(id || '').trim()).filter(Boolean);
        const assignedTo = String(req.body.assigned_to || '').trim();
        const instruction = String(req.body.admin_instruction || '');
        if (!rowIds.length || !assignedTo) return res.status(400).json({ ok: false, message: 'row_id and assigned_to required' });
    
        await client.query('BEGIN');
        const executive = await client.query(`
          SELECT id, name, email
          FROM public.app_users
          WHERE id = $1 AND role = 'executor' AND active = TRUE
        `, [assignedTo]);
        if (!executive.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Active executive not found' });
        }
    
        const manager = executive.rows[0];
        const patch = {
          assigned_to: manager.id,
          assigned_to_name: manager.name,
          assigned_to_email: manager.email,
          task_status: 'Pending',
          admin_instruction: instruction,
          assigned_at: new Date().toISOString(),
          executive_read_at: '',
        };
        const result = await client.query(`
          UPDATE public.dataset_rows
          SET data = data || $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE dataset_id = $2 AND id::text = ANY($3::text[])
          RETURNING id::text, row_number, data
        `, [JSON.stringify(patch), DATASET_ID, rowIds]);
    
        for (const row of result.rows) {
          await insertRowEvent(client, row, 'assignment', req.user, {
            assigned_to: { from: '', to: manager.id },
            assigned_to_name: { from: '', to: manager.name },
            task_status: { from: '', to: 'Pending' },
          }, instruction);
        }
    
        await client.query('COMMIT');
        res.json({ ok: true, message: `Assigned ${result.rowCount} profile(s) to ${manager.name}`, updated: result.rowCount });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Assign error:', error);
        res.status(500).json({ ok: false, message: 'Task assign failed', error: error.message });
      } finally {
        client.release();
      }
    });
    
    router.get('/api/tasks/bulk-queue-summary', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const summary = await queryBulkQueueSummary();
        res.json({ ok: true, summary });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Bulk queue summary failed', error: error.message });
      }
    });
    
    router.post('/api/tasks/bulk-assign', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_assign_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const rawSegments = Array.isArray(req.body.segments) ? req.body.segments : [];
        const segments = rawSegments
          .map((segment) => ({
            assigned_to: String(segment.assigned_to || '').trim(),
            count: Math.max(0, Math.floor(Number(segment.count || 0))),
            admin_instruction: String(segment.admin_instruction || req.body.admin_instruction || ''),
          }))
          .filter((segment) => segment.assigned_to && segment.count > 0);
    
        if (!segments.length) {
          return res.status(400).json({ ok: false, message: 'At least one executive/count segment is required' });
        }
    
        await client.query('BEGIN');
        const executiveIds = [...new Set(segments.map((segment) => segment.assigned_to))];
        const executiveRows = await client.query(`
          SELECT id, name, email
          FROM public.app_users
          WHERE role = 'executor'
            AND active = TRUE
            AND id = ANY($1::text[])
        `, [executiveIds]);
        const executiveMap = new Map(executiveRows.rows.map((row) => [row.id, row]));
        const missing = executiveIds.filter((id) => !executiveMap.has(id));
        if (missing.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'One or more active executives were not found' });
        }
    
        const requestedTotal = segments.reduce((sum, segment) => sum + segment.count, 0);
        const queue = await client.query(`
          SELECT id::text, row_number, data
          FROM public.dataset_rows
          WHERE dataset_id = $1
            AND COALESCE(data->>'assigned_to', '') = ''
            AND LOWER(COALESCE(NULLIF(data->>'task_status', ''), 'pending')) = 'pending'
          ORDER BY row_number ASC, id ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        `, [DATASET_ID, requestedTotal]);
    
        let cursor = 0;
        const results = [];
        for (const segment of segments) {
          const manager = executiveMap.get(segment.assigned_to);
          const picked = queue.rows.slice(cursor, cursor + segment.count);
          cursor += picked.length;
          if (!picked.length) {
            results.push({ executive_id: manager.id, executive_name: manager.name, requested: segment.count, allocated: 0 });
            continue;
          }
    
          const assignedAt = new Date().toISOString();
          const patch = {
            assigned_to: manager.id,
            assigned_to_name: manager.name,
            assigned_to_email: manager.email,
            task_status: 'Pending',
            admin_instruction: segment.admin_instruction,
            assigned_at: assignedAt,
            executive_read_at: '',
          };
          const rowIds = picked.map((row) => row.id);
          const updated = await client.query(`
            UPDATE public.dataset_rows
            SET data = data || $1::jsonb,
                updated_at = CURRENT_TIMESTAMP
            WHERE dataset_id = $2 AND id::text = ANY($3::text[])
            RETURNING id::text, row_number, data
          `, [JSON.stringify(patch), DATASET_ID, rowIds]);
    
          for (const row of updated.rows) {
            const before = picked.find((candidate) => candidate.id === row.id)?.data || {};
            await insertRowEvent(client, row, 'assignment', req.user, {
              assigned_to: { from: before.assigned_to || '', to: manager.id },
              assigned_to_name: { from: before.assigned_to_name || '', to: manager.name },
              task_status: { from: before.task_status || '', to: 'Pending' },
              bulk_segment: { from: '', to: `${segment.count} requested for ${manager.name}` },
            }, segment.admin_instruction || 'Bulk queue assignment');
          }
    
          results.push({
            executive_id: manager.id,
            executive_name: manager.name,
            requested: segment.count,
            allocated: updated.rowCount,
          });
        }
    
        const allocated = results.reduce((sum, item) => sum + item.allocated, 0);
        await client.query('COMMIT');
        const summary = await queryBulkQueueSummary();
        res.json({
          ok: true,
          message: `Bulk assigned ${allocated} pending task(s)`,
          requested: requestedTotal,
          allocated,
          results,
          summary,
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Bulk assign error:', error);
        res.status(500).json({ ok: false, message: 'Bulk task assignment failed', error: error.message });
      } finally {
        client.release();
      }
    });
  }
  return router;
}

module.exports = createTasksRoutes;
