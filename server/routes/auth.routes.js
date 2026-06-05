const express = require('express');

function createAuthRoutes(ctx) {
  const router = express.Router();
  with (ctx) {
    router.get('/forgot-password', (req, res) => {
      res.sendFile(forgotPasswordPagePath());
    });
    
    router.get('/reset-password/:token', (req, res) => {
      res.sendFile(resetPasswordPagePath());
    });
    
    router.get('/reset-password', (req, res) => {
      res.sendFile(resetPasswordPagePath());
    });
    
    router.get('/create-executive-account', (req, res) => {
      res.sendFile(createExecutiveAccountPagePath());
    });
    
    router.post('/api/auth/login', async (req, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        const requestedRole = req.body.role ? normalizeSoftwareRole(req.body.role, '') : '';
        if (!email || !password) return res.status(400).json({ ok: false, message: 'Email and password required' });
        if (requestedRole && !ROLE_VALUES.has(requestedRole)) return res.status(400).json({ ok: false, message: 'Invalid software role' });
    
        const result = await pool.query('SELECT * FROM public.app_users WHERE LOWER(email) = $1', [email]);
        const user = result.rows[0];
        if (!user || !user.active || !verifyPassword(password, user.password_hash)) {
          return res.status(401).json({ ok: false, message: 'Invalid login credentials' });
        }
        if (requestedRole && user.role !== requestedRole) {
          return res.status(403).json({ ok: false, message: `This account is not a ${requestedRole === 'executor' ? 'Executive' : 'Admin'} account` });
        }
    
        const publicUser = safeUser(user);
        res.json({ ok: true, user: publicUser, token: makeToken(publicUser) });
      } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ ok: false, message: 'Login failed', error: error.message });
      }
    });
    
    router.post('/api/auth/forgot-password', async (req, res) => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ ok: false, message: 'Email required' });
    
        const result = await pool.query(
          `SELECT id, name, email, role, active FROM public.app_users WHERE LOWER(email) = $1 LIMIT 1`,
          [email]
        );
        const user = result.rows[0];
        if (user && user.active) {
          const { token, tokenHash } = generateResetToken();
          const expiresAt = new Date(Date.now() + RESET_PASSWORD_TTL_SECONDS * 1000);
          const resetUrl = `${appBaseUrl(req)}/reset-password/${encodeURIComponent(token)}`;
          await pool.query(
            `
            UPDATE public.app_users
            SET reset_password_token_hash = $2,
                reset_password_token_expires_at = $3,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
            `,
            [user.id, tokenHash, expiresAt]
          );
          const mailResult = await sendResetPasswordEmail(user, resetUrl);
          return res.json({
            ok: true,
            message: 'If the email exists, a reset link has been sent.',
            ...(mailResult.devLink ? { dev_reset_link: mailResult.devLink } : {}),
          });
        }
    
        return res.json({
          ok: true,
          message: 'If the email exists, a reset link has been sent.',
        });
      } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ ok: false, message: 'Password reset request failed', error: error.message });
      }
    });
    
    router.get(['/api/auth/reset-password/validate', '/api/auth/reset-password/validate/:token'], async (req, res) => {
      try {
        const token = String(req.params.token || req.query.token || '').trim();
        if (!token) return res.status(400).json({ ok: false, message: 'Token required' });
        const tokenHash = hashResetToken(token);
        const result = await pool.query(
          `
          SELECT id, email, reset_password_token_expires_at
          FROM public.app_users
          WHERE reset_password_token_hash = $1
            AND reset_password_token_expires_at IS NOT NULL
            AND reset_password_token_expires_at > CURRENT_TIMESTAMP
          LIMIT 1
          `,
          [tokenHash]
        );
        if (!result.rows.length) return res.status(400).json({ ok: false, message: 'Reset link is invalid or expired' });
        res.json({ ok: true, email: result.rows[0].email });
      } catch (error) {
        console.error('Reset password validate error:', error);
        res.status(500).json({ ok: false, message: 'Reset link validation failed', error: error.message });
      }
    });
    
    router.post('/api/auth/reset-password', async (req, res) => {
      try {
        const token = String(req.body.token || '').trim();
        const password = String(req.body.password || '').trim();
        const confirmPassword = String(req.body.confirmPassword || '').trim();
        if (!token || !password || !confirmPassword) return res.status(400).json({ ok: false, message: 'Token and new password required' });
        if (password !== confirmPassword) return res.status(400).json({ ok: false, message: 'Passwords do not match' });
        if (password.length < 6) return res.status(400).json({ ok: false, message: 'Password must be at least 6 characters' });
    
        const tokenHash = hashResetToken(token);
        const result = await pool.query(
          `
          SELECT id
          FROM public.app_users
          WHERE reset_password_token_hash = $1
            AND reset_password_token_expires_at IS NOT NULL
            AND reset_password_token_expires_at > CURRENT_TIMESTAMP
          LIMIT 1
          `,
          [tokenHash]
        );
        const user = result.rows[0];
        if (!user) return res.status(400).json({ ok: false, message: 'Reset link is invalid or expired' });
    
        await pool.query(
          `
          UPDATE public.app_users
          SET password_hash = $2,
              reset_password_token_hash = NULL,
              reset_password_token_expires_at = NULL,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $1
          `,
          [user.id, bcrypt.hashSync(password, 12)]
        );
    
        res.json({ ok: true, message: 'Password updated successfully' });
      } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ ok: false, message: 'Password reset failed', error: error.message });
      }
    });
    
    router.get('/api/auth/me', requireAuth, (req, res) => {
      res.json({ ok: true, user: req.user });
    });
  }
  return router;
}

module.exports = createAuthRoutes;
