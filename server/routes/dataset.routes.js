const express = require('express');

function createDatasetRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    const path = require('path');

    router.get('/task-report-feedback-source', (req, res) => {
      // Serve the embedded task report form from the public folder instead of a local Windows path
      const sourcePath = path.join(rootDir, 'public', 'features', 'executive', 'songjogayon-form.html');
      res.sendFile(sourcePath, (error) => {
        if (error) {
          console.error('Task report feedback source error:', error);
          res.status(error.statusCode || 500).send('Feedback source not available');
        }
      });
    });

    router.get('/autosuggestion-source', (req, res) => {
      // Serve a public autosuggestion page (fallback to admin program form if dedicated file not present)
      const candidate = path.join(rootDir, 'public', 'features', 'admin', 'program-form.html');
      const fallback = path.join(rootDir, 'public', 'index.html');
      const sourcePath = candidate;
      res.sendFile(sourcePath, (error) => {
        if (error) {
          console.error('Autosuggestion source error (candidate):', error);
          // fallback to index so admin still sees something
          res.sendFile(fallback, (err2) => {
            if (err2) {
              console.error('Autosuggestion fallback error:', err2);
              res.status(err2.statusCode || 500).send('Autosuggestion source not available');
            }
          });
        }
      });
    });
    
    router.get('/api/dataset-meta', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      const schema = await datasetSchema();
      res.json({ ok: true, schema });
    });
    
    router.get('/api/dataset-rows', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (req.user.role === 'executor' && !perms.exec_view_assigned_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const page = toInt(req.query.page, 1, 1, Number.MAX_SAFE_INTEGER);
        const pageSize = toInt(req.query.pageSize || req.query.limit, 50, 1, MAX_PAGE_SIZE);
        const filters = filtersFromQuery(req.query);
        const result = await queryDatasetRows(req.user, filters, page, pageSize);
        res.json({ ok: true, ...result });
      } catch (error) {
        console.error('Rows error:', error);
        res.status(500).json({ ok: false, message: 'Dataset rows load failed', error: error.message });
      }
    });
    
    router.get('/api/dataset-summary', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (req.user.role === 'executor' && !perms.exec_view_assigned_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const summary = await queryDatasetSummary(req.user, filtersFromQuery(req.query));
        res.json({ ok: true, summary });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Dataset summary load failed', error: error.message });
      }
    });
    
    router.put('/api/dataset-rows/:id', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (req.user.role === 'admin' && !perms.admin_rw_all_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      if (req.user.role === 'executor' && !perms.exec_update_stage_remarks) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const permissions = await getPermissionSettings();
        const requestedPersonal = PERSONAL_DATA_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(req.body, key))
          || Boolean(req.body.personal_info)
          || Object.prototype.hasOwnProperty.call(req.body, 'family_info')
          || Object.prototype.hasOwnProperty.call(req.body, 'attendance_history')
          || Object.prototype.hasOwnProperty.call(req.body, 'custom_fields');
        if (req.user.role === 'executor' && requestedPersonal && !permissions.executive_can_edit_personal_data) {
          return res.status(403).json({ ok: false, message: 'Executive personal-data editing is currently revoked by Admin' });
        }
    
        const allowed = req.user.role === 'admin'
          ? DATA_EDIT_FIELDS
          : (permissions.executive_can_edit_personal_data ? [...EXECUTOR_EDIT_FIELDS, ...PERSONAL_DATA_FIELDS] : []);
        const patch = {};
        for (const key of allowed) {
          if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key] ?? '';
        }
    
        const personal = req.body.personal_info && typeof req.body.personal_info === 'object' ? req.body.personal_info : {};
        const personalMap = [
          ['Full Name', ['full_name', 'Full Name', 'name']],
          ['Email', ['email', 'Email']],
          ['Mobile', ['mobile', 'Mobile']],
          ['Father\'s Name', ['father_name', 'Father\'s Name']],
          ['Mother\'s Name', ['mother_name', 'Mother\'s Name']],
          ['Date of Birth', ['date_of_birth', 'Date of Birth']],
          ['Marital Status', ['marital_status', 'Marital Status']],
          ['Blood Group', ['blood_group', 'Blood Group']],
          ['Occupation', ['occupation', 'Occupation', 'profession']],
          ['Present Address', ['present_address', 'Present Address', 'location']],
          ['Permanent Address', ['permanent_address', 'Permanent Address']],
        ];
        for (const [target, aliases] of personalMap) {
          if (!allowed.includes(target)) continue;
          for (const alias of aliases) {
            if (Object.prototype.hasOwnProperty.call(req.body, alias)) {
              patch[target] = req.body[alias] ?? '';
              break;
            }
            if (Object.prototype.hasOwnProperty.call(personal, alias)) {
              patch[target] = personal[alias] ?? '';
              break;
            }
          }
        }
    
        if (Object.prototype.hasOwnProperty.call(req.body, 'profile_classification') && allowed.includes('profile_classification')) {
          const classification = normalizeClassification(req.body.profile_classification);
          if (!PROFILE_CLASS_OPTIONS.has(classification)) return res.status(400).json({ ok: false, message: 'Invalid profile classification' });
          patch.profile_classification = classification;
        }
    
        if (Object.prototype.hasOwnProperty.call(req.body, 'family_info') && allowed.includes('family_info')) {
          patch.family_info = req.body.family_info && typeof req.body.family_info === 'object' ? req.body.family_info : {};
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'attendance_history') && allowed.includes('attendance_history')) {
          patch.attendance_history = Array.isArray(req.body.attendance_history) ? req.body.attendance_history : [];
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'custom_fields') && allowed.includes('custom_fields')) {
          patch.custom_fields = req.body.custom_fields && typeof req.body.custom_fields === 'object' ? req.body.custom_fields : {};
        }
    
        if (patch['Full Name'] !== undefined) patch.Name = patch['Full Name'];
        if (patch.Occupation !== undefined) patch.Profession = patch.Occupation;
        if (patch['Present Address'] !== undefined && patch.Location === undefined) patch.Location = patch['Present Address'];
        const dobValue = patch['Date of Birth'] ?? patch.date_of_birth ?? patch['date_of_birth'];
        if (dobValue !== undefined) {
          const calculatedAge = calculateAgeFromDob(dobValue);
          patch['Date of Birth'] = dobValue;
          patch.date_of_birth = dobValue;
          patch.Age = calculatedAge;
          patch.age = calculatedAge;
        }
    
        if (patch.Stage && !CALL_STAGE_OPTIONS.includes(String(patch.Stage))) {
          return res.status(400).json({ ok: false, message: 'Invalid call details stage' });
        }
        if (patch.Stage) patch.task_status = taskStatusFromStage(patch.Stage, req.user.role === 'executor' ? 'Updated' : 'Updated');
        else if (req.user.role === 'executor') patch.task_status = 'Updated';
        if (!Object.keys(patch).length) return res.status(400).json({ ok: false, message: 'No update fields sent' });
    
        await client.query('BEGIN');
        const selectValues = [DATASET_ID, String(req.params.id)];
        let where = 'dataset_id = $1 AND id::text = $2';
    
        const before = await client.query(`
          SELECT id::text, row_number, data
          FROM public.dataset_rows
          WHERE ${where}
          FOR UPDATE
        `, selectValues);
        if (!before.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Row not found' });
        }
    
        const changes = buildChangeSet(before.rows[0].data, patch);
        const updateValues = [JSON.stringify(patch), DATASET_ID, String(req.params.id)];
        const result = await client.query(`
          UPDATE public.dataset_rows
          SET data = data || $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE dataset_id = $2 AND id::text = $3
          RETURNING id::text, row_number, data
        `, updateValues);
    
        let updatedRow = result.rows[0];
        let accountNote = '';
        const rowClassification = normalizeClassification(updatedRow.data?.profile_classification || updatedRow.data?.Classification || updatedRow.data?.Role);
        const shouldSyncSoftwareAccount = req.user.role === 'admin'
          && (Object.prototype.hasOwnProperty.call(patch, 'profile_classification')
            || String(updatedRow.data?.app_user_id || '').trim()
            || rowClassification === 'Executive');
        if (shouldSyncSoftwareAccount) {
          const sync = await syncProfileSoftwareAccount(client, updatedRow, req.user);
          if (sync.patch) {
            const syncChanges = buildChangeSet(updatedRow.data, sync.patch);
            Object.assign(changes, syncChanges);
            const synced = await client.query(`
              UPDATE public.dataset_rows
              SET data = data || $1::jsonb,
                  updated_at = CURRENT_TIMESTAMP
              WHERE dataset_id = $2 AND id::text = $3
              RETURNING id::text, row_number, data
            `, [JSON.stringify(sync.patch), DATASET_ID, String(req.params.id)]);
            updatedRow = synced.rows[0];
          }
          accountNote = sync.account
            ? ` Executive software account synced: ${sync.account.email}.`
            : ' Executive software account deactivated for non-Executive profile classification.';
        }
    
        const notes = `${String(req.body.call_notes || req.body.notes || '')}${accountNote}`.trim();
        if (Object.keys(changes).length || notes) {
          const hasCallChange = ['Stage', 'Problem', 'Remarks'].some((field) => Object.prototype.hasOwnProperty.call(changes, field));
          await insertRowEvent(client, updatedRow, (req.body.call_notes || hasCallChange) ? 'call_update' : 'profile_update', req.user, changes, notes);
        }
    
        await client.query('COMMIT');
        res.json({ ok: true, message: 'Profile updated', row: normalizeRow({ ...updatedRow, raw_data: updatedRow.data }) });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Update error:', error);
        res.status(500).json({ ok: false, message: 'Update failed', error: error.message });
      } finally {
        client.release();
      }
    });
    
    router.get('/api/dataset-rows/:id', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (req.user.role === 'executor' && !perms.exec_view_client_details) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const values = [DATASET_ID, String(req.params.id)];
        let where = 'dataset_id = $1 AND id::text = $2';
        if (req.user.role === 'executor') {
          values.push(req.user.id);
          where += ` AND COALESCE(data->>'assigned_to', '') = $${values.length}`;
        }
        const result = await pool.query(`
          SELECT id::text, row_number, data
          FROM public.dataset_rows
          WHERE ${where}
          LIMIT 1
        `, values);
        if (!result.rows.length) return res.status(404).json({ ok: false, message: 'Row not found' });
        res.json({ ok: true, row: normalizeRow({ ...result.rows[0], raw_data: result.rows[0].data }) });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Row load failed', error: error.message });
      }
    });
    
    router.delete('/api/dataset-rows/:id/attendance/:index', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (req.user.role === 'admin' && !perms.admin_rw_all_profiles) return res.status(403).json({ ok: false, message: 'Permission denied' });
      if (req.user.role === 'executor' && !perms.exec_manage_attendance) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const permissions = await getPermissionSettings();
        if (req.user.role === 'executor' && !permissions.executive_can_edit_personal_data) {
          return res.status(403).json({ ok: false, message: 'Executive personal-data editing is currently revoked by Admin' });
        }
    
        const index = toInt(req.params.index, -1, -1, Number.MAX_SAFE_INTEGER);
        if (index < 0) return res.status(400).json({ ok: false, message: 'Invalid attendance row index' });
    
        await client.query('BEGIN');
        const values = [DATASET_ID, String(req.params.id)];
        let where = 'dataset_id = $1 AND id::text = $2';
    
        const before = await client.query(`
          SELECT id::text, row_number, data
          FROM public.dataset_rows
          WHERE ${where}
          FOR UPDATE
        `, values);
        if (!before.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Row not found' });
        }
    
        const attendance = normalizeAttendanceList(before.rows[0].data.attendance_history);
        if (index >= attendance.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Attendance row not found' });
        }
        const removed = attendance.splice(index, 1)[0];
        const patch = { attendance_history: attendance };
        const result = await client.query(`
          UPDATE public.dataset_rows
          SET data = data || $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE dataset_id = $2 AND id::text = $3
          RETURNING id::text, row_number, data
        `, [JSON.stringify(patch), DATASET_ID, String(req.params.id)]);
    
        await insertRowEvent(client, result.rows[0], 'profile_update', req.user, {
          attendance_history: {
            from: before.rows[0].data.attendance_history || [],
            to: attendance,
          },
          removed_attendance: { from: removed, to: '' },
        }, `Removed attendance row: ${removed.event_name || 'Unnamed Event'}`);
    
        await client.query('COMMIT');
        res.json({
          ok: true,
          message: 'Attendance row removed',
          row: normalizeRow({ ...result.rows[0], raw_data: result.rows[0].data }),
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        res.status(500).json({ ok: false, message: 'Attendance remove failed', error: error.message });
      } finally {
        client.release();
      }
    });
    
    router.post('/api/dataset-rows/:id/read', requireAuth, requireRole(['executor']), async (req, res) => {
      try {
        const readAt = new Date().toISOString();
        const result = await pool.query(`
          UPDATE public.dataset_rows
          SET data = data || $1::jsonb,
              updated_at = CURRENT_TIMESTAMP
          WHERE dataset_id = $2
            AND id::text = $3
            AND COALESCE(data->>'executive_read_at', '') = ''
          RETURNING id::text, row_number, data
        `, [JSON.stringify({ executive_read_at: readAt }), DATASET_ID, String(req.params.id)]);
        if (result.rows[0]) {
          await insertRowEvent(pool, result.rows[0], 'profile_update', req.user, {
            executive_read_at: { from: '', to: readAt },
          }, 'Executive opened the profile');
        }
        res.json({ ok: true, read_at: readAt, updated: result.rowCount });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'Read status update failed', error: error.message });
      }
    });
    
    router.get('/api/dataset-rows/:id/history', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      try {
        const rowId = String(req.params.id);
        const access = await pool.query(`SELECT id::text, row_number FROM public.dataset_rows WHERE dataset_id = $1 AND id::text = $2`, [DATASET_ID, rowId]);
        if (!access.rows.length) return res.status(404).json({ ok: false, message: 'Row not found' });
    
        const history = await pool.query(`
          SELECT
            id::text,
            event_type,
            actor_id,
            actor_name,
            actor_role,
            changes,
            notes,
            created_at
          FROM public.dataset_row_events
          WHERE dataset_id = $1 AND row_id = $2 AND deleted_at IS NULL
          ORDER BY created_at DESC, id DESC
        `, [DATASET_ID, rowId]);
        res.json({ ok: true, history: history.rows });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'History load failed', error: error.message });
      }
    });
    
    router.delete('/api/dataset-rows/:id/history/:eventId', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_clear_history) return res.status(403).json({ ok: false, message: 'Permission denied' });
      try {
        const result = await pool.query(`
          UPDATE public.dataset_row_events
          SET deleted_at = CURRENT_TIMESTAMP,
              deleted_by = $1
          WHERE dataset_id = $2 AND row_id = $3 AND id::text = $4 AND deleted_at IS NULL
          RETURNING id
        `, [req.user.id, DATASET_ID, String(req.params.id), String(req.params.eventId)]);
        if (!result.rows.length) return res.status(404).json({ ok: false, message: 'History entry not found' });
        res.json({ ok: true, message: 'History entry removed' });
      } catch (error) {
        res.status(500).json({ ok: false, message: 'History remove failed', error: error.message });
      }
    });
    
    router.delete('/api/dataset-rows/:id/history', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_clear_history) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const row = await client.query(`
          SELECT id::text, row_number, data
          FROM public.dataset_rows
          WHERE dataset_id = $1 AND id::text = $2
          FOR UPDATE
        `, [DATASET_ID, String(req.params.id)]);
        if (!row.rows.length) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Row not found' });
        }
        const removed = await client.query(`
          UPDATE public.dataset_row_events
          SET deleted_at = CURRENT_TIMESTAMP,
              deleted_by = $1
          WHERE dataset_id = $2 AND row_id = $3 AND deleted_at IS NULL
        `, [req.user.id, DATASET_ID, String(req.params.id)]);
        await insertRowEvent(client, row.rows[0], 'history_clear', req.user, {
          removed_entries: { from: removed.rowCount, to: 0 },
        }, 'Admin cleared profile history');
        await client.query('COMMIT');
        res.json({ ok: true, message: 'History cleared', removed: removed.rowCount });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        res.status(500).json({ ok: false, message: 'History clear failed', error: error.message });
      } finally {
        client.release();
      }
    });
    
    router.get('/dataset-rows', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
      try {
        const result = await queryDatasetRows(req.user, filtersFromQuery(req.query), 1, 50);
        res.json(result.rows);
      } catch (error) {
        res.status(500).json({ message: 'Data ante problem hocche', error: error.message });
      }
    });
  }
  return router;
}

module.exports = createDatasetRoutes;
