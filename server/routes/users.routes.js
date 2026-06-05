const express = require('express');

function createUsersRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    router.get('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied: Create & manage accounts' });
      const users = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.active,
          u.profile_row_id,
          u.metadata,
          u.created_at,
          u.updated_at,
          r.data AS profile_data
        FROM public.app_users u
        LEFT JOIN public.dataset_rows r
          ON r.dataset_id = $1
         AND r.id::text = u.profile_row_id
        WHERE u.role IN ('admin', 'executor')
        ORDER BY u.role, u.name
      `, [DATASET_ID]);
      res.json({ ok: true, users: users.rows.map(safeUser) });
    });
    
    router.get('/api/users/:id/tasks', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied: Create & manage accounts' });
      try {
        const userId = String(req.params.id || '').trim();
        if (!userId) return res.status(400).json({ ok: false, message: 'User id required' });
        const userResult = await pool.query(`
          SELECT id, name, email, role, active, profile_row_id, metadata
          FROM public.app_users
          WHERE id = $1
          LIMIT 1
        `, [userId]);
        if (!userResult.rows.length) return res.status(404).json({ ok: false, message: 'User not found' });
    
        const taskResult = await pool.query(`
          SELECT
            id::text,
            row_number,
            COALESCE(NULLIF(data->>'name', ''), NULLIF(data->>'Full Name', ''), '-') AS name,
            COALESCE(NULLIF(data->>'mobile', ''), NULLIF(data->>'Mobile', ''), '') AS mobile,
            COALESCE(NULLIF(data->>'email', ''), NULLIF(data->>'Email', ''), '') AS email,
            COALESCE(NULLIF(data->>'Stage', ''), '') AS stage,
            COALESCE(NULLIF(data->>'task_status', ''), 'Pending') AS task_status,
            COALESCE(NULLIF(data->>'admin_instruction', ''), '') AS admin_instruction,
            COALESCE(NULLIF(data->>'assigned_at', ''), '') AS assigned_at,
            COALESCE(NULLIF(data->>'executive_read_at', ''), '') AS executive_read_at,
            updated_at
          FROM public.dataset_rows
          WHERE dataset_id = $1
            AND data->>'assigned_to' = $2
          ORDER BY updated_at DESC, row_number DESC, id DESC
        `, [DATASET_ID, userId]);
    
        res.json({
          ok: true,
          user: safeUser(userResult.rows[0]),
          tasks: taskResult.rows.map((row) => ({
            id: row.id,
            row_number: row.row_number,
            name: row.name,
            mobile: row.mobile,
            email: row.email,
            stage: row.stage,
            task_status: row.task_status,
            admin_instruction: row.admin_instruction,
            assigned_at: row.assigned_at,
            executive_read_at: row.executive_read_at,
            updated_at: row.updated_at,
          })),
        });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Account task list load failed', error: error.message });
      }
    });
    
    router.get('/api/executive-accounts', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied: Create & manage accounts' });
      const users = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.active,
          u.profile_row_id,
          u.metadata,
          u.created_at,
          u.updated_at,
          r.data AS profile_data
        FROM public.app_users u
        LEFT JOIN public.dataset_rows r
          ON r.dataset_id = $1
         AND r.id::text = u.profile_row_id
        WHERE u.role = 'executor'
          AND u.active = TRUE
        ORDER BY u.name
      `, [DATASET_ID]);
      res.json({ ok: true, executives: users.rows.map(safeUser) });
    });
    
    router.post('/api/admin/executive-accounts', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const name = String(req.body.name || req.body.fullName || '').trim();
        const phoneNumber = String(req.body.phoneNumber || req.body.phone || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '').trim();
        const confirmPassword = String(req.body.confirmPassword || '').trim();
    
        if (!name || !phoneNumber || !email || !password || !confirmPassword) {
          return res.status(400).json({ ok: false, message: 'Full name, phone, email and password are required' });
        }
        if (password !== confirmPassword) {
          return res.status(400).json({ ok: false, message: 'Password and confirm password must match' });
        }
        if (password.length < 6) {
          return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
        }
    
        const duplicate = await pool.query(
          `SELECT id FROM public.app_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [email]
        );
        if (duplicate.rows.length) {
          return res.status(409).json({ ok: false, message: 'Email already exists' });
        }
    
        const id = `executor-${crypto.randomUUID()}`;
        const metadata = mergeRoleMetadata({
          source: 'admin_direct_create',
          phone_number: phoneNumber,
          mobile: phoneNumber,
          personal_info: {
            full_name: name,
            email,
            mobile: phoneNumber,
          },
        }, 'Executive');
    
        const result = await pool.query(`
          INSERT INTO public.app_users (id, name, email, password_hash, role, active, metadata)
          VALUES ($1, $2, $3, $4, 'executor', TRUE, $5::jsonb)
          RETURNING id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
        `, [id, name, email, hashPassword(password), JSON.stringify(metadata)]);
    
        const user = safeUser(result.rows[0]);
        await sendExecutiveCredentialsEmail(user, password).catch((error) => {
          console.error('Executive credentials email failed:', error);
        });
    
        res.status(201).json({
          ok: true,
          message: 'Executive account created successfully',
          user,
          dev_notice: 'Confirmation mail was sent or logged.',
        });
      } catch (error) {
        const message = error.code === '23505' ? 'Email already exists' : error.message;
        console.error('Admin executive create error:', error);
        res.status(500).json({ ok: false, message });
      }
    });
    
    router.post('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '').trim();
        const role = normalizeSoftwareRole(req.body.role, 'executor');
        const metadata = req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};
        if (!name || !email || !password) return res.status(400).json({ ok: false, message: 'Name, email and password required' });
        if (!ROLE_VALUES.has(role)) return res.status(400).json({ ok: false, message: 'Invalid role' });
    
        const id = `${role}-${crypto.randomUUID()}`;
        const finalMetadata = mergeRoleMetadata(metadata, role, { id, name, email, role, active: true });
        const result = await pool.query(`
          INSERT INTO public.app_users (id, name, email, password_hash, role, active, metadata)
          VALUES ($1, $2, $3, $4, $5, TRUE, $6::jsonb)
          RETURNING id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
        `, [id, name, email, hashPassword(password), role, JSON.stringify(finalMetadata)]);
        res.status(201).json({ ok: true, user: safeUser(result.rows[0]) });
      } catch (error) {
        const message = error.code === '23505' ? 'Email already exists' : error.message;
        res.status(500).json({ ok: false, message });
      }
    });
    
    router.put('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const current = await pool.query(`SELECT id, name, email, role, active, profile_row_id, metadata FROM public.app_users WHERE id = $1 LIMIT 1`, [req.params.id]);
        if (!current.rows.length) return res.status(404).json({ ok: false, message: 'User not found' });
        const patch = {};
        for (const key of ['name', 'email', 'role', 'active']) {
          if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
        }
        const metadataPatch = req.body.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null;
        if (patch.role !== undefined) patch.role = normalizeSoftwareRole(patch.role, 'executor');
        if (patch.role && !ROLE_VALUES.has(String(patch.role))) return res.status(400).json({ ok: false, message: 'Invalid role' });
    
        const sets = [];
        const values = [];
        let i = 1;
        if (patch.name !== undefined) {
          sets.push(`name = $${i++}`);
          values.push(String(patch.name).trim());
        }
        if (patch.email !== undefined) {
          sets.push(`email = $${i++}`);
          values.push(String(patch.email).trim().toLowerCase());
        }
        if (patch.role !== undefined) {
          sets.push(`role = $${i++}`);
          values.push(String(patch.role));
        }
        if (patch.active !== undefined) {
          sets.push(`active = $${i++}`);
          values.push(Boolean(patch.active));
        }
        if (req.body.password) {
          sets.push(`password_hash = $${i++}`);
          values.push(hashPassword(req.body.password));
        }
        const effectiveRole = String(patch.role || current.rows[0].role || 'executor');
        if (metadataPatch || patch.role !== undefined) {
          const mergedMetadata = mergeRoleMetadata(
            { ...(current.rows[0].metadata && typeof current.rows[0].metadata === 'object' ? current.rows[0].metadata : {}), ...(metadataPatch || {}) },
            effectiveRole,
            { id: current.rows[0].id, name: patch.name ?? current.rows[0].name, email: patch.email ?? current.rows[0].email, role: effectiveRole, active: patch.active ?? current.rows[0].active }
          );
          sets.push(`metadata = $${i++}::jsonb`);
          values.push(JSON.stringify(mergedMetadata));
        }
        if (!sets.length) return res.status(400).json({ ok: false, message: 'No update fields sent' });
    
        sets.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);
        const result = await pool.query(`
          UPDATE public.app_users
          SET ${sets.join(', ')}
          WHERE id = $${i}
          RETURNING id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
        `, values);
        if (!result.rows.length) return res.status(404).json({ ok: false, message: 'User not found' });
        res.json({ ok: true, user: safeUser(result.rows[0]) });
      } catch (error) {
        const message = error.code === '23505' ? 'Email already exists' : error.message;
        res.status(500).json({ ok: false, message });
      }
    });
    
    router.delete('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const rawId = String(req.params.id || '').trim();
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const fallbackId = String(body.id || '').trim();
        const fallbackProfileRowId = String(body.profile_row_id || '').trim();
        const fallbackEmail = String(body.email || '').trim().toLowerCase();
        const fallbackName = String(body.name || '').trim();
        const lookupKeys = [...new Set([rawId, fallbackId].filter(Boolean))];
        if (!lookupKeys.length && !fallbackProfileRowId && !fallbackEmail && !fallbackName) {
          return res.status(400).json({ ok: false, message: 'User id required' });
        }
    
        const findTarget = async () => {
          for (const key of lookupKeys) {
            const exact = await client.query(`
              SELECT id, name, email, role, active, profile_row_id, metadata
              FROM public.app_users
              WHERE id = $1
              FOR UPDATE
            `, [key]);
            if (exact.rows.length) return exact.rows[0];
          }
          if (fallbackProfileRowId) {
            const byProfileRow = await client.query(`
              SELECT id, name, email, role, active, profile_row_id, metadata
              FROM public.app_users
              WHERE profile_row_id = $1
              FOR UPDATE
            `, [fallbackProfileRowId]);
            if (byProfileRow.rows.length) return byProfileRow.rows[0];
          }
          if (fallbackEmail) {
            const byEmail = await client.query(`
              SELECT id, name, email, role, active, profile_row_id, metadata
              FROM public.app_users
              WHERE LOWER(email) = LOWER($1)
              FOR UPDATE
            `, [fallbackEmail]);
            if (byEmail.rows.length === 1) return byEmail.rows[0];
            if (byEmail.rows.length > 1) return null;
          }
          if (fallbackName) {
            const byName = await client.query(`
              SELECT id, name, email, role, active, profile_row_id, metadata
              FROM public.app_users
              WHERE LOWER(name) = LOWER($1)
              FOR UPDATE
            `, [fallbackName]);
            if (byName.rows.length === 1) return byName.rows[0];
            if (byName.rows.length > 1) return null;
          }
          return null;
        };
    
        await client.query('BEGIN');
        const target = await findTarget();
        if (!target) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Account not found' });
        }
        if (String(target.id) === String(req.user.id)) {
          await client.query('ROLLBACK');
          return res.status(400).json({ ok: false, message: 'You cannot delete your own account' });
        }
    
        const deleted = await client.query(`
          DELETE FROM public.app_users
          WHERE id = $1
          RETURNING id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
        `, [target.id]);
        if (!deleted.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Account not found' });
        }
    
        await client.query('COMMIT');
        res.json({ ok: true, message: 'Account deleted', user: safeUser(deleted.rows[0]) });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        res.status(500).json({ ok: false, message: 'Delete failed', error: error.message });
      } finally {
        client.release();
      }
    });
    
    router.get('/api/executives', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      const result = await pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.role,
          u.active,
          u.profile_row_id,
          u.metadata,
          u.created_at,
          u.updated_at,
          r.data AS profile_data
        FROM public.app_users u
        LEFT JOIN public.dataset_rows r
          ON r.dataset_id = $1
         AND r.id::text = u.profile_row_id
        WHERE u.role = 'executor' AND u.active = TRUE
        ORDER BY u.name
      `, [DATASET_ID]);
      res.json({ ok: true, executives: result.rows.map(safeUser) });
    });
  }
  return router;
}

module.exports = createUsersRoutes;
