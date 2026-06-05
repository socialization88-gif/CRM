const express = require('express');

function createExecutiveRequestsRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    router.post('/api/executive-account-requests', async (req, res) => {
      try {
        const fullName = String(req.body.fullName || req.body.name || '').trim();
        const phoneNumber = String(req.body.phoneNumber || req.body.phone || '').trim();
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '').trim();
        const confirmPassword = String(req.body.confirmPassword || '').trim();
    
        if (!fullName || !phoneNumber || !email || !password || !confirmPassword) {
          return res.status(400).json({ ok: false, message: 'All fields are required' });
        }
        if (password !== confirmPassword) {
          return res.status(400).json({ ok: false, message: 'Password and confirm password must match' });
        }
        if (password.length < 6) {
          return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
        }
    
        const existingAccount = await pool.query(
          `SELECT id FROM public.app_users WHERE LOWER(email) = $1 LIMIT 1`,
          [email]
        );
        if (existingAccount.rows.length) {
          return res.status(409).json({ ok: false, message: 'Email already exists' });
        }
    
        const existingRequest = await pool.query(
          `SELECT id FROM public.executive_account_requests WHERE LOWER(email) = $1 AND status = 'pending' LIMIT 1`,
          [email]
        );
        if (existingRequest.rows.length) {
          return res.status(409).json({ ok: false, message: 'A pending request already exists for this email' });
        }
    
        const passwordHash = await bcrypt.hash(password, 12);
        const created = await pool.query(
          `
          INSERT INTO public.executive_account_requests (full_name, phone_number, email, password_hash, status)
          VALUES ($1, $2, $3, $4, 'pending')
          RETURNING id, full_name, phone_number, email, status, requested_at
          `,
          [fullName, phoneNumber, email, passwordHash]
        );
        const request = created.rows[0];
    
        const mailResult = await sendExecutiveRequestSubmissionEmail(request);
    
        res.status(201).json({
          ok: true,
          message: 'Your request has been submitted and sent to admin for approval.',
          ...(mailResult.sent ? {} : { dev_notice: 'Email service is not configured; a dev log was generated.' }),
        });
      } catch (error) {
        console.error('Executive request submit error:', error);
        const message = error.code === '23505' ? 'Email already exists' : error.message;
        res.status(500).json({ ok: false, message: message || 'Request submission failed' });
      }
    });
    
    router.get('/api/admin/executive-account-requests', requireAuth, requireRole(['admin']), async (req, res) => {
      try {
        const perms = await getPermissionSettings();
        if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied' });
        const result = await pool.query(`
          SELECT id, full_name, phone_number, email, status, requested_at, reviewed_at, reviewed_by, created_user_id
          FROM public.executive_account_requests
          WHERE status = 'pending'
          ORDER BY requested_at ASC, id ASC
        `);
        res.json({ ok: true, requests: result.rows });
      } catch (error) {
        console.error('Load executive requests error:', error);
        res.status(500).json({ ok: false, message: 'Failed to load executive requests', error: error.message });
      }
    });
    
    router.post('/api/admin/executive-account-requests/:id/approve', requireAuth, requireRole(['admin']), async (req, res) => {
      const perms = await getPermissionSettings();
      if (!perms.admin_create_accounts) return res.status(403).json({ ok: false, message: 'Permission denied' });
      const client = await pool.connect();
      try {
        const requestId = String(req.params.id || '').trim();
        if (!requestId) return res.status(400).json({ ok: false, message: 'Request id required' });
    
        await client.query('BEGIN');
        const requestResult = await client.query(`
          SELECT id, full_name, phone_number, email, password_hash, status, requested_at
          FROM public.executive_account_requests
          WHERE id = $1
          FOR UPDATE
        `, [requestId]);
    
        const request = requestResult.rows[0];
        if (!request) {
          await client.query('ROLLBACK');
          return res.status(404).json({ ok: false, message: 'Request not found' });
        }
        if (request.status !== 'pending') {
          await client.query('ROLLBACK');
          return res.status(400).json({ ok: false, message: 'This request is no longer pending' });
        }
    
        const duplicate = await client.query(
          `SELECT id FROM public.app_users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
          [request.email]
        );
        if (duplicate.rows.length) {
          await client.query('ROLLBACK');
          return res.status(409).json({ ok: false, message: 'An account already exists for this email' });
        }
    
        const approvedUserId = `executor-req-${request.id}`;
        const metadata = mergeRoleMetadata({
          source: 'executive_account_request',
          request_id: request.id,
          request_phone_number: request.phone_number,
          request_status: 'approved',
          approved_by: req.user.id,
          approved_by_name: req.user.name,
          approved_at: new Date().toISOString(),
        }, 'Executive');
    
        const insertedUser = await client.query(`
          INSERT INTO public.app_users (id, name, email, password_hash, role, active, metadata)
          VALUES ($1, $2, $3, $4, 'executor', TRUE, $5::jsonb)
          RETURNING id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
        `, [
          approvedUserId,
          request.full_name,
          request.email,
          request.password_hash,
          JSON.stringify(metadata),
        ]);
    
        await client.query(`
          UPDATE public.executive_account_requests
          SET status = 'approved',
              reviewed_at = CURRENT_TIMESTAMP,
              reviewed_by = $2,
              created_user_id = $3
          WHERE id = $1
        `, [request.id, req.user.id, insertedUser.rows[0].id]);
    
        await client.query('COMMIT');
    
        await sendExecutiveRequestApprovedEmail(
          { email: request.email, full_name: request.full_name },
          req.user.name
        ).catch((error) => {
          console.error('Approval email failed:', error);
        });
    
        res.json({
          ok: true,
          message: 'Executive request approved and account created',
          user: safeUser(insertedUser.rows[0]),
        });
      } catch (error) {
        await client.query('ROLLBACK').catch(() => { });
        console.error('Approve executive request error:', error);
        res.status(500).json({ ok: false, message: 'Approval failed', error: error.message });
      } finally {
        client.release();
      }
    });
  }
  return router;
}

module.exports = createExecutiveRequestsRoutes;
