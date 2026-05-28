require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const db = require('./db');

const pool = db.pool || db;
const { cloudinary, cloudinaryOptimized, initDatabase } = db;

const app = express();
const upload = multer({
  dest: path.join(__dirname, 'tmp_uploads'),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const PORT = Number(process.env.PORT || 3000);
const DATASET_ID = Number(process.env.DATASET_ID || 2);
const TOKEN_TTL_SECONDS = 60 * 60 * 12;
const MAX_PAGE_SIZE = 500;

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
  ['image_url', 'image_url'],
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
  'image_url',
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
  'image_url',
];
const ROLE_VALUES = new Set(['admin', 'executor']);
const AI_PROVIDERS = new Set(['local', 'openai', 'gemini', 'anthropic']);
const AI_VENDOR_MODELS = {
  local: ['local-parser'],
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
};
const COMPLETED_STAGES = new Set(['completed', 'complete', 'handled', 'done', 'closed']);
const CALL_STAGE_OPTIONS = ['Interested', 'Active', 'Inactive', 'Pending', 'Completed', 'Handled', 'Dropped', 'Counselling', 'Follow Up'];
const PROFILE_CLASS_OPTIONS = new Set(['Admin', 'Executive', 'User']);

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function appSecret() {
  return process.env.APP_SECRET || process.env.DATABASE_URL || 'quantum-work-management-local-secret';
}

function signPayload(payload) {
  return crypto.createHmac('sha256', appSecret()).update(payload).digest('base64url');
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
  if (!payload || !signature || signPayload(payload) !== signature) return null;
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
  const [kind, iterations, salt, expected] = String(encoded || '').split('$');
  if (kind !== 'pbkdf2' || !iterations || !salt || !expected) return false;
  const actual = crypto.pbkdf2Sync(String(password), salt, Number(iterations), 32, 'sha256').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function safeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    profile_row_id: row.profile_row_id || null,
    metadata: row.metadata || {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function getUserById(id) {
  const result = await pool.query(
    'SELECT id, name, email, role, active, profile_row_id, metadata, created_at, updated_at FROM public.app_users WHERE id = $1',
    [id]
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

function normalizeClassification(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'admin') return 'Admin';
  if (raw === 'executive' || raw === 'executor') return 'Executive';
  return 'User';
}

function normalizeRow(row) {
  const raw = row.raw_data || {};
  const fullName = row.full_name || row.name || raw['Full Name'] || raw.Name || '';
  const email = row.email || raw.Email || raw.email || '';
  const mobile = row.mobile || raw.Mobile || '';
  const occupation = row.occupation || row.profession || raw.Occupation || raw.Profession || '';
  const classification = normalizeClassification(row.profile_classification || raw.profile_classification || raw.Classification || raw.Role);
  return {
    ...row,
    date: row.date || raw.Date || '',
    problem: row.problem || raw.Problem || '',
    executive: row.executive || raw.Executive || '',
    age: row.age || raw.Age || '',
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
    date_of_birth: row.date_of_birth || raw['Date of Birth'] || raw.date_of_birth || '',
    marital_status: row.marital_status || raw['Marital Status'] || raw.marital_status || '',
    blood_group: row.blood_group || raw['Blood Group'] || raw.blood_group || '',
    present_address: row.present_address || raw['Present Address'] || raw.present_address || row.location || '',
    permanent_address: row.permanent_address || raw['Permanent Address'] || raw.permanent_address || '',
    profile_classification: classification,
    family_info: parseJsonField(row.family_info ?? raw.family_info, {}),
    attendance_history: parseJsonField(row.attendance_history ?? raw.attendance_history, []),
    custom_fields: parseJsonField(row.custom_fields ?? raw.custom_fields, {}),
    app_user_id: row.app_user_id || raw.app_user_id || '',
    executive_read_at: row.executive_read_at || raw.executive_read_at || '',
    raw_data: raw,
    image_url: cloudinaryOptimized(row.image_url || raw.image_url || ''),
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

  if (classification !== 'Executive') {
    if (existingAccountId || profileRowId) {
      await client.query(`
        UPDATE public.app_users
        SET active = FALSE,
            updated_at = CURRENT_TIMESTAMP,
            metadata = metadata || $1::jsonb
        WHERE role = 'executor'
          AND (id = $2 OR profile_row_id = $3)
      `, [JSON.stringify({ deactivated_by_profile_classification: true }), existingAccountId, profileRowId]);
    }
    return { account: null, patch: existingAccountId ? { app_user_id: '' } : null };
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
  const metadata = {
    source: 'profile_promotion',
    promoted_by: actor?.id || null,
    promoted_at: new Date().toISOString(),
  };

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

  const patch = {};
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

function buildDatasetWhere(user, filters = {}) {
  const values = [DATASET_ID];
  const where = ['r.dataset_id = $1'];

  if (user.role === 'executor') {
    values.push(user.id);
    where.push(`r.data->>'assigned_to' = $${values.length}`);
  }

  if (filters.search) {
    values.push(filters.search);
    const p = `$${values.length}`;
    where.push(`(
      r.data->>'Name' ILIKE '%' || ${p} || '%' OR
      r.data->>'Mobile' ILIKE '%' || ${p} || '%' OR
      r.data->>'Location' ILIKE '%' || ${p} || '%' OR
      r.data->>'Problem' ILIKE '%' || ${p} || '%' OR
      r.data->>'Executive' ILIKE '%' || ${p} || '%' OR
      r.data->>'Remarks' ILIKE '%' || ${p} || '%'
    )`);
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
    values.push(filters.mobile);
    where.push(`r.data->>'Mobile' ILIKE '%' || $${values.length} || '%'`);
  }

  if (filters.min_age && Number.isFinite(Number(filters.min_age))) {
    values.push(Number(filters.min_age));
    where.push(`NULLIF(regexp_replace(COALESCE(r.data->>'Age', ''), '[^0-9]', '', 'g'), '')::int >= $${values.length}`);
  }

  if (filters.max_age && Number.isFinite(Number(filters.max_age))) {
    values.push(Number(filters.max_age));
    where.push(`NULLIF(regexp_replace(COALESCE(r.data->>'Age', ''), '[^0-9]', '', 'g'), '')::int <= $${values.length}`);
  }

  return { where: `WHERE ${where.join(' AND ')}`, values };
}

async function queryDatasetRows(user, filters, page, pageSize) {
  const { where, values } = buildDatasetWhere(user, filters);
  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM public.dataset_rows r ${where}`, values);
  const total = countResult.rows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const offset = (safePage - 1) * pageSize;
  const dataValues = [...values, pageSize, offset];
  const rowsResult = await pool.query(
    `${rowSelectSql()} ${where} ORDER BY r.row_number ASC, r.id ASC LIMIT $${dataValues.length - 1} OFFSET $${dataValues.length}`,
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
      COUNT(*) FILTER (WHERE COALESCE(r.data->>'image_url', '') <> '')::int AS images,
      COUNT(*) FILTER (WHERE COALESCE(r.data->>'assigned_to', '') = '')::int AS unassigned
    FROM public.dataset_rows r
    ${where}
  `, values);
  return result.rows[0] || { total: 0, pending: 0, completed: 0, updated: 0, images: 0, unassigned: 0 };
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
          WHERE LOWER(COALESCE(data->>'task_status', '')) IN ('completed', 'handled')
             OR LOWER(COALESCE(data->>'Stage', '')) IN ('completed', 'handled')
        )::int AS total_completed_tasks
      FROM public.dataset_rows
      WHERE dataset_id = $1
    `, [DATASET_ID]),
    pool.query(`
      SELECT COUNT(*)::int AS total_updated_profiles
      FROM public.dataset_row_events
      WHERE dataset_id = $1
        AND deleted_at IS NULL
        AND event_type IN ('assignment', 'profile_update', 'call_update', 'image_upload')
    `, [DATASET_ID]),
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
  ]);

  return {
    ...totals.rows[0],
    total_updated_profiles: updatedProfiles.rows[0]?.total_updated_profiles || 0,
    executive_progress: matrix.rows,
  };
}

async function queryExecutiveDashboard(user) {
  const result = await pool.query(`
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
      COUNT(*) FILTER (WHERE COALESCE(data->>'assigned_to', '') = $2)::int AS total_assigned
    FROM public.dataset_rows
    WHERE dataset_id = $1
  `, [DATASET_ID, user.id]);

  return result.rows[0] || {
    new_tasks: 0,
    previous_pending_tasks: 0,
    completed_tasks: 0,
    total_assigned: 0,
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
      )::int AS remaining_unassigned_core_records
    FROM public.dataset_rows
    WHERE dataset_id = $1
  `, [DATASET_ID]);
  return result.rows[0] || {
    total_pending_queue_records: 0,
    total_allocated_records: 0,
    remaining_unassigned_core_records: 0,
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
  return result.rows[0]?.value || { activeProvider: 'local', providers: {} };
}

async function getPermissionSettings() {
  const result = await pool.query("SELECT value FROM public.app_settings WHERE key = 'permission_settings'");
  return {
    executive_can_edit_personal_data: result.rows[0]?.value?.executive_can_edit_personal_data !== false,
  };
}

async function savePermissionSettings(userId, settings) {
  const value = {
    executive_can_edit_personal_data: Boolean(settings.executive_can_edit_personal_data),
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

function publicAiSettings(settings) {
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
    activeProvider: settings.activeProvider || 'local',
    vendors: {
      local: { label: 'Local SQL Agent', models: AI_VENDOR_MODELS.local },
      openai: { label: 'OpenAI', models: AI_VENDOR_MODELS.openai },
      gemini: { label: 'Google Gemini', models: AI_VENDOR_MODELS.gemini },
      anthropic: { label: 'Anthropic', models: AI_VENDOR_MODELS.anthropic },
    },
    providers,
  };
}

function defaultAiModel(provider) {
  return (AI_VENDOR_MODELS[provider] || AI_VENDOR_MODELS.local)[0];
}

async function upsertAiSettings(userId, body) {
  const provider = String(body.provider || body.vendor || '').trim();
  const activeProvider = String(body.activeProvider || provider || 'local').trim();
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

  return publicAiSettings(next);
}

function pickConfiguredProvider(settings) {
  const provider = settings.activeProvider || 'local';
  if (provider === 'local') return null;
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

async function callAiProvider(question, schema, configured) {
  const prompt = aiSystemPrompt(schema);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    if (configured.provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${configured.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: configured.model,
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
      if (!response.ok) throw new Error(data.error?.message || 'OpenAI request failed');
      return extractJson(data.choices?.[0]?.message?.content || '{}');
    }

    if (configured.provider === 'gemini') {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(configured.model)}:generateContent?key=${encodeURIComponent(configured.apiKey)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nQuestion: ${question}` }] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini request failed');
      return extractJson(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    }

    if (configured.provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': configured.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: configured.model,
          max_tokens: 800,
          temperature: 0,
          system: prompt,
          messages: [{ role: 'user', content: question }],
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Anthropic request failed');
      return extractJson(data.content?.map((part) => part.text || '').join('\n') || '{}');
    }
  } finally {
    clearTimeout(timeout);
  }
  return null;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
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

  if (!Object.keys(filters).length) {
    filters.search = question
      .replace(/\b(show|me|users?|who|are|is|from|in|with|and|the|all|list|find|search)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return { filters, explanation: 'Local schema parser matched known fields and common filter phrases.' };
}

function cleanAiFilters(rawFilters, schema) {
  const filters = {};
  const raw = rawFilters || {};
  const allowedStrings = ['search', 'stage', 'task_status', 'assigned_to', 'location', 'executive', 'mobile'];
  for (const key of allowedStrings) {
    if (raw[key] !== undefined && raw[key] !== null && String(raw[key]).trim()) {
      filters[key] = String(raw[key]).trim();
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
      source = configured.provider;
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

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/health', async (req, res) => {
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

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const requestedRole = String(req.body.role || '').trim();
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

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
  const users = await pool.query(`
    SELECT id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
    FROM public.app_users
    WHERE role IN ('admin', 'executor')
    ORDER BY role, name
  `);
  res.json({ ok: true, users: users.rows.map(safeUser) });
});

app.post('/api/users', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '').trim();
    const role = String(req.body.role || 'executor').trim();
    if (!name || !email || !password) return res.status(400).json({ ok: false, message: 'Name, email and password required' });
    if (!ROLE_VALUES.has(role)) return res.status(400).json({ ok: false, message: 'Invalid role' });

    const id = `${role}-${crypto.randomUUID()}`;
    const result = await pool.query(`
      INSERT INTO public.app_users (id, name, email, password_hash, role, active)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      RETURNING id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
    `, [id, name, email, hashPassword(password), role]);
    res.status(201).json({ ok: true, user: safeUser(result.rows[0]) });
  } catch (error) {
    const message = error.code === '23505' ? 'Email already exists' : error.message;
    res.status(500).json({ ok: false, message });
  }
});

app.put('/api/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const patch = {};
    for (const key of ['name', 'email', 'role', 'active']) {
      if (Object.prototype.hasOwnProperty.call(req.body, key)) patch[key] = req.body[key];
    }
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

app.get('/api/executives', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
  const result = await pool.query(`
    SELECT id, name, email, role, active, profile_row_id, metadata, created_at, updated_at
    FROM public.app_users
    WHERE role = 'executor' AND active = TRUE
    ORDER BY name
  `);
  res.json({ ok: true, executives: result.rows.map(safeUser) });
});

app.get('/api/dataset-meta', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
  const schema = await datasetSchema();
  res.json({ ok: true, schema });
});

app.get('/api/dataset-rows', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
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

app.get('/api/dataset-summary', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
  try {
    const summary = await queryDatasetSummary(req.user, filtersFromQuery(req.query));
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Dataset summary load failed', error: error.message });
  }
});

app.get('/api/dashboard/overview', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const overview = await queryOverviewDashboard();
    res.json({ ok: true, overview });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Overview dashboard load failed', error: error.message });
  }
});

app.get('/api/dashboard/executive', requireAuth, requireRole(['executor']), async (req, res) => {
  try {
    const overview = await queryExecutiveDashboard(req.user);
    res.json({ ok: true, overview });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Executive dashboard load failed', error: error.message });
  }
});

app.get('/api/analytics/assignments', requireAuth, requireRole(['admin']), async (req, res) => {
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

app.post('/api/tasks/assign', requireAuth, requireRole(['admin']), async (req, res) => {
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
    await client.query('ROLLBACK').catch(() => {});
    console.error('Assign error:', error);
    res.status(500).json({ ok: false, message: 'Task assign failed', error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/tasks/bulk-queue-summary', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const summary = await queryBulkQueueSummary();
    res.json({ ok: true, summary });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Bulk queue summary failed', error: error.message });
  }
});

app.post('/api/tasks/bulk-assign', requireAuth, requireRole(['admin']), async (req, res) => {
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
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bulk assign error:', error);
    res.status(500).json({ ok: false, message: 'Bulk task assignment failed', error: error.message });
  } finally {
    client.release();
  }
});

app.put('/api/dataset-rows/:id', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
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
      : (permissions.executive_can_edit_personal_data ? [...EXECUTOR_EDIT_FIELDS, ...PERSONAL_DATA_FIELDS] : EXECUTOR_EDIT_FIELDS);
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

    if (patch.Stage && !CALL_STAGE_OPTIONS.includes(String(patch.Stage))) {
      return res.status(400).json({ ok: false, message: 'Invalid call details stage' });
    }
    if (patch.Stage) patch.task_status = taskStatusFromStage(patch.Stage, req.user.role === 'executor' ? 'Updated' : 'Updated');
    else if (req.user.role === 'executor') patch.task_status = 'Updated';
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, message: 'No update fields sent' });

    await client.query('BEGIN');
    const selectValues = [DATASET_ID, String(req.params.id)];
    let where = 'dataset_id = $1 AND id::text = $2';
    if (req.user.role === 'executor') {
      selectValues.push(req.user.id);
      where += ` AND data->>'assigned_to' = $${selectValues.length}`;
    }

    const before = await client.query(`
      SELECT id::text, row_number, data
      FROM public.dataset_rows
      WHERE ${where}
      FOR UPDATE
    `, selectValues);
    if (!before.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'Row not found or not assigned to you' });
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
    if (req.user.role === 'admin' && Object.prototype.hasOwnProperty.call(patch, 'profile_classification')) {
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
      await insertRowEvent(client, updatedRow, req.body.call_notes ? 'call_update' : 'profile_update', req.user, changes, notes);
    }

    await client.query('COMMIT');
    res.json({ ok: true, message: 'Profile updated', row: normalizeRow({ ...updatedRow, raw_data: updatedRow.data }) });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update error:', error);
    res.status(500).json({ ok: false, message: 'Update failed', error: error.message });
  } finally {
    client.release();
  }
});

app.post('/api/upload/profile-image/:id', requireAuth, requireRole(['admin', 'executor']), upload.single('image'), async (req, res) => {
  try {
    if (!process.env.CLOUDINARY_CLOUD_NAME) return res.status(500).json({ ok: false, message: 'Cloudinary .env missing' });
    if (!req.file) return res.status(400).json({ ok: false, message: 'image file required' });

    if (req.user.role === 'executor') {
      const permissions = await getPermissionSettings();
      if (!permissions.executive_can_edit_personal_data) {
        return res.status(403).json({ ok: false, message: 'Executive personal-data editing is currently revoked by Admin' });
      }
      const assigned = await pool.query(`
        SELECT id
        FROM public.dataset_rows
        WHERE dataset_id = $1 AND id::text = $2 AND data->>'assigned_to' = $3
      `, [DATASET_ID, String(req.params.id), req.user.id]);
      if (!assigned.rows.length) return res.status(403).json({ ok: false, message: 'Row not assigned to you' });
    }

    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
      folder: process.env.CLOUDINARY_FOLDER || 'quantum-profiles',
      public_id: `dataset_row_${req.params.id}_${Date.now()}`,
      overwrite: true,
      resource_type: 'image',
    });
    const optimizedUrl = cloudinary.url(uploadResult.public_id, { fetch_format: 'auto', quality: 'auto', secure: true });
    const updated = await pool.query(`
      UPDATE public.dataset_rows
      SET data = data || $1::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE dataset_id = $2 AND id::text = $3
      RETURNING id::text, row_number, data
    `, [JSON.stringify({ image_url: optimizedUrl }), DATASET_ID, String(req.params.id)]);
    if (updated.rows[0]) {
      await insertRowEvent(pool, updated.rows[0], 'image_upload', req.user, {
        image_url: { from: '', to: optimizedUrl },
      }, 'Profile image uploaded');
    }
    res.json({ ok: true, image_url: optimizedUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ ok: false, message: 'Image upload failed', error: error.message });
  } finally {
    if (req.file?.path) fs.unlink(req.file.path).catch(() => {});
  }
});

app.post('/api/dataset-rows/:id/read', requireAuth, requireRole(['executor']), async (req, res) => {
  try {
    const readAt = new Date().toISOString();
    const result = await pool.query(`
      UPDATE public.dataset_rows
      SET data = data || $1::jsonb,
          updated_at = CURRENT_TIMESTAMP
      WHERE dataset_id = $2
        AND id::text = $3
        AND data->>'assigned_to' = $4
        AND COALESCE(data->>'executive_read_at', '') = ''
      RETURNING id::text, row_number, data
    `, [JSON.stringify({ executive_read_at: readAt }), DATASET_ID, String(req.params.id), req.user.id]);
    if (result.rows[0]) {
      await insertRowEvent(pool, result.rows[0], 'profile_update', req.user, {
        executive_read_at: { from: '', to: readAt },
      }, 'Executive opened the assigned profile');
    }
    res.json({ ok: true, read_at: readAt, updated: result.rowCount });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Read status update failed', error: error.message });
  }
});

app.get('/api/dataset-rows/:id/history', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
  try {
    const rowId = String(req.params.id);
    const values = [DATASET_ID, rowId];
    let accessWhere = 'dataset_id = $1 AND id::text = $2';
    if (req.user.role === 'executor') {
      values.push(req.user.id);
      accessWhere += ` AND data->>'assigned_to' = $${values.length}`;
    }
    const access = await pool.query(`SELECT id::text, row_number FROM public.dataset_rows WHERE ${accessWhere}`, values);
    if (!access.rows.length) return res.status(404).json({ ok: false, message: 'Row not found or not assigned to you' });

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

app.delete('/api/dataset-rows/:id/history/:eventId', requireAuth, requireRole(['admin']), async (req, res) => {
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

app.delete('/api/dataset-rows/:id/history', requireAuth, requireRole(['admin']), async (req, res) => {
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
    await client.query('ROLLBACK').catch(() => {});
    res.status(500).json({ ok: false, message: 'History clear failed', error: error.message });
  } finally {
    client.release();
  }
});

app.get('/api/settings/permissions', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
  try {
    const settings = await getPermissionSettings();
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(500).json({ ok: false, message: 'Permission settings load failed', error: error.message });
  }
});

app.put('/api/settings/permissions', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const settings = await savePermissionSettings(req.user.id, req.body);
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.get('/api/ai/settings', requireAuth, requireRole(['admin']), async (req, res) => {
  const settings = await getAiSettingsRaw();
  res.json({ ok: true, settings: publicAiSettings(settings) });
});

app.put('/api/ai/settings', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const settings = await upsertAiSettings(req.user.id, req.body);
    res.json({ ok: true, settings });
  } catch (error) {
    res.status(400).json({ ok: false, message: error.message });
  }
});

app.post('/api/ai/query', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ ok: false, message: 'Question required' });
    const pageSize = toInt(req.body.pageSize, 50, 1, MAX_PAGE_SIZE);
    const plan = await translateQuestion(question);
    const result = await queryDatasetRows(req.user, plan.filters, 1, pageSize);
    const sqlPlan = buildDatasetWhere(req.user, plan.filters);
    res.json({
      ok: true,
      source: `langchain-${plan.source}`,
      provider_error: plan.provider_error,
      explanation: plan.explanation,
      filters: plan.filters,
      schema_keys: plan.schema.keys.map((k) => k.key),
      agent_steps: [
        { tool: 'schema_inspector', output: { table: 'public.dataset_rows', dataset_id: DATASET_ID, jsonb_keys: plan.schema.keys.map((k) => k.key) } },
        { tool: 'query_planner', output: { filters: plan.filters } },
        { tool: 'postgres_sql_tool', output: { where: sqlPlan.where, parameter_count: sqlPlan.values.length, returned_rows: result.rows.length, total_matches: result.pagination.total } },
      ],
      ...result,
    });
  } catch (error) {
    console.error('AI query error:', error);
    res.status(500).json({ ok: false, message: 'AI query failed', error: error.message });
  }
});

app.get('/dataset-rows', requireAuth, requireRole(['admin', 'executor']), async (req, res) => {
  try {
    const result = await queryDatasetRows(req.user, filtersFromQuery(req.query), 1, 50);
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ message: 'Data ante problem hocche', error: error.message });
  }
});

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ ok: false, message: 'Server error', error: error.message });
});

async function start() {
  await initDatabase();
  await seedDefaultUsers();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Dataset ${DATASET_ID} is served with server-side pagination`);
  });
}

start().catch((error) => {
  console.error('Startup failed:', error);
  process.exit(1);
});
