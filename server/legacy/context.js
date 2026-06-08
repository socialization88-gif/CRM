const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { sendMailMessage } = require('../services/notification.service');

function createContext({ pool, rootDir, env }) {
  const crypto = require('crypto');
  const path = require('path');
  const bcrypt = require('bcrypt');
  const { sendMailMessage } = require('../services/notification.service');
  const PORT = env.PORT;
  const HOST = env.HOST;
  const PORT_RETRY_LIMIT = env.PORT_RETRY_LIMIT;
  const DATASET_ID = env.DATASET_ID;
  const TOKEN_TTL_SECONDS = env.TOKEN_TTL_SECONDS;
  const RESET_PASSWORD_TTL_SECONDS = env.RESET_PASSWORD_TTL_SECONDS;
  const MAX_PAGE_SIZE = env.MAX_PAGE_SIZE;
  
  const ROW_FIELDS = [
    ['SL', 'sl'],
    ['Date', 'date'],
    ['Name', 'name'],
    ['Full Name', 'full_name'],
    ['Email', 'email'],
    ['Mobile', 'mobile'],
    ['Problem', 'problem'],
    ['Executive', 'executive'],
    ['Age', 'age'],
    ['Profession', 'profession'],
    ['Occupation', 'occupation'],
    ['Location', 'location'],
    ['Stage', 'stage'],
    ['Advertisement', 'advertisement'],
    ['Remarks', 'remarks'],
    ['Father\'s Name', 'father_name'],
    ['Mother\'s Name', 'mother_name'],
    ['Date of Birth', 'date_of_birth'],
    ['Marital Status', 'marital_status'],
    ['Blood Group', 'blood_group'],
    ['Present Address', 'present_address'],
    ['Permanent Address', 'permanent_address'],
    ['profile_classification', 'profile_classification'],
    ['app_user_id', 'app_user_id'],
    ['family_info', 'family_info'],
    ['attendance_history', 'attendance_history'],
    ['custom_fields', 'custom_fields'],
    ['executive_read_at', 'executive_read_at'],
    ['assigned_to', 'assigned_to'],
    ['assigned_to_name', 'assigned_to_name'],
    ['assigned_to_email', 'assigned_to_email'],
    ['task_status', 'task_status'],
    ['admin_instruction', 'admin_instruction'],
    ['assigned_at', 'assigned_at'],
  ];
  
  const DATA_EDIT_FIELDS = [
    'SL',
    'Date',
    'Name',
    'Full Name',
    'Email',
    'Mobile',
    'Problem',
    'Executive',
    'Age',
    'Profession',
    'Occupation',
    'Location',
    'Stage',
    'Advertisement',
    'Remarks',
    'Father\'s Name',
    'Mother\'s Name',
    'Date of Birth',
    'Marital Status',
    'Blood Group',
    'Present Address',
    'Permanent Address',
    'profile_classification',
    'app_user_id',
    'family_info',
    'attendance_history',
    'custom_fields',
    'executive_read_at',
    'assigned_to',
    'assigned_to_name',
    'assigned_to_email',
    'task_status',
    'admin_instruction',
  ];
  
  const EXECUTOR_EDIT_FIELDS = ['Stage', 'Problem', 'Remarks'];
  const PERSONAL_DATA_FIELDS = [
    'Name',
    'Full Name',
    'Email',
    'Mobile',
    'Age',
    'Profession',
    'Occupation',
    'Location',
    'Father\'s Name',
    'Mother\'s Name',
    'Date of Birth',
    'Marital Status',
    'Blood Group',
    'Present Address',
    'Permanent Address',
    'family_info',
    'attendance_history',
    'custom_fields',
  ];
  const ROLE_VALUES = new Set(['admin', 'executor']);
  const AI_PROVIDERS = new Set(['local', 'openai', 'gemini', 'anthropic']);
  const AI_VENDOR_MODELS = {
    local: ['local-parser'],
    openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
    gemini: ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-pro'],
    anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest'],
  };
  const COMPLETED_STAGES = new Set(['completed', 'complete', 'handled', 'done', 'closed']);
  const CALL_STAGE_OPTIONS = ['Interested', 'Active', 'Inactive', 'Pending', 'Completed', 'Handled', 'Dropped', 'Counselling', 'Follow Up'];
  const PROFILE_CLASS_OPTIONS = new Set(['Admin', 'Executive', 'User']);
  let langChainAgentState = {
    initialized: false,
    provider: '',
    model: '',
    initialized_at: null,
    error: '',
  };
  function base64url(input) {
    return Buffer.from(input).toString('base64url');
  }
  
  function appSecret() {
    return process.env.APP_SECRET || process.env.DATABASE_URL || 'quantum-work-management-local-secret';
  }
  
  function signPayload(payload) {
    return crypto.createHmac('sha256', appSecret()).update(payload).digest('base64url');
  }

  function signaturesMatch(actual, expected) {
    try {
      const actualBuffer = Buffer.from(String(actual || ''), 'base64url');
      const expectedBuffer = Buffer.from(String(expected || ''), 'base64url');
      return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }
  
  function makeToken(user) {
    const payload = base64url(JSON.stringify({
      sub: user.id,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }));
    return `${payload}.${signPayload(payload)}`;
  }
  
  function readTokenPayload(req) {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !signaturesMatch(signature, signPayload(payload))) return null;
    try {
      const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      if (!parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
      return parsed;
    } catch {
      return null;
    }
  }
  
  function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
    return `pbkdf2$120000$${salt}$${hash}`;
  }
  
  function verifyPassword(password, encoded) {
    if (String(encoded || '').startsWith('$2')) {
      return bcrypt.compareSync(String(password), String(encoded || ''));
    }
    const [kind, iterations, salt, expected] = String(encoded || '').split('$');
    if (kind !== 'pbkdf2' || !iterations || !salt || !expected) return false;
    const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, 'sha256').toString('hex');
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
  }
  
  function hashResetToken(token) {
    return crypto.createHash('sha256').update(String(token || '')).digest('hex');
  }
  
  function generateResetToken() {
    const token = crypto.randomBytes(32).toString('hex');
    return {
      token,
      tokenHash: hashResetToken(token),
    };
  }
  
  function appBaseUrl(req) {
    const configured = String(process.env.APP_BASE_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;
    const host = req.get('host') || `localhost:${PORT}`;
    return `${req.protocol}://${host}`;
  }
  
  async function sendResetPasswordEmail(user, resetUrl) {
    const transporter = getMailTransporter();
    const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'noreply@quantum.local';
    if (!transporter) {
      console.log(`[password-reset] ${user.email}: ${resetUrl}`);
      return { sent: false, devLink: resetUrl };
    }
    await transporter.sendMail({
      from,
      to: user.email,
      subject: 'Reset your Quantum password',
      text: `Use this link to reset your password: ${resetUrl}`,
      html: `<p>Use this link to reset your password:</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
    });
    return { sent: true };
  }
  
  async function sendExecutiveRequestSubmissionEmail(request) {
    const message = 'Your form has been submitted successfully. Your account creation request has been sent to the admin for approval. Please wait for admin approval. After admin approval, you will receive a confirmation email. Then you can log in using your email and password.';
    return sendMailMessage({
      to: request.email,
      subject: 'Executive account request submitted',
      text: message,
      html: `<p>${escapeHtml(message)}</p>`,
      logPrefix: 'executive-request',
    });
  }
  
  async function sendExecutiveRequestApprovedEmail(request, approvedByName) {
    const message = `Your executive account request has been approved${approvedByName ? ` by ${approvedByName}` : ''}. You can now log in using your email and password.`;
    return sendMailMessage({
      to: request.email,
      subject: 'Executive account request approved',
      text: message,
      html: `<p>${escapeHtml(message)}</p>`,
      logPrefix: 'executive-approved',
    });
  }
  
  async function sendExecutiveCredentialsEmail(account, plainPassword) {
    const message = `Your executive account has been created successfully.\n\nEmail: ${account.email}\nPassword: ${plainPassword}\n\nYou can now log in using these credentials.`;
    return sendMailMessage({
      to: account.email,
      subject: 'Your Executive Account Credentials',
      text: message,
      html: `
        <p>Your executive account has been created successfully.</p>
        <p><strong>Email:</strong> ${escapeHtml(account.email)}</p>
        <p><strong>Password:</strong> ${escapeHtml(plainPassword)}</p>
        <p>You can now log in using these credentials.</p>
      `,
      logPrefix: 'executive-created',
    });
  }
  
  function resetPasswordPagePath() {
    return path.join(rootDir, 'public', 'pages', 'auth', 'reset-password.html');
  }
  
  function forgotPasswordPagePath() {
    return path.join(rootDir, 'public', 'pages', 'auth', 'forgot-password.html');
  }
  
  function createExecutiveAccountPagePath() {
    return path.join(rootDir, 'public', 'pages', 'auth', 'create-executive-account.html');
  }
  
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    }[m]));
  }
  
  function normalizeSoftwareRole(value, fallback = 'executor') {
    const role = String(value || fallback).trim().toLowerCase();
    if (role === 'executive') return 'executor';
    if (role === 'admin') return 'admin';
    if (role === 'executor') return 'executor';
    return role;
  }
  
  function normalizeChatSessionId(value) {
    return String(value || '').trim().slice(0, 120);
  }
  
  function normalizeChatRole(role) {
    return role === 'assistant' ? 'assistant' : 'user';
  }
  
  async function rotateChatHistory(client, userId, sessionId) {
    await client.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY user_id, session_id ORDER BY created_at DESC, id DESC) AS rn
        FROM public.ai_chat_messages
        WHERE user_id = $1 AND session_id = $2
      )
      DELETE FROM public.ai_chat_messages m
      USING ranked r
      WHERE m.id = r.id
        AND r.rn > 30
    `, [userId, sessionId]);
  }
  
  async function saveChatMessage(client, userId, sessionId, role, contentHtml, meta = {}) {
    const result = await client.query(`
      INSERT INTO public.ai_chat_messages (user_id, session_id, role, content_html, meta)
      VALUES ($1, $2, $3, $4, $5::jsonb)
      RETURNING id, user_id, session_id, role, content_html, meta, created_at
    `, [userId, sessionId, normalizeChatRole(role), String(contentHtml || ''), JSON.stringify(meta || {})]);
    await rotateChatHistory(client, userId, sessionId);
    return result.rows[0];
  }
  
  async function loadChatHistory(userId, sessionId) {
    const result = await pool.query(`
      SELECT id::text, user_id, session_id, role, content_html, meta, created_at
      FROM public.ai_chat_messages
      WHERE user_id = $1 AND session_id = $2
      ORDER BY created_at ASC, id ASC
    `, [userId, sessionId]);
    return result.rows;
  }
  
  function safeUser(row) {
    if (!row) return null;
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const personal = metadata.personal_info && typeof metadata.personal_info === 'object' ? metadata.personal_info : {};
    const profileData = row.profile_data && typeof row.profile_data === 'object' ? row.profile_data : {};
    const profilePersonal = profileData.personal_info && typeof profileData.personal_info === 'object' ? profileData.personal_info : {};
    const phoneNumbers = normalizePhoneNumbers(parseJsonField(metadata.phone_numbers ?? personal.phone_numbers ?? profileData.phone_numbers ?? profilePersonal.phone_numbers, []));
    const displayName = personal.full_name || profilePersonal.full_name || metadata.full_name || profileData['Full Name'] || profileData.Name || row.name || '';
    const displayEmail = personal.email || profilePersonal.email || metadata.email || profileData.Email || profileData.email || row.email || '';
    const roleDetails = metadata.role_details && typeof metadata.role_details === 'object'
      ? metadata.role_details
      : buildRoleDetails(row.profile_classification || row.role || 'User', row);
    return {
      id: row.id,
      name: displayName,
      email: displayEmail,
      role: row.role,
      active: row.active,
      profile_row_id: row.profile_row_id || null,
      metadata: { ...metadata, role_details: roleDetails },
      profile_data: profileData,
      mobile: personal.mobile || profilePersonal.mobile || metadata.mobile || profileData.mobile || profileData.Mobile || row.mobile || phoneNumbers[0] || '',
      phone_numbers: phoneNumbers,
      full_name: personal.full_name || profilePersonal.full_name || metadata.full_name || profileData['Full Name'] || row.name || '',
      profile_classification: metadata.profile_classification || profileData.profile_classification || row.profile_classification || row.role || '',
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
  
  async function getUserById(id) {
    const result = await pool.query(
      `
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
        ON r.dataset_id = $2
       AND r.id::text = u.profile_row_id
      WHERE u.id = $1
      `,
      [id, DATASET_ID]
    );
    return safeUser(result.rows[0]);
  }
  
  async function requireAuth(req, res, next) {
    try {
      const payload = readTokenPayload(req);
      if (!payload) return res.status(401).json({ ok: false, message: 'Login required' });
      const user = await getUserById(payload.sub);
      if (!user || !user.active) return res.status(401).json({ ok: false, message: 'Account is inactive or missing' });
      req.user = user;
      next();
    } catch (error) {
      next(error);
    }
  }
  
  function requireRole(roles) {
    return (req, res, next) => {
      if (!req.user) return res.status(401).json({ ok: false, message: 'Login required' });
      if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, message: 'No access permitted' });
      next();
    };
  }
  
  function encryptionKey() {
    return crypto.createHash('sha256').update(appSecret()).digest();
  }
  
  function encryptSecret(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    return {
      iv: iv.toString('base64url'),
      tag: cipher.getAuthTag().toString('base64url'),
      encrypted: encrypted.toString('base64url'),
    };
  }
  
  function decryptSecret(payload) {
    if (!payload?.encrypted || !payload?.iv || !payload?.tag) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(payload.iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
  
  function toInt(value, fallback, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }
  
  function rowSelectSql() {
    const jsonFields = ROW_FIELDS
      .map(([key, alias]) => `r.data->>'${String(key).replace(/'/g, "''")}' AS ${alias}`)
      .join(',\n      ');
    return `
      SELECT
        r.id::text AS id,
        r.row_number,
        r.data AS raw_data,
        ${jsonFields},
        COALESCE(u.name, r.data->>'assigned_to_name') AS manager_name,
        COALESCE(u.email, r.data->>'assigned_to_email') AS manager_email,
        u.active AS manager_active
      FROM public.dataset_rows r
      LEFT JOIN public.app_users u ON u.id = r.data->>'assigned_to'
    `;
  }
  
  function parseJsonField(value, fallback) {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  
  function normalizePhoneNumbers(value) {
    const rawList = Array.isArray(value) ? value : value ? [value] : [];
    const result = [];
    const seen = new Set();
    for (const item of rawList.flat ? rawList.flat(Infinity) : rawList) {
      const phone = String(item ?? '').trim();
      if (!phone || seen.has(phone)) continue;
      seen.add(phone);
      result.push(phone);
    }
    return result;
  }
  
  function normalizeAttendanceList(value) {
    const list = parseJsonField(value, []);
    if (!Array.isArray(list)) return [];
    return list.map((item) => {
      if (typeof item === 'string') return { event_name: item, timestamp: '' };
      return {
        event_name: item?.event_name || item?.event || item?.name || '',
        timestamp: item?.timestamp || item?.time || item?.date || '',
        notes: item?.notes || '',
      };
    });
  }
  
  function normalizeClassification(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'admin') return 'Admin';
    if (raw === 'executive' || raw === 'executor') return 'Executive';
    return 'User';
  }
  
  function buildRoleDetails(classification = 'User', account = null) {
    const role = normalizeClassification(classification);
    const normalizedAccountRole = String(account?.role || '').toLowerCase();
    const executiveAccount = normalizedAccountRole === 'executor' ? account : null;
    const adminAccount = normalizedAccountRole === 'admin' ? account : null;
    return {
      classification: role,
      is_admin: role === 'Admin',
      is_executive: role === 'Executive',
      admin_account_id: adminAccount?.id || null,
      admin_account_name: adminAccount?.name || null,
      admin_account_email: adminAccount?.email || null,
      executive_account_id: executiveAccount?.id || null,
      executive_account_name: executiveAccount?.name || null,
      executive_account_email: executiveAccount?.email || null,
    };
  }
  
  function mergeRoleMetadata(metadata = {}, classification = 'User', account = null) {
    const role = normalizeClassification(classification);
    return {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      profile_classification: role,
      role_details: buildRoleDetails(role, account),
    };
  }
  
  function parseDobValue(dob) {
    const value = String(dob || '').trim();
    if (!value) return null;
    const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      const date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const slashMatch = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (slashMatch) {
      const date = new Date(Number(slashMatch[3]), Number(slashMatch[2]) - 1, Number(slashMatch[1]));
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  
  function calculateAgeFromDob(dob) {
    const birth = parseDobValue(dob);
    if (!birth) return '';
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDelta = today.getMonth() - birth.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
    return age >= 0 ? String(age) : '';
  }
  
  function normalizeRow(row) {
    const raw = row.raw_data || {};
    const rawPersonal = raw.personal_info && typeof raw.personal_info === 'object' ? raw.personal_info : {};
    const fullName = row.full_name || row.name || raw['Full Name'] || raw.Name || '';
    const email = row.email || raw.Email || raw.email || '';
    const phoneNumbers = normalizePhoneNumbers(parseJsonField(row.phone_numbers ?? raw.phone_numbers ?? rawPersonal.phone_numbers, []));
    const mobile = row.mobile || raw.Mobile || phoneNumbers[0] || '';
    const occupation = row.occupation || row.profession || raw.Occupation || raw.Profession || '';
    const dateOfBirth = row.date_of_birth || raw['Date of Birth'] || raw.date_of_birth || '';
    const calculatedAge = calculateAgeFromDob(dateOfBirth);
    const classification = normalizeClassification(row.profile_classification || raw.profile_classification || raw.Classification || raw.Role);
    return {
      ...row,
      date: row.date || raw.Date || '',
      problem: row.problem || raw.Problem || '',
      executive: row.executive || raw.Executive || '',
      age: calculatedAge || row.age || raw.Age || raw.age || '',
      Age: calculatedAge || row.Age || raw.Age || raw.age || '',
      location: row.location || raw.Location || '',
      stage: row.stage || raw.Stage || '',
      advertisement: row.advertisement || raw.Advertisement || '',
      remarks: row.remarks || raw.Remarks || '',
      task_status: row.task_status || raw.task_status || '',
      admin_instruction: row.admin_instruction || raw.admin_instruction || '',
      assigned_at: row.assigned_at || raw.assigned_at || '',
      name: fullName,
      full_name: fullName,
      email,
      mobile,
      occupation,
      profession: row.profession || occupation,
      father_name: row.father_name || raw["Father's Name"] || raw.father_name || '',
      mother_name: row.mother_name || raw["Mother's Name"] || raw.mother_name || '',
      date_of_birth: dateOfBirth,
      marital_status: row.marital_status || raw['Marital Status'] || raw.marital_status || '',
      blood_group: row.blood_group || raw['Blood Group'] || raw.blood_group || '',
      present_address: row.present_address || raw['Present Address'] || raw.present_address || row.location || '',
      permanent_address: row.permanent_address || raw['Permanent Address'] || raw.permanent_address || '',
      profile_classification: classification,
      family_info: parseJsonField(row.family_info ?? raw.family_info, {}),
      attendance_history: normalizeAttendanceList(row.attendance_history ?? raw.attendance_history),
      custom_fields: parseJsonField(row.custom_fields ?? raw.custom_fields, {}),
      role_details: parseJsonField(row.role_details ?? raw.role_details, buildRoleDetails(classification)),
      phone_numbers: phoneNumbers,
      app_user_id: row.app_user_id || raw.app_user_id || '',
      executive_read_at: row.executive_read_at || raw.executive_read_at || '',
      raw_data: raw,
      assigned_to_name: row.manager_name || row.assigned_to_name || '',
      assigned_to_email: row.manager_email || row.assigned_to_email || '',
    };
  }
  
  function actorSnapshot(user) {
    return {
      actor_id: user.id,
      actor_name: user.name,
      actor_role: user.role,
    };
  }
  
  function taskStatusFromStage(stage, fallback = 'Updated') {
    const value = String(stage || '').trim().toLowerCase();
    if (COMPLETED_STAGES.has(value)) return 'Completed';
    if (value === 'pending') return 'Pending';
    return fallback;
  }
  
  function buildChangeSet(oldData = {}, patch = {}) {
    const changes = {};
    for (const [field, nextValue] of Object.entries(patch)) {
      const before = oldData[field] ?? '';
      const after = nextValue ?? '';
      const beforeComparable = typeof before === 'object' ? JSON.stringify(before) : String(before);
      const afterComparable = typeof after === 'object' ? JSON.stringify(after) : String(after);
      if (beforeComparable !== afterComparable) {
        changes[field] = { from: before, to: after };
      }
    }
    return changes;
  }
  
  async function insertRowEvent(client, row, eventType, user, changes = {}, notes = '') {
    const actor = actorSnapshot(user);
    await client.query(`
      INSERT INTO public.dataset_row_events (
        dataset_id, row_id, row_number, event_type,
        actor_id, actor_name, actor_role, changes, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
    `, [
      DATASET_ID,
      String(row.id),
      row.row_number || null,
      eventType,
      actor.actor_id,
      actor.actor_name,
      actor.actor_role,
      JSON.stringify(changes || {}),
      String(notes || ''),
    ]);
  }
  
  function slugifyEmailName(value, fallback) {
    const slug = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')
      .slice(0, 44);
    return `${slug || fallback}@quantum.local`;
  }
  
  function defaultExecutivePassword() {
    return process.env.EXECUTOR_PASSWORD || 'exec123';
  }
  
  function rowAccountEmail(row) {
    const data = row.data || row.raw_data || {};
    const rowId = String(row.id || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || crypto.randomUUID();
    return String(data.Email || data.email || '').trim().toLowerCase()
      || slugifyEmailName(data['Full Name'] || data.Name || '', `executive.${rowId}`);
  }
  
  async function syncProfileSoftwareAccount(client, row, actor) {
    const data = row.data || row.raw_data || {};
    const classification = normalizeClassification(data.profile_classification || data.Classification || data.Role);
    const existingAccountId = String(data.app_user_id || '').trim();
    const profileRowId = String(row.id);
    const roleDetails = buildRoleDetails(classification);
  
    if (classification !== 'Executive') {
      if (existingAccountId || profileRowId) {
        await client.query(`
          UPDATE public.app_users
          SET active = FALSE,
              profile_row_id = NULL,
              updated_at = CURRENT_TIMESTAMP,
              metadata = metadata || $1::jsonb
          WHERE role = 'executor'
            AND (id = $2 OR profile_row_id = $3)
        `, [JSON.stringify(mergeRoleMetadata({ deactivated_by_profile_classification: true }, classification)), existingAccountId, profileRowId]);
      }
      return { account: null, patch: { app_user_id: '', role_details: roleDetails } };
    }
  
    const name = String(data['Full Name'] || data.Name || '').trim() || `Executive ${profileRowId}`;
    let email = rowAccountEmail(row);
    const blockedEmail = await client.query(
      "SELECT id FROM public.app_users WHERE LOWER(email) = LOWER($1) AND role <> 'executor' LIMIT 1",
      [email]
    );
    if (blockedEmail.rows.length) email = slugifyEmailName(`${name}.${profileRowId}`, `executive.${profileRowId}`);
    const linkedEmailConflict = await client.query(`
      SELECT id
      FROM public.app_users
      WHERE LOWER(email) = LOWER($1)
        AND role = 'executor'
        AND profile_row_id IS NOT NULL
        AND profile_row_id <> $2
      LIMIT 1
    `, [email, profileRowId]);
    if (linkedEmailConflict.rows.length) email = slugifyEmailName(`${name}.${profileRowId}`, `executive.${profileRowId}`);
    const existing = await client.query(`
      SELECT id
      FROM public.app_users
      WHERE id = $1 OR profile_row_id = $2 OR (LOWER(email) = LOWER($3) AND role = 'executor' AND (profile_row_id IS NULL OR profile_row_id = $2))
      ORDER BY CASE WHEN id = $1 THEN 0 WHEN profile_row_id = $2 THEN 1 ELSE 2 END
      LIMIT 1
    `, [existingAccountId || `exec-profile-${profileRowId}`, profileRowId, email]);
    const id = existing.rows[0]?.id || existingAccountId || `exec-profile-${profileRowId}`;
    const metadata = mergeRoleMetadata({
      source: 'profile_promotion',
      promoted_by: actor?.id || null,
      promoted_at: new Date().toISOString(),
    }, 'Executive');
  
    const upserted = await client.query(`
      INSERT INTO public.app_users (id, name, email, password_hash, role, active, profile_row_id, metadata)
      VALUES ($1, $2, $3, $4, 'executor', TRUE, $5, $6::jsonb)
      ON CONFLICT (id) DO UPDATE
        SET name = EXCLUDED.name,
            email = EXCLUDED.email,
            role = 'executor',
            active = TRUE,
            profile_row_id = EXCLUDED.profile_row_id,
            metadata = public.app_users.metadata || EXCLUDED.metadata,
            updated_at = CURRENT_TIMESTAMP
      RETURNING id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
    `, [id, name, email, hashPassword(defaultExecutivePassword()), profileRowId, JSON.stringify(metadata)]);
  
    const patch = { role_details: buildRoleDetails('Executive', upserted.rows[0]) };
    if (data.app_user_id !== upserted.rows[0].id) patch.app_user_id = upserted.rows[0].id;
    if (!data.Email && !data.email) patch.Email = email;
    return { account: safeUser(upserted.rows[0]), patch: Object.keys(patch).length ? patch : null };
  }
  
  function filtersFromQuery(query) {
    return {
      search: String(query.search || '').trim(),
      stage: String(query.stage || '').trim(),
      task_status: String(query.task_status || '').trim(),
      assigned_to: String(query.assigned_to || '').trim(),
      location: String(query.location || '').trim(),
      executive: String(query.executive || '').trim(),
      mobile: String(query.mobile || '').trim(),
      min_age: String(query.min_age || '').trim(),
      max_age: String(query.max_age || '').trim(),
    };
  }
  
  function buildDatasetWhere(user, filters = {}, options = {}) {
    const values = [DATASET_ID];
    const where = ['r.dataset_id = $1'];
    const searchMode = options.searchMode || 'broad';
  
    if (filters.search) {
      const searchValue = normalizeText(filters.search);
      if (searchValue) {
        const hasBangla = /[\u0980-\u09FF]/.test(searchValue);
        values.push(searchValue);
        const p = `$${values.length}`;
        const nameExpr = `LOWER(COALESCE(r.data->>'Full Name', r.data->>'Name', r.data->>'full_name', ''))`;
        const emailExpr = `LOWER(COALESCE(r.data->>'Email', r.data->>'email', ''))`;
        const mobileExpr = `LOWER(COALESCE(r.data->>'Mobile', r.data->>'mobile', ''))`;
        const matchClause = hasBangla
          ? `(
              ${nameExpr} LIKE ${p} || '%' OR ${nameExpr} LIKE '%' || ${p} || '%' OR
              ${emailExpr} LIKE ${p} || '%' OR ${emailExpr} LIKE '%' || ${p} || '%' OR
              ${mobileExpr} LIKE ${p} || '%' OR ${mobileExpr} LIKE '%' || ${p} || '%'
            )`
          : `(
              ${nameExpr} LIKE ${p} || '%' OR
              ${emailExpr} LIKE ${p} || '%' OR
              ${mobileExpr} LIKE ${p} || '%'
            )`;
        where.push(matchClause);
      }
    }
  
    if (filters.stage) {
      values.push(filters.stage);
      where.push(`LOWER(COALESCE(r.data->>'Stage', '')) = LOWER($${values.length})`);
    }
  
    if (filters.task_status) {
      if (filters.task_status === '__unassigned') {
        where.push(`COALESCE(r.data->>'task_status', '') = ''`);
      } else {
        values.push(filters.task_status);
        where.push(`LOWER(COALESCE(r.data->>'task_status', '')) = LOWER($${values.length})`);
      }
    }
  
    if (filters.assigned_to) {
      if (filters.assigned_to === '__unassigned') {
        where.push(`COALESCE(r.data->>'assigned_to', '') = ''`);
      } else {
        values.push(filters.assigned_to);
        where.push(`r.data->>'assigned_to' = $${values.length}`);
      }
    }
  
    if (filters.location) {
      values.push(filters.location);
      where.push(`r.data->>'Location' ILIKE '%' || $${values.length} || '%'`);
    }
  
    if (filters.executive) {
      values.push(filters.executive);
      const p = `$${values.length}`;
      where.push(`(
        r.data->>'Executive' ILIKE '%' || ${p} || '%' OR
        r.data->>'assigned_to_name' ILIKE '%' || ${p} || '%'
      )`);
    }
  
    if (filters.mobile) {
      values.push(normalizeText(filters.mobile));
      where.push(`LOWER(COALESCE(r.data->>'Mobile', r.data->>'mobile', '')) LIKE $${values.length} || '%'`);
    }
  
    if (filters.min_age && Number.isFinite(Number(filters.min_age))) {
      values.push(Number(filters.min_age));
      where.push(`NULLIF(regexp_replace(COALESCE(r.data->>'Age', ''), '[^0-9]', '', 'g'), '')::int >= $${values.length}`);
    }
  
    if (filters.max_age && Number.isFinite(Number(filters.max_age))) {
      values.push(Number(filters.max_age));
      where.push(`NULLIF(regexp_replace(COALESCE(r.data->>'Age', ''), '[^0-9]', '', 'g'), '')::int <= $${values.length}`);
    }
  
    return { where: `WHERE ${where.join(' AND ')}`, values, searchMode };
  }
  
  async function queryDatasetRows(user, filters, page, pageSize, options = {}) {
    const { where, values, searchMode } = buildDatasetWhere(user, filters, options);
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM public.dataset_rows r ${where}`, values);
    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const offset = (safePage - 1) * pageSize;
    const dataValues = [...values, pageSize, offset];
    const orderClause = filters.search
      ? `ORDER BY
          CASE
            WHEN LOWER(COALESCE(r.data->>'Full Name', r.data->>'Name', r.data->>'full_name', '')) = $2 THEN 0
            WHEN LOWER(COALESCE(r.data->>'Email', r.data->>'email', '')) = $2 THEN 1
            WHEN LOWER(COALESCE(r.data->>'Mobile', r.data->>'mobile', '')) = $2 THEN 2
            WHEN LOWER(COALESCE(r.data->>'Full Name', r.data->>'Name', r.data->>'full_name', '')) LIKE $2 || '%' THEN 3
            WHEN LOWER(COALESCE(r.data->>'Email', r.data->>'email', '')) LIKE $2 || '%' THEN 4
            WHEN LOWER(COALESCE(r.data->>'Mobile', r.data->>'mobile', '')) LIKE $2 || '%' THEN 5
            WHEN LOWER(COALESCE(r.data->>'Full Name', r.data->>'Name', r.data->>'full_name', '')) LIKE '%' || $2 || '%' THEN 6
            WHEN LOWER(COALESCE(r.data->>'Email', r.data->>'email', '')) LIKE '%' || $2 || '%' THEN 7
            WHEN LOWER(COALESCE(r.data->>'Mobile', r.data->>'mobile', '')) LIKE '%' || $2 || '%' THEN 8
            ELSE 9
          END ASC,
          r.row_number ASC,
          r.id ASC`
      : 'ORDER BY r.row_number ASC, r.id ASC';
    const rowsResult = await pool.query(
      `${rowSelectSql()} ${where} ${orderClause} LIMIT $${dataValues.length - 1}::int OFFSET $${dataValues.length}::int`,
      dataValues
    );
  
    return {
      rows: rowsResult.rows.map(normalizeRow),
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages,
      },
    };
  }
  
  async function queryDatasetSummary(user, filters = {}) {
    const { where, values } = buildDatasetWhere(user, filters);
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE r.data->>'task_status' = 'Pending' AND COALESCE(r.data->>'assigned_to', '') <> '')::int AS pending,
        COUNT(*) FILTER (
          WHERE LOWER(COALESCE(r.data->>'task_status', '')) IN ('completed', 'handled')
             OR LOWER(COALESCE(r.data->>'Stage', '')) IN ('completed', 'handled')
        )::int AS completed,
        COUNT(*) FILTER (WHERE r.data->>'task_status' = 'Updated')::int AS updated,
        COUNT(*) FILTER (WHERE COALESCE(r.data->>'assigned_to', '') = '')::int AS unassigned
      FROM public.dataset_rows r
      ${where}
    `, values);
    return result.rows[0] || { total: 0, pending: 0, completed: 0, updated: 0, unassigned: 0 };
  }
  
  async function queryOverviewDashboard() {
    const [totals, updatedProfiles, matrix] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*)::int AS total_data_count,
          COUNT(*) FILTER (
            WHERE COALESCE(data->>'assigned_to', '') <> ''
              AND LOWER(COALESCE(data->>'task_status', '')) = 'pending'
          )::int AS total_pending_tasks,
          COUNT(*) FILTER (
            WHERE COALESCE(data->>'assigned_to', '') = ''
              AND LOWER(COALESCE(NULLIF(data->>'task_status', ''), 'pending')) = 'pending'
          )::int AS total_pending_queue_records,
          COUNT(*) FILTER (
            WHERE COALESCE(data->>'assigned_to', '') <> ''
          )::int AS total_allocated_records,
          COUNT(*) FILTER (
            WHERE COALESCE(data->>'assigned_to', '') = ''
          )::int AS remaining_unassigned_records,
          COUNT(*) FILTER (
            WHERE LOWER(COALESCE(data->>'task_status', '')) IN ('completed', 'handled')
               OR LOWER(COALESCE(data->>'Stage', '')) IN ('completed', 'handled')
          )::int AS total_completed_tasks
        FROM public.dataset_rows
        WHERE dataset_id = $1
          AND COALESCE(data->>'source_assign_new_task_key', '') = ''
      `, [DATASET_ID]),
      pool.query(`
        SELECT COUNT(*)::int AS total_updated_profiles
        FROM public.dataset_row_events e
        LEFT JOIN public.dataset_rows r
          ON r.dataset_id = e.dataset_id
         AND r.id::text = e.row_id
        WHERE e.dataset_id = $1
          AND e.deleted_at IS NULL
          AND e.event_type IN ('assignment', 'profile_update', 'call_update')
          AND COALESCE(r.data->>'source_assign_new_task_key', '') = ''
      `, [DATASET_ID]),
      pool.query(`
        SELECT
          u.id,
          u.name,
          u.email,
          u.active,
          COALESCE(
            NULLIF(u.metadata->'personal_info'->>'mobile', ''),
            NULLIF(u.metadata->>'mobile', ''),
            ''
          ) AS mobile,
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
          ON r.dataset_id = $1
         AND r.data->>'assigned_to' = u.id
         AND COALESCE(r.data->>'source_assign_new_task_key', '') = ''
        LEFT JOIN public.dataset_rows rp
          ON rp.dataset_id = $1 AND rp.id::text = u.profile_row_id
        WHERE u.role = 'executor' AND u.active = TRUE
        GROUP BY u.id, u.name, u.email, u.active, rp.data, u.metadata
        ORDER BY assigned_count DESC, u.name
      `, [DATASET_ID]),
    ]);
  
    return {
      ...totals.rows[0],
      total_updated_profiles: updatedProfiles.rows[0]?.total_updated_profiles || 0,
      executive_progress: matrix.rows,
    };
  }
  
  function normalizeExecutiveDashboardDateFilter(value) {
    const raw = String(value || '').trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
  }
  
  async function queryExecutiveDashboard(user, dateFilter = '') {
    const filterDate = normalizeExecutiveDashboardDateFilter(dateFilter);
    const dateClause = filterDate
      ? `
          AND COALESCE(
            NULLIF(r.data->>'executive_read_at', ''),
            NULLIF(r.data->>'assigned_at', '')
          )::timestamptz::date = $3::date
        `
      : '';
    const params = filterDate ? [DATASET_ID, user.id, filterDate] : [DATASET_ID, user.id];
    const [statsResult, rowsResult] = await Promise.all([
      pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') = $2
            AND COALESCE(data->>'executive_read_at', '') = ''
            AND LOWER(COALESCE(data->>'task_status', 'Pending')) NOT IN ('completed', 'handled')
        )::int AS new_tasks,
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') = $2
            AND COALESCE(data->>'executive_read_at', '') <> ''
            AND LOWER(COALESCE(data->>'task_status', 'Pending')) NOT IN ('completed', 'handled')
        )::int AS previous_pending_tasks,
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') = $2
            AND (
              LOWER(COALESCE(data->>'task_status', '')) IN ('completed', 'handled')
              OR LOWER(COALESCE(data->>'Stage', '')) IN ('completed', 'handled')
            )
        )::int AS completed_tasks,
        COUNT(*) FILTER (WHERE COALESCE(data->>'assigned_to', '') = $2)::int AS total_assigned,
        COUNT(*) FILTER (WHERE COALESCE(data->>'assigned_to', '') = $2)::int AS total_data_count,
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') = $2
            AND LOWER(COALESCE(NULLIF(data->>'task_status', ''), 'pending')) = 'pending'
        )::int AS total_pending_queue_records,
        COUNT(*) FILTER (WHERE COALESCE(data->>'assigned_to', '') = $2)::int AS total_allocated_records,
        0::int AS remaining_unassigned_records,
        CASE
          WHEN COUNT(*) FILTER (WHERE COALESCE(data->>'assigned_to', '') = $2) = 0 THEN 0
          ELSE ROUND((
            COUNT(*) FILTER (
              WHERE COALESCE(data->>'assigned_to', '') = $2
                AND (
                  LOWER(COALESCE(data->>'task_status', '')) IN ('completed', 'handled')
                  OR LOWER(COALESCE(data->>'Stage', '')) IN ('completed', 'handled')
                )
            )::numeric /
            COUNT(*) FILTER (WHERE COALESCE(data->>'assigned_to', '') = $2)::numeric
          ) * 100, 2)
        END AS completion_percentage
      FROM public.dataset_rows
      WHERE dataset_id = $1
        AND COALESCE(data->>'source_assign_new_task_key', '') = ''
      ${filterDate ? `
        AND COALESCE(
          NULLIF(data->>'executive_read_at', ''),
          NULLIF(data->>'assigned_at', '')
        )::timestamptz::date = $3::date
      ` : ''}
      `, params),
      pool.query(`
        SELECT
          r.id::text AS id,
          r.row_number,
          COALESCE(NULLIF(r.data->>'Full Name', ''), NULLIF(r.data->>'Name', ''), NULLIF(r.data->>'full_name', ''), '') AS name,
          COALESCE(NULLIF(r.data->>'Email', ''), NULLIF(r.data->>'email', ''), '') AS email,
          COALESCE(NULLIF(r.data->>'Mobile', ''), NULLIF(r.data->>'mobile', ''), '') AS mobile,
          COALESCE(r.data->>'assigned_at', '') AS assigned_at,
          COALESCE(r.data->>'executive_read_at', '') AS executive_read_at,
          COALESCE(r.data->>'task_status', '') AS task_status,
          COALESCE(r.data->>'Stage', '') AS stage
        FROM public.dataset_rows r
        WHERE r.dataset_id = $1
          AND COALESCE(r.data->>'assigned_to', '') = $2
          AND COALESCE(r.data->>'source_assign_new_task_key', '') = ''
          AND LOWER(COALESCE(r.data->>'task_status', 'Pending')) NOT IN ('completed', 'handled')
          ${dateClause}
        ORDER BY (COALESCE(r.data->>'executive_read_at', '') = '') DESC,
                 COALESCE(r.data->>'assigned_at', '') DESC,
                 r.row_number ASC,
                 r.id ASC
        LIMIT 200
      `, params),
    ]);
  
    const stats = statsResult.rows[0] || {
      new_tasks: 0,
      previous_pending_tasks: 0,
      completed_tasks: 0,
      total_assigned: 0,
      total_data_count: 0,
      total_pending_queue_records: 0,
      total_allocated_records: 0,
      remaining_unassigned_records: 0,
      completion_percentage: 0,
    };
  
      return {
        ...stats,
        assigned_rows: rowsResult.rows.map((row) => ({
          id: row.id,
          row_number: row.row_number,
          name: row.name,
          email: row.email,
          mobile: row.mobile,
        assigned_at: row.assigned_at,
        executive_read_at: row.executive_read_at,
        task_status: row.task_status,
        stage: row.stage,
        is_new: !row.executive_read_at,
      })),
    };
  }
  
  async function queryBulkQueueSummary() {
    const result = await pool.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') = ''
            AND LOWER(COALESCE(NULLIF(data->>'task_status', ''), 'pending')) = 'pending'
        )::int AS total_pending_queue_records,
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') <> ''
        )::int AS total_allocated_records,
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') = ''
        )::int AS remaining_unassigned_core_records,
        COUNT(*) FILTER (
          WHERE COALESCE(data->>'assigned_to', '') = ''
        )::int AS remaining_unassigned_records
      FROM public.dataset_rows
      WHERE dataset_id = $1
    `, [DATASET_ID]);
    return result.rows[0] || {
      total_pending_queue_records: 0,
      total_allocated_records: 0,
      remaining_unassigned_core_records: 0,
      remaining_unassigned_records: 0,
    };
  }
  
  async function datasetSchema() {
    const [keys, stages, taskStatuses, locations, executives, users] = await Promise.all([
      pool.query(`
        SELECT key, COUNT(*)::int AS count
        FROM public.dataset_rows, jsonb_object_keys(data) AS key
        WHERE dataset_id = $1
        GROUP BY key
        ORDER BY key
      `, [DATASET_ID]),
      pool.query(`
        SELECT data->>'Stage' AS value, COUNT(*)::int AS count
        FROM public.dataset_rows
        WHERE dataset_id = $1 AND COALESCE(data->>'Stage', '') <> ''
        GROUP BY value
        ORDER BY count DESC, value
        LIMIT 80
      `, [DATASET_ID]),
      pool.query(`
        SELECT data->>'task_status' AS value, COUNT(*)::int AS count
        FROM public.dataset_rows
        WHERE dataset_id = $1 AND COALESCE(data->>'task_status', '') <> ''
        GROUP BY value
        ORDER BY count DESC, value
        LIMIT 40
      `, [DATASET_ID]),
      pool.query(`
        SELECT data->>'Location' AS value, COUNT(*)::int AS count
        FROM public.dataset_rows
        WHERE dataset_id = $1 AND COALESCE(data->>'Location', '') <> ''
        GROUP BY value
        ORDER BY count DESC, value
        LIMIT 120
      `, [DATASET_ID]),
      pool.query(`
        SELECT data->>'Executive' AS value, COUNT(*)::int AS count
        FROM public.dataset_rows
        WHERE dataset_id = $1 AND COALESCE(data->>'Executive', '') <> ''
        GROUP BY value
        ORDER BY count DESC, value
        LIMIT 80
      `, [DATASET_ID]),
      pool.query(`
        SELECT id, name, email, role, active, profile_row_id, metadata
        FROM public.app_users
        WHERE role = 'executor'
        ORDER BY active DESC, name
      `),
    ]);
  
    return {
      dataset_id: DATASET_ID,
      table: 'public.dataset_rows',
      jsonb_column: 'data',
      keys: keys.rows,
      stages: stages.rows,
      task_statuses: taskStatuses.rows,
      locations: locations.rows,
      executives: executives.rows,
      executor_accounts: users.rows.map(safeUser),
    };
  }
  
  async function getAiSettingsRaw() {
    const result = await pool.query("SELECT value FROM public.app_settings WHERE key = 'ai_settings'");
    return result.rows[0]?.value || { activeProvider: 'openai', providers: {} };
  }
  
  async function getPermissionSettings() {
    const result = await pool.query("SELECT value FROM public.app_settings WHERE key = 'permission_settings'");
    const val = result.rows[0]?.value || {};
    return {
      admin_create_accounts: val.admin_create_accounts !== false,
      admin_assign_profiles: val.admin_assign_profiles !== false,
      admin_configure_ai: val.admin_configure_ai !== false,
      admin_manage_permissions: true,
      admin_view_dashboard: val.admin_view_dashboard !== false,
      admin_rw_all_profiles: val.admin_rw_all_profiles !== false,
      admin_use_ai_chat: val.admin_use_ai_chat !== false,
      admin_clear_history: val.admin_clear_history !== false,
      
      exec_view_assigned_profiles: val.exec_view_assigned_profiles !== false,
      exec_view_client_details: val.exec_view_client_details !== false,
      exec_update_stage_remarks: val.exec_update_stage_remarks !== false,
      executive_can_edit_personal_data: val.executive_can_edit_personal_data !== false,
      exec_manage_attendance: val.exec_manage_attendance !== false
    };
  }
  
  async function savePermissionSettings(userId, settings) {
    const value = {
      admin_create_accounts: Boolean(settings.admin_create_accounts),
      admin_assign_profiles: Boolean(settings.admin_assign_profiles),
      admin_configure_ai: Boolean(settings.admin_configure_ai),
      admin_manage_permissions: true,
      admin_view_dashboard: Boolean(settings.admin_view_dashboard),
      admin_rw_all_profiles: Boolean(settings.admin_rw_all_profiles),
      admin_use_ai_chat: Boolean(settings.admin_use_ai_chat),
      admin_clear_history: Boolean(settings.admin_clear_history),
      
      exec_view_assigned_profiles: Boolean(settings.exec_view_assigned_profiles),
      exec_view_client_details: Boolean(settings.exec_view_client_details),
      exec_update_stage_remarks: Boolean(settings.exec_update_stage_remarks),
      executive_can_edit_personal_data: Boolean(settings.executive_can_edit_personal_data),
      exec_manage_attendance: Boolean(settings.exec_manage_attendance)
    };
    await pool.query(`
      INSERT INTO public.app_settings (key, value, updated_by, updated_at)
      VALUES ('permission_settings', $1::jsonb, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(value), userId]);
    return value;
  }
  
  async function getProgramSettings() {
    const result = await pool.query("SELECT value FROM public.app_settings WHERE key = 'program_settings'");
    const val = result.rows[0]?.value || {};
    return {
      program_name: String(val.program_name || '').trim(),
    };
  }
  
  async function saveProgramSettings(userId, settings) {
    const value = {
      program_name: String(settings.program_name || '').trim(),
    };
    await pool.query(`
      INSERT INTO public.app_settings (key, value, updated_by, updated_at)
      VALUES ('program_settings', $1::jsonb, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(value), userId]);
    return value;
  }
  
  function normalizeCommunicationConnector(connector) {
    const name = String(connector?.name || '').trim();
    const url = String(connector?.url || '').trim();
    if (!name) return null;
    return { name, url };
  }
  
  async function getCommunicationConnectorSettings() {
    const result = await pool.query("SELECT value FROM public.app_settings WHERE key = 'communication_connectors'");
    const val = result.rows[0]?.value || {};
    return {
      connectors: Array.isArray(val.connectors)
        ? val.connectors.map(normalizeCommunicationConnector).filter(Boolean)
        : [],
    };
  }
  
  async function saveCommunicationConnectorSettings(userId, settings) {
    const connectors = Array.isArray(settings.connectors)
      ? settings.connectors.map(normalizeCommunicationConnector).filter(Boolean)
      : [];
    const value = { connectors };
    await pool.query(`
      INSERT INTO public.app_settings (key, value, updated_by, updated_at)
      VALUES ('communication_connectors', $1::jsonb, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(value), userId]);
    return value;
  }
  
  function normalizeOverviewAdsBannerSettings(settings) {
    const source = settings || {};
    const toInt = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
    };
    return {
      image: String(source.image || '').trim(),
      title: String(source.title || '').trim(),
      sub: String(source.sub || '').trim(),
      bannerColor: String(source.bannerColor || '').trim() || '#007bff',
      titleColor: String(source.titleColor || '').trim() || '#ffffff',
      subtitleColor: String(source.subtitleColor || '').trim() || '#ffffff',
      titleSize: toInt(source.titleSize, 28),
      subtitleSize: toInt(source.subtitleSize, 14),
      titleX: toInt(source.titleX, 28),
      titleY: toInt(source.titleY, 16),
      subtitleX: toInt(source.subtitleX, 28),
      subtitleY: toInt(source.subtitleY, 52),
      icon: String(source.icon || '📢').trim() || '📢',
      runAt: String(source.runAt || '').trim(),
      runLabel: String(source.runLabel || '').trim(),
    };
  }
  
  async function getOverviewAdsBannerSettings() {
    const result = await pool.query("SELECT value, updated_at FROM public.app_settings WHERE key = 'overview_ads_banner'");
    const row = result.rows[0];
    return {
      settings: normalizeOverviewAdsBannerSettings(row?.value || {}),
      updated_at: row?.updated_at || null,
    };
  }
  
  async function saveOverviewAdsBannerSettings(userId, settings) {
    const current = await getOverviewAdsBannerSettings();
    const value = {
      ...current.settings,
      ...normalizeOverviewAdsBannerSettings(settings),
    };
    if (!value.image && current.settings?.image) {
      value.image = current.settings.image;
    }
    await pool.query(`
      INSERT INTO public.app_settings (key, value, updated_by, updated_at)
      VALUES ('overview_ads_banner', $1::jsonb, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(value), userId]);
    return value;
  }
  
  async function backfillRoleDetailsSchema() {
    await pool.query(`
      UPDATE public.dataset_rows
      SET data = jsonb_set(
        data,
        '{role_details}',
        COALESCE(
          data->'role_details',
          jsonb_build_object(
            'classification', COALESCE(NULLIF(data->>'profile_classification', ''), 'User'),
            'is_admin', CASE WHEN COALESCE(NULLIF(data->>'profile_classification', ''), 'User') = 'Admin' THEN true ELSE false END,
            'is_executive', CASE WHEN COALESCE(NULLIF(data->>'profile_classification', ''), 'User') = 'Executive' THEN true ELSE false END,
            'admin_account_id', NULL,
            'admin_account_name', NULL,
            'admin_account_email', NULL,
            'executive_account_id', NULL,
            'executive_account_name', NULL,
            'executive_account_email', NULL
          )
        ),
        true
      )
      WHERE dataset_id = $1
        AND (data->'role_details' IS NULL OR jsonb_typeof(data->'role_details') <> 'object')
    `, [DATASET_ID]);
  
    await pool.query(`
      UPDATE public.app_users
      SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'role_details',
        COALESCE(
          metadata->'role_details',
          jsonb_build_object(
            'classification', CASE WHEN role = 'admin' THEN 'Admin' ELSE 'Executive' END,
            'is_admin', CASE WHEN role = 'admin' THEN true ELSE false END,
            'is_executive', CASE WHEN role = 'executor' THEN true ELSE false END,
            'admin_account_id', NULL,
            'admin_account_name', NULL,
            'admin_account_email', NULL,
            'executive_account_id', NULL,
            'executive_account_name', NULL,
            'executive_account_email', NULL
          )
        )
      ),
      updated_at = CURRENT_TIMESTAMP
      WHERE role IN ('admin', 'executor')
        AND (metadata->'role_details' IS NULL OR jsonb_typeof(metadata->'role_details') <> 'object')
    `);
  }
  
  function publicAiSettings(settings) {
    const activeProvider = ['openai', 'gemini', 'anthropic'].includes(settings.activeProvider)
      ? settings.activeProvider
      : 'openai';
    const providers = {};
    for (const provider of ['openai', 'gemini', 'anthropic']) {
      const cfg = settings.providers?.[provider] || {};
      providers[provider] = {
        configured: Boolean(cfg.secret?.encrypted),
        model: cfg.model || defaultAiModel(provider),
        models: AI_VENDOR_MODELS[provider] || [],
        updated_at: cfg.updated_at || null,
      };
    }
    return {
      activeProvider,
      vendors: {
        openai: { label: 'OpenAI', models: AI_VENDOR_MODELS.openai },
        gemini: { label: 'Google Gemini', models: AI_VENDOR_MODELS.gemini },
        anthropic: { label: 'Anthropic', models: AI_VENDOR_MODELS.anthropic },
      },
      providers,
      agent: langChainAgentState,
    };
  }
  
  function defaultAiModel(provider) {
    return (AI_VENDOR_MODELS[provider] || AI_VENDOR_MODELS.local)[0];
  }
  
  function providerModelCandidates(configured) {
    const provider = configured.provider;
    const preferred = String(configured.model || '').trim();
    const fallbacks = AI_VENDOR_MODELS[provider] || [];
    const candidates = [preferred, ...fallbacks].filter(Boolean);
    return [...new Set(candidates)];
  }
  
  async function upsertAiSettings(userId, body) {
    const provider = String(body.provider || body.vendor || '').trim();
    const activeProvider = String(body.activeProvider || provider || 'openai').trim();
    if (!AI_PROVIDERS.has(activeProvider)) throw new Error('Invalid active AI provider');
    if (provider && !AI_PROVIDERS.has(provider)) throw new Error('Invalid AI provider');
    const requestedModel = String(body.model || '').trim();
    if (provider && provider !== 'local' && requestedModel && !(AI_VENDOR_MODELS[provider] || []).includes(requestedModel)) {
      throw new Error('Invalid model for selected AI vendor');
    }
  
    const current = await getAiSettingsRaw();
    const next = {
      activeProvider,
      providers: current.providers || {},
    };
  
    if (provider && provider !== 'local') {
      const existing = next.providers[provider] || {};
      next.providers[provider] = {
        ...existing,
        model: requestedModel || existing.model || defaultAiModel(provider),
        updated_at: new Date().toISOString(),
      };
      if (body.apiKey) {
        next.providers[provider].secret = encryptSecret(body.apiKey);
        const envKey = provider === 'openai'
          ? 'OPENAI_API_KEY'
          : provider === 'gemini'
            ? 'GOOGLE_API_KEY'
            : provider === 'anthropic'
              ? 'ANTHROPIC_API_KEY'
              : '';
        if (envKey) process.env[envKey] = String(body.apiKey);
      }
    }
  
    await pool.query(`
      INSERT INTO public.app_settings (key, value, updated_by, updated_at)
      VALUES ('ai_settings', $1::jsonb, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
    `, [JSON.stringify(next), userId]);
  
    await initializeLangChainAgent(next);
    return publicAiSettings(next);
  }
  
  function pickConfiguredProvider(settings) {
    const provider = ['openai', 'gemini', 'anthropic'].includes(settings.activeProvider)
      ? settings.activeProvider
      : 'openai';
    const cfg = settings.providers?.[provider];
    if (!cfg?.secret?.encrypted) return null;
    return {
      provider,
      model: cfg.model || defaultAiModel(provider),
      apiKey: decryptSecret(cfg.secret),
    };
  }
  
  function extractJson(text) {
    const raw = String(text || '').trim();
    try {
      return JSON.parse(raw);
    } catch {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
      throw new Error('AI response was not valid JSON');
    }
  }
  
  function aiSystemPrompt(schema) {
    return [
      'You are the planner inside a LangChain PostgreSQL agent for a work management dashboard.',
      'Return only compact JSON. Do not include markdown.',
      'Understand English, Bangla, and mixed Hinglish-style user messages.',
      'Ignore filler words, typos, and conversational phrases; infer the user intent from the useful keywords.',
      'If the request is broad or noisy, prefer a safe broad search filter instead of returning empty filters.',
      'If the user asks about a specific person or profile, prioritize exact identity fields like name, full name, email, mobile, and assigned executive, and avoid broad problem/remarks fields unless the user explicitly asks for them.',
      'For person lookups, prefer narrow filters that bring back the most relevant single profile or the closest matching profiles.',
      'Use only these filter keys: search, stage, task_status, assigned_to, location, executive, mobile, min_age, max_age.',
      'Do not create destructive SQL. Convert the natural language request into safe filter values for public.dataset_rows; the server SQL tool will execute the final parameterized SELECT.',
      `The table is ${schema.table}; data fields are stored in JSONB column "${schema.jsonb_column}".`,
      `Available JSONB keys: ${schema.keys.map((k) => k.key).join(', ')}.`,
      `Known stages: ${schema.stages.map((s) => s.value).slice(0, 30).join(', ')}.`,
      `Known task statuses: ${schema.task_statuses.map((s) => s.value).join(', ')}.`,
      `Executor accounts: ${schema.executor_accounts.map((u) => `${u.name}=${u.id}`).join(', ')}.`,
      'Response shape: {"filters":{...},"explanation":"short reason"}',
    ].join('\n');
  }
  
  function messageContentToText(content) {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((part) => {
        if (typeof part === 'string') return part;
        return part?.text || part?.content || '';
      }).join('\n');
    }
    return String(content || '');
  }
  
  async function createLangChainModel(configured) {
    if (configured.provider === 'openai') {
      const { ChatOpenAI } = await import('@langchain/openai');
      return new ChatOpenAI({
        apiKey: configured.apiKey,
        model: configured.model,
        temperature: 0,
      });
    }
    if (configured.provider === 'gemini') {
      const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
      return new ChatGoogleGenerativeAI({
        apiKey: configured.apiKey,
        model: configured.model,
        temperature: 0,
      });
    }
    if (configured.provider === 'anthropic') {
      const { ChatAnthropic } = await import('@langchain/anthropic');
      return new ChatAnthropic({
        apiKey: configured.apiKey,
        model: configured.model,
        temperature: 0,
      });
    }
    throw new Error('Unsupported LangChain provider');
  }
  
  async function callLangChainProvider(question, prompt, configured) {
    const model = await createLangChainModel(configured);
    const response = await model.invoke([
      { role: 'system', content: prompt },
      { role: 'user', content: question },
    ]);
    return extractJson(messageContentToText(response.content || response.text || response));
  }
  
  async function initializeLangChainAgent(settings = null) {
    try {
      const raw = settings || await getAiSettingsRaw();
      const configured = pickConfiguredProvider(raw);
      if (!configured) {
        const activeProvider = ['openai', 'gemini', 'anthropic'].includes(raw.activeProvider) ? raw.activeProvider : 'openai';
        langChainAgentState = {
          initialized: false,
          provider: activeProvider,
          model: '',
          initialized_at: null,
          error: 'API key is not configured for the active vendor.',
        };
        return langChainAgentState;
      }
      await createLangChainModel(configured);
      langChainAgentState = {
        initialized: true,
        provider: configured.provider,
        model: configured.model,
        initialized_at: new Date().toISOString(),
        error: '',
      };
    } catch (error) {
      const activeProvider = ['openai', 'gemini', 'anthropic'].includes(settings?.activeProvider) ? settings.activeProvider : 'openai';
      langChainAgentState = {
        initialized: false,
        provider: activeProvider,
        model: '',
        initialized_at: null,
        error: error.message,
      };
    }
    return langChainAgentState;
  }
  
  async function callDirectProvider(question, prompt, configured) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      if (configured.provider === 'openai') {
        let lastError = null;
        for (const model of providerModelCandidates(configured)) {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${configured.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: prompt },
                { role: 'user', content: question },
              ],
              temperature: 0,
            }),
            signal: controller.signal,
          });
          const data = await response.json();
          if (response.ok) return extractJson(data.choices?.[0]?.message?.content || '{}');
          lastError = new Error(data.error?.message || 'OpenAI request failed');
        }
        throw lastError || new Error('OpenAI request failed');
      }
  
      if (configured.provider === 'gemini') {
        let lastError = null;
        for (const model of providerModelCandidates(configured)) {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(configured.apiKey)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nQuestion: ${question}` }] }],
              generationConfig: { temperature: 0, responseMimeType: 'application/json' },
            }),
            signal: controller.signal,
          });
          const data = await response.json();
          if (response.ok) return extractJson(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
          lastError = new Error(data.error?.message || 'Gemini request failed');
        }
        throw lastError || new Error('Gemini request failed');
      }
  
      if (configured.provider === 'anthropic') {
        let lastError = null;
        for (const model of providerModelCandidates(configured)) {
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': configured.apiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              max_tokens: 800,
              temperature: 0,
              system: prompt,
              messages: [{ role: 'user', content: question }],
            }),
            signal: controller.signal,
          });
          const data = await response.json();
          if (response.ok) return extractJson(data.content?.map((part) => part.text || '').join('\n') || '{}');
          lastError = new Error(data.error?.message || 'Anthropic request failed');
        }
        throw lastError || new Error('Anthropic request failed');
      }
    } finally {
      clearTimeout(timeout);
    }
    return null;
  }
  
  async function callAiProvider(question, schema, configured) {
    const prompt = aiSystemPrompt(schema);
    try {
      const parsed = await callLangChainProvider(question, prompt, configured);
      langChainAgentState = {
        initialized: true,
        provider: configured.provider,
        model: configured.model,
        initialized_at: langChainAgentState.initialized_at || new Date().toISOString(),
        error: '',
      };
      return { ...parsed, _source: configured.provider };
    } catch (error) {
      const directParsed = await callDirectProvider(question, prompt, configured);
      return {
        ...directParsed,
        _source: `${configured.provider}-direct-fallback`,
        _provider_error: `LangChain unavailable or failed: ${error.message}`,
      };
    }
  }
  
  function normalizeText(value) {
    return String(value || '').trim().toLowerCase();
  }
  
  const QUERY_BOILERPLATE_WORDS = new Set([
    'show',
    'me',
    'give',
    'tell',
    'find',
    'search',
    'lookup',
    'look',
    'about',
    'load',
    'list',
    'get',
    'all',
    'full',
    'details',
    'detail',
    'info',
    'information',
    'profile',
    'record',
    'records',
    'data',
    'acha',
    'achha',
    'accha',
    'bhalo',
    'valo',
    'kar',
    'koro',
    'kori',
    'kore',
    'koreo',
    'ki',
    'kisu',
    'kono',
    'aro',
    'bolo',
    'bujhao',
    'somporke',
    'daw',
    'dao',
    'please',
    'kindly',
    'amake',
    'amar',
    'jonno',
    'the',
    'a',
    'an',
    'of',
    'to',
    'for',
    'with',
    'and',
    'in',
    'from',
    'on',
    'at',
    'er',
    'r',
    'er.',
    'r.',
    // Expanded English conversational/filler terms
    'what',
    'do',
    'you',
    'know',
    'who',
    'is',
    'he',
    'she',
    'can',
    'could',
    'would',
    'should',
    'want',
    'need',
    'like',
    'how',
    'where',
    'why',
    'which',
    'tall',
    'says',
    'say',
    'said',
    'has',
    'have',
    'had',
    'any',
    'some',
    'someone',
    'person',
    'people',
    'user',
    'users',
    // Expanded Bengali conversational/filler terms
    'amader',
    'apnar',
    'apnader',
    'tar',
    'tader',
    'kicchu',
    'ache',
    'ase',
    'asen',
    'asen.',
    'ache.',
    'na',
    'niye',
    'niya',
    'bapere',
    'bapare',
    'bishaie',
    'bishoye',
    'sombondhe',
    'bolte',
    'parben',
    'parben?',
    'janen',
    'janen?',
    'jano',
    'jano?',
    'bujhiye',
    'khuje',
    'khoje',
    'khujun',
    'khojun',
    'khujo',
    'dekhaw',
    'dekhao',
    'dekhaben',
    'dekhaben?',
    'dekhon',
    'dekhun',
  ]);
  
  function extractSearchText(question) {
    const tokens = String(question || '')
      .toLowerCase()
      .replace(/[^a-z0-9@._+\-\s]/g, ' ')
      .split(/\s+/)
      .map((token) => token.trim().replace(/^[^a-z0-9@]+|[^a-z0-9@]+$/gi, ''))
      .filter(Boolean)
      .filter((token) => token.length > 2 && !QUERY_BOILERPLATE_WORDS.has(token));
    return [...new Set(tokens)].join(' ').trim();
  }
  
  function buildSearchTerms(value) {
    const cleaned = extractSearchText(value);
    if (!cleaned) return [];
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    const terms = [cleaned];
    if (tokens.length > 1) terms.push(tokens.join(' '));
    terms.push(...tokens);
    return [...new Set(terms)].slice(0, 8);
  }
  
  function inferSearchMode(question, filters = {}) {
    const q = normalizeText(question);
    const search = extractSearchText(filters.search || question);
    const tokenCount = search ? search.split(/\s+/).filter(Boolean).length : 0;
    const entityHint = /(about|somporke|সম্পর্কে|details?|full details|tell me|show me|who is|what is|er data|er details|er full details|profile of|information about)/i.test(q);
    if (entityHint) return 'entity';
    if (tokenCount > 0 && tokenCount <= 2) return 'entity';
    return 'broad';
  }
  
  function isLikelyExactMatch(search, row) {
    const target = normalizeText(search);
    if (!target) return false;
    const fields = [
      row.full_name,
      row.name,
      row.email,
      row.mobile,
      row.executive,
      row.assigned_to_name,
    ].map(normalizeText).filter(Boolean);
    return fields.some((value) => value === target);
  }
  
  function rowSummary(row) {
    const name = row.full_name || row.name || '-';
    const mobile = row.mobile || '-';
    const location = row.location || row.present_address || '-';
    const problem = row.problem || '-';
    const stage = row.stage || '-';
    return { name, mobile, location, problem, stage };
  }
  
  function buildAiMatchReply(plan, resultRows, total) {
    if (!total) return buildAiNoResultReply(plan);
    const focus = plan.search_mode === 'entity' && plan.filters.search ? ` for "${plan.filters.search}"` : '';
    const exact = (resultRows || []).find((row) => isLikelyExactMatch(plan.filters.search, row));
    const top = exact || resultRows?.[0];
    const summary = top ? rowSummary(top) : null;
    if (plan.search_mode === 'entity' && summary) {
      return `I found ${total} matching profile${total === 1 ? '' : 's'}${focus}. Top match: ${summary.name}. Mobile: ${summary.mobile}. Location: ${summary.location}. Problem: ${summary.problem}. Stage: ${summary.stage}.`;
    }
    if (summary) {
      return `I found ${total} matching profile${total === 1 ? '' : 's'}${focus}. Best match: ${summary.name}. Mobile: ${summary.mobile}. Location: ${summary.location}. Problem: ${summary.problem}.`;
    }
    return `I found ${total} matching profile${total === 1 ? '' : 's'}${focus}.`;
  }
  
  function describeFilterSet(filters = {}) {
    const pieces = [];
    if (filters.search) pieces.push(`search "${filters.search}"`);
    if (filters.mobile) pieces.push(`mobile "${filters.mobile}"`);
    if (filters.stage) pieces.push(`stage "${filters.stage}"`);
    if (filters.task_status) pieces.push(`task status "${filters.task_status}"`);
    if (filters.assigned_to) pieces.push(`assigned profile "${filters.assigned_to}"`);
    if (filters.location) pieces.push(`location "${filters.location}"`);
    if (filters.executive) pieces.push(`executive "${filters.executive}"`);
    if (filters.min_age) pieces.push(`min age ${filters.min_age}`);
    if (filters.max_age) pieces.push(`max age ${filters.max_age}`);
    return pieces.join(', ');
  }
  
  function buildAiNoResultReply(plan) {
    const filterSummary = describeFilterSet(plan.filters);
    const searchHint = plan.filters.search
      ? `I searched for "${plan.filters.search}" across name, full name, mobile, email, location, problem, executive, remarks, and related fields.`
      : 'I could not extract a clear name, phone number, or other searchable field from the message, so the match was too broad.';
    const explanationHint = plan.explanation ? ` Reason: ${plan.explanation}` : '';
    const filterHint = filterSummary ? ` Filters used: ${filterSummary}.` : '';
    return `No related data found in the database matching your criteria.${filterHint} ${searchHint}${explanationHint}`.trim();
  }
  
  function findKnownValue(question, knownRows) {
    const q = normalizeText(question);
    return (knownRows || [])
      .map((row) => String(row.value || '').trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .find((value) => q.includes(value.toLowerCase())) || '';
  }
  
  function localQuestionToFilters(question, schema) {
    const q = normalizeText(question);
    const filters = {};
  
    const stage = findKnownValue(q, schema.stages);
    if (stage) filters.stage = stage;
  
    const location = findKnownValue(q, schema.locations);
    if (location) filters.location = location;
  
    const executive = findKnownValue(q, schema.executives);
    if (executive) filters.executive = executive;
  
    const account = (schema.executor_accounts || []).find((u) => q.includes(normalizeText(u.name)) || q.includes(normalizeText(u.email)));
    if (account) filters.assigned_to = account.id;
  
    if (q.includes('unassigned') || q.includes('not assigned')) filters.assigned_to = '__unassigned';
    if (q.includes('pending')) filters.task_status = 'Pending';
    if (q.includes('updated')) filters.task_status = 'Updated';
    if (q.includes('contacted')) filters.task_status = 'Contacted';
  
    const mobile = q.match(/01[0-9]{8,10}/);
    if (mobile) filters.mobile = mobile[0];
  
    const overAge = q.match(/(?:over|above|older than|greater than|more than)\s+(\d{1,3})/);
    if (overAge) filters.min_age = String(Number(overAge[1]) + 1);
  
    const atLeastAge = q.match(/(?:at least|min(?:imum)? age)\s+(\d{1,3})/);
    if (atLeastAge) filters.min_age = atLeastAge[1];
  
    const underAge = q.match(/(?:under|below|younger than|less than)\s+(\d{1,3})/);
    if (underAge) filters.max_age = String(Number(underAge[1]) - 1);
  
    const maxAge = q.match(/(?:at most|max(?:imum)? age)\s+(\d{1,3})/);
    if (maxAge) filters.max_age = maxAge[1];
  
    const exactAge = q.match(/(?:age|aged)\s+(\d{1,3})/);
    if (exactAge && !filters.min_age && !filters.max_age) {
      filters.min_age = exactAge[1];
      filters.max_age = exactAge[1];
    }
  
    const fallbackSearch = extractSearchText(question);
    if (fallbackSearch) {
      filters.search = fallbackSearch;
    }
  
    return { filters, explanation: 'Local schema parser matched known fields and common filter phrases.' };
  }
  
  function cleanAiFilters(rawFilters, schema) {
    const filters = {};
    const raw = rawFilters || {};
    const allowedStrings = ['search', 'stage', 'task_status', 'assigned_to', 'location', 'executive', 'mobile'];
    for (const key of allowedStrings) {
      if (raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim()) {
        const value = String(raw[key]).trim();
        filters[key] = key === 'search' ? extractSearchText(value) : value;
      }
    }
    for (const key of ['min_age', 'max_age']) {
      if (raw[key] !== undefined && raw[key] !== null && Number.isFinite(Number(raw[key]))) {
        filters[key] = String(Math.max(0, Math.floor(Number(raw[key]))));
      }
    }
    if (filters.assigned_to && !filters.assigned_to.startsWith('__')) {
      const match = (schema.executor_accounts || []).find((u) => (
        u.id === filters.assigned_to ||
        normalizeText(u.name) === normalizeText(filters.assigned_to) ||
        normalizeText(u.email) === normalizeText(filters.assigned_to)
      ));
      if (match) filters.assigned_to = match.id;
    }
    return filters;
  }
  
  async function translateQuestion(question) {
    const schema = await datasetSchema();
    const settings = await getAiSettingsRaw();
    const configured = pickConfiguredProvider(settings);
    let parsed = null;
    let source = 'local';
    let provider_error = '';
  
    if (configured) {
      try {
        parsed = await callAiProvider(question, schema, configured);
        source = parsed._source || configured.provider;
        if (parsed._provider_error) provider_error = parsed._provider_error;
      } catch (error) {
        provider_error = error.message;
      }
    }
  
    if (!parsed?.filters) {
      parsed = localQuestionToFilters(question, schema);
      source = provider_error ? 'local-fallback' : 'local';
    }
  
    return {
      source,
      provider_error,
      filters: cleanAiFilters(parsed.filters, schema),
      search_mode: inferSearchMode(question, parsed?.filters || {}),
      explanation: parsed.explanation || 'Filter plan generated from the dataset schema.',
      schema,
    };
  }
  
  async function seedDefaultUsers() {
    const slugEmail = (name, fallback) => {
      const slug = String(name || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '.')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 36);
      return `${slug || fallback}@quantum.local`;
    };
  
    const executiveNames = await pool.query(`
      SELECT data->>'Executive' AS name, COUNT(*)::int AS count
      FROM public.dataset_rows
      WHERE dataset_id = $1 AND COALESCE(data->>'Executive', '') <> ''
      GROUP BY name
      ORDER BY count DESC, name
      LIMIT 8
    `, [DATASET_ID]);
  
    const defaults = [{
      id: 'admin-1',
      name: 'Admin',
      email: process.env.ADMIN_EMAIL || 'admin@quantum.local',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      role: 'admin',
    }];
  
    executiveNames.rows.forEach((row, index) => {
      defaults.push({
        id: `exec-${index + 1}`,
        name: row.name,
        email: slugEmail(row.name, `executive${index + 1}`),
        password: process.env.EXECUTOR_PASSWORD || 'exec123',
        role: 'executor',
      });
    });
  
    for (const user of defaults) {
      await pool.query(`
        INSERT INTO public.app_users (id, name, email, password_hash, role, active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        ON CONFLICT (id) DO UPDATE
          SET name = EXCLUDED.name,
              email = EXCLUDED.email,
              role = EXCLUDED.role,
              active = TRUE,
              updated_at = CURRENT_TIMESTAMP
      `, [user.id, user.name, user.email, hashPassword(user.password), user.role]);
    }
  }
  
  

  return {
    AI_PROVIDERS,
    AI_VENDOR_MODELS,
    CALL_STAGE_OPTIONS,
    COMPLETED_STAGES,
    DATASET_ID,
    DATA_EDIT_FIELDS,
    EXECUTOR_EDIT_FIELDS,
    HOST,
    MAX_PAGE_SIZE,
    PERSONAL_DATA_FIELDS,
    PORT,
    PORT_RETRY_LIMIT,
    PROFILE_CLASS_OPTIONS,
    QUERY_BOILERPLATE_WORDS,
    RESET_PASSWORD_TTL_SECONDS,
    ROLE_VALUES,
    ROW_FIELDS,
    TOKEN_TTL_SECONDS,
    actorSnapshot,
    aiSystemPrompt,
    appBaseUrl,
    appSecret,
    backfillRoleDetailsSchema,
    base64url,
    bcrypt,
    buildAiMatchReply,
    buildAiNoResultReply,
    buildChangeSet,
    buildDatasetWhere,
    buildRoleDetails,
    buildSearchTerms,
    calculateAgeFromDob,
    callAiProvider,
    callDirectProvider,
    callLangChainProvider,
    cleanAiFilters,
    createExecutiveAccountPagePath,
    createLangChainModel,
    crypto,
    datasetSchema,
    decryptSecret,
    defaultAiModel,
    defaultExecutivePassword,
    describeFilterSet,
    encryptSecret,
    encryptionKey,
    env,
    escapeHtml,
    extractJson,
    extractSearchText,
    filtersFromQuery,
    findKnownValue,
    forgotPasswordPagePath,
    generateResetToken,
    getAiSettingsRaw,
    getCommunicationConnectorSettings,
    getOverviewAdsBannerSettings,
    getPermissionSettings,
    getProgramSettings,
    getUserById,
    hashPassword,
    hashResetToken,
    inferSearchMode,
    initializeLangChainAgent,
    insertRowEvent,
    isLikelyExactMatch,
    langChainAgentState,
    loadChatHistory,
    localQuestionToFilters,
    makeToken,
    mergeRoleMetadata,
    messageContentToText,
    normalizeAttendanceList,
    normalizeChatRole,
    normalizeChatSessionId,
    normalizeClassification,
    normalizeCommunicationConnector,
    normalizeExecutiveDashboardDateFilter,
    normalizeOverviewAdsBannerSettings,
    normalizePhoneNumbers,
    normalizeRow,
    normalizeSoftwareRole,
    normalizeText,
    parseDobValue,
    parseJsonField,
    path,
    pickConfiguredProvider,
    pool,
    providerModelCandidates,
    publicAiSettings,
    queryBulkQueueSummary,
    queryDatasetRows,
    queryDatasetSummary,
    queryExecutiveDashboard,
    queryOverviewDashboard,
    readTokenPayload,
    requireAuth,
    requireRole,
    resetPasswordPagePath,
    rootDir,
    rotateChatHistory,
    rowAccountEmail,
    rowSelectSql,
    rowSummary,
    safeUser,
    saveChatMessage,
    saveCommunicationConnectorSettings,
    saveOverviewAdsBannerSettings,
    savePermissionSettings,
    saveProgramSettings,
    seedDefaultUsers,
    sendExecutiveCredentialsEmail,
    sendExecutiveRequestApprovedEmail,
    sendExecutiveRequestSubmissionEmail,
    sendResetPasswordEmail,
    signPayload,
    slugifyEmailName,
    syncProfileSoftwareAccount,
    taskStatusFromStage,
    toInt,
    translateQuestion,
    upsertAiSettings,
    verifyPassword,
  };
}

module.exports = { createContext };
