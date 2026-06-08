const express = require('express');

function createUsersRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    router.get('/api/executor/assign-new-tasks', requireAuth, requireRole(['executor']), async (req, res) => {
      try {
        const result = await pool.query(`
          SELECT metadata
          FROM public.app_users
          WHERE id = $1
          LIMIT 1
        `, [req.user.id]);
        if (!result.rows.length) return res.status(404).json({ ok: false, message: 'User not found' });
        const metadata = result.rows[0].metadata && typeof result.rows[0].metadata === 'object' ? result.rows[0].metadata : {};
        const tasks = Array.isArray(metadata.assign_new_tasks) ? metadata.assign_new_tasks : [];
        res.json({ ok: true, tasks });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Assign new task list load failed', error: error.message });
      }
    });

    router.get('/api/executor/admin-assigned-tasks', requireAuth, requireRole(['executor']), async (req, res) => {
      try {
        const result = await pool.query(`
          SELECT
            id::text,
            row_number,
            COALESCE(NULLIF(data->>'Full Name', ''), NULLIF(data->>'Name', ''), NULLIF(data->>'full_name', ''), '') AS name,
            COALESCE(NULLIF(data->>'Email', ''), NULLIF(data->>'email', ''), '') AS email,
            COALESCE(NULLIF(data->>'Mobile', ''), NULLIF(data->>'mobile', ''), NULLIF(data->>'phone', ''), '') AS mobile,
            COALESCE(NULLIF(data->>'Advertisement', ''), NULLIF(data->>'advertisement', ''), 'Advertisement') AS advertisement,
            COALESCE(NULLIF(data->>'Problem', ''), NULLIF(data->>'problem', ''), '') AS problem,
            COALESCE(NULLIF(data->>'from_source', ''), NULLIF(data->>'source_executor_name', ''), NULLIF(data->>'source', ''), '-') AS source,
            COALESCE(NULLIF(data->>'task_status', ''), 'Pending') AS task_status,
            COALESCE(NULLIF(data->>'assigned_at', ''), NULLIF(data->>'assignedAt', ''), '') AS assigned_at,
            COALESCE(NULLIF(data->>'created_at', ''), '') AS created_at,
            updated_at
          FROM public.dataset_rows
          WHERE dataset_id = $1
            AND COALESCE(data->>'source_assign_new_task_key', '') <> ''
            AND (
              COALESCE(data->>'assigned_to', '') = $2
              OR LOWER(COALESCE(data->>'assigned_to_email', '')) = LOWER($3)
            )
          ORDER BY COALESCE(NULLIF(data->>'assigned_at', ''), NULLIF(data->>'created_at', '')) DESC,
                   row_number DESC,
                   id DESC
        `, [DATASET_ID, req.user.id, req.user.email || '']);
        res.json({ ok: true, tasks: result.rows });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Assigned task list load failed', error: error.message });
      }
    });

    router.get('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied: Create & manage accounts' });
      try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ ok: false, message: 'User id required' });
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
          WHERE u.id = $2
          LIMIT 1
        `, [DATASET_ID, id]);
        if (!result.rows.length) return res.status(404).json({ ok: false, message: 'User not found' });
        res.json({ ok: true, user: safeUser(result.rows[0]) });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'User load failed', error: error.message });
      }
    });

    router.get('/api/admin/assign-new-tasks', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const [result, assignedResult] = await Promise.all([
          pool.query(`
            SELECT id, name, email, metadata
            FROM public.app_users
            WHERE role = 'executor'
              AND active = TRUE
            ORDER BY name ASC
          `),
          pool.query(`
            SELECT data->>'source_assign_new_task_key' AS source_key
            FROM public.dataset_rows
            WHERE dataset_id = $1
              AND COALESCE(data->>'source_assign_new_task_key', '') <> ''
          `, [DATASET_ID]),
        ]);
        const assignedKeys = new Set(assignedResult.rows.map((row) => row.source_key).filter(Boolean));
        const tasks = result.rows.flatMap((row) => {
          const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
          const items = Array.isArray(metadata.assign_new_tasks) ? metadata.assign_new_tasks : [];
          return items.map((task) => ({
            id: `${row.id}:${String(task?.id || '').trim()}`,
            task_id: String(task?.id || '').trim(),
            source_executor_id: row.id,
            executor_id: row.id,
            executor_name: row.name,
            executor_email: row.email,
            full_name: String(task?.full_name || '').trim(),
            email: String(task?.email || '').trim(),
            phone: String(task?.phone || '').trim(),
            advertisement: String(task?.advertisement || '').trim(),
            problem: String(task?.problem || '').trim(),
            created_at: String(task?.created_at || '').trim(),
            updated_at: String(task?.updated_at || '').trim(),
          })).filter((task) => (task.full_name || task.problem) && !assignedKeys.has(task.id));
        }).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        res.json({ ok: true, tasks });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Admin assign new task load failed', error: error.message });
      }
    });

    router.post('/api/admin/assign-new-tasks/assign', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_assign_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const rawTaskIds = Array.isArray(req.body.task_ids) ? req.body.task_ids : [];
        const taskIds = [...new Set(rawTaskIds.map((id) => String(id || '').trim()).filter(Boolean))];
        const assignedTo = String(req.body.assigned_to || '').trim();
        if (!taskIds.length) return res.status(400).json({ ok: false, message: 'Please select at least one task.' });
        if (!assignedTo) return res.status(400).json({ ok: false, message: 'Choose an executive' });

        await client.query('BEGIN');
        const executiveResult = await client.query(`
          SELECT id, name, email
          FROM public.app_users
          WHERE id = $1 AND role = 'executor' AND active = TRUE
          LIMIT 1
        `, [assignedTo]);
        if (!executiveResult.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Active executive not found' });
        }
        const manager = executiveResult.rows[0];

        const usersResult = await client.query(`
          SELECT id, name, email, role, active, metadata
          FROM public.app_users
          WHERE role = 'executor'
            AND active = TRUE
          ORDER BY name ASC
          FOR UPDATE
        `);

        const sourceTasks = [];
        const selected = new Set(taskIds);
        for (const user of usersResult.rows) {
          const metadata = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
          const items = Array.isArray(metadata.assign_new_tasks) ? metadata.assign_new_tasks : [];
          for (const task of items) {
            const taskId = String(task?.id || '').trim();
            const compositeId = `${user.id}:${taskId}`;
            if (!selected.has(compositeId)) continue;
            sourceTasks.push({ compositeId, taskId, sourceUser: user, task });
          }
        }

        if (sourceTasks.length !== taskIds.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({ ok: false, message: 'One or more selected tasks are no longer available' });
        }

        const existingResult = await client.query(`
          SELECT data->>'source_assign_new_task_key' AS source_key
          FROM public.dataset_rows
          WHERE dataset_id = $1
            AND data->>'source_assign_new_task_key' = ANY($2::text[])
        `, [DATASET_ID, taskIds]);
        const duplicateKeys = new Set(existingResult.rows.map((row) => row.source_key).filter(Boolean));
        if (duplicateKeys.size) {
          await client.query('ROLLBACK');
          return res.status(409).json({ ok: false, message: 'One or more selected tasks are already assigned' });
        }

        const maxRowResult = await client.query(`
          SELECT COALESCE(MAX(row_number), 0)::int AS max_row
          FROM public.dataset_rows
          WHERE dataset_id = $1
        `, [DATASET_ID]);
        let nextRowNumber = Number(maxRowResult.rows[0]?.max_row || 0);
        const assignedAt = new Date().toISOString();
        const inserted = [];

        for (const item of sourceTasks) {
          nextRowNumber += 1;
          const fullName = String(item.task?.full_name || '').trim();
          const email = String(item.task?.email || '').trim();
          const phone = String(item.task?.phone || '').trim();
          const advertisement = String(item.task?.advertisement || '').trim();
          const problem = String(item.task?.problem || '').trim();
          const data = {
            'Full Name': fullName,
            Name: fullName,
            full_name: fullName,
            Email: email,
            email,
            Mobile: phone,
            mobile: phone,
            phone,
            Advertisement: advertisement,
            advertisement,
            Problem: problem,
            problem,
            Stage: 'Pending',
            stage: 'Pending',
            profile_classification: 'User',
            task_status: 'Pending',
            assignmentStatus: 'Pending',
            assigned_to: manager.id,
            assigned_to_name: manager.name,
            assigned_to_email: manager.email,
            assignedAt,
            assigned_at: assignedAt,
            executive_read_at: '',
            source: 'Assign New Task',
            from_source: item.sourceUser.name || item.sourceUser.email || 'Executive',
            source_executor_id: item.sourceUser.id,
            source_executor_name: item.sourceUser.name,
            source_executor_email: item.sourceUser.email,
            source_assign_new_task_id: item.taskId,
            source_assign_new_task_key: item.compositeId,
            created_at: item.task?.created_at || assignedAt,
            updated_at: item.task?.updated_at || assignedAt,
          };

          const insertResult = await client.query(`
            INSERT INTO public.dataset_rows (dataset_id, row_number, data)
            VALUES ($1, $2, $3::jsonb)
            RETURNING id::text, row_number, data
          `, [DATASET_ID, nextRowNumber, JSON.stringify(data)]);
          const row = insertResult.rows[0];
          inserted.push(row);
          await insertRowEvent(client, row, 'assignment', req.user, {
            assigned_to: { from: '', to: manager.id },
            assigned_to_name: { from: '', to: manager.name },
            task_status: { from: '', to: 'Pending' },
            source_assign_new_task_key: { from: '', to: item.compositeId },
          }, `Assigned task from ${item.sourceUser.name || item.sourceUser.email || 'executive'}`);
        }

        const bySourceUser = new Map();
        for (const item of sourceTasks) {
          if (!bySourceUser.has(item.sourceUser.id)) bySourceUser.set(item.sourceUser.id, new Set());
          bySourceUser.get(item.sourceUser.id).add(item.taskId);
        }

        for (const user of usersResult.rows) {
          const removeIds = bySourceUser.get(user.id);
          if (!removeIds) continue;
          const metadata = user.metadata && typeof user.metadata === 'object' ? user.metadata : {};
          const currentTasks = Array.isArray(metadata.assign_new_tasks) ? metadata.assign_new_tasks : [];
          const nextMeta = mergeRoleMetadata({
            ...metadata,
            assign_new_tasks: currentTasks.filter((task) => !removeIds.has(String(task?.id || '').trim())),
          }, user.role, user);
          await client.query(`
            UPDATE public.app_users
            SET metadata = $2::jsonb,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [user.id, JSON.stringify(nextMeta)]);
        }

        await client.query('COMMIT');
        res.json({
          ok: true,
          message: `Assigned ${inserted.length} task${inserted.length === 1 ? '' : 's'} to ${manager.name}`,
          assigned: inserted.length,
          assigned_to: manager,
          rows: inserted.map((row) => ({
            id: row.id,
            row_number: row.row_number,
            ...row.data,
          })),
          removed_task_ids: taskIds,
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Admin assign new task error:', error);
        res.status(500).json({ ok: false, message: 'Task assignment failed', error: error.message });
      } finally {
        client.release();
      }
    });

    router.put('/api/executor/assign-new-tasks', requireAuth, requireRole(['executor']), async (req, res) => {
      try {
        const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks : null;
        if (!tasks) return res.status(400).json({ ok: false, message: 'Tasks array required' });
        const current = await pool.query(`
          SELECT id, name, email, role, active, metadata
          FROM public.app_users
          WHERE id = $1
          LIMIT 1
        `, [req.user.id]);
        if (!current.rows.length) return res.status(404).json({ ok: false, message: 'User not found' });
        const existingMeta = current.rows[0].metadata && typeof current.rows[0].metadata === 'object' ? current.rows[0].metadata : {};
        const nextMeta = mergeRoleMetadata({
          ...existingMeta,
          assign_new_tasks: tasks.map((task) => ({
            id: String(task?.id || '').trim(),
            full_name: String(task?.full_name || '').trim(),
            email: String(task?.email || '').trim(),
            phone: String(task?.phone || '').trim(),
            advertisement: String(task?.advertisement || '').trim(),
            problem: String(task?.problem || '').trim(),
            created_at: String(task?.created_at || '').trim(),
            updated_at: String(task?.updated_at || '').trim(),
          })).filter((task) => task.full_name || task.problem)
        }, current.rows[0].role, current.rows[0]);
        await pool.query(`
          UPDATE public.app_users
          SET metadata = $2::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [req.user.id, JSON.stringify(nextMeta)]);
        res.json({ ok: true, tasks: nextMeta.assign_new_tasks || [] });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Assign new task save failed', error: error.message });
      }
    });

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
            AND COALESCE(data->>'source_assign_new_task_key', '') = ''
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
