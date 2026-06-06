const CALL_STAGES = ['Interested', 'Active', 'Inactive', 'Pending', 'Completed', 'Handled', 'Dropped', 'Counselling', 'Follow Up'];
const FAMILY_ROLES = [
  ['father', 'Father'],
  ['mother', 'Mother']
];
const FAMILY_RELATION_OPTIONS = ['Father', 'Mother', 'Wife', 'Child', 'Brother', 'Sister', 'Other'];
const FAMILY_CORE_FIELDS = [
  ['full_name', 'Name'],
  ['mobile', 'Phone']
];
const FAMILY_MEMBER_KNOWN_KEYS = new Set([
  'relationship',
  'role',
  'full_name',
  'name',
  'mobile',
  'phone',
  'extra_fields',
  'additional_fields'
]);
const AI_VENDOR_MODELS = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini'],
  gemini: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-latest']
};
const PERSONAL_TO_API = {
  full_name: 'Full Name',
  email: 'Email',
  mobile: 'Mobile',
  father_name: "Father's Name",
  mother_name: "Mother's Name",
  date_of_birth: 'Date of Birth',
  marital_status: 'Marital Status',
  blood_group: 'Blood Group',
  occupation: 'Occupation',
  present_address: 'Present Address',
  permanent_address: 'Permanent Address'
};
const AUTH_TOKEN_KEY = 'crm.session.token';
const AUTH_USER_KEY = 'crm.session.user';
let token = readSessionToken();
let currentUser = readSessionUser();
let rows = [];
let selected = null;
let selectedSnapshot = null;
let profileEditMode = false;
let profileHistoryOpen = false;
let executives = [];
let executiveAccounts = [];
let accountRows = [];
let accountProfile = null;
let accountProfileSnapshot = null;
let accountProfileEditMode = false;
let accountHistoryOpen = false;
let executiveRequests = [];
let deleteAccountTarget = null;
let accountSelectMode = false;
let selectedAccountIds = new Set();
let bulkAssignExecutiveRows = [];
let bulkSegments = [];
let lastBulkAllocated = 0;
let bulkAssignMode = false;
let bulkAssignRowIds = new Set();
let bulkAssignedExecutiveId = '';
let aiChatMessages = [];
let aiChatSessionId = '';
let executiveAssignedRows = [];
let executiveOverviewData = null;
let executiveOverviewMode = 'self';
let executiveOverviewAdIndex = 0;
let executiveOverviewToday = new Date();
let executiveOverviewSelectedDate = new Date();
let executiveOverviewViewYear = executiveOverviewToday.getFullYear();
let executiveOverviewViewMonth = executiveOverviewToday.getMonth();
let schema = null;
let aiSettings = null;
let programSettings = { program_name: '' };
let communicationConnectors = [];
let communicationConnectorViewIndex = -1;
let adminOverviewData = null;
let adminOverviewAdIndex = 0;
let adminOverviewToday = new Date();
let adminOverviewSelectedDate = new Date();
let adminOverviewViewYear = adminOverviewToday.getFullYear();
let adminOverviewViewMonth = adminOverviewToday.getMonth();
let overviewAdsBannerSettings = null;
let overviewAdsBannerUpdatedAt = '';
let overviewAdsBannerPollTimer = null;

window.getTaskSummaryRows = function getTaskSummaryRows() {
  const fallbackNames = ["Api", "Medha", "Ukyaa", "Shofiqul", "Rabeya", "Yeasmin", "ShahAlam", "Benedik", "Tuli", "Kaingpray"];
  const source = Array.isArray(communicationConnectors) && communicationConnectors.length ? communicationConnectors : [];
  const rows = source.slice(0, 10).map((connector, index) => ({
    name: connector.name || fallbackNames[index] || `Connector ${index + 1}`,
    url: connector.url || '',
    status: connector.url ? 'Submitted' : 'Pending',
    time: '7:33 PM'
  }));
  while (rows.length < 10) {
    const index = rows.length;
    rows.push({
      name: fallbackNames[index] || `Connector ${index + 1}`,
      url: '',
      status: 'Submitted',
      time: '7:33 PM'
    });
  }
  return rows;
};

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

function getOverviewAdsBannerSource(role) {
  if (overviewAdsBannerSettings?.image) return [normalizeOverviewAdsBannerSettings(overviewAdsBannerSettings)];
  return role === 'executor' ? executiveOverviewAds : adminOverviewAds;
}

function pickReadableTextColor(color) {
  const hex = String(color || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return '#ffffff';
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? '#111827' : '#ffffff';
}

function formatOverviewRunTime(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.day} ${map.month} ${map.year} · ${map.hour}:${map.minute} ${map.dayPeriod || ''}`.trim();
}

function ensureAutosuggestionRunTimeBadge(frameDocument) {
  const card = frameDocument.getElementById('adCard');
  if (!card) return null;
  card.style.position = 'relative';
  let badge = frameDocument.getElementById('overviewRunTimeBadge');
  if (!badge) {
    badge = frameDocument.createElement('div');
    badge.id = 'overviewRunTimeBadge';
    badge.style.cssText = [
      'position:absolute',
      'right:16px',
      'top:12px',
      'z-index:6',
      'padding:4px 8px',
      'border-radius:999px',
      'font-size:10px',
      'font-weight:700',
      'letter-spacing:0.02em',
      'pointer-events:none',
      'backdrop-filter:blur(4px)',
      '-webkit-backdrop-filter:blur(4px)',
      'box-shadow:0 6px 18px rgba(0,0,0,0.18)',
      'max-width:180px',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis',
    ].join(';');
    card.appendChild(badge);
  }
  return badge;
}

function syncAutosuggestionRunTimeBadge(frameDocument, bgColor, runLabel) {
  const badge = ensureAutosuggestionRunTimeBadge(frameDocument);
  if (!badge) return;
  const textColor = pickReadableTextColor(bgColor);
  const background = textColor === '#ffffff' ? 'rgba(0,0,0,0.32)' : 'rgba(255,255,255,0.78)';
  badge.textContent = runLabel || formatOverviewRunTime();
  badge.style.color = textColor;
  badge.style.background = background;
  badge.style.border = `1px solid ${textColor === '#ffffff' ? 'rgba(255,255,255,0.24)' : 'rgba(17,24,39,0.16)'}`;
  badge.style.textShadow = textColor === '#ffffff' ? '0 1px 2px rgba(0,0,0,0.25)' : 'none';
}

function syncOverviewBannerDom({ bannerEl, titleEl, subEl, iconEl, dotsEl, imageEl, actionEl, decoEls }, ad, role) {
  if (!bannerEl || !titleEl || !subEl || !iconEl || !dotsEl || !imageEl || !actionEl) return;
  const hasImage = Boolean(ad?.image);
  bannerEl.style.display = hasImage ? 'block' : 'flex';
  bannerEl.style.padding = hasImage ? '0' : (role === 'executor' ? '18px 24px' : '18px 24px');
  bannerEl.style.minHeight = hasImage ? '0' : '90px';
  bannerEl.style.background = hasImage ? 'transparent' : (ad?.bg || '#1a56c4');
  imageEl.style.display = hasImage ? 'block' : 'none';
  imageEl.src = hasImage ? ad.image : '';
  if (hasImage) {
    imageEl.alt = ad.title || 'Overview banner preview';
    titleEl.style.display = 'none';
    subEl.style.display = 'none';
    iconEl.style.display = 'none';
    actionEl.style.display = 'none';
    dotsEl.style.display = 'none';
    decoEls.forEach((el) => { if (el) el.style.display = 'none'; });
  } else {
    titleEl.style.display = '';
    subEl.style.display = '';
    iconEl.style.display = '';
    actionEl.style.display = 'flex';
    dotsEl.style.display = 'flex';
    decoEls.forEach((el) => { if (el) el.style.display = ''; });
  }
}

const adminOverviewAds = [
  { title: 'New Quantum Method Course', sub: 'Register now and transform your community impact', icon: '🎓', bg: '#1a56c4' },
  { title: 'Community Growth Program', sub: 'Connect more people, create lasting change today', icon: '🌱', bg: '#0f6e56' },
  { title: 'Donation Drive 2026', sub: 'Every contribution builds a stronger tomorrow', icon: '💙', bg: '#6d28d9' },
  { title: 'Counselling Sessions Open', sub: 'Book your free orientation session this week', icon: '🤝', bg: '#b45309' },
];
setInterval(nextOverviewAd, 3500);

function adminOverviewIsReady() {
  return Boolean(document.getElementById('adminOverviewCard'));
}

function getAdminOverviewConnectors() {
  const fallbackNames = ['Shofiqul Islam', 'Shah Alam', 'Adeeba Sultana', 'Jannatul Umme Salma', 'Rabeya Basri', 'Yeasmin Akhter', 'Benedik Bawm', 'Kaingpre Mro'];
  const source = Array.isArray(communicationConnectors) && communicationConnectors.length ? communicationConnectors : [];
  const rows = source.slice(0, 8).map((connector, index) => ({
    name: connector.name || fallbackNames[index] || `Connector ${index + 1}`,
    active: Boolean(String(connector.url || '').trim()),
    value: String(index + 1).padStart(2, '0'),
  }));
  while (rows.length < 8) {
    const index = rows.length;
    rows.push({
      name: fallbackNames[index] || `Connector ${index + 1}`,
      active: false,
      value: String(index + 1).padStart(2, '0'),
    });
  }
  return rows;
}

function getCommunityConnectorCardRows() {
  const fallbackNames = ['Shofiqul Islam', 'Shah Alam', 'Adeeba Sultana', 'Jannatul Umme Salma', 'Rabeya Basri', 'Yeasmin Akhter', 'Benedik Bawm', 'Kaingpre Mro'];
  const counts = [12, 15, 74, 7, 9, 3, 7, 23];
  const source = Array.isArray(communicationConnectors) && communicationConnectors.length ? communicationConnectors : [];
  return counts.map((count, index) => ({
    name: source[index]?.name || fallbackNames[index] || `Connector ${index + 1}`,
    count,
  }));
}

function renderCommunityConnectorCard() {
  const body = document.getElementById('communityConnectorCardBody');
  if (!body) return;
  body.innerHTML = getCommunityConnectorCardRows().map(row => `
    <tr>
      <td class="connector-name">${esc(row.name)}</td>
      <td class="stat-number">${row.count}</td>
      <td class="stat-number">${row.count}</td>
      <td class="stat-number">${row.count}</td>
      <td class="stat-number">${row.count}</td>
      <td class="stat-number">${row.count}</td>
      <td class="stat-number">${row.count}</td>
    </tr>
  `).join('');
}

function formatAdminOverviewDate(date) {
  return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`;
}

function renderAdminOverviewAds() {
  const source = getOverviewAdsBannerSource('admin');
  const ad = source[adminOverviewAdIndex % source.length];
  const titleEl = document.getElementById('overview-ads-title');
  const subEl = document.getElementById('overview-ads-sub');
  const iconEl = document.getElementById('overview-ads-icon');
  const bannerEl = document.getElementById('overview-ads-banner');
  const dotsEl = document.getElementById('overview-ads-dots');
  const imageEl = document.getElementById('overview-ads-image');
  const actionEl = bannerEl?.querySelector('.overview-ads-actions');
  const decoEls = bannerEl ? Array.from(bannerEl.querySelectorAll('.overview-ads-deco')) : [];
  if (!titleEl || !subEl || !iconEl || !bannerEl || !dotsEl || !imageEl || !actionEl) return;
  syncOverviewBannerDom({ bannerEl, titleEl, subEl, iconEl, dotsEl, imageEl, actionEl, decoEls }, ad, 'admin');
  titleEl.textContent = ad.title || 'New Quantum Method Course';
  subEl.textContent = ad.sub || '';
  iconEl.textContent = ad.icon || '📢';
  titleEl.style.color = ad.titleColor || '#fff';
  subEl.style.color = ad.subtitleColor || '#bfdbfe';
  titleEl.style.fontSize = `${Number(ad.titleSize) || 18}px`;
  subEl.style.fontSize = `${Number(ad.subtitleSize) || 13}px`;
  if (titleEl.style.display !== 'none') {
    bannerEl.style.background = ad.bannerColor || ad.bg || '#1a56c4';
  }
  dotsEl.innerHTML = source.map((_, index) => `<div style="width:7px;height:7px;border-radius:50%;background:${index === adminOverviewAdIndex ? '#fff' : 'rgba(255,255,255,0.4)'};"></div>`).join('');
}

function nextOverviewAd() {
  const source = getOverviewAdsBannerSource('admin');
  adminOverviewAdIndex = (adminOverviewAdIndex + 1) % source.length;
  renderAdminOverviewAds();
}

function prevOverviewAd() {
  const source = getOverviewAdsBannerSource('admin');
  adminOverviewAdIndex = (adminOverviewAdIndex - 1 + source.length) % source.length;
  renderAdminOverviewAds();
}

function renderAdminOverviewCalendar() {
  const labelEl = document.getElementById('overview-date-label');
  const monthEl = document.getElementById('overview-month-label');
  const grid = document.getElementById('overview-cal-days');
  if (!labelEl || !monthEl || !grid) return;
  labelEl.textContent = formatAdminOverviewDate(adminOverviewSelectedDate);
  monthEl.textContent = new Date(adminOverviewViewYear, adminOverviewViewMonth, 1).toLocaleString('en-US', { month: 'long' }) + ' ' + adminOverviewViewYear;
  grid.innerHTML = '';
  const first = new Date(adminOverviewViewYear, adminOverviewViewMonth, 1).getDay();
  const daysInMonth = new Date(adminOverviewViewYear, adminOverviewViewMonth + 1, 0).getDate();
  for (let i = 0; i < first; i++) grid.appendChild(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(day);
    const isToday = day === adminOverviewToday.getDate() && adminOverviewViewMonth === adminOverviewToday.getMonth() && adminOverviewViewYear === adminOverviewToday.getFullYear();
    const isSelected = day === adminOverviewSelectedDate.getDate() && adminOverviewViewMonth === adminOverviewSelectedDate.getMonth() && adminOverviewViewYear === adminOverviewSelectedDate.getFullYear();
    btn.style.cssText = `width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;font-size:12px;background:${isSelected ? '#1a56c4' : isToday ? '#dbeafe' : 'transparent'};color:${isSelected ? '#fff' : isToday ? '#1a56c4' : '#2d3748'};font-weight:${isToday || isSelected ? '700' : '400'};`;
    btn.onmouseover = () => { if (!isSelected) btn.style.background = '#f0f4ff'; };
    btn.onmouseout = () => { if (!isSelected) btn.style.background = isToday ? '#dbeafe' : 'transparent'; };
    btn.onclick = (() => {
      const selectedDay = day;
      return () => {
        adminOverviewSelectedDate = new Date(adminOverviewViewYear, adminOverviewViewMonth, selectedDay);
        renderAdminOverviewCalendar();
        const calendar = document.getElementById('overview-calendar');
        if (calendar) calendar.style.display = 'none';
      };
    })();
    grid.appendChild(btn);
  }
}

function toggleOverviewCal() {
  const calendar = document.getElementById('overview-calendar');
  if (!calendar) return;
  calendar.style.display = calendar.style.display === 'none' || !calendar.style.display ? 'block' : 'none';
  if (calendar.style.display === 'block') renderAdminOverviewCalendar();
}

function changeOverviewMonth(direction) {
  adminOverviewViewMonth += direction;
  if (adminOverviewViewMonth > 11) {
    adminOverviewViewMonth = 0;
    adminOverviewViewYear += 1;
  }
  if (adminOverviewViewMonth < 0) {
    adminOverviewViewMonth = 11;
    adminOverviewViewYear -= 1;
  }
  renderAdminOverviewCalendar();
}

function renderAdminOverviewCard() {
  if (!adminOverviewIsReady()) return;
  const overview = adminOverviewData || {};
  const connectors = getAdminOverviewConnectors();
  const activeConnectors = connectors.filter(item => item.active).length;
  const totalData = Number(overview.total_data_count || 0);
  const pendingQueue = Number(overview.total_pending_queue_records || 0);
  const allocated = Number(overview.total_allocated_records || 0);
  const unassigned = Number(overview.remaining_unassigned_records || 0);
  const executiveCount = Array.isArray(overview.executive_progress) ? overview.executive_progress.length : 0;
  const received = Math.max(0, totalData - unassigned);
  const dropped = Math.max(0, totalData - pendingQueue - allocated - unassigned);
  const interested = Math.max(0, pendingQueue + allocated - unassigned);

  const connectorWrap = document.getElementById('overviewConnectors');
  if (connectorWrap) {
    connectorWrap.innerHTML = connectors.map((connector) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid #f0f4f8;">
        <span style="font-size:13px;color:#2d3748;">${esc(connector.name)}</span>
        <div style="display:flex;align-items:center;gap:7px;">
          <span style="width:10px;height:10px;border-radius:50%;background:${connector.active ? '#38a169' : '#a0aec0'};display:inline-block;"></span>
          <span style="font-size:14px;font-weight:700;color:#1a202c;min-width:20px;text-align:right;">${connector.value}</span>
        </div>
      </div>
    `).join('');
  }

  const statsWrap = document.getElementById('overviewStats');
  if (statsWrap) {
    const statsData = [
      { val: String(activeConnectors), label: 'Active Connectors' },
      { val: String(executiveCount), label: 'Executives' },
      { val: String(allocated), label: 'Allocated' },
      { val: String(unassigned), label: 'Unassigned' },
      { val: String(pendingQueue), label: 'Pending Queue' },
      { val: String(totalData), label: 'Total Data' },
    ];
    statsWrap.innerHTML = statsData.map((item, index) => `
      <div style="padding:10px 0;${index < statsData.length - 1 ? 'border-bottom:1px solid #e2e8f0;' : ''}">
        <p style="font-size:22px;font-weight:700;color:#1a202c;margin:0;">${esc(item.val)}</p>
        <p style="font-size:12px;color:#718096;margin:3px 0 0;">${esc(item.label)}</p>
      </div>
    `).join('');
  }

  const num1 = document.getElementById('overviewNumbers');
  if (num1) {
    const items = [
      { val: String(totalData), label: 'Total Call' },
      { val: String(received), label: 'Received' },
      { val: String(unassigned), label: 'N/R' },
    ];
    num1.innerHTML = items.map(item => `<div><p style="font-size:22px;font-weight:700;color:#1a202c;margin:0;">${esc(item.val)}</p><p style="font-size:12px;color:#718096;margin:3px 0 0;">${esc(item.label)}</p></div>`).join('');
  }

  const num2 = document.getElementById('overviewNumbers2');
  if (num2) {
    const items = [
      { val: String(dropped), label: 'Dropped' },
      { val: String(interested), label: 'Interested' },
    ];
    num2.innerHTML = items.map(item => `<div><p style="font-size:22px;font-weight:700;color:#1a202c;margin:0;">${esc(item.val)}</p><p style="font-size:12px;color:#718096;margin:3px 0 0;">${esc(item.label)}</p></div>`).join('');
  }

  const reg = document.getElementById('overviewRegistration');
  if (reg) {
    const items = [
      { val: String(allocated), label: 'Quantum Method Course' },
      { val: String(pendingQueue), label: 'Quantum Method Orientation' },
      { val: String(executiveCount), label: 'Counselling' },
    ];
    reg.innerHTML = items.map(item => `<div><p style="font-size:22px;font-weight:700;color:#1a202c;margin:0;">${esc(item.val)}</p><p style="font-size:12px;color:#718096;margin:3px 0 0;">${esc(item.label)}</p></div>`).join('');
  }

  const donation = document.getElementById('overviewDonation');
  if (donation) {
    const items = [
      { val: String(activeConnectors), label: 'Total Donor' },
      { val: String(totalData), label: 'Total Amount' },
    ];
    donation.innerHTML = items.map(item => `<div><p style="font-size:22px;font-weight:700;color:#1a202c;margin:0;">${esc(item.val)}</p><p style="font-size:12px;color:#718096;margin:3px 0 0;">${esc(item.label)}</p></div>`).join('');
  }

  renderAdminOverviewAds();
  renderAdminOverviewCalendar();
}

const executiveOverviewAds = [
  { title: 'New Quantum Method Course', sub: 'Register now and transform your community impact', icon: '🎓', bg: '#1a56c4' },
  { title: 'Community Growth Program', sub: 'Connect more people, create lasting change today', icon: '🌱', bg: '#0f6e56' },
  { title: 'Donation Drive 2026', sub: 'Every contribution builds a stronger tomorrow', icon: '💙', bg: '#6d28d9' },
  { title: 'Counselling Sessions Open', sub: 'Book your free orientation session this week', icon: '🤝', bg: '#b45309' },
];
setInterval(() => {
  if (document.getElementById('executiveOverviewCard')) nextExecutiveOverviewAd();
}, 3500);

function formatExecutiveOverviewDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getDate()} ${date.toLocaleString('en-US', { month: 'long' })} ${date.getFullYear()}`;
}

function executiveOverviewApiDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderExecutiveOverviewCard() {
  const host = document.getElementById('executiveOverviewCard');
  if (!host) return;
  if (host.dataset.ready !== '1') {
    host.innerHTML = `
      <div class="executive-overview-wrap">
        <div id="executiveOverviewBanner" class="executive-overview-banner">
          <img id="executiveOverviewBannerImage" alt="Executive banner preview"
            style="display:none;width:100%;height:auto;border-radius:12px;object-fit:contain;" />
          <div class="executive-overview-ads-main">
            <p id="executiveOverviewBannerTitle" class="executive-overview-banner-title"></p>
            <p id="executiveOverviewBannerSub" class="executive-overview-banner-sub"></p>
          </div>
          <div class="executive-overview-banner-actions">
            <button type="button" onclick="prevExecutiveOverviewAd()" style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:30px;height:30px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">&#8249;</button>
            <div id="executiveOverviewBannerIcon" style="width:64px;height:64px;border-radius:12px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;font-size:32px;"></div>
            <button type="button" onclick="nextExecutiveOverviewAd()" style="background:rgba(255,255,255,0.2);border:none;border-radius:50%;width:30px;height:30px;color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;">&#8250;</button>
          </div>
          <div class="executive-overview-banner-dot"></div>
          <div class="executive-overview-banner-dot two"></div>
          <div id="executiveOverviewBannerDots" class="executive-overview-banner-dots"></div>
        </div>

        <div class="executive-overview-grid">
          <div class="executive-overview-card left">
            <div class="executive-overview-insight">
              <p class="executive-overview-insight-title">Instructions</p>
              <p>1. First cover follow ups and then pending list and then start the new lists.</p>
              <p>2. As we have course after three days we will finish our todays work and then take leave. This will continue till course</p>
            </div>
            <div class="executive-overview-stats-3">
              <div><p id="executiveOverviewLeftNew" class="executive-overview-stat-num">0</p><p class="executive-overview-stat-label">Today New</p></div>
              <div><p id="executiveOverviewLeftPending" class="executive-overview-stat-num">0</p><p class="executive-overview-stat-label">Pending</p></div>
              <div><p id="executiveOverviewLeftFollowUp" class="executive-overview-stat-num">0</p><p class="executive-overview-stat-label">Follow up</p></div>
            </div>
            <div class="executive-overview-subtle-link-row">
              <p class="executive-overview-subtle-link">Previous Day Communication</p>
            </div>
          </div>

          <div class="executive-overview-card">
            <div class="executive-overview-panel-head">
              <div class="executive-overview-toggle">
                <button id="executiveOverviewModeSelf" type="button" onclick="setExecutiveOverviewMode('self')" class="active">Self</button>
                <button id="executiveOverviewModeTotal" type="button" onclick="setExecutiveOverviewMode('total')" class="inactive">Total</button>
              </div>
              <div class="executive-overview-date-wrap">
                <button id="executiveOverviewDateBtn" type="button" onclick="toggleExecutiveOverviewCal()" class="executive-overview-date-btn">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1a56c4" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span id="executiveOverviewDateLabel"></span>
                </button>
                <div id="executiveOverviewCalendar" class="executive-overview-calendar">
                  <div class="executive-overview-calendar-head">
                    <button type="button" onclick="changeExecutiveOverviewMonth(-1)" aria-label="Previous month">&#8249;</button>
                    <span id="executiveOverviewMonthLabel" class="executive-overview-month"></span>
                    <button type="button" onclick="changeExecutiveOverviewMonth(1)" aria-label="Next month">&#8250;</button>
                  </div>
                  <div class="executive-overview-calendar-weekdays">
                    <span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>
                  </div>
                  <div id="executiveOverviewCalDays" class="executive-overview-calendar-days"></div>
                </div>
              </div>
            </div>

            <div id="executiveOverviewNumbers" class="executive-overview-stats-3" style="margin-bottom:8px;"></div>
            <div id="executiveOverviewNumbers2" class="executive-overview-stats-2" style="margin-bottom:8px;"></div>

            <p class="executive-overview-section-title">Task</p>
            <div id="executiveOverviewTask" class="executive-overview-stats-3" style="margin-bottom:8px;"></div>

            <p class="executive-overview-section-title">Task report</p>
            <div id="executiveOverviewTaskReport" class="executive-overview-stats-3"></div>
          </div>
        </div>
      </div>
    `;
    host.dataset.ready = '1';
  }
  renderExecutiveOverviewAd();
  renderExecutiveOverviewData();
  renderExecutiveOverviewCalendar();
}

function renderExecutiveOverviewAd() {
  const source = getOverviewAdsBannerSource('executor');
  const ad = source[executiveOverviewAdIndex % source.length];
  const titleEl = document.getElementById('executiveOverviewBannerTitle');
  const subEl = document.getElementById('executiveOverviewBannerSub');
  const iconEl = document.getElementById('executiveOverviewBannerIcon');
  const bannerEl = document.getElementById('executiveOverviewBanner');
  const dotsEl = document.getElementById('executiveOverviewBannerDots');
  const imageEl = document.getElementById('executiveOverviewBannerImage');
  const actionEl = bannerEl?.querySelector('.executive-overview-banner-actions');
  const decoEls = bannerEl ? Array.from(bannerEl.querySelectorAll('.executive-overview-banner-dot')) : [];
  if (!titleEl || !subEl || !iconEl || !bannerEl || !dotsEl || !imageEl || !actionEl) return;
  syncOverviewBannerDom({ bannerEl, titleEl, subEl, iconEl, dotsEl, imageEl, actionEl, decoEls }, ad, 'executor');
  titleEl.textContent = ad.title || 'New Quantum Method Course';
  subEl.textContent = ad.sub || '';
  iconEl.textContent = ad.icon || '📢';
  titleEl.style.color = ad.titleColor || '#fff';
  subEl.style.color = ad.subtitleColor || '#e2e8f0';
  titleEl.style.fontSize = `${Number(ad.titleSize) || 18}px`;
  subEl.style.fontSize = `${Number(ad.subtitleSize) || 13}px`;
  if (titleEl.style.display !== 'none') {
    bannerEl.style.background = ad.bannerColor || ad.bg || '#1a56c4';
  }
  dotsEl.innerHTML = source.map((_, index) => `<div style="width:7px;height:7px;border-radius:50%;background:${index === executiveOverviewAdIndex ? '#fff' : 'rgba(255,255,255,0.4)'};"></div>`).join('');
}

function nextExecutiveOverviewAd() {
  const source = getOverviewAdsBannerSource('executor');
  executiveOverviewAdIndex = (executiveOverviewAdIndex + 1) % source.length;
  renderExecutiveOverviewAd();
}

function prevExecutiveOverviewAd() {
  const source = getOverviewAdsBannerSource('executor');
  executiveOverviewAdIndex = (executiveOverviewAdIndex - 1 + source.length) % source.length;
  renderExecutiveOverviewAd();
}

function setExecutiveOverviewMode(mode) {
  executiveOverviewMode = mode === 'total' ? 'total' : 'self';
  const selfBtn = document.getElementById('executiveOverviewModeSelf');
  const totalBtn = document.getElementById('executiveOverviewModeTotal');
  if (selfBtn && totalBtn) {
    selfBtn.className = executiveOverviewMode === 'self' ? 'active' : 'inactive';
    totalBtn.className = executiveOverviewMode === 'total' ? 'active' : 'inactive';
  }
  renderExecutiveOverviewData();
}

function renderExecutiveOverviewCalendar() {
  const labelEl = document.getElementById('executiveOverviewDateLabel');
  const monthEl = document.getElementById('executiveOverviewMonthLabel');
  const grid = document.getElementById('executiveOverviewCalDays');
  if (!labelEl || !monthEl || !grid) return;
  labelEl.textContent = formatExecutiveOverviewDate(executiveOverviewSelectedDate);
  monthEl.textContent = new Date(executiveOverviewViewYear, executiveOverviewViewMonth, 1).toLocaleString('en-US', { month: 'long' }) + ' ' + executiveOverviewViewYear;
  grid.innerHTML = '';
  const first = new Date(executiveOverviewViewYear, executiveOverviewViewMonth, 1).getDay();
  const daysInMonth = new Date(executiveOverviewViewYear, executiveOverviewViewMonth + 1, 0).getDate();
  for (let i = 0; i < first; i++) grid.appendChild(document.createElement('span'));
  for (let day = 1; day <= daysInMonth; day++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = String(day);
    const isToday = day === executiveOverviewToday.getDate() && executiveOverviewViewMonth === executiveOverviewToday.getMonth() && executiveOverviewViewYear === executiveOverviewToday.getFullYear();
    const isSelected = day === executiveOverviewSelectedDate.getDate() && executiveOverviewViewMonth === executiveOverviewSelectedDate.getMonth() && executiveOverviewViewYear === executiveOverviewSelectedDate.getFullYear();
    btn.style.cssText = `width:26px;height:26px;border:none;border-radius:50%;cursor:pointer;font-size:11px;background:${isSelected ? '#1a56c4' : isToday ? '#dbeafe' : 'transparent'};color:${isSelected ? '#fff' : isToday ? '#1a56c4' : '#2d3748'};font-weight:${isToday || isSelected ? '700' : '400'};`;
    btn.onmouseover = () => { if (!isSelected) btn.style.background = '#f0f4ff'; };
    btn.onmouseout = () => { if (!isSelected) btn.style.background = isToday ? '#dbeafe' : 'transparent'; };
    btn.onclick = (() => {
      const selectedDay = day;
      return () => {
        executiveOverviewSelectedDate = new Date(executiveOverviewViewYear, executiveOverviewViewMonth, selectedDay);
        const calendar = document.getElementById('executiveOverviewCalendar');
        if (calendar) calendar.style.display = 'none';
        loadExecutiveOverview(executiveOverviewSelectedDate);
      };
    })();
    grid.appendChild(btn);
  }
}

function toggleExecutiveOverviewCal() {
  const calendar = document.getElementById('executiveOverviewCalendar');
  if (!calendar) return;
  calendar.style.display = calendar.style.display === 'none' || !calendar.style.display ? 'block' : 'none';
  if (calendar.style.display === 'block') renderExecutiveOverviewCalendar();
}

function changeExecutiveOverviewMonth(direction) {
  executiveOverviewViewMonth += direction;
  if (executiveOverviewViewMonth > 11) {
    executiveOverviewViewMonth = 0;
    executiveOverviewViewYear += 1;
  }
  if (executiveOverviewViewMonth < 0) {
    executiveOverviewViewMonth = 11;
    executiveOverviewViewYear -= 1;
  }
  renderExecutiveOverviewCalendar();
}

function renderExecutiveOverviewData() {
  const overview = executiveOverviewData || {};
  const leftNew = Number(overview.new_tasks || 0);
  const leftPending = Number(overview.previous_pending_tasks || 0);
  const leftFollowUp = Number(overview.completed_tasks || 0);
  const totalAssigned = Number(overview.total_assigned || 0);
  const received = Number(overview.completed_tasks || 0);
  const nr = Math.max(0, totalAssigned - received);
  const dropped = Math.max(0, Number(overview.total_data_count || totalAssigned) - Number(overview.total_pending_queue_records || 0) - Number(overview.total_allocated_records || 0) - Number(overview.remaining_unassigned_records || 0));
  const interested = Math.max(0, leftNew + leftPending);
  const taskTotal = totalAssigned;
  const taskNew = leftNew;
  const taskPending = leftPending;
  const taskReportCompleted = leftFollowUp;
  const taskReportPercent = Number(overview.completion_percentage || 0);
  const taskReportAssigned = Array.isArray(overview.assigned_rows) ? overview.assigned_rows.length : 0;

  const setText = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };

  setText('executiveOverviewLeftNew', leftNew);
  setText('executiveOverviewLeftPending', leftPending);
  setText('executiveOverviewLeftFollowUp', leftFollowUp);
  setText('executiveOverviewDateLabel', formatExecutiveOverviewDate(executiveOverviewSelectedDate));

  const selfBtn = document.getElementById('executiveOverviewModeSelf');
  const totalBtn = document.getElementById('executiveOverviewModeTotal');
  if (selfBtn && totalBtn) {
    selfBtn.className = executiveOverviewMode === 'self' ? 'active' : 'inactive';
    totalBtn.className = executiveOverviewMode === 'total' ? 'active' : 'inactive';
  }

  const numberWrap = document.getElementById('executiveOverviewNumbers');
  if (numberWrap) {
    const items = [
      { val: totalAssigned, label: 'Total Call' },
      { val: received, label: 'Received' },
      { val: nr, label: 'N/R' },
    ];
    numberWrap.innerHTML = items.map(item => `<div><p class="executive-overview-stat-num">${esc(item.val)}</p><p class="executive-overview-stat-label">${esc(item.label)}</p></div>`).join('');
  }

  const numberWrap2 = document.getElementById('executiveOverviewNumbers2');
  if (numberWrap2) {
    const items = [
      { val: dropped, label: 'Dropped' },
      { val: interested, label: 'Interested' },
    ];
    numberWrap2.innerHTML = items.map(item => `<div><p class="executive-overview-stat-num">${esc(item.val)}</p><p class="executive-overview-stat-label">${esc(item.label)}</p></div>`).join('');
  }

  const taskWrap = document.getElementById('executiveOverviewTask');
  if (taskWrap) {
    const items = [
      { val: taskTotal, label: 'Total Task' },
      { val: taskNew, label: 'New Task' },
      { val: taskPending, label: 'Pending Task' },
    ];
    taskWrap.innerHTML = items.map(item => `<div><p class="executive-overview-stat-num">${esc(item.val)}</p><p class="executive-overview-stat-label">${esc(item.label)}</p></div>`).join('');
  }

  const taskReportWrap = document.getElementById('executiveOverviewTaskReport');
  if (taskReportWrap) {
    const items = [
      { val: taskReportCompleted, label: 'Completed' },
      { val: `${taskReportPercent}%`, label: 'Completion' },
      { val: taskReportAssigned, label: 'Assigned' },
    ];
    taskReportWrap.innerHTML = items.map(item => `<div><p class="executive-overview-stat-num">${esc(item.val)}</p><p class="executive-overview-stat-label">${esc(item.label)}</p></div>`).join('');
  }
}

function setOverviewMode(mode) {
  const adminCard = document.getElementById('adminOverviewCard');
  const legacy = document.getElementById('legacyOverviewContent');
  if (adminCard) adminCard.style.display = mode === 'admin' ? 'block' : 'none';
  if (legacy) legacy.style.display = mode === 'admin' ? 'none' : 'block';
}

let permissions = { executive_can_edit_personal_data: true };
let pagination = { page: 1, pageSize: 50, total: 0, totalPages: 1, hasPrev: false, hasNext: false };
let accountSearchQuery = '';
let aiFabDrag = null;
let aiFabClickSuppressed = false;
let aiFabResetTimer = null;
const API = resolveApiBase();

function parseJson(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback } catch { return fallback } }
function clearLegacyAuthStorage() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}
function readSessionToken() {
  clearLegacyAuthStorage();
  return sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
}
function readSessionUser() {
  clearLegacyAuthStorage();
  return parseJson(sessionStorage.getItem(AUTH_USER_KEY), null);
}
function writeSession(nextToken, nextUser) {
  clearLegacyAuthStorage();
  token = nextToken || '';
  currentUser = nextUser || null;
  if (token) sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  else sessionStorage.removeItem(AUTH_TOKEN_KEY);
  if (currentUser) sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(currentUser));
  else sessionStorage.removeItem(AUTH_USER_KEY);
}
function clearSession() {
  writeSession('', null);
}
function resolveApiBase() { const configured = (window.API_BASE_URL || localStorage.getItem('apiBaseUrl') || '').trim(); return configured ? configured.replace(/\/+$/, '') : (window.location.protocol === 'file:' ? 'http://localhost:3000' : '') }
function apiUrl(path) { return API + (path.startsWith('/') ? path : '/' + path) }
function esc(v) { return String(v ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])) }
function attr(v) { return esc(v).replace(/`/g, '&#096;') }
function roleName(role) { return role === 'executor' ? 'Executive' : role === 'admin' ? 'Admin' : 'User' }
function canEditPersonal() { return currentUser?.role === 'admin' || permissions.executive_can_edit_personal_data }
function clone(value) { return JSON.parse(JSON.stringify(value ?? null)) }
function isProfileEditable() { return Boolean(profileEditMode && selected) }
function escapeChatHtml(value) { return esc(String(value ?? '')).replace(/\n/g, '<br>') }
function accountAvatarSvg(name) {
  const initials = String(name || 'A')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0] || '')
    .join('')
    .toUpperCase() || 'A';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#274060"/><stop offset="100%" stop-color="#4aa3df"/></linearGradient></defs><rect width="160" height="160" rx="80" fill="url(#g)"/><circle cx="80" cy="62" r="30" fill="#fff" fill-opacity="0.22"/><path d="M36 138c9-25 28-38 44-38s35 13 44 38" fill="#fff" fill-opacity="0.22"/><text x="80" y="92" fill="#fff" font-family="Arial, Helvetica, sans-serif" font-size="44" font-weight="700" text-anchor="middle">${initials}</text></svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}
function accountImageSrc(user) { return accountAvatarSvg(user?.name || user?.email || 'Account') }
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
function selectedPhoneNumbers() {
  const personal = selected?.personal_info && typeof selected.personal_info === 'object' ? selected.personal_info : {};
  const primary = String(selected?.mobile || personal.mobile || selected?.phone_numbers?.[0] || '').trim();
  const phones = normalizePhoneNumbers(
    selected?.phone_numbers ??
    personal.phone_numbers ??
    selected?.additional_phone_numbers ??
    selected?.raw_data?.phone_numbers ??
    selected?.raw_data?.personal_info?.phone_numbers ??
    []
  );
  return phones.filter(phone => phone && phone !== primary);
}
function accountPhoneNumbers() {
  const meta = accountMetadata();
  const personal = meta.personal_info && typeof meta.personal_info === 'object' ? meta.personal_info : {};
  const primary = String(personal.mobile || accountProfile?.mobile || accountProfile?.phone_numbers?.[0] || '').trim();
  const phones = normalizePhoneNumbers(
    meta.phone_numbers ??
    personal.phone_numbers ??
    meta.additional_phone_numbers ??
    accountProfile?.phone_numbers ??
    []
  );
  return phones.filter(phone => phone && phone !== primary);
}
function renderPhoneNumberRows(containerId, values, prefix, editable) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const list = editable
    ? (Array.isArray(values) ? values : values ? [values] : [])
    : normalizePhoneNumbers(values);
  if (!editable) {
    container.innerHTML = list.length ? list.map((value) => `<div class="phone-number-row"><div class="value">${esc(value || '-')}</div></div>`).join('') : '<div class="muted">No additional phone numbers.</div>';
    return;
  }
  container.innerHTML = list.map((value, index) => `<div class="phone-number-row">
    <input data-${prefix}-phone-number="${index}" value="${attr(value)}" placeholder="Phone number">
    <button class="danger" onclick="${prefix === 'account' ? 'removeAccountPhoneNumber' : 'removePhoneNumber'}(${index})">Remove</button>
  </div>`).join('') || '<div class="muted">No additional phone numbers yet.</div>';
}
function syncPrimaryPhoneFromNumbers(prefix) {
  const mobileInput = document.querySelector(prefix === 'account' ? '[data-account-personal="mobile"]' : '[data-personal="mobile"]');
  if (!mobileInput) return '';
  return String(mobileInput.value || '').trim();
}
function collectPhoneNumbers(prefix) {
  const primary = syncPrimaryPhoneFromNumbers(prefix);
  const selector = prefix === 'account' ? '[data-account-phone-number]' : '[data-profile-phone-number]';
  const extras = Array.from(document.querySelectorAll(selector)).map(input => String(input.value || '').trim()).filter(Boolean);
  return normalizePhoneNumbers([primary, ...extras]);
}
function getAiFab() { return document.getElementById('aiFab'); }
function clamp(value, min, max) { return Math.min(Math.max(value, min), max); }
function applyAiFabPosition(x, y) {
  const fab = getAiFab();
  if (!fab) return;
  const rect = fab.getBoundingClientRect();
  const maxX = Math.max(0, window.innerWidth - rect.width - 8);
  const maxY = Math.max(0, window.innerHeight - rect.height - 8);
  const nextX = clamp(Number(x) || 0, 8, maxX);
  const nextY = clamp(Number(y) || 0, 8, maxY);
  fab.style.left = `${nextX}px`;
  fab.style.top = `${nextY}px`;
  fab.style.right = 'auto';
  fab.style.bottom = 'auto';
  fab.dataset.positioned = 'true';
  return { x: nextX, y: nextY };
}
function resetAiFabPosition() {
  const fab = getAiFab();
  if (!fab) return;
  fab.style.left = 'auto';
  fab.style.top = 'auto';
  fab.style.right = window.matchMedia('(max-width: 1100px)').matches ? '12px' : '18px';
  fab.style.bottom = window.matchMedia('(max-width: 1100px)').matches ? '12px' : '18px';
  fab.dataset.positioned = 'default';
}
function scheduleAiFabReset() {
  if (aiFabResetTimer) clearTimeout(aiFabResetTimer);
  aiFabResetTimer = setTimeout(() => {
    resetAiFabPosition();
    aiFabResetTimer = null;
  }, 10000);
}
function handleAiFabPointerDown(event) {
  const fab = getAiFab();
  if (!fab || aiFabDrag || event.button !== 0) return;
  if (aiFabResetTimer) {
    clearTimeout(aiFabResetTimer);
    aiFabResetTimer = null;
  }
  const isMouseEvent = event.type === 'mousedown';
  const pointerId = isMouseEvent ? 'mouse' : event.pointerId;
  aiFabDrag = {
    pointerId,
    isMouseEvent,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - fab.getBoundingClientRect().left,
    offsetY: event.clientY - fab.getBoundingClientRect().top,
    moved: false,
  };
  aiFabClickSuppressed = false;
  fab.classList.add('dragging');
  if (!isMouseEvent) fab.setPointerCapture?.(event.pointerId);
  const onMove = (moveEvent) => {
    if (!aiFabDrag) return;
    const matchesPointer = !aiFabDrag.isMouseEvent && moveEvent.pointerId === aiFabDrag.pointerId;
    const matchesMouse = aiFabDrag.isMouseEvent && moveEvent.type === 'mousemove';
    if (!matchesPointer && !matchesMouse) return;
    const dx = moveEvent.clientX - aiFabDrag.startX;
    const dy = moveEvent.clientY - aiFabDrag.startY;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) aiFabDrag.moved = true;
    const x = moveEvent.clientX - aiFabDrag.offsetX;
    const y = moveEvent.clientY - aiFabDrag.offsetY;
    applyAiFabPosition(x, y);
  };
  const onUp = (upEvent) => {
    if (!aiFabDrag) return;
    const matchesPointer = !aiFabDrag.isMouseEvent && upEvent.pointerId === aiFabDrag.pointerId;
    const matchesMouse = aiFabDrag.isMouseEvent && upEvent.type === 'mouseup';
    if (!matchesPointer && !matchesMouse) return;
    fab.classList.remove('dragging');
    aiFabClickSuppressed = aiFabDrag.moved;
    if (aiFabDrag.moved) scheduleAiFabReset();
    else resetAiFabPosition();
    aiFabDrag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}
function handleAiFabClick(event) {
  if (aiFabClickSuppressed) {
    event.preventDefault();
    event.stopPropagation();
    aiFabClickSuppressed = false;
    return;
  }
  scheduleAiFabReset();
  toggleAiChat();
}
function syncSidebarToggleButton() {
  const button = document.getElementById('sideToggle');
  if (!button) return;
  const collapsed = document.body.classList.contains('sidebar-collapsed');
  button.innerHTML = '<img class="menu-logo" src="/assets/Qlogo.png" alt="Quantum logo">';
  button.title = 'Quantum logo';
  button.setAttribute('aria-label', 'Quantum logo');
  button.setAttribute('aria-expanded', String(!collapsed));
}
function ensureAiSessionId() {
  if (!currentUser?.id) return '';
  const key = `aiChatSessionId:${currentUser.id}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(key, id);
  }
  aiChatSessionId = id;
  return id;
}

async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await fetch(apiUrl(path), { ...options, headers });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {} } catch { throw new Error('Invalid server response') }
  if (response.status === 401 && token && !String(path || '').includes('/api/auth/login')) {
    clearSession();
  }
  if (!response.ok || data.ok === false) throw new Error(data.message || 'Request failed');
  return data;
}

function toggleLoginPassword() {
  const input = document.getElementById('password');
  const button = document.getElementById('togglePassword');
  const eyeOpen = document.getElementById('passwordEyeOpen');
  const eyeClosed = document.getElementById('passwordEyeClosed');
  if (!input || !button) return;
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  if (eyeOpen) eyeOpen.style.display = show ? 'none' : 'block';
  if (eyeClosed) eyeClosed.style.display = show ? 'block' : 'none';
  button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  button.title = show ? 'Hide password' : 'Show password';
}

function showToast(message) {
  const box = document.getElementById('toast');
  box.textContent = message;
  box.style.display = 'block';
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => box.style.display = 'none', 3600);
}

async function health() {
  try {
    const data = await apiFetch('/api/health');
    document.getElementById('dbDot').className = 'db-dot loaded';
    document.getElementById('dbLabel').textContent = 'Neon connected';
  } catch {
    document.getElementById('dbDot').className = 'db-dot';
    document.getElementById('dbLabel').textContent = API ? 'Server failed: ' + API : 'Server failed';
  }
}

async function loadLoginScreen() {
  const host = document.getElementById('loginScreen');
  if (!host || host.dataset.loaded === 'true') return;
  const response = await fetch('/pages/auth/login.html');
  if (!response.ok) throw new Error('Failed to load login form');
  host.innerHTML = await response.text();
  host.dataset.loaded = 'true';
}

async function login() {
  try {
    const data = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: document.getElementById('email').value.trim(), password: document.getElementById('password').value }) });
    writeSession(data.token, data.user);
    document.getElementById('topUserWrap').style.display = 'inline-flex';
    document.getElementById('topUserAvatar').src = accountImageSrc(currentUser);
    await boot();
  } catch (error) { showToast(error.message || 'Login failed') }
}

function logout() {
  clearSession();
  rows = [];
  selected = null;
  aiChatMessages = [];
  aiChatSessionId = '';
  toggleFilters(false);
  toggleCreateAccountForm(false);
  closeAccountProfile();
  toggleAiChat(false);
  document.body.classList.add('login-mode');
  document.body.classList.remove('is-admin', 'is-executor');
  document.getElementById('appShell').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  const sideToggle = document.getElementById('sideToggle');
  if (sideToggle) sideToggle.style.display = 'none';
  document.getElementById('topUser').textContent = '';
  document.getElementById('topUserWrap').style.display = 'none';
  document.body.classList.remove('sidebar-collapsed', 'sidebar-open');
  if (overviewAdsBannerPollTimer) {
    clearInterval(overviewAdsBannerPollTimer);
    overviewAdsBannerPollTimer = null;
  }
}

async function boot() {
  await loadLoginScreen();
  await health();
  renderAiChat();
  if (token) {
    try {
      const data = await apiFetch('/api/auth/me');
      writeSession(token, data.user);
    } catch { return logout() }
  }
  if (!currentUser) return logout();
  if (currentUser.role === 'admin' && typeof loadAdminFragments === 'function') {
    await loadAdminFragments();
  }
  document.body.classList.remove('login-mode');
  document.body.classList.toggle('is-admin', currentUser.role === 'admin');
  document.body.classList.toggle('is-executor', currentUser.role === 'executor');
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'grid';
  const sideToggle = document.getElementById('sideToggle');
  if (sideToggle) sideToggle.style.display = 'inline-block';
  document.getElementById('topUserWrap').style.display = 'inline-flex';
  document.getElementById('topUserAvatar').src = accountImageSrc(currentUser);
  document.getElementById('topUser').textContent = currentUser.name;
  document.getElementById('roleLabel').textContent = `${currentUser.name} (${roleName(currentUser.role)})`;
  const navTask = document.getElementById('navTask');
  if (navTask) navTask.textContent = currentUser.role === 'executor' ? 'Task' : 'C & A Summary';
  const navTaskReport = document.getElementById('navTaskReport');
  if (navTaskReport) navTaskReport.style.display = currentUser.role === 'executor' ? 'block' : 'none';
  await loadOverviewAdsBanner().catch(() => { });
  if (currentUser.role === 'executor') {
    switchView('overview');
    loadExecutiveOverview().catch(() => { });
  }
  await Promise.all([loadMeta(), loadExecutives(), loadPermissions()]);
  if (currentUser.role === 'admin') await loadBulkAssignExecutives();
  renderFilterOptions();
  renderStageSelect();
  if (currentUser.role === 'admin') {
    await Promise.all([refreshAccounts(), loadOverview(), loadAiSettings(), loadCommunicationConnectors()]);
  }
  ensureAiSessionId();
  resetAiFabPosition();
  switchView('overview');
  if (!overviewAdsBannerPollTimer) {
    overviewAdsBannerPollTimer = setInterval(() => {
      if (!currentUser) return;
      loadOverviewAdsBanner().catch(() => { });
    }, 8000);
  }
  loadAiChatHistory().catch(() => { });
  const aiInput = document.getElementById('aiQuestion');
  if (aiInput && !aiInput.dataset.bound) {
    aiInput.dataset.bound = 'true';
    aiInput.addEventListener('input', () => autoGrowChatInput(aiInput));
    aiInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        askAi();
      }
    });
    autoGrowChatInput(aiInput);
  }
  syncSidebarToggleButton();
  syncSidebarState();
}

function toggleSidebar(forceOpen) {
  const sidebar = document.getElementById('sidebar');
  const appShell = document.getElementById('appShell');
  const isMobile = window.matchMedia('(max-width: 1100px)').matches;
  const open = typeof forceOpen === 'boolean'
    ? forceOpen
    : isMobile
      ? !document.body.classList.contains('sidebar-open')
      : !sidebar.classList.contains('collapsed');

  if (isMobile) {
    document.body.classList.toggle('sidebar-open', open);
    document.body.classList.remove('sidebar-collapsed');
    sidebar.classList.remove('collapsed');
    appShell.classList.remove('sidebar-collapsed');
  } else {
    document.body.classList.toggle('sidebar-collapsed', !open);
    sidebar.classList.toggle('collapsed', !open);
    appShell.classList.toggle('sidebar-collapsed', !open);
    document.body.classList.remove('sidebar-open');
  }
  syncSidebarToggleButton();
}

function syncSidebarState() {
  const sidebar = document.getElementById('sidebar');
  const appShell = document.getElementById('appShell');
  const isMobile = window.matchMedia('(max-width: 1100px)').matches;
  if (isMobile) {
    document.body.classList.remove('sidebar-open');
    document.body.classList.remove('sidebar-collapsed');
    sidebar.classList.remove('collapsed');
    appShell.classList.remove('sidebar-collapsed');
  } else {
    const collapsed = sidebar.classList.contains('collapsed') || document.body.classList.contains('sidebar-collapsed');
    sidebar.classList.toggle('collapsed', collapsed);
    appShell.classList.toggle('sidebar-collapsed', collapsed);
    document.body.classList.toggle('sidebar-collapsed', collapsed);
  }
  syncSidebarToggleButton();
}

window.addEventListener('resize', syncSidebarState);
window.addEventListener('resize', () => {
  if (!aiFabDrag) resetAiFabPosition();
});

(() => {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const fallbackRows = [
    { name: "Api", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Medha", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Ukyaa", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Shofiqul", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Rabeya", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Yeasmin", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "ShahAlam", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Benedik", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Tuli", url: "", status: "Submitted", time: "7:33 PM" },
    { name: "Kaingpray", url: "", status: "Submitted", time: "7:33 PM" }
  ];
  const state = {
    today: new Date(),
    selDate: new Date(),
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth()
  };
  const popupState = {
    today: new Date(),
    selDate: new Date(),
    viewYear: new Date().getFullYear(),
    viewMonth: new Date().getMonth(),
    activeCardIndex: 0,
    dateKey: '',
    entry: null
  };
  const taskReportState = {
    tab: 'form'
  };
  const assignNewTaskState = {
    items: [],
    formOpen: false,
    editingId: '',
  };
  let selectedIndex = 0;

  function getRows() {
    if (typeof window.getTaskSummaryRows === 'function') {
      const connectorRows = window.getTaskSummaryRows();
      if (Array.isArray(connectorRows) && connectorRows.length) return connectorRows;
    }
    return fallbackRows;
  }

  function getSelectedRow() {
    const rows = getRows();
    if (!rows.length) return null;
    return rows[Math.min(Math.max(selectedIndex, 0), rows.length - 1)];
  }

  function formatSelectedDate(date) {
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function formatClock(date = new Date()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function toBn(value) {
    return String(value).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]);
  }

  function fmtBn(date) {
    return `${toBn(date.getDate())} ${['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'][date.getMonth()]}, ${toBn(date.getFullYear())}`;
  }

  function fmtSubmit(date) {
    let h = date.getHours();
    const m = date.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `জমা দেওয়ার সময়: ${fmtBn(date)} ${toBn(h)}:${m < 10 ? '০' : ''}${toBn(m)} ${ampm}`;
  }

  const taskSummaryStorageKey = 'taskSummaryDailyReportsV1';
  const taskSummaryNamePool = ['Api', 'Medha', 'Ukyaa', 'Shofiqul', 'Rabeya', 'Yeasmin', 'ShahAlam', 'Benedik', 'Tuli', 'Kaingpray'];
  const taskSummarySlideLabels = ['1', '2', '3', '4'];

  function getDateKey(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function readTaskSummaryStore() {
    try {
      const raw = localStorage.getItem(taskSummaryStorageKey);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function writeTaskSummaryStore(store) {
    localStorage.setItem(taskSummaryStorageKey, JSON.stringify(store));
  }

  function pickName(date, index) {
    const seed = date.getDate() + date.getMonth() * 3 + index;
    return taskSummaryNamePool[seed % taskSummaryNamePool.length];
  }

  function buildTaskSummaryCardData(date, index) {
    const baseName = pickName(date, index);
    const shift = index + 1;
    return {
      title: `কার্ড ${shift}`,
      basic: {
        name: baseName,
        role: index % 2 === 0 ? 'Executive' : 'Senior Executive',
        mobile: `01700000${String(10 + ((date.getDate() + index) % 80)).padStart(2, '0')}`,
        sector: index % 2 === 0 ? 'ঢাকা সেন্টার' : 'চট্টগ্রাম জোন',
        program: index % 2 === 0 ? 'ফলোআপ কল' : 'সাপ্তাহিক সংযোগ',
        specificProgram: index % 2 === 0 ? 'মেডিটেশন প্রোগ্রাম' : 'সেবা প্রোগ্রাম',
        contactsWith: index % 2 === 0 ? 'পুরানো ও নতুন সদস্য' : 'নতুন সদস্য'
      },
      contact: {
        received: [
          ['প্রো-মাস্টার', 5 + index],
          ['গ্র্যাজুয়েট', 8 + (index % 2)],
          ['এসোসিয়েট', 3 + (index % 3)],
          ['একেবারে নতুন', 4 + (index % 4)]
        ],
        missed: [
          ['প্রো-মাস্টার', 6 + (index % 2)],
          ['গ্র্যাজুয়েট', 2 + (index % 3)],
          ['এসোসিয়েট', index % 2],
          ['একেবারে নতুন', 3 + (index % 2)]
        ]
      },
      time: {
        slots: [
          '10:00 AM – 11:00 AM',
          '12:00 PM – 01:00 PM',
          index % 2 === 0 ? '–' : '02:00 PM – 03:00 PM',
          index % 3 === 0 ? '–' : '04:00 PM – 05:00 PM'
        ],
        total: index % 2 === 0 ? '২ ঘণ্টা ০০ মিনিট' : '৩ ঘণ্টা ০০ মিনিট',
        meditation: 'হ্যাঁ',
        prayer: index % 3 === 0 ? 'না' : 'হ্যাঁ'
      },
      summary: {
        positives: [
          'অনেকেই প্রোগ্রাম সম্পর্কে আগ্রহ দেখিয়েছেন',
          index % 2 === 0 ? 'নতুন ব্যক্তির সাথে ভালো সংযোগ হয়েছে' : 'ফলোআপের জন্য ইতিবাচক সাড়া এসেছে'
        ],
        challenges: [
          'কিছু নম্বর বন্ধ ছিল',
          index % 2 === 0 ? 'কিছু ব্যক্তি পরে কথা বলতে বলেছেন' : 'কিছু ব্যক্তি ব্যস্ত ছিলেন'
        ],
        advice: [
          index % 2 === 0 ? 'আগে SMS দিলে call receive rate বাড়তে পারে' : 'আগে reminder দিলে engagement বাড়তে পারে'
        ]
      }
    };
  }

  function buildTaskSummaryDateData(date) {
    const key = getDateKey(date);
    const store = readTaskSummaryStore();
    if (!store[key]) {
      store[key] = {
        cards: [0, 1, 2, 3].map((index) => buildTaskSummaryCardData(date, index)),
        feedback: []
      };
      writeTaskSummaryStore(store);
    }
    const entry = store[key];
    if (!Array.isArray(entry.cards) || !entry.cards.length) {
      entry.cards = [0, 1, 2, 3].map((index) => buildTaskSummaryCardData(date, index));
    }
    if (!Array.isArray(entry.feedback)) entry.feedback = [];
    return { key, entry };
  }

  function saveTaskSummaryDateData() {
    if (!popupState.dateKey) return;
    const store = readTaskSummaryStore();
    store[popupState.dateKey] = popupState.entry;
    writeTaskSummaryStore(store);
  }

  function getActiveTaskSummaryCard() {
    const cards = popupState.entry?.cards || [];
    if (!cards.length) return null;
    return cards[Math.min(Math.max(popupState.activeCardIndex, 0), cards.length - 1)];
  }

  function renderTaskSummarySlide(card, index) {
    const title = card?.title || `কার্ড ${index + 1}`;
    const basic = card?.basic || {};
    const contact = card?.contact || {};
    const time = card?.time || {};
    const summary = card?.summary || {};
    const received = Array.isArray(contact.received) ? contact.received : [];
    const missed = Array.isArray(contact.missed) ? contact.missed : [];
    const positives = Array.isArray(summary.positives) ? summary.positives : [];
    const challenges = Array.isArray(summary.challenges) ? summary.challenges : [];
    const advice = Array.isArray(summary.advice) ? summary.advice : [];
    const slot1 = time.slots?.[0] || '–';
    const slot2 = time.slots?.[1] || '–';
    const slot3 = time.slots?.[2] || '–';
    const slot4 = time.slots?.[3] || '–';
    return `
      <div class="task-summary-slide">
        <div class="popup-grid">
          <div class="card">
            <div class="section-title">👤 1. Basic Information <span style="margin-left:auto;font-size:11px;color:#718096;">${title}</span></div>
            <div class="row-info"><span class="lbl">নাম</span><span>${esc(basic.name || '-')}</span></div>
            <div class="row-info"><span class="lbl">পদবী</span><span>${esc(basic.role || '-')}</span></div>
            <div class="row-info"><span class="lbl">মোবাইল</span><span>${esc(basic.mobile || '-')}</span></div>
            <div class="row-info"><span class="lbl">সেক্টর/শাখা/সেল</span><span>${esc(basic.sector || '-')}</span></div>
            <div class="row-info"><span class="lbl">প্রোগ্রাম/উদ্দেশ্য</span><span>${esc(basic.program || '-')}</span></div>
            <div class="row-info"><span class="lbl">সুনির্দিষ্ট প্রোগ্রাম</span><span>${esc(basic.specificProgram || '-')}</span></div>
            <div class="row-info"><span class="lbl">যাদের সাথে যোগাযোগ</span><span>${esc(basic.contactsWith || '-')}</span></div>
          </div>

          <div class="card">
            <div class="section-title">📞 2. Contact Summary</div>
            <div class="popup-contact-grid">
              <div>
                <p style="font-weight:700;color:#2d3748;margin-bottom:6px;">ফোন রিসিভ করেছেন</p>
                <ul class="bullet">
                  ${received.map(([label, count]) => `<li>${esc(label)} : ${toBn(count)}</li>`).join('')}
                </ul>
                <p style="font-size:11px;color:#a0aec0;margin-top:6px;">(আপনিই প্রথম ফোন দিচ্ছেন)</p>
              </div>
              <div>
                <p style="font-weight:700;color:#2d3748;margin-bottom:6px;">ফোন রিসিভ করেন নি</p>
                <ul class="bullet">
                  ${missed.map(([label, count]) => `<li>${esc(label)} : ${toBn(count)}</li>`).join('')}
                </ul>
                <p style="font-size:11px;color:#a0aec0;margin-top:6px;">(আপনিই প্রথম ফোন দিচ্ছেন)</p>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="section-title">⏱ ৩. সংযোগায়নের সময়</div>
            <div class="time-row"><span class="lbl">সময় ১</span><span class="sep">:</span><span>${esc(slot1)}</span></div>
            <div class="time-row"><span class="lbl">সময় ২</span><span class="sep">:</span><span>${esc(slot2)}</span></div>
            <div class="time-row"><span class="lbl">সময় ৩</span><span class="sep">:</span><span>${esc(slot3)}</span></div>
            <div class="time-row"><span class="lbl">সময় ৪</span><span class="sep">:</span><span>${esc(slot4)}</span></div>
            <div class="time-row" style="margin-top:6px;"><span class="lbl">মোট সময়</span><span class="sep">:</span><span>${esc(time.total || '–')}</span></div>
            <div class="time-row"><span class="lbl">সংযোগায়নের আগে মেডিটেশন</span><span class="sep">:</span><span>${esc(time.meditation || 'হ্যাঁ')}</span></div>
            <div class="time-row"><span class="lbl">সংযোগায়ন শেষে প্রার্থনা</span><span class="sep">:</span><span>${esc(time.prayer || 'হ্যাঁ')}</span></div>
          </div>
        </div>

        <div class="card" style="margin-bottom:14px;">
          <div class="section-title">📋 4. C &amp; A Summary</div>
          <div class="popup-summary-grid">
            <div>
              <p style="font-size:13px;font-weight:700;color:#2d3748;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">আজকের সংযোগায়নের ইতিবাচক দিক</p>
              <ul class="bullet">
                ${positives.map((item) => `<li>${esc(item)}</li>`).join('')}
              </ul>
            </div>
            <div>
              <p style="font-size:13px;font-weight:700;color:#2d3748;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">যেসব চ্যালেঞ্জ হয়েছে</p>
              <ul class="bullet">
                ${challenges.map((item) => `<li>${esc(item)}</li>`).join('')}
              </ul>
            </div>
            <div>
              <p style="font-size:13px;font-weight:700;color:#2d3748;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">আপনার পরামর্শ</p>
              <ul class="bullet">
                ${advice.map((item) => `<li>${esc(item)}</li>`).join('')}
              </ul>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function setPopupCalendarOpen(open) {
    const calendar = document.getElementById('caPopupCalendar');
    if (!calendar) return;
    calendar.style.display = open ? 'block' : 'none';
    if (open) renderTaskPopupCal();
  }

  function renderTaskPopupCal() {
    const monthLabel = document.getElementById('caPopupMonthLabel');
    const grid = document.getElementById('caPopupCalDays');
    if (!monthLabel || !grid) return;
    monthLabel.textContent = `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][popupState.viewMonth]} ${popupState.viewYear}`;
    grid.innerHTML = '';
    const first = new Date(popupState.viewYear, popupState.viewMonth, 1).getDay();
    const daysInMonth = new Date(popupState.viewYear, popupState.viewMonth + 1, 0).getDate();
    for (let i = 0; i < first; i++) {
      grid.appendChild(document.createElement('span'));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(day);
      const isToday = day === popupState.today.getDate() && popupState.viewMonth === popupState.today.getMonth() && popupState.viewYear === popupState.today.getFullYear();
      const isSelected = day === popupState.selDate.getDate() && popupState.viewMonth === popupState.selDate.getMonth() && popupState.viewYear === popupState.selDate.getFullYear();
      btn.style.cssText = `width:28px;height:28px;border:none;border-radius:50%;cursor:pointer;font-size:12px;background:${isSelected ? '#1a56c4' : isToday ? '#dbeafe' : 'transparent'};color:${isSelected ? '#fff' : isToday ? '#1a56c4' : '#2d3748'};font-weight:${isToday || isSelected ? '700' : '400'};`;
      btn.onmouseover = () => {
        if (!isSelected) btn.style.background = '#f0f4ff';
      };
      btn.onmouseout = () => {
        if (!isSelected) btn.style.background = isToday ? '#dbeafe' : 'transparent';
      };
      btn.onclick = () => {
        popupState.selDate = new Date(popupState.viewYear, popupState.viewMonth, day);
        const label = document.getElementById('caPopupDateLabel');
        if (label) label.textContent = fmtBn(popupState.selDate);
        setPopupCalendarOpen(false);
        const { key, entry } = buildTaskSummaryDateData(popupState.selDate);
        popupState.dateKey = key;
        popupState.entry = entry;
        popupState.activeCardIndex = 0;
        renderTaskSummaryPopup();
      };
      grid.appendChild(btn);
    }
  }

  function toggleTaskPopupCal() {
    const calendar = document.getElementById('caPopupCalendar');
    if (!calendar) return;
    const open = calendar.style.display === 'none' || !calendar.style.display;
    setPopupCalendarOpen(open);
  }

  function changeTaskPopupMonth(direction) {
    popupState.viewMonth += direction;
    if (popupState.viewMonth > 11) {
      popupState.viewMonth = 0;
      popupState.viewYear += 1;
    }
    if (popupState.viewMonth < 0) {
      popupState.viewMonth = 11;
      popupState.viewYear -= 1;
    }
    renderTaskPopupCal();
  }

  function renderTaskSummaryPopup() {
    const dateLabel = document.getElementById('caPopupDateLabel');
    const submitTime = document.getElementById('caPopupSubmitTime');
    const track = document.getElementById('caPopupCarouselTrack');
    const feedbackList = document.getElementById('caPopupFeedbackList');
    const prevBtn = document.querySelector('#taskSummaryPanel .task-carousel-prev');
    const nextBtn = document.querySelector('#taskSummaryPanel .task-carousel-next');
    if (!popupState.entry) return;
    if (dateLabel) dateLabel.textContent = fmtBn(popupState.selDate);
    if (submitTime) submitTime.textContent = fmtSubmit(popupState.today);
    if (track) {
      const cards = popupState.entry.cards || [];
      track.innerHTML = cards.map((card, index) => renderTaskSummarySlide(card, index)).join('');
      track.style.transform = `translateX(-${Math.min(Math.max(popupState.activeCardIndex, 0), Math.max(cards.length - 1, 0)) * 100}%)`;
      if (prevBtn) prevBtn.classList.toggle('visible', cards.length > 1);
      if (nextBtn) nextBtn.classList.toggle('visible', cards.length > 1);
    }
    if (feedbackList) {
      const feedback = Array.isArray(popupState.entry.feedback) ? [...popupState.entry.feedback].reverse() : [];
      feedbackList.innerHTML = feedback.length
        ? feedback.map((item) => `
          <div class="feedback-item">
            <div class="meta">
              <span>${esc(item.author || 'Admin feedback')}</span>
              <span>${esc(item.at || '')}</span>
            </div>
            <div class="body">${esc(item.text || '')}</div>
          </div>
        `).join('')
        : '<div class="muted">No admin feedback yet.</div>';
    }
  }

  function shiftTaskSummaryCard(direction) {
    const cards = popupState.entry?.cards || [];
    if (cards.length <= 1) return;
    popupState.activeCardIndex += direction;
    if (popupState.activeCardIndex < 0) popupState.activeCardIndex = cards.length - 1;
    if (popupState.activeCardIndex > cards.length - 1) popupState.activeCardIndex = 0;
    renderTaskSummaryPopup();
  }

  function openTaskSummaryConnector(index) {
    const date = new Date(popupState.selDate);
    const { key, entry } = buildTaskSummaryDateData(date);
    popupState.dateKey = key;
    popupState.entry = entry;
    const rows = getRows();
    popupState.activeCardIndex = rows.length ? Math.min(Math.max(Number(index) || 0, 0), (entry.cards?.length || 1) - 1) : 0;
    const backdrop = document.getElementById('taskSummaryDetailsBackdrop');
    if (backdrop) backdrop.classList.add('open');
    setPopupCalendarOpen(false);
    renderTaskSummaryPopup();
  }

  function closeTaskSummaryConnector() {
    const backdrop = document.getElementById('taskSummaryDetailsBackdrop');
    if (backdrop) backdrop.classList.remove('open');
    setPopupCalendarOpen(false);
  }

  function submitTaskSummaryFeedback() {
    const input = document.getElementById('caPopupFeedbackInput');
    const text = String(input?.value || '').trim();
    if (!text) return showToast('Feedback লিখুন');
    if (!popupState.entry) return;
    popupState.entry.feedback = Array.isArray(popupState.entry.feedback) ? popupState.entry.feedback : [];
    popupState.entry.feedback.push({
      author: 'Admin feedback',
      at: fmtSubmit(new Date()),
      text
    });
    if (input) input.value = '';
    saveTaskSummaryDateData();
    renderTaskSummaryPopup();
    showToast('Feedback added');
  }

  function renderTaskReport() {
    const grid = document.getElementById('taskReportGrid');
    const updatedAt = document.getElementById('taskReportUpdatedAt');
    if (!grid) return;
    const rows = getRows();
    const total = rows.length;
    const submitted = rows.filter((row) => String(row.status || '').toLowerCase() === 'submitted').length;
    const pending = Math.max(total - submitted, 0);
    const activeDateLabel = formatSelectedDate(state.selDate);
    grid.innerHTML = `
      <div class="task-report-item">
        <div class="label">Total Task</div>
        <div class="value">${esc(String(total))}</div>
        <div class="note">Current connector rows</div>
      </div>
      <div class="task-report-item">
        <div class="label">Submitted</div>
        <div class="value">${esc(String(submitted))}</div>
        <div class="note">Submitted status rows</div>
      </div>
      <div class="task-report-item">
        <div class="label">Pending</div>
        <div class="value">${esc(String(pending))}</div>
        <div class="note">Rows still awaiting work</div>
      </div>
      <div class="task-report-item compact">
        <div class="label">Active date</div>
        <div class="value">${esc(activeDateLabel)}</div>
        <div class="note">Report date selector</div>
      </div>
    `;
    if (updatedAt) updatedAt.textContent = `Date: ${activeDateLabel}`;
  }

  function formatTaskReportDateInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function setTaskReportTab(tab) {
    taskReportState.tab = tab === 'feedback' ? 'feedback' : 'form';
    const tabButtons = document.querySelectorAll('#taskReportPanel [data-task-report-tab]');
    tabButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.taskReportTab === taskReportState.tab);
    });
    const panels = document.querySelectorAll('#taskReportPanel [data-task-report-panel]');
    panels.forEach((panel) => {
      panel.style.display = panel.dataset.taskReportPanel === taskReportState.tab ? 'grid' : 'none';
    });
    const buttonArea = document.querySelector('#taskReportPanel .button-area');
    if (buttonArea) buttonArea.style.display = taskReportState.tab === 'form' ? 'flex' : 'none';
    if (taskReportState.tab === 'feedback') ensureTaskReportFeedbackDefaults();
    const activeFrame = document.querySelector(`#taskReportPanel [data-task-report-panel="${taskReportState.tab}"] iframe`);
    if (activeFrame) setTimeout(() => resizeTaskReportFrame(activeFrame), 50);
  }

  function assignNewTaskStorageKey() {
    return `crm.assignNewTask.${currentUser?.id || 'anonymous'}`;
  }

  window.resizeAssignNewTaskFrame = function resizeAssignNewTaskFrame(frame) {
    try {
      const doc = frame?.contentDocument || frame?.contentWindow?.document;
      if (!doc?.body) return;
      const height = Math.max(doc.body.scrollHeight || 0, doc.documentElement?.scrollHeight || 0, 720);
      frame.style.height = `${height}px`;
    } catch (_) { }
  }

  window.toggleAssignNewTaskForm = function toggleAssignNewTaskForm(force) {
    const wrap = document.getElementById('assignNewTaskFormWrap');
    const button = document.getElementById('assignNewTaskToggleBtn');
    if (!wrap || !button) return;
    const open = typeof force === 'boolean' ? force : wrap.style.display === 'none' || !wrap.style.display;
    assignNewTaskState.formOpen = open;
    wrap.style.display = open ? 'flex' : 'none';
    document.body.style.overflow = open ? 'hidden' : '';
    button.textContent = open ? 'Close' : '+ Add New';
    if (open) {
      const frame = document.getElementById('assignNewTaskFrame');
      if (frame) {
        window.resizeAssignNewTaskFrame(frame);
        const item = assignNewTaskState.items.find((task) => String(task.id) === String(assignNewTaskState.editingId));
        if (item?.id) {
          setTimeout(() => {
            frame.contentWindow?.postMessage({
              type: 'crm:assign-new-task:prefill',
              payload: {
                mode: 'edit',
                full_name: item.full_name || '',
                email: item.email || '',
                phone: item.phone || '',
                advertisement: item.advertisement || '',
                problem: item.problem || ''
              }
            }, window.location.origin);
          }, 30);
        }
      }
    } else {
      assignNewTaskState.editingId = '';
    }
  }

  function renderAssignNewTaskList(message = '') {
    const list = document.getElementById('assignNewTaskList');
    const count = document.getElementById('assignNewTaskCount');
    if (!list || !count) return;
    if (!assignNewTaskState.items.length) {
      list.innerHTML = `<div class="empty">${esc(message || 'No task submitted yet')}</div>`;
      count.textContent = '0 tasks';
      return;
    }
    count.textContent = `${assignNewTaskState.items.length} task${assignNewTaskState.items.length === 1 ? '' : 's'}`;
    list.innerHTML = assignNewTaskState.items.map((item, index) => `
      <div class="assign-new-task-row">
        <div class="assign-new-task-cell assign-new-task-cell-primary">
          <b>#${esc(index + 1)} ${esc(item.full_name || '-')}</b>
          <div class="muted">User | ${esc(item.email || 'No email')} | ${esc(item.phone || '-')}</div>
        </div>
        <div class="assign-new-task-cell">${esc(item.advertisement || 'Advertisement')}</div>
        <div class="assign-new-task-cell">${esc(item.problem || '-')}</div>
        <div class="assign-new-task-cell">${esc(formatDateTime(item.created_at || ''))}</div>
        <div class="assign-new-task-cell assign-new-task-cell-actions">
          <span class="pill pending">New</span>
          <button type="button" class="assign-new-task-mini-btn" onclick="window.editAssignNewTaskItem('${esc(item.id || '')}')">Edit</button>
          <button type="button" class="assign-new-task-mini-btn danger" onclick="window.removeAssignNewTaskItem('${esc(item.id || '')}')">Remove</button>
        </div>
      </div>
    `).join('');
  }

  window.loadAssignNewTaskList = async function loadAssignNewTaskList() {
    if (currentUser?.role !== 'executor') return;
    try {
      const data = await apiFetch('/api/executor/assign-new-tasks');
      assignNewTaskState.items = Array.isArray(data.tasks) ? data.tasks : [];
      try {
        localStorage.setItem(assignNewTaskStorageKey(), JSON.stringify(assignNewTaskState.items));
      } catch (_) { }
      renderAssignNewTaskList();
    } catch (error) {
      try {
        assignNewTaskState.items = parseJson(localStorage.getItem(assignNewTaskStorageKey()), []) || [];
      } catch (_) {
        assignNewTaskState.items = [];
      }
      renderAssignNewTaskList(error.message || 'Task list load failed');
    }
  }

  async function persistAssignNewTaskList(tasks) {
    const payload = Array.isArray(tasks) ? tasks : [];
    const data = await apiFetch('/api/executor/assign-new-tasks', {
      method: 'PUT',
      body: JSON.stringify({ tasks: payload })
    });
    assignNewTaskState.items = Array.isArray(data.tasks) ? data.tasks : payload;
    try {
      localStorage.setItem(assignNewTaskStorageKey(), JSON.stringify(assignNewTaskState.items));
    } catch (_) { }
    renderAssignNewTaskList();
  }

  function syncAssignNewTaskFrame(payload = {}, mode = 'create') {
    const frame = document.getElementById('assignNewTaskFrame');
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({
      type: mode === 'edit' ? 'crm:assign-new-task:prefill' : 'crm:assign-new-task:reset',
      payload: mode === 'edit' ? { ...payload, mode } : undefined
    }, window.location.origin);
  }

  window.editAssignNewTaskItem = function editAssignNewTaskItem(id) {
    const item = assignNewTaskState.items.find((task) => String(task.id) === String(id));
    if (!item) return;
    assignNewTaskState.editingId = String(item.id || '');
    window.toggleAssignNewTaskForm(true);
    syncAssignNewTaskFrame({
      full_name: item.full_name || '',
      email: item.email || '',
      phone: item.phone || '',
      advertisement: item.advertisement || '',
      problem: item.problem || ''
    }, 'edit');
  };

  window.removeAssignNewTaskItem = async function removeAssignNewTaskItem(id) {
    const itemId = String(id || '').trim();
    if (!itemId) return;
    const item = assignNewTaskState.items.find((task) => String(task.id) === itemId);
    if (!item) return;
    if (!window.confirm(`Remove task "${item.full_name || 'this item'}"?`)) return;
    const next = assignNewTaskState.items.filter((task) => String(task.id) !== itemId);
    try {
      await persistAssignNewTaskList(next);
      if (String(assignNewTaskState.editingId || '') === itemId) {
        assignNewTaskState.editingId = '';
        window.toggleAssignNewTaskForm(false);
      }
      renderAssignNewTaskList();
      showToast('Task removed');
    } catch (error) {
      showToast(error.message || 'Remove failed');
    }
  };

  window.submitAssignNewTask = async function submitAssignNewTask(payload = {}) {
    if (currentUser?.role !== 'executor') return;
    const fullName = String(payload.full_name || '').trim();
    const email = String(payload.email || '').trim();
    const phone = String(payload.phone || '').trim();
    const advertisement = String(payload.advertisement || '').trim();
    const problem = String(payload.problem || '').trim();
    if (!fullName || !problem) {
      showToast('Full name and problem are required');
      return;
    }
    const now = new Date().toISOString();
    const editingId = String(assignNewTaskState.editingId || '').trim();
    const existing = editingId ? assignNewTaskState.items.find((task) => String(task.id) === editingId) : null;
    const updatedTask = {
      id: existing?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: fullName,
      email,
      phone,
      advertisement,
      problem,
      created_at: existing?.created_at || now,
      updated_at: now
    };
    const next = existing
      ? assignNewTaskState.items.map((task) => String(task.id) === editingId ? updatedTask : task)
      : [updatedTask, ...assignNewTaskState.items];
    try {
      await persistAssignNewTaskList(next);
      window.toggleAssignNewTaskForm(false);
      syncAssignNewTaskFrame({}, 'create');
      try {
        localStorage.setItem('crm.assignNewTask.updatedAt', String(Date.now()));
      } catch (_) { }
      showToast(existing ? 'Task updated' : 'New task added');
    } catch (error) {
      showToast(error.message || 'Task save failed');
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data && typeof event.data === 'object' ? event.data : null;
    if (!data) return;
    if (data.type === 'crm:assign-new-task:submit') {
      window.submitAssignNewTask(data.payload || {});
    }
    if (data.type === 'crm:assign-new-task:resize') {
      const frame = document.getElementById('assignNewTaskFrame');
      if (frame) frame.style.height = `${Math.max(Number(data.height) || 0, 720)}px`;
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && assignNewTaskState.formOpen) {
      window.toggleAssignNewTaskForm(false);
    }
  });

  function resizeTaskReportFrame(frame) {
    if (!frame) return;
    try {
      const doc = frame.contentDocument || frame.contentWindow?.document;
      if (!doc) return;
      const height = Math.max(
        doc.body?.scrollHeight || 0,
        doc.documentElement?.scrollHeight || 0,
        doc.body?.offsetHeight || 0,
        doc.documentElement?.offsetHeight || 0
      );
      if (height > 0) frame.style.height = `${height}px`;
    } catch (error) {
      frame.style.height = 'calc(100vh - 175px)';
    }
  }

  function renumberTaskReportTimeRows() {
    const rows = Array.from(document.querySelectorAll('#taskReportTimeContainer .task-report-time-row'));
    rows.forEach((row, index) => {
      const marker = row.querySelector('.task-report-time-number');
      if (marker) marker.textContent = `${index + 1})`;
    });
    calculateTaskReportTotalTime();
  }

  function addTaskReportTime() {
    const container = document.getElementById('taskReportTimeContainer');
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'task-report-time-row';
    row.innerHTML = `
      <span class="task-report-time-number">1)</span>
      <input class="input-box task-report-time-start" type="time" name="time_start[]" onchange="calculateTaskReportTotalTime()" oninput="calculateTaskReportTotalTime()" />
      <span>থেকে</span>
      <input class="input-box task-report-time-end" type="time" name="time_end[]" onchange="calculateTaskReportTotalTime()" oninput="calculateTaskReportTotalTime()" />
      <button type="button" class="task-report-remove-time-btn" onclick="removeTaskReportTime(this)">Remove</button>
    `;
    container.appendChild(row);
    renumberTaskReportTimeRows();
  }

  function removeTaskReportTime(button) {
    const container = document.getElementById('taskReportTimeContainer');
    const row = button?.closest('.task-report-time-row');
    if (!container || !row) return;
    if (container.querySelectorAll('.task-report-time-row').length <= 1) {
      row.querySelectorAll('input').forEach((input) => { input.value = ''; });
      return;
    }
    row.remove();
    renumberTaskReportTimeRows();
  }

  function calculateTaskReportTotalTime() {
    const startInputs = Array.from(document.querySelectorAll('#taskReportTimeContainer .task-report-time-start'));
    const endInputs = Array.from(document.querySelectorAll('#taskReportTimeContainer .task-report-time-end'));
    let totalMinutes = 0;
    startInputs.forEach((startInput, index) => {
      const endInput = endInputs[index];
      const start = String(startInput?.value || '').trim();
      const end = String(endInput?.value || '').trim();
      if (!start || !end) return;
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return;
      const startTotal = sh * 60 + sm;
      const endTotal = eh * 60 + em;
      const diff = endTotal - startTotal;
      if (diff > 0) totalMinutes += diff;
    });
    const hoursEl = document.getElementById('taskReportTotalHours');
    const minutesEl = document.getElementById('taskReportTotalMinutes');
    if (hoursEl) hoursEl.value = String(Math.floor(totalMinutes / 60));
    if (minutesEl) minutesEl.value = String(totalMinutes % 60).padStart(2, '0');
  }

  function addTaskReportPoint(containerId, name, placeholder) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const row = document.createElement('div');
    row.className = 'task-report-point-row';
    row.innerHTML = `
      <div class="task-report-point-number">1</div>
      <textarea class="input-box" name="${attr(name)}" placeholder="${attr(placeholder)}"></textarea>
      <button type="button" class="task-report-remove-point-btn" onclick="removeTaskReportPoint(this)">Remove</button>
    `;
    container.appendChild(row);
    renumberTaskReportPointRows(containerId);
  }

  function removeTaskReportPoint(button) {
    const row = button?.closest('.task-report-point-row');
    const container = row?.parentElement;
    if (!row || !container) return;
    if (container.querySelectorAll('.task-report-point-row').length <= 1) {
      row.querySelectorAll('textarea').forEach((input) => { input.value = ''; });
      return;
    }
    row.remove();
    renumberTaskReportPointRows(container.id);
  }

  function renumberTaskReportPointRows(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const rows = Array.from(container.querySelectorAll('.task-report-point-row'));
    rows.forEach((row, index) => {
      const marker = row.querySelector('.task-report-point-number');
      if (marker) marker.textContent = String(index + 1);
    });
  }

  function submitTaskReportForm(event) {
    event?.preventDefault?.();
    showToast('Task report ready');
  }

  function downloadTaskReportPDF() {
    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) return;
    const form = document.getElementById('taskReportForm');
    const title = 'Task report';
    const bodyHtml = form ? form.outerHTML : '<div class="muted">No task report form found.</div>';
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Bengali:wght@400;500;700;800&display=swap" rel="stylesheet">
      <style>
        body{font-family:'Noto Sans Bengali',Arial,sans-serif;padding:20px;background:#fff;}
        .button-area,.task-report-tabs,.task-report-add-btn,.task-report-remove-time-btn,.task-report-remove-point-btn{display:none !important;}
        .task-report-block{border:1px solid #e2e8f0;border-radius:14px;padding:16px;margin-bottom:14px;}
        .task-report-grid-2{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;}
        .task-report-grid-4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;}
        .task-report-time-section{display:grid;grid-template-columns:2fr 1fr;gap:14px;}
        .task-report-point-row,.task-report-time-row{display:grid;grid-template-columns:30px 1fr 42px 1fr auto;gap:8px;align-items:center;}
        input,textarea{border:1px solid #cbd5e1;border-radius:8px;padding:8px;font-family:inherit;}
        .input-box{width:100%;}
        .task-report-title{font-size:24px;margin:0 0 6px;}
        .task-report-copy{margin:0 0 16px;color:#64748b;}
      </style>
    </head><body>${bodyHtml}<script>window.onload=()=>{window.print();setTimeout(()=>window.close(),300);}<\/script></body></html>`);
    win.document.close();
  }

  function ensureTaskReportDefaults() {
    const dateInput = document.getElementById('taskReportDate');
    if (dateInput && !dateInput.value) dateInput.value = formatTaskReportDateInput(state.selDate);
    const nameInput = document.getElementById('taskReportName');
    if (nameInput && !nameInput.value) nameInput.value = currentUser?.name || '';
    if (!document.querySelector('#taskReportTimeContainer .task-report-time-row')) {
      const container = document.getElementById('taskReportTimeContainer');
      if (container) {
        container.innerHTML = `
          <div class="task-report-time-row">
            <span class="task-report-time-number">১)</span>
            <input class="input-box task-report-time-start" type="time" name="time_start[]" onchange="calculateTaskReportTotalTime()" oninput="calculateTaskReportTotalTime()" />
            <span>থেকে</span>
            <input class="input-box task-report-time-end" type="time" name="time_end[]" onchange="calculateTaskReportTotalTime()" oninput="calculateTaskReportTotalTime()" />
            <button type="button" class="task-report-remove-time-btn" onclick="removeTaskReportTime(this)">Remove</button>
          </div>
        `;
      }
    }
    ['taskReportPositiveContainer', 'taskReportChallengeContainer', 'taskReportSuggestionContainer'].forEach((id) => {
      const container = document.getElementById(id);
      if (!container) return;
      if (container.querySelector('.task-report-point-row')) return;
      const name = id === 'taskReportPositiveContainer' ? 'positive_points[]' : id === 'taskReportChallengeContainer' ? 'challenge_points[]' : 'suggestion_points[]';
      const placeholder = id === 'taskReportPositiveContainer' ? 'ইতিবাচক দিক লিখুন' : id === 'taskReportChallengeContainer' ? 'চ্যালেঞ্জ লিখুন' : 'পরামর্শ লিখুন';
      container.innerHTML = `
        <div class="task-report-point-row">
          <div class="task-report-point-number">১</div>
          <textarea class="input-box" name="${name}" placeholder="${placeholder}"></textarea>
          <button type="button" class="task-report-remove-point-btn" onclick="removeTaskReportPoint(this)">Remove</button>
        </div>
      `;
    });
    calculateTaskReportTotalTime();
  }

  function ensureTaskReportFeedbackDefaults() {
    const dateInput = document.getElementById('taskReportFeedbackDate');
    if (dateInput && !dateInput.value) dateInput.value = formatTaskReportDateInput(new Date());
  }

  function updateTaskReportFeedbackDate() {
    const dateInput = document.getElementById('taskReportFeedbackDate');
    if (!dateInput) return;
    const raw = dateInput.value;
    if (!raw) return;
    console.log('Date updated to:', raw);
  }

  function renderTaskReportForm() {
    if (document.getElementById('taskReportTimeContainer')) ensureTaskReportDefaults();
    ensureTaskReportFeedbackDefaults();
    setTaskReportTab(taskReportState.tab);
  }

  function renderRows() {
    const tbody = document.getElementById('taskSummaryTableBody');
    if (!tbody) return;
    if (currentUser?.role === 'executor') {
      tbody.innerHTML = '<tr><td colspan="5"><div class="empty">Task list has moved to your account profile.</div></td></tr>';
      return;
    }
    const rows = getRows();
    tbody.innerHTML = '';
    rows.forEach((row, index) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid #e2e8f0';
      tr.style.background = index % 2 === 0 ? '#ffffff' : '#f7fafc';
      tr.innerHTML = `
        <td style="padding:10px 14px;color:#2d3748;">${row.name}</td>
        <td style="padding:10px 14px;color:#4a5568;">${row.status}</td>
        <td style="padding:10px 14px;color:#4a5568;">${row.time}</td>
        <td style="padding:10px 14px;"><span style="font-size:12px;font-weight:600;color:#2b6cb0;cursor:pointer;letter-spacing:.04em;">SEND</span></td>
        <td style="padding:10px 14px;text-align:center;">
          <button type="button" class="task-view-btn" onclick="viewTaskSummaryConnector(${index})">VIEW</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
    renderTaskReport();
  }

  function renderCal() {
    const monthLabel = document.getElementById('month-label');
    const grid = document.getElementById('cal-days');
    if (!monthLabel || !grid) return;
    monthLabel.textContent = `${months[state.viewMonth]} ${state.viewYear}`;
    grid.innerHTML = '';
    const first = new Date(state.viewYear, state.viewMonth, 1).getDay();
    const daysInMonth = new Date(state.viewYear, state.viewMonth + 1, 0).getDate();
    for (let i = 0; i < first; i++) {
      grid.appendChild(document.createElement('span'));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(day);
      const isToday = day === state.today.getDate() && state.viewMonth === state.today.getMonth() && state.viewYear === state.today.getFullYear();
      const isSelected = day === state.selDate.getDate() && state.viewMonth === state.selDate.getMonth() && state.viewYear === state.selDate.getFullYear();
      btn.style.cssText = `
        width:32px;height:32px;border:none;border-radius:50%;cursor:pointer;font-size:13px;
        background:${isSelected ? '#1a56c4' : isToday ? '#dbeafe' : 'transparent'};
        color:${isSelected ? '#fff' : isToday ? '#1a56c4' : '#2d3748'};
        font-weight:${isToday || isSelected ? '600' : '400'};
      `;
      btn.onmouseover = () => {
        if (!isSelected) btn.style.background = '#f0f4ff';
      };
      btn.onmouseout = () => {
        if (!isSelected) btn.style.background = isToday ? '#dbeafe' : 'transparent';
      };
      btn.onclick = () => {
        state.selDate = new Date(state.viewYear, state.viewMonth, day);
        const label = document.getElementById('date-label');
        if (label) label.textContent = formatSelectedDate(state.selDate);
        const calendar = document.getElementById('calendar');
        if (calendar) calendar.style.display = 'none';
        renderCal();
        renderTaskReport();
      };
      grid.appendChild(btn);
    }
  }

  function toggleCal() {
    const calendar = document.getElementById('calendar');
    if (!calendar) return;
    calendar.style.display = calendar.style.display === 'none' || !calendar.style.display ? 'block' : 'none';
    if (calendar.style.display === 'block') renderCal();
  }

  function changeMonth(direction) {
    state.viewMonth += direction;
    if (state.viewMonth > 11) {
      state.viewMonth = 0;
      state.viewYear += 1;
    }
    if (state.viewMonth < 0) {
      state.viewMonth = 11;
      state.viewYear -= 1;
    }
    renderCal();
  }

  function initTaskSummaryWidget() {
    const label = document.getElementById('date-label');
    if (label) label.textContent = formatSelectedDate(state.selDate);
    const popupDateLabel = document.getElementById('caPopupDateLabel');
    if (popupDateLabel) popupDateLabel.textContent = fmtBn(popupState.selDate);
    const popupSubmitTime = document.getElementById('caPopupSubmitTime');
    if (popupSubmitTime) popupSubmitTime.textContent = fmtSubmit(popupState.today);
    renderRows();
    renderTaskReport();
    closeTaskSummaryConnector();
    renderCal();
  }

  function viewTaskSummaryConnector(index) {
    openTaskSummaryConnector(index);
  }

  function openSelectedTaskConnector() {
    const row = getSelectedRow();
    if (!row?.url) return showToast('No URL saved for this connector');
    window.open(row.url, '_blank', 'noopener');
  }

  window.toggleCal = toggleCal;
  window.changeMonth = changeMonth;
  window.toggleTaskPopupCal = toggleTaskPopupCal;
  window.changeTaskPopupMonth = changeTaskPopupMonth;
  window.shiftTaskSummaryCard = shiftTaskSummaryCard;
  window.submitTaskSummaryFeedback = submitTaskSummaryFeedback;
  window.renderTaskReport = renderTaskReport;
  window.renderTaskReportForm = renderTaskReportForm;
  window.setTaskReportTab = setTaskReportTab;
  window.resizeTaskReportFrame = resizeTaskReportFrame;
  window.addTaskReportTime = addTaskReportTime;
  window.removeTaskReportTime = removeTaskReportTime;
  window.calculateTaskReportTotalTime = calculateTaskReportTotalTime;
  window.addTaskReportPoint = addTaskReportPoint;
  window.removeTaskReportPoint = removeTaskReportPoint;
  window.submitTaskReportForm = submitTaskReportForm;
  window.downloadTaskReportPDF = downloadTaskReportPDF;
  window.viewTaskSummaryConnector = viewTaskSummaryConnector;
  window.openSelectedTaskConnector = openSelectedTaskConnector;
  window.closeTaskSummaryConnector = closeTaskSummaryConnector;
  window.printTaskSummaryCard = () => {
    const activeCard = getActiveTaskSummaryCard();
    const feedback = Array.isArray(popupState.entry?.feedback) ? popupState.entry.feedback : [];
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>সংযোগায়ন সারাংশ</title>
  <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Hind Siliguri',sans-serif;background:#fff;padding:20px;}
.wrap{background:#fff;padding:20px;}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:18px;margin-bottom:14px;}
.section-title{font-size:13px;font-weight:700;color:#1a56c4;margin-bottom:12px;display:flex;align-items:center;gap:6px;}
.row-info{display:flex;font-size:12.5px;padding:3px 0;color:#2d3748;border-bottom:1px solid #f7fafc;}
.row-info .lbl{color:#718096;min-width:140px;}
.time-row{display:flex;font-size:12px;padding:4px 0;border-bottom:1px solid #f7fafc;color:#2d3748;}
.time-row .lbl{min-width:160px;color:#718096;}
.time-row .sep{margin:0 8px;color:#a0aec0;}
ul.bullet{padding-left:14px;font-size:12px;color:#2d3748;}
ul.bullet li{margin-bottom:4px;}
.no-print{display:none!important;}
  </style></head><body><div class="wrap">${activeCard ? renderTaskSummarySlide(activeCard, popupState.activeCardIndex || 0) : ''}<div class="card"><div class="section-title">🗣 Admin Feedback</div>${feedback.length ? feedback.map((item) => `<div class="card" style="margin-bottom:10px;background:#f8fbff;padding:12px 14px;"><div style="font-size:11px;color:#718096;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;"><span>${esc(item.author || 'Admin feedback')}</span><span>${esc(item.at || '')}</span></div><div style="font-size:12px;color:#2d3748;line-height:1.45;white-space:pre-wrap;margin-top:4px;">${esc(item.text || '')}</div></div>`).join('') : '<div class="muted">No admin feedback yet.</div>'}</div></div><script>window.onload=()=>{window.print();window.close();}<\/script></body></html>`);
    win.document.close();
  };
  window.refreshTaskSummaryWidget = () => {
    renderRows();
    renderTaskReport();
    closeTaskSummaryConnector();
  };

  document.addEventListener('click', (event) => {
    const calendar = document.getElementById('calendar');
    const button = document.getElementById('date-btn');
    if (!calendar || !button) return;
    if (!calendar.contains(event.target) && !button.contains(event.target)) {
      calendar.style.display = 'none';
    }
  });

  document.addEventListener('click', (event) => {
    const calendar = document.getElementById('caPopupCalendar');
    const button = document.getElementById('caPopupDateBtn');
    if (!calendar || !button) return;
    if (!calendar.contains(event.target) && !button.contains(event.target)) {
      calendar.style.display = 'none';
    }
  });

  document.addEventListener('click', (event) => {
    const calendar = document.getElementById('executiveOverviewCalendar');
    const button = document.getElementById('executiveOverviewDateBtn');
    if (!calendar || !button) return;
    if (!calendar.contains(event.target) && !button.contains(event.target)) {
      calendar.style.display = 'none';
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTaskSummaryWidget, { once: true });
  } else {
    initTaskSummaryWidget();
  }
})();

function switchView(view, options = {}) {
  const taskMode = view === 'task';
  const taskReportMode = view === 'taskReport' || view === 'task-report';
  const adminTaskMode = view === 'adminTask';
  const assignNewTaskMode = view === 'assignNewTask';
  const actualView = taskMode ? 'records' : taskReportMode ? 'taskReport' : assignNewTaskMode ? 'assignNewTask' : view;
  if (actualView === 'accounts' && currentUser?.role !== 'admin') return;
  if (actualView === 'programForm' && currentUser?.role !== 'admin') return;
  if (actualView === 'settings' && currentUser?.role !== 'admin') return;
  if (actualView === 'adminTask' && currentUser?.role !== 'admin') return;
  if (actualView === 'assignNewTask' && currentUser?.role !== 'executor') return;
  for (const el of document.querySelectorAll('.view')) el.classList.remove('active');
  for (const el of document.querySelectorAll('.side-btn')) el.classList.remove('active');
  const activeViewEl = document.getElementById(actualView + 'View');
  if (activeViewEl) activeViewEl.classList.add('active');
  const recordsViewEl = document.getElementById('recordsView');
  if (recordsViewEl) recordsViewEl.classList.toggle('task-mode', taskMode);
  document.getElementById('nav' + view[0].toUpperCase() + view.slice(1))?.classList.add('active');
  const viewTitleEl = document.getElementById('viewTitle');
  if (viewTitleEl) {
    viewTitleEl.textContent = {
      overview: 'Overview',
      records: 'All Profile',
      adminTask: 'Task',
      taskReport: 'Task report',
      assignNewTask: 'Assign New Task',
      programForm: 'Program Form',
      autosuggestion: 'Autosuggestion',
      accounts: 'Community Connector',
      settings: 'Admin te',
      task: 'Task'
    }[view] || 'Dashboard';
  }
  const hideRecordChrome = actualView === 'records' && !taskMode;
  const hideTaskReportChrome = taskReportMode && currentUser?.role === 'executor';
  const hideAssignNewTaskChrome = assignNewTaskMode && currentUser?.role === 'executor';
  if (viewTitleEl) viewTitleEl.style.display = hideRecordChrome ? 'none' : 'inline-block';
  const roleLabelEl = document.getElementById('roleLabel');
  if (roleLabelEl) roleLabelEl.style.display = hideRecordChrome ? 'none' : 'inline-block';
  if (hideTaskReportChrome) {
    if (viewTitleEl) viewTitleEl.style.display = 'none';
    if (roleLabelEl) roleLabelEl.style.display = 'none';
  }
  if (hideAssignNewTaskChrome) {
    if (viewTitleEl) viewTitleEl.style.display = 'none';
    if (roleLabelEl) roleLabelEl.style.display = 'none';
  }
  const recordSummaryEl = document.getElementById('recordSummary');
  if (recordSummaryEl) recordSummaryEl.style.display = hideRecordChrome && !adminTaskMode ? 'flex' : 'none';
  const taskSummaryPanelEl = document.getElementById('taskSummaryPanel');
  if (taskSummaryPanelEl) taskSummaryPanelEl.style.display = taskMode ? 'flex' : 'none';
  const taskReportPanelEl = document.getElementById('taskReportPanel');
  if (taskReportPanelEl) taskReportPanelEl.style.display = taskReportMode ? 'flex' : 'none';
  const assignNewTaskPanelEl = document.getElementById('assignNewTaskPanel');
  if (assignNewTaskPanelEl) assignNewTaskPanelEl.style.display = assignNewTaskMode ? 'flex' : 'none';
  const recordsShellEl = document.getElementById('recordsShell');
  if (recordsShellEl) recordsShellEl.style.display = (taskMode || taskReportMode) ? 'none' : 'flex';
  const recordsToolbarControlsEl = document.getElementById('recordsToolbarControls');
  if (recordsToolbarControlsEl) recordsToolbarControlsEl.style.display = hideRecordChrome ? 'inline-flex' : 'none';
  if (document.getElementById('bulkAssignToggleBtn')) document.getElementById('bulkAssignToggleBtn').style.display = hideRecordChrome && currentUser?.role === 'admin' ? 'inline-block' : 'none';
  if (document.getElementById('newAccountToggleBtn')) document.getElementById('newAccountToggleBtn').style.display = actualView === 'accounts' && currentUser?.role === 'admin' ? 'inline-block' : 'none';
  if (document.getElementById('recordSearch')) document.getElementById('recordSearch').style.display = hideRecordChrome ? 'inline-block' : 'none';
  if (document.getElementById('filterBtn')) document.getElementById('filterBtn').style.display = hideRecordChrome ? 'inline-block' : 'none';
  if (document.getElementById('accountSelectToggleBtn')) document.getElementById('accountSelectToggleBtn').style.display = actualView === 'accounts' && currentUser?.role === 'admin' ? 'inline-block' : 'none';
  if (document.getElementById('accountDeleteBtn')) document.getElementById('accountDeleteBtn').style.display = actualView === 'accounts' && currentUser?.role === 'admin' && accountSelectMode ? 'inline-grid' : 'none';
  if (document.getElementById('pageSize')) document.getElementById('pageSize').style.display = hideRecordChrome ? 'inline-block' : 'none';
  if (!hideRecordChrome) toggleFilters(false);
  if (!hideRecordChrome && bulkAssignMode) clearBulkAssignMode();
  if (actualView !== 'accounts') toggleCreateAccountForm(false);
  if (actualView !== 'accounts' && accountSelectMode) clearAccountSelectMode();
  if (view === 'overview') {
    if (currentUser?.role === 'admin') {
      setOverviewMode('admin');
      loadOverview();
    } else {
      setOverviewMode('legacy');
      loadExecutiveOverview();
    }
  }
  if (view === 'accounts' && currentUser?.role === 'admin') { loadCommunicationConnectors(); renderCommunityConnectorCard(); }
  if (view === 'adminTask' && currentUser?.role === 'admin' && typeof window.loadAdminTaskRows === 'function') window.loadAdminTaskRows();
  if (taskMode || (actualView === 'records' && !options.skipLoad)) loadRecords(true);
  if (view === 'settings') { loadProgramSettings(); loadPermissions(); loadAiSettings(); loadCommunicationConnectors(); }
  if (view === 'autosuggestion') { setTimeout(bindAutosuggestionSourceFrame, 0); }
  if (window.matchMedia('(max-width: 1100px)').matches) {
    document.body.classList.remove('sidebar-open');
  }
  if (taskMode && typeof window.renderTaskReport === 'function') window.renderTaskReport();
  if (taskReportMode && typeof window.renderTaskReportForm === 'function') window.renderTaskReportForm();
  if (assignNewTaskMode) {
    if (typeof window.loadAssignNewTaskList === 'function') window.loadAssignNewTaskList();
    if (typeof window.toggleAssignNewTaskForm === 'function') window.toggleAssignNewTaskForm(false);
    const frame = document.getElementById('assignNewTaskFrame');
    if (frame) setTimeout(() => window.resizeAssignNewTaskFrame && window.resizeAssignNewTaskFrame(frame), 50);
  }
  if (adminTaskMode && typeof window.setAdminTaskTab === 'function') window.setAdminTaskTab(window.adminTaskState?.tab || 'assign');
}

function openSettingsSection(sectionId) {
  if (currentUser?.role !== 'admin') return;
  if (sectionId === 'autosuggestion') return openAutosuggestionPage();
  switchView('settings');
  setTimeout(() => {
    const target = document.getElementById(sectionId + 'Section');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 0);
}

function openAutosuggestionPage() {
  if (currentUser?.role !== 'admin') return;
  switchView('autosuggestion');
  setTimeout(bindAutosuggestionSourceFrame, 0);
}

async function loadMeta() { const data = await apiFetch('/api/dataset-meta'); schema = data.schema }
async function loadExecutives() {
  const data = await apiFetch('/api/executives');
  executives = data.executives || [];
  renderFilterOptions();
  renderBulkSegments();
}

async function loadBulkAssignExecutives() {
  if (currentUser?.role !== 'admin') return;
  try {
    const data = await apiFetch('/api/executive-accounts');
    executiveAccounts = data.executives || [];
    bulkAssignExecutiveRows = executiveAccounts;
    renderFilterOptions();
    renderAccountExecutiveOptions();
    renderBulkAssignPanel();
    renderBulkSegments();
  } catch {
    executiveAccounts = [];
    bulkAssignExecutiveRows = [];
    renderFilterOptions();
    renderAccountExecutiveOptions();
    renderBulkAssignPanel();
    renderBulkSegments();
  }
}

function bulkAssignExecutiveList() {
  if (executiveAccounts.length) return executiveAccounts;
  if (bulkAssignExecutiveRows.length) return bulkAssignExecutiveRows;
  return accountRows.filter(user => String(user.role || '').toLowerCase() === 'executor');
}

async function loadPermissions() {
  if (!currentUser) return;
  try {
    const data = await apiFetch('/api/settings/permissions');
    permissions = data.settings || permissions;
    const setToggle = (id, val) => { const el = document.getElementById(id); if (el) el.checked = val !== false; };
    setToggle('permAdminCreateAccounts', permissions.admin_create_accounts);
    setToggle('permAdminAssignProfiles', permissions.admin_assign_profiles);
    setToggle('permAdminConfigureAi', permissions.admin_configure_ai);
    setToggle('permAdminViewDashboard', permissions.admin_view_dashboard);
    setToggle('permAdminRwAllProfiles', permissions.admin_rw_all_profiles);
    setToggle('permAdminUseAiChat', permissions.admin_use_ai_chat);
    setToggle('permAdminClearHistory', permissions.admin_clear_history);

    setToggle('permExecViewAssignedProfiles', permissions.exec_view_assigned_profiles);
    setToggle('permExecViewClientDetails', permissions.exec_view_client_details);
    setToggle('permExecUpdateStageRemarks', permissions.exec_update_stage_remarks);
    setToggle('permExecutiveEdit', permissions.executive_can_edit_personal_data);
    setToggle('permExecManageAttendance', permissions.exec_manage_attendance);
  } catch { }
}

async function loadProgramSettings() {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    const data = await apiFetch('/api/settings/program');
    programSettings = data.settings || programSettings;
    const input = document.getElementById('programNameInput');
    if (input) input.value = programSettings.program_name || '';
  } catch (error) {
    const input = document.getElementById('programNameInput');
    if (input) input.value = '';
  }
}

async function loadOverviewAdsBanner() {
  if (!currentUser || !['admin', 'executor'].includes(currentUser.role)) return;
  try {
    const prevVersion = String(overviewAdsBannerUpdatedAt || '');
    const prevPayload = JSON.stringify(overviewAdsBannerSettings || {});
    const data = await apiFetch('/api/settings/overview-ads-banner');
    const next = normalizeOverviewAdsBannerSettings(data.settings || {});
    const nextVersion = String(data.updated_at || '');
    const nextPayload = JSON.stringify(next);
    overviewAdsBannerSettings = next;
    overviewAdsBannerUpdatedAt = nextVersion;
    if (prevPayload !== nextPayload || prevVersion !== nextVersion) {
      adminOverviewAdIndex = 0;
      executiveOverviewAdIndex = 0;
    }
    renderAdminOverviewAds();
    renderExecutiveOverviewAd();
  } catch {
    overviewAdsBannerSettings = overviewAdsBannerSettings || null;
  }
}

async function saveOverviewAdsBannerFromAutosuggestion(frameWindow, frameDocument) {
  const readValue = (selector, fallback = '') => String(frameDocument.querySelector(selector)?.value ?? fallback).trim();
  const readText = (selector, fallback = '') => String(frameDocument.querySelector(selector)?.textContent ?? fallback).trim();
  const bannerColor = readValue('#bannerColor', '#007bff');
  const runLabel = formatOverviewRunTime();
  syncAutosuggestionRunTimeBadge(frameDocument, bannerColor, runLabel);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const payload = normalizeOverviewAdsBannerSettings({
    title: readValue('#titleInput', readText('#titleText', '')),
    sub: readValue('#subInput', readText('#subText', '')),
    bannerColor,
    titleColor: readValue('#titleColor', '#ffffff'),
    subtitleColor: readValue('#subtitleColor', '#ffffff'),
    titleSize: readValue('#titleSize', '28'),
    subtitleSize: readValue('#subtitleSize', '14'),
    titleX: readValue('#titleX', '28'),
    titleY: readValue('#titleY', '16'),
    subtitleX: readValue('#subtitleX', '28'),
    subtitleY: readValue('#subtitleY', '52'),
    icon: '📢',
    runAt: new Date().toISOString(),
    runLabel,
  });
  const card = frameDocument.getElementById('adCard');
  if (card && frameWindow?.html2canvas) {
    try {
      const canvas = await frameWindow.html2canvas(card, {
        scale: 2,
        backgroundColor: null,
        useCORS: true,
      });
      payload.image = canvas.toDataURL('image/png');
    } catch (error) {
      console.warn('Autosuggestion banner capture failed:', error);
    }
  }

  const data = await apiFetch('/api/settings/overview-ads-banner', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  const next = normalizeOverviewAdsBannerSettings(data.settings || payload);
  overviewAdsBannerSettings = next;
  overviewAdsBannerUpdatedAt = String(data.updated_at || new Date().toISOString());
  adminOverviewAdIndex = 0;
  executiveOverviewAdIndex = 0;
  renderAdminOverviewAds();
  renderExecutiveOverviewAd();
  showToast('Overview banner updated');
  return next;
}

function bindAutosuggestionSourceFrame() {
  const iframe = document.querySelector('#autosuggestionView iframe');
  if (!iframe) return;

  const bind = () => {
    try {
      const frameWindow = iframe.contentWindow;
      const frameDocument = frameWindow?.document;
      if (!frameWindow || !frameDocument) return;
      const marker = frameDocument.body || frameDocument.documentElement;
      if (!marker) return;
      if (marker.dataset.overviewBannerHooked === '1') return;
      marker.dataset.overviewBannerHooked = '1';

      const originalDownloadAd = frameWindow.downloadAd;
      frameWindow.downloadAd = async function downloadAdAndShare() {
        try {
          const saved = await saveOverviewAdsBannerFromAutosuggestion(frameWindow, frameDocument);
          if (!saved && typeof originalDownloadAd === 'function') {
            return originalDownloadAd.apply(this, arguments);
          }
        } catch (error) {
          console.error('Autosuggestion save failed:', error);
        }
      };
    } catch (error) {
      console.error('Autosuggestion frame bind failed:', error);
    }
  };

  try {
    const frameWindow = iframe.contentWindow;
    if (frameWindow?.document?.readyState === 'complete') {
      bind();
      return;
    }
  } catch {
    // ignore and wait for load
  }

  iframe.addEventListener('load', bind, { once: true });
}

function renderFilterOptions() {
  document.getElementById('stageFilter').innerHTML = '<option value="">All Stage</option>' + CALL_STAGES.map(s => `<option value="${attr(s)}">${esc(s)}</option>`).join('');
  document.getElementById('statusFilter').innerHTML = '<option value="">All Task</option><option value="__unassigned">Unassigned</option><option>Pending</option><option>Updated</option><option>Completed</option><option>Handled</option>';
  const assignedExecs = bulkAssignExecutiveList();
  document.getElementById('assignedFilter').innerHTML = '<option value="">All Executives</option><option value="__unassigned">Unassigned</option>' + assignedExecs.map(e => `<option value="${attr(e.id)}">${esc(e.name || e.email || 'Executive')}</option>`).join('');
  renderProfileExecutiveOptions();
  renderBulkAssignPanel();
}

function renderStageSelect() {
  document.getElementById('editStage').innerHTML = CALL_STAGES.map(s => `<option value="${attr(s)}">${esc(s)}</option>`).join('');
}

function renderProfileExecutiveOptions() {
  const select = document.getElementById('profileExecutive');
  if (!select) return;
  const options = bulkAssignExecutiveList().length
    ? bulkAssignExecutiveList().map(e => `<option value="${attr(e.id)}">${esc(e.name || e.email || 'Executive')} (${esc(e.email || '')})</option>`).join('')
    : '<option value="">No executives available</option>';
  select.innerHTML = `<option value="">Choose executive</option>${options}`;
  if (selected?.assigned_to) select.value = String(selected.assigned_to);
  updateProfileAssignButtonState();
}

function updateProfileAssignButtonState() {
  const button = document.getElementById('profileAssignBtn');
  const select = document.getElementById('profileExecutive');
  if (!button || !select) return;
  const canAssign = currentUser?.role === 'admin' && Boolean(String(select.value || '').trim());
  button.style.display = currentUser?.role === 'admin' ? 'inline-block' : 'none';
  button.disabled = !canAssign;
}

function renderBulkAssignPanel() {
  const toggleBtn = document.getElementById('bulkAssignToggleBtn');
  const execSelect = document.getElementById('bulkAssignExecutiveSelect');
  if (!toggleBtn || !execSelect) return;
  toggleBtn.style.display = currentUser?.role === 'admin' ? 'inline-block' : 'none';
  toggleBtn.textContent = bulkAssignMode ? 'Cancel' : 'Select';
  const modeOpen = bulkAssignMode && currentUser?.role === 'admin';
  execSelect.style.display = modeOpen ? 'inline-block' : 'none';
  const execList = bulkAssignExecutiveList();
  execSelect.innerHTML = `<option value="">Choose executive</option>${execList.map(exec => `<option value="${attr(exec.id)}" ${String(exec.id) === String(bulkAssignedExecutiveId) ? 'selected' : ''}>${esc(exec.name || exec.email || 'Executive')}</option>`).join('')}`;
  execSelect.value = bulkAssignedExecutiveId || '';
  execSelect.disabled = !modeOpen;
  toggleBtn.disabled = false;
}

function handleBulkAssignAction() {
  if (currentUser?.role !== 'admin') return;
  toggleBulkAssignMode();
}

function toggleBulkAssignMode(force) {
  if (currentUser?.role !== 'admin') return;
  const next = typeof force === 'boolean' ? force : !bulkAssignMode;
  bulkAssignMode = next;
  if (!bulkAssignMode) {
    bulkAssignRowIds = new Set();
    bulkAssignedExecutiveId = '';
  }
  renderBulkAssignPanel();
  renderRows();
}

function selectBulkAssignedExecutive(id) {
  bulkAssignedExecutiveId = String(id || '');
  renderBulkAssignPanel();
  if (bulkAssignMode && bulkAssignRowIds.size > 0 && bulkAssignedExecutiveId) {
    assignSelectedRows();
  }
}

function toggleBulkRowSelection(id, checked) {
  if (!bulkAssignMode || currentUser?.role !== 'admin') return;
  const rowId = String(id || '');
  if (!rowId) return;
  if (checked) bulkAssignRowIds.add(rowId);
  else bulkAssignRowIds.delete(rowId);
  renderBulkAssignPanel();
  renderRows();
}

function clearBulkAssignMode() {
  bulkAssignMode = false;
  bulkAssignRowIds = new Set();
  bulkAssignedExecutiveId = '';
  renderBulkAssignPanel();
  renderRows();
}

async function loadOverview() {
  if (currentUser?.role !== 'admin') return loadExecutiveOverview();
  try {
    const data = await apiFetch('/api/dashboard/overview');
    const overview = data.overview || {};
    adminOverviewData = overview;
    setOverviewMode('admin');
    renderAdminOverviewCard();
    await loadBulkQueueSummary();
  } catch (error) { showToast(error.message || 'Overview failed') }
}

async function loadExecutiveOverview(date = executiveOverviewSelectedDate) {
  if (currentUser?.role !== 'executor') return;
  try {
    const selectedDate = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    executiveOverviewSelectedDate = selectedDate;
    executiveOverviewViewYear = selectedDate.getFullYear();
    executiveOverviewViewMonth = selectedDate.getMonth();
    const queryDate = executiveOverviewApiDate(selectedDate);
    const data = await apiFetch(`/api/dashboard/executive${queryDate ? `?date=${encodeURIComponent(queryDate)}` : ''}`);
    const overview = data.overview || {};
    executiveOverviewData = overview;
    setOverviewMode('legacy');
    renderExecutiveOverviewCard();
    executiveAssignedRows = Array.isArray(overview.assigned_rows) ? overview.assigned_rows : [];
    document.getElementById('assignedPanel').style.display = executiveAssignedRows.length ? 'block' : 'none';
    renderExecutiveAssignments();
  } catch (error) { showToast(error.message || 'Executive overview failed') }
}

function renderExecutiveAssignments() {
  const body = document.getElementById('assignedBody');
  const panel = document.getElementById('assignedPanel');
  if (!body || !panel) return;
  panel.style.display = executiveAssignedRows.length ? 'block' : 'none';
  if (!executiveAssignedRows.length) {
    body.innerHTML = '<tr><td colspan="4"><div class="empty">No assigned accounts</div></td></tr>';
    return;
  }
  body.innerHTML = executiveAssignedRows.map((row) => {
    const statusClass = row.is_new ? 'task-new' : 'task-remaining';
    const statusLabel = row.is_new ? 'New' : 'Remaining';
    const assignDate = row.assigned_at ? formatDateTime(row.assigned_at) : '-';
    return `<tr class="${statusClass}" onclick="openProfile('${attr(row.id)}')" ondblclick="openProfile('${attr(row.id)}')" style="cursor:pointer">
      <td><b>${esc(row.name || '-')}</b></td>
      <td><div>${esc(row.mobile || row.phone || '-')}</div></td>
      <td>${esc(assignDate)}</td>
      <td><span class="pill ${statusClass}">${statusLabel}</span></td>
    </tr>`;
  }).join('');
}

async function loadBulkQueueSummary() {
  if (currentUser?.role !== 'admin') return;
  if (!document.getElementById('bulkPending')) return;
  try {
    const data = await apiFetch('/api/tasks/bulk-queue-summary');
    const summary = data.summary || {};
    document.getElementById('bulkPending').textContent = summary.total_pending_queue_records || 0;
    document.getElementById('bulkAllocated').textContent = lastBulkAllocated || summary.total_allocated_records || 0;
    document.getElementById('bulkRemaining').textContent = summary.remaining_unassigned_records || summary.remaining_unassigned_core_records || 0;
    if (!bulkSegments.length) addBulkSegment(false);
    renderBulkSegments();
  } catch (error) { showToast(error.message || 'Bulk summary failed') }
}

function addBulkSegment(render = true) {
  const execList = bulkAssignExecutiveList();
  bulkSegments.push({ assigned_to: execList[bulkSegments.length % Math.max(execList.length, 1)]?.id || '', count: '', admin_instruction: '' });
  if (render) renderBulkSegments();
}

function removeBulkSegment(index) {
  bulkSegments.splice(index, 1);
  if (!bulkSegments.length) addBulkSegment(false);
  renderBulkSegments();
}

function updateBulkSegment(index, field, value) {
  if (!bulkSegments[index]) return;
  bulkSegments[index][field] = value;
}

function renderBulkSegments() {
  const wrap = document.getElementById('bulkSegments');
  if (!wrap || currentUser?.role !== 'admin') return;
  const execList = bulkAssignExecutiveList();
  if (!bulkSegments.length) bulkSegments = [{ assigned_to: execList[0]?.id || '', count: '', admin_instruction: '' }];
  wrap.innerHTML = bulkSegments.map((segment, index) => {
    const options = execList.map(e => `<option value="${attr(e.id)}" ${e.id === segment.assigned_to ? 'selected' : ''}>${esc(e.name || e.email || 'Executive')}</option>`).join('');
    return `<div class="bulk-row">
  <select onchange="updateBulkSegment(${index},'assigned_to',this.value)">${options}</select>
  <input type="number" min="1" value="${attr(segment.count)}" placeholder="Count" oninput="updateBulkSegment(${index},'count',this.value)">
  <input value="${attr(segment.admin_instruction)}" placeholder="Instruction" oninput="updateBulkSegment(${index},'admin_instruction',this.value)">
  <button class="danger" onclick="removeBulkSegment(${index})">Remove</button>
</div>`;
  }).join('');
}

async function allocateBulkQueue() {
  const segments = bulkSegments.map(segment => ({
    assigned_to: segment.assigned_to,
    count: Number(segment.count || 0),
    admin_instruction: segment.admin_instruction || ''
  })).filter(segment => segment.assigned_to && segment.count > 0);
  if (!segments.length) return showToast('Add at least one Executive and count segment');
  try {
    const data = await apiFetch('/api/tasks/bulk-assign', { method: 'POST', body: JSON.stringify({ segments }) });
    lastBulkAllocated = data.allocated || 0;
    showToast(data.message || 'Bulk queue allocated');
    await Promise.all([loadBulkQueueSummary(), loadOverview(), loadRecords(false)]);
  } catch (error) { showToast(error.message || 'Bulk allocation failed') }
}

function collectFilters() {
  return {
    search: document.getElementById('recordSearch').value.trim(),
    stage: document.getElementById('stageFilter').value,
    task_status: document.getElementById('statusFilter').value,
    assigned_to: currentUser?.role === 'admin' ? document.getElementById('assignedFilter').value : '',
    location: document.getElementById('locationFilter').value.trim(),
    min_age: document.getElementById('minAgeFilter').value.trim(),
    max_age: document.getElementById('maxAgeFilter').value.trim()
  };
}

function queryString(extra = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...collectFilters(), ...extra })) {
    if (value !== undefined && value !== null && String(value).trim() !== '') params.set(key, value);
  }
  return params.toString();
}

function debouncedSearch() {
  clearTimeout(debouncedSearch.timer);
  debouncedSearch.timer = setTimeout(() => loadRecords(true), 240);
}

async function loadRecords(resetPage = false) {
  if (resetPage) pagination.page = 1;
  pagination.pageSize = Number(document.getElementById('pageSize').value || 50);
  renderRecordsLoading('Loading records...');
  try {
    const data = await apiFetch('/api/dataset-rows?' + queryString({ page: pagination.page, pageSize: pagination.pageSize }));
    rows = data.rows || [];
    pagination = data.pagination || pagination;
    const recordSummaryMeta = document.getElementById('recordSummaryMeta');
    if (recordSummaryMeta) recordSummaryMeta.textContent = `${rows.length} records loaded from ${pagination.total}`;
    renderRows();
    renderPagination();
  } catch (error) {
    rows = [];
    renderRecordsLoading(error.message || 'Load failed');
  }
}

function renderRecordsLoading(message) {
  document.getElementById('tbody').innerHTML = `<tr><td colspan="6"><div class="empty">${esc(message)}</div></td></tr>`;
  const pageNumbers = document.getElementById('pageNumbers');
  if (pageNumbers) pageNumbers.innerHTML = '';
  const prevPage = document.getElementById('prevPage');
  const nextPage = document.getElementById('nextPage');
  if (prevPage) prevPage.disabled = true;
  if (nextPage) nextPage.disabled = true;
  const paginationText = document.getElementById('paginationText');
  if (paginationText) paginationText.textContent = message;
}
function renderRows() {
  if (!rows.length) { renderRecordsLoading('No records found.'); return }
  document.getElementById('tbody').innerHTML = rows.map(row => {
    const taskClass = String(row.task_status || 'pending').toLowerCase();
    const classification = row.profile_classification || 'User';
    const age = row.age || calculateAgeFromDob(row.date_of_birth);
    const profession = row.profession || row.occupation || '-';
    const email = row.email || 'No email';
    const avatarSrc = accountAvatarSvg(row.name || row.email || 'Profile');
    const selectedBulk = bulkAssignMode && bulkAssignRowIds.has(String(row.id));
    return `<tr class="${selectedBulk ? 'bulk-selected' : ''}" onclick="openProfile('${attr(row.id)}')" ondblclick="openProfile('${attr(row.id)}')" style="cursor:pointer">
  <td><div class="profile-cell">${bulkAssignMode && currentUser?.role === 'admin' ? `<label class="row-select-cell"><input type="checkbox" onclick="event.stopPropagation()" ${selectedBulk ? 'checked' : ''} onchange="toggleBulkRowSelection('${attr(row.id)}', this.checked)"></label>` : ''}<img class="profile-row-avatar" src="${attr(avatarSrc)}" alt="${attr(row.name || 'Profile')}"><div class="profile-row-meta"><b>${esc(row.name || '-')}</b><div class="muted">${esc(classification)} | ${esc(profession)} | Age ${esc(age || '-')}</div></div></div></td>
  <td><div>${esc(row.mobile || '-')}</div><div class="muted">${esc(email)} | ${esc(row.location || row.present_address || '-')}</div></td>
  <td>${esc(row.problem || '-')}</td>
  <td>${esc(row.stage || '-')}</td>
  <td><b>${esc(row.assigned_to_name || 'Unassigned')}</b><div class="muted">${esc(row.assigned_to_email || '')}</div></td>
  <td><span class="pill ${attr(taskClass)}">${esc(row.task_status || 'Unassigned')}</span></td>
</tr>`;
  }).join('');
}

function calculateAgeFromDob(dob) {
  const value = String(dob || '').trim();
  if (!value) return '';
  const matchIso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const matchAlt = value.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  let birth = null;
  if (matchIso) {
    birth = new Date(Number(matchIso[1]), Number(matchIso[2]) - 1, Number(matchIso[3]));
  } else if (matchAlt) {
    birth = new Date(Number(matchAlt[3]), Number(matchAlt[2]) - 1, Number(matchAlt[1]));
  } else {
    birth = new Date(value);
  }
  if (!birth || Number.isNaN(birth.getTime())) return '';
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDelta = today.getMonth() - birth.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? String(age) : '';
}

function renderPagination() {
  document.getElementById('paginationText').textContent = `Page ${pagination.page} of ${pagination.totalPages} - ${pagination.total} matching records`;
  document.getElementById('prevPage').disabled = !pagination.hasPrev;
  document.getElementById('nextPage').disabled = !pagination.hasNext;
  const pageNumbers = document.getElementById('pageNumbers');
  if (!pageNumbers) return;
  const totalPages = Number(pagination.totalPages || 1);
  const current = Number(pagination.page || 1);
  const pages = [];
  const pushPage = (page) => {
    if (!pages.includes(page) && page >= 1 && page <= totalPages) pages.push(page);
  };
  if (totalPages <= 9) {
    for (let page = 1; page <= totalPages; page += 1) pushPage(page);
  } else {
    pushPage(1);
    pushPage(2);
    const start = Math.max(3, current - 1);
    const end = Math.min(totalPages - 2, current + 1);
    if (start > 3) pages.push('...');
    for (let page = start; page <= end; page += 1) pushPage(page);
    if (end < totalPages - 2) pages.push('...');
    pushPage(totalPages - 1);
    pushPage(totalPages);
  }
  pageNumbers.innerHTML = pages.map(page => page === '...'
    ? '<span class="page-number-btn ellipsis">...</span>'
    : `<button class="page-number-btn ${page === current ? 'active' : ''}" onclick="goToPage(${page})">${page}</button>`).join('');
}

function goToPage(page) {
  const next = Number(page);
  if (!Number.isFinite(next) || next < 1 || next > pagination.totalPages || next === pagination.page) return;
  pagination.page = next;
  loadRecords(false);
}

function changePage(delta) {
  const next = pagination.page + delta;
  if (next < 1 || next > pagination.totalPages) return;
  pagination.page = next;
  loadRecords(false);
}

function toggleFilters(force) {
  const drawer = document.getElementById('filterDrawer');
  const open = force === undefined ? !drawer.classList.contains('open') : Boolean(force);
  drawer.classList.toggle('open', open);
}
function applyFilters() { toggleFilters(false); loadRecords(true) }
function refreshRecords() {
  clearFilters();
}
function clearFilters() {
  document.getElementById('recordSearch').value = '';
  for (const id of ['locationFilter', 'minAgeFilter', 'maxAgeFilter']) document.getElementById(id).value = '';
  for (const id of ['stageFilter', 'statusFilter', 'assignedFilter']) { const el = document.getElementById(id); if (el) el.value = '' }
  loadRecords(true);
}

async function assignSelectedRows() {
  if (currentUser?.role !== 'admin') return;
  const row_ids = [...bulkAssignRowIds];
  if (!row_ids.length) return showToast('Select at least one profile');
  if (!bulkAssignedExecutiveId) return showToast('Choose an executive');
  try {
    const data = await apiFetch('/api/tasks/assign', {
      method: 'POST',
      body: JSON.stringify({
        row_ids,
        assigned_to: bulkAssignedExecutiveId,
        admin_instruction: '',
      })
    });
    showToast(data.message || 'Profiles assigned');
    clearBulkAssignMode();
    await Promise.all([loadRecords(false), loadOverview()]);
  } catch (error) {
    showToast(error.message || 'Bulk assign failed');
  }
}

async function openProfile(id) {
  const localRow = rows.find(row => String(row.id) === String(id)) || executiveAssignedRows.find(row => String(row.id) === String(id));
  if (!localRow) return;
  selected = localRow.raw_data ? clone(localRow) : clone(await apiFetch('/api/dataset-rows/' + encodeURIComponent(id)).then(data => data.row));
  selected = clone(selected);
  selectedSnapshot = clone(selected);
  profileEditMode = false;
  profileHistoryOpen = false;
  document.getElementById('profileModal').style.display = 'flex';
  document.getElementById('profileModal').classList.add('profile-readonly');
  const displayName = selected.full_name || selected.name || 'Profile';
  document.getElementById('profileModalAvatar').src = accountAvatarSvg(displayName || selected.email || 'Profile');
  const profileName = displayName || 'Profile';
  const profileRole = selected.profile_classification || 'User';
  const profileRowNumber = selected.row_number || '-';
  const profileMobile = selected.mobile || '-';
  if (document.getElementById('profileName')) document.getElementById('profileName').textContent = profileName;
  if (document.getElementById('profileType')) document.getElementById('profileType').textContent = profileRole;
  if (document.getElementById('profileId')) document.getElementById('profileId').textContent = String(selected.id || '-');
  if (document.getElementById('profileRow')) document.getElementById('profileRow').textContent = String(profileRowNumber);
  if (document.getElementById('mobileNumber')) document.getElementById('mobileNumber').textContent = profileMobile;
  document.getElementById('modalTitle').textContent = profileName;
  document.getElementById('pName').textContent = profileName || '-';
  document.getElementById('pId').textContent = `ID: ${selected.id} | Row: ${selected.row_number}`;
  document.getElementById('pImg').src = accountAvatarSvg(displayName || selected.email || 'Profile');
  document.getElementById('profileClass').textContent = selected.profile_classification || 'User';
  document.getElementById('callMobile').href = selected.mobile ? 'tel:' + selected.mobile : '#';
  document.getElementById('editStage').value = CALL_STAGES.includes(selected.stage) ? selected.stage : 'Interested';
  document.getElementById('editProblem').value = selected.problem || '';
  document.getElementById('editRemarks').value = selected.remarks || '';
  document.getElementById('callNotes').value = '';
  document.getElementById('assignInstruction').value = selected.admin_instruction || '';
  renderProfileExecutiveOptions();
  if (selected.assigned_to) document.getElementById('profileExecutive').value = selected.assigned_to;
  updateProfileAssignButtonState();
  fillPersonalForm();
  renderCustomFields();
  renderFamilyInfo();
  renderAttendance();
  setProfileEditMode(false);
  toggleProfileHistory(false);
  switchProfileTab('personal');
  loadHistory(selected.id);
  if (currentUser?.role === 'executor') markProfileRead(selected.id);
}

async function markProfileRead(id) {
  try {
    const data = await apiFetch('/api/dataset-rows/' + encodeURIComponent(id) + '/read', { method: 'POST' });
    if (data.updated) await loadExecutiveOverview();
  } catch { }
}

function fillPersonalForm() {
  const primaryMobile = String(selected?.mobile || selected?.phone_numbers?.[0] || selected?.raw_data?.Mobile || selected?.raw_data?.mobile || selected?.personal_info?.mobile || '').trim();
  const phoneNumbers = normalizePhoneNumbers(
    selected?.phone_numbers ??
    selected?.personal_info?.phone_numbers ??
    selected?.additional_phone_numbers ??
    selected?.raw_data?.phone_numbers ??
    selected?.raw_data?.personal_info?.phone_numbers ??
    []
  ).filter(phone => phone && phone !== primaryMobile);
  const values = {
    full_name: selected.full_name || selected.name || '',
    email: selected.email || '',
    mobile: primaryMobile || selected.mobile || '',
    father_name: selected.father_name || '',
    mother_name: selected.mother_name || '',
    date_of_birth: selected.date_of_birth || '',
    marital_status: selected.marital_status || '',
    blood_group: selected.blood_group || '',
    occupation: selected.occupation || selected.profession || '',
    present_address: selected.present_address || selected.location || '',
    permanent_address: selected.permanent_address || ''
  };
  for (const input of document.querySelectorAll('[data-personal]')) {
    input.value = values[input.dataset.personal] || '';
  }
  document.getElementById('profileClassification').value = selected.profile_classification || 'User';
  renderPhoneNumberRows('profilePhoneNumbers', phoneNumbers, 'profile', isProfileEditable() && canEditPersonal());
  syncProfileReadonlyData(values, phoneNumbers);
}

function setProfileReadonlyText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value && String(value).trim() ? String(value).trim() : '-';
}

function syncProfileReadonlyData(values = {}, phoneNumbers = []) {
  setProfileReadonlyText('fullNameValue', values.full_name || selected?.name || '-');
  setProfileReadonlyText('emailValue', values.email || '-');
  setProfileReadonlyText('mobileValue', values.mobile || '-');
  setProfileReadonlyText('rowValue', selected?.row_number || '-');
  setProfileReadonlyText('additionalPhoneValue', phoneNumbers.length ? phoneNumbers.join(', ') : 'No additional phone numbers.');
  setProfileReadonlyText('dobValue', values.date_of_birth || '-');
  setProfileReadonlyText('maritalValue', values.marital_status || '-');
  setProfileReadonlyText('bloodValue', values.blood_group || '-');
  setProfileReadonlyText('occupationValue', values.occupation || '-');
  setProfileReadonlyText('systemValue', selected?.profile_classification || 'User');
  setProfileReadonlyText('presentAddressValue', values.present_address || '-');
  setProfileReadonlyText('permanentAddressValue', values.permanent_address || '-');
}

function addPhoneNumber() {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const next = selectedPhoneNumbers();
  next.push('');
  selected.phone_numbers = next;
  renderPhoneNumberRows('profilePhoneNumbers', next, 'profile', true);
  applyProfilePermissions();
}

function removePhoneNumber(index) {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const next = selectedPhoneNumbers();
  next.splice(index, 1);
  selected.phone_numbers = next;
  renderPhoneNumberRows('profilePhoneNumbers', next, 'profile', true);
  applyProfilePermissions();
}

function setProfileEditMode(enabled) {
  profileEditMode = Boolean(enabled);
  document.getElementById('profileEditBtn').style.display = profileEditMode ? 'none' : 'inline-grid';
  document.getElementById('profileCancelBtn').style.display = profileEditMode ? 'inline-grid' : 'none';
  document.getElementById('profileSaveBtn').style.display = profileEditMode ? 'inline-grid' : 'none';
  document.getElementById('profileModal').classList.toggle('profile-readonly', !profileEditMode);
  applyProfilePermissions();
  fillPersonalForm();
  updateProfileAssignButtonState();
  renderCustomFields();
  renderFamilyInfo();
  renderAttendance();
}

function cancelProfileEdit() {
  if (!selectedSnapshot) return setProfileEditMode(false);
  selected = clone(selectedSnapshot);
  fillPersonalForm();
  renderCustomFields();
  renderFamilyInfo();
  renderAttendance();
  setProfileEditMode(false);
}

function applyProfilePermissions() {
  const personalLocked = !profileEditMode || !canEditPersonal();
  const profileLocked = !profileEditMode;
  for (const el of document.querySelectorAll('#tabPersonal input,#tabPersonal select,#tabPersonal textarea,#tabFamily input,#tabFamily select,#tabFamily textarea,#tabAttendance input,#tabAttendance select,#tabAttendance textarea,#tabAttendance button')) {
    el.disabled = personalLocked;
  }
  for (const el of document.querySelectorAll('#editStage,#editProblem,#editRemarks,#callNotes')) {
    el.disabled = profileLocked;
  }
  for (const el of document.querySelectorAll('#profileExecutive,#assignInstruction')) {
    el.disabled = currentUser?.role !== 'admin';
  }
  const assignButton = document.getElementById('profileAssignBtn');
  if (assignButton) assignButton.disabled = currentUser?.role !== 'admin' || !String(document.getElementById('profileExecutive')?.value || '').trim();
  document.getElementById('profileClassification').disabled = profileLocked || currentUser?.role !== 'admin';
  const uploadBtn = document.getElementById('uploadBtn');
  if (uploadBtn) uploadBtn.disabled = personalLocked;
  const customBtn = document.getElementById('addCustomFieldBtn');
  if (customBtn) customBtn.disabled = personalLocked;
  const familyBtn = document.getElementById('addFamilyBtn');
  if (familyBtn) familyBtn.disabled = personalLocked;
  const attendanceBtn = document.getElementById('addAttendanceBtn');
  if (attendanceBtn) attendanceBtn.disabled = personalLocked;
  const profileEditButton = document.getElementById('profileEditBtn');
  if (profileEditButton) profileEditButton.disabled = false;
  const profileHistoryButton = document.getElementById('profileHistoryBtn');
  if (profileHistoryButton) profileHistoryButton.disabled = false;
}

function switchProfileTab(tab) {
  for (const el of document.querySelectorAll('.tab-panel')) el.classList.remove('active');
  for (const el of document.querySelectorAll('.tab-btn')) el.classList.remove('active');
  document.getElementById('tab' + tab[0].toUpperCase() + tab.slice(1)).classList.add('active');
  document.getElementById('tabBtn' + tab[0].toUpperCase() + tab.slice(1)).classList.add('active');
}

function renderCustomFields() {
  const fields = selected.custom_fields && typeof selected.custom_fields === 'object' ? selected.custom_fields : {};
  const entries = Object.entries(fields);
  document.getElementById('customFields').innerHTML = entries.map(([key, value], index) => `<div class="custom-row" data-custom-index="${index}">
<input data-custom-key value="${attr(key)}" placeholder="Field name">
<input data-custom-value value="${attr(value)}" placeholder="Field value">
<button class="danger" onclick="removeCustomField(${index})">Remove</button>
  </div>`).join('') || '<div class="muted">No custom fields yet.</div>';
  const readonlyList = document.getElementById('customList');
  if (readonlyList) {
    readonlyList.innerHTML = entries.length
      ? entries.map(([key, value]) => `<div class="data-row"><div class="label">${esc(key)}</div><div class="value">${esc(value || '-')}</div></div>`).join('')
      : '<div class="data-row"><div class="label">Custom Note</div><div class="value">No custom fields yet.</div></div>';
  }
  applyProfilePermissions();
}

function addCustomField() {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  selected.custom_fields = selected.custom_fields && typeof selected.custom_fields === 'object' ? selected.custom_fields : {};
  let i = Object.keys(selected.custom_fields).length + 1;
  let key = `Custom Field ${i}`;
  while (Object.prototype.hasOwnProperty.call(selected.custom_fields, key)) key = `Custom Field ${++i}`;
  selected.custom_fields[key] = '';
  renderCustomFields();
}

function removeCustomField(index) {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const entries = Object.entries(selected.custom_fields || {});
  entries.splice(index, 1);
  selected.custom_fields = Object.fromEntries(entries);
  renderCustomFields();
}

function normalizeFamilyExtraFields(member = {}) {
  const extras = member.extra_fields && typeof member.extra_fields === 'object' && !Array.isArray(member.extra_fields) ? clone(member.extra_fields) : {};
  for (const [key, value] of Object.entries(member)) {
    if (FAMILY_MEMBER_KNOWN_KEYS.has(key)) continue;
    if (value !== undefined && value !== null && String(value).trim() !== '') extras[key] = value;
  }
  return extras;
}

function normalizeFamilyMember(member = {}, fallbackRelationship = '') {
  const rawRelationship = member.relationship || member.role || fallbackRelationship || '';
  const relationMap = { father: 'Father', mother: 'Mother', wife: 'Wife', child: 'Child', brother: 'Brother', sister: 'Sister', other: 'Other' };
  const relationship = relationMap[String(rawRelationship).toLowerCase()] || rawRelationship;
  return {
    relationship,
    full_name: member.full_name || member.name || member['Full Name'] || '',
    mobile: member.mobile || member.phone || member.Mobile || member.Phone || '',
    extra_fields: normalizeFamilyExtraFields(member)
  };
}

function buildFamilyMemberTitle(member, index) {
  return member.relationship || `Family Member ${index + 1}`;
}

function renderFamilyExtraFields(member, index, editable, prefix) {
  const extras = member.extra_fields && typeof member.extra_fields === 'object' ? member.extra_fields : {};
  const rows = Object.entries(extras);
  if (!rows.length && !editable) return '';
  const extraRows = rows.map(([key, value], extraIndex) => `
    <div class="family-extra-row" data-${prefix}-family-extra-index="${index}">
      <div class="field">
        <div class="label">Field Name</div>
        <input data-${prefix}-family-extra-key="${index}-${extraIndex}" value="${attr(key)}" placeholder="Field name">
      </div>
      <div class="field">
        <div class="label">Field Value</div>
        <input data-${prefix}-family-extra-value="${index}-${extraIndex}" value="${attr(value)}" placeholder="Field value">
      </div>
      <button class="danger" onclick="${prefix === 'account' ? 'removeAccountFamilyExtraField' : 'removeFamilyExtraField'}(${index}, ${extraIndex})">Remove</button>
    </div>
  `).join('');
  if (!editable) {
    return rows.length ? `<div class="family-extra-list">${rows.map(([key, value]) => `
      <div class="family-extra-row">
        <div class="field"><div class="label">${esc(key)}</div><div class="value">${esc(value || '-')}</div></div>
        <div></div>
      </div>
    `).join('')}</div>` : '';
  }
  return `<div class="family-extra-list">${extraRows}</div>`;
}

function renderFamilyMemberCard(member, index, editable, prefix) {
  const title = buildFamilyMemberTitle(member, index);
  const coreFields = FAMILY_CORE_FIELDS.map(([field, fieldLabel]) => {
    const value = member[field] || '';
    if (!editable) {
      return `<div class="field"><div class="label">${esc(fieldLabel)}</div><div class="value">${esc(value || '-')}</div></div>`;
    }
    return `<div class="field"><div class="label">${esc(fieldLabel)}</div><input data-${prefix}-family-index="${index}" data-${prefix}-family-field="${attr(field)}" value="${attr(value)}"></div>`;
  }).join('');
  const extras = renderFamilyExtraFields(member, index, editable, prefix);
  const actions = editable ? `
    <div class="family-extra-actions">
      <button class="family-member-add" onclick="${prefix === 'account' ? 'addAccountFamilyExtraField' : 'addFamilyExtraField'}(${index})">+ Add</button>
      <button class="danger" onclick="${prefix === 'account' ? 'removeAccountFamilyMember' : 'removeFamilyMember'}(${index})">Remove Member</button>
    </div>
  ` : '';
  return `<div class="family-card">
    <div class="family-head"><b>${esc(title)}</b>${actions}</div>
    <div class="form-grid">${coreFields}</div>
    ${extras}
  </div>`;
}

function familyMembersFromSelected() {
  const info = selected?.family_info;
  if (Array.isArray(info)) return info.map(member => normalizeFamilyMember(member));
  if (info && Array.isArray(info.members)) return info.members.map(member => normalizeFamilyMember(member));
  if (info && typeof info === 'object' && Object.keys(info).length) {
    return Object.entries(info).map(([role, member]) => normalizeFamilyMember(member, role));
  }
  return FAMILY_ROLES.map(([role, label]) => normalizeFamilyMember({}, label));
}

function setFamilyMembers(members) {
  selected.family_info = { members: members.map(member => normalizeFamilyMember(member)) };
}

function renderFamilyInfo() {
  const members = familyMembersFromSelected();
  setFamilyMembers(members);
  const editable = isProfileEditable() && canEditPersonal();
  document.getElementById('familyGrid').innerHTML = members.map((member, index) => renderFamilyMemberCard(member, index, editable, 'profile')).join('') || '<div class="muted">No family members added.</div>';
  const father = members.find(member => String(member.relationship || '').toLowerCase() === 'father') || {};
  const mother = members.find(member => String(member.relationship || '').toLowerCase() === 'mother') || {};
  const guardian = members.find(member => String(member.mobile || '').trim()) || father || mother || {};
  const familyAddress = selected?.present_address || selected?.permanent_address || selected?.location || '';
  setProfileReadonlyText('familyFatherValue', father.full_name || selected?.father_name || '-');
  setProfileReadonlyText('familyMotherValue', mother.full_name || selected?.mother_name || '-');
  setProfileReadonlyText('familyGuardianPhoneValue', guardian.mobile || selected?.mobile || '-');
  setProfileReadonlyText('familyAddressValue', familyAddress || '-');
  applyProfilePermissions();
}

function addFamilyMember() {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const members = familyMembersFromSelected();
  members.push(normalizeFamilyMember({ relationship: '' }));
  setFamilyMembers(members);
  renderFamilyInfo();
}

function removeFamilyMember(index) {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const members = familyMembersFromSelected();
  members.splice(index, 1);
  setFamilyMembers(members);
  renderFamilyInfo();
}

function addFamilyExtraField(index) {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const members = familyMembersFromSelected();
  const member = members[index];
  if (!member) return;
  member.extra_fields = member.extra_fields && typeof member.extra_fields === 'object' ? member.extra_fields : {};
  let i = Object.keys(member.extra_fields).length + 1;
  let key = `Field ${i}`;
  while (Object.prototype.hasOwnProperty.call(member.extra_fields, key)) key = `Field ${++i}`;
  member.extra_fields[key] = '';
  setFamilyMembers(members);
  renderFamilyInfo();
}

function removeFamilyExtraField(memberIndex, extraIndex) {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const members = familyMembersFromSelected();
  const member = members[memberIndex];
  if (!member || !member.extra_fields || typeof member.extra_fields !== 'object') return;
  const entries = Object.entries(member.extra_fields);
  entries.splice(extraIndex, 1);
  member.extra_fields = Object.fromEntries(entries);
  setFamilyMembers(members);
  renderFamilyInfo();
}

function collectFamilyInfo() {
  const members = [];
  for (const card of document.querySelectorAll('#familyGrid .family-card')) {
    const member = {};
    for (const input of card.querySelectorAll('[data-profile-family-field]')) {
      member[input.dataset.profileFamilyField] = input.value.trim();
    }
    const extraFields = {};
    const keyInputs = card.querySelectorAll('[data-profile-family-extra-key]');
    const valueInputs = card.querySelectorAll('[data-profile-family-extra-value]');
    keyInputs.forEach((input, extraIndex) => {
      const key = input.value.trim();
      const valueInput = valueInputs[extraIndex];
      const value = valueInput ? valueInput.value.trim() : '';
      if (key) extraFields[key] = value;
    });
    member.extra_fields = extraFields;
    members.push(normalizeFamilyMember(member));
  }
  return { members };
}

function normalizeAttendanceItem(item) {
  if (typeof item === 'string') return { event_name: item, timestamp: '' };
  return { event_name: item?.event_name || item?.event || item?.name || '', timestamp: item?.timestamp || item?.time || item?.date || '' };
}
function renderAttendance() {
  selected.attendance_history = Array.isArray(selected.attendance_history) ? selected.attendance_history.map(normalizeAttendanceItem) : [];
  const counts = {};
  for (const item of selected.attendance_history) {
    const name = item.event_name || 'Unnamed Event';
    counts[name] = (counts[name] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([event, count]) => `${event}: ${count} time${count === 1 ? '' : 's'}`).join(' | ');
  document.getElementById('attendanceSummary').textContent = summary || 'No attendance recorded';
  document.getElementById('attendanceList').innerHTML = selected.attendance_history.map((item, index) => `<div class="attendance-row">
<b>${esc(item.event_name || 'Unnamed Event')}</b>
<span class="muted">${esc(formatDateTime(item.timestamp))}</span>
<button class="danger" onclick="removeAttendance(${index})">Remove</button>
  </div>`).join('') || '<div class="muted">No attendance history yet.</div>';
  const latest = selected.attendance_history[selected.attendance_history.length - 1] || null;
  const firstProgram = Object.keys(counts)[0] || 'Not added';
  setProfileReadonlyText('programNameValue', firstProgram);
  setProfileReadonlyText('attendancePercentValue', selected.attendance_history.length ? `${selected.attendance_history.length} records` : '0%');
  setProfileReadonlyText('lastJoinValue', latest?.timestamp ? formatDateTime(latest.timestamp) : '-');
  setProfileReadonlyText('programStatusValue', selected?.stage || 'Pending');
  applyProfilePermissions();
}

function addAttendance() {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  const event = document.getElementById('attendanceEvent').value.trim();
  const time = document.getElementById('attendanceTime').value;
  if (!event) return showToast('Event name required');
  selected.attendance_history = Array.isArray(selected.attendance_history) ? selected.attendance_history : [];
  selected.attendance_history.push({ event_name: event, timestamp: time ? new Date(time).toISOString() : new Date().toISOString() });
  document.getElementById('attendanceEvent').value = '';
  document.getElementById('attendanceTime').value = '';
  renderAttendance();
}

async function removeAttendance(index) {
  if (!selected || !isProfileEditable() || !canEditPersonal()) return;
  if (!window.confirm('Remove this attendance log from the database?')) return;
  try {
    const data = await apiFetch('/api/dataset-rows/' + encodeURIComponent(selected.id) + '/attendance/' + encodeURIComponent(index), { method: 'DELETE' });
    selected = data.row || selected;
    selectedSnapshot = clone(selected);
    const rowIndex = rows.findIndex(row => String(row.id) === String(selected.id));
    if (rowIndex >= 0) rows[rowIndex] = clone(selected);
    fillPersonalForm();
    renderCustomFields();
    renderFamilyInfo();
    renderAttendance();
    await loadHistory(selected.id);
    showToast('Attendance removed');
  } catch (error) { showToast(error.message || 'Attendance remove failed') }
}

function collectCustomFields() {
  const fields = {};
  for (const row of document.querySelectorAll('[data-custom-index]')) {
    const key = row.querySelector('[data-custom-key]').value.trim();
    const value = row.querySelector('[data-custom-value]').value.trim();
    if (key) fields[key] = value;
  }
  return fields;
}

function collectProfilePayload() {
  const payload = {
    Stage: document.getElementById('editStage').value,
    Problem: document.getElementById('editProblem').value,
    Remarks: document.getElementById('editRemarks').value,
    call_notes: document.getElementById('callNotes').value
  };
  if (canEditPersonal()) {
    const personal = {};
    for (const input of document.querySelectorAll('[data-personal]')) {
      personal[input.dataset.personal] = input.value.trim();
      payload[PERSONAL_TO_API[input.dataset.personal]] = input.value.trim();
    }
    const phoneNumbers = collectPhoneNumbers('profile');
    personal.mobile = phoneNumbers[0] || personal.mobile || '';
    personal.phone_numbers = phoneNumbers;
    payload.mobile = phoneNumbers[0] || '';
    payload.phone_numbers = phoneNumbers;
    payload.personal_info = personal;
    payload.family_info = collectFamilyInfo();
    payload.attendance_history = selected.attendance_history || [];
    payload.custom_fields = collectCustomFields();
    if (currentUser?.role === 'admin') payload.profile_classification = document.getElementById('profileClassification').value;
  }
  return payload;
}

function closeProfile() {
  document.getElementById('profileModal').style.display = 'none';
  document.getElementById('profileModal').classList.remove('profile-readonly');
  document.getElementById('profileModalAvatar').src = accountAvatarSvg('Profile');
  if (document.getElementById('profileName')) document.getElementById('profileName').textContent = 'Profile';
  if (document.getElementById('profileType')) document.getElementById('profileType').textContent = 'User';
  if (document.getElementById('profileId')) document.getElementById('profileId').textContent = '-';
  if (document.getElementById('profileRow')) document.getElementById('profileRow').textContent = '-';
  if (document.getElementById('mobileNumber')) document.getElementById('mobileNumber').textContent = '-';
  if (document.getElementById('modalTitle')) document.getElementById('modalTitle').textContent = 'Profile';
  if (document.getElementById('pName')) document.getElementById('pName').textContent = '-';
  if (document.getElementById('pId')) document.getElementById('pId').textContent = '-';
  if (document.getElementById('profileClass')) document.getElementById('profileClass').textContent = 'User';
  ['fullNameValue', 'emailValue', 'mobileValue', 'rowValue', 'additionalPhoneValue', 'dobValue', 'maritalValue', 'bloodValue', 'occupationValue', 'systemValue', 'presentAddressValue', 'permanentAddressValue', 'familyFatherValue', 'familyMotherValue', 'familyGuardianPhoneValue', 'familyAddressValue', 'programNameValue', 'attendancePercentValue', 'lastJoinValue', 'programStatusValue'].forEach(id => setProfileReadonlyText(id, '-'));
  const customList = document.getElementById('customList');
  if (customList) customList.innerHTML = '<div class="data-row"><div class="label">Custom Note</div><div class="value">No custom fields yet.</div></div>';
  selected = null;
  selectedSnapshot = null;
  profileEditMode = false;
  profileHistoryOpen = false;
}

async function assignSelected() {
  if (!selected) return;
  const executiveSelect = document.getElementById('profileExecutive');
  const instructionInput = document.getElementById('assignInstruction');
  const assignedTo = String(executiveSelect?.value || '').trim();
  if (!assignedTo) return showToast('Choose an executive');
  try {
    const data = await apiFetch('/api/tasks/assign', { method: 'POST', body: JSON.stringify({ row_id: selected.id, assigned_to: assignedTo, admin_instruction: instructionInput?.value || '' }) });
    showToast(data.message || 'Assigned');
    selected.assigned_to = assignedTo;
    selected.admin_instruction = '';
    selectedSnapshot = clone(selected);
    if (executiveSelect) executiveSelect.value = '';
    if (instructionInput) instructionInput.value = '';
    updateProfileAssignButtonState();
    await Promise.all([loadRecords(false), loadOverview()]);
  } catch (error) { showToast(error.message || 'Assign failed') }
}

async function saveProfile() {
  if (!selected) return;
  if (!profileEditMode) return;
  try {
    const data = await apiFetch('/api/dataset-rows/' + encodeURIComponent(selected.id), { method: 'PUT', body: JSON.stringify(collectProfilePayload()) });
    selected = data.row || selected;
    selectedSnapshot = clone(selected);
    const rowIndex = rows.findIndex(row => String(row.id) === String(selected.id));
    if (rowIndex >= 0) rows[rowIndex] = clone(selected);
    fillPersonalForm();
    renderCustomFields();
    renderFamilyInfo();
    renderAttendance();
    setProfileEditMode(false);
    showToast(data.message || 'Profile updated');
    await Promise.all([loadRecords(false), loadExecutives(), loadPermissions()]);
    renderFilterOptions();
    let linkedAccount = null;
    if (currentUser?.role === 'admin') {
      await Promise.all([loadOverview(), loadUsers()]);
      linkedAccount = accountRows.find(user => String(user.profile_row_id || '') === String(selected.id) || String(user.id || '') === String(selected.app_user_id || ''));
      if (linkedAccount && accountProfile && String(accountProfile.id) === String(linkedAccount.id)) {
        accountProfile = clone(linkedAccount);
        accountProfileSnapshot = clone(linkedAccount);
        document.getElementById('accountProfileImage').src = accountImageSrc(linkedAccount);
        document.getElementById('accountProfileName').textContent = linkedAccount.name || '-';
        document.getElementById('accountProfileId').textContent = `ID: ${linkedAccount.id}${linkedAccount.profile_row_id ? ' | Row: ' + linkedAccount.profile_row_id : ''}`;
        document.getElementById('accountProfileClass').textContent = linkedAccount.profile_classification || linkedAccount.metadata?.profile_classification || 'User';
        renderAccountExecutiveOptions();
        if (linkedAccount.assigned_to) document.getElementById('accountProfileExecutive').value = linkedAccount.assigned_to;
        if (document.getElementById('accountAssignInstruction')) document.getElementById('accountAssignInstruction').value = linkedAccount.admin_instruction || '';
        fillAccountPersonalForm();
        renderAccountCustomFields();
        renderAccountFamilyInfo();
        renderAccountAttendance();
        renderAccountHistory();
        updateAccountProfileAssignButtonState();
        setAccountProfileEditMode(accountProfileEditMode);
      }
    } else {
      await loadExecutiveOverview();
    }
    await loadHistory(selected.id);
  } catch (error) { showToast(error.message || 'Update failed') }
}

async function uploadImage() {
  showToast('Image uploads are disabled');
}

async function loadHistory(rowId) {
  try {
    const data = await apiFetch('/api/dataset-rows/' + encodeURIComponent(rowId) + '/history');
    renderHistory(data.history || []);
  } catch (error) {
    const table = document.getElementById('profileFollowTable');
    if (table) table.innerHTML = `<tr><td colspan="5"><div class="empty">${esc(error.message || 'History failed')}</div></td></tr>`;
    const total = document.getElementById('profileHistoryTotal');
    if (total) total.textContent = 'Total 0 records';
  }
}

function formatChangeValue(value) {
  if (value === undefined || value === null || value === '') return '-';
  if (typeof value === 'object') return esc(JSON.stringify(value));
  return esc(value);
}

function historyEntryMarkup(item, removable = false) {
  const changes = Object.entries(item.changes || {}).map(([field, change]) => `${esc(field)}: ${formatChangeValue(change.from)} -> ${formatChangeValue(change.to)}`).join('<br>') || 'No field delta';
  const remove = removable && currentUser?.role === 'admin' && item.id ? `<button class="danger" onclick="removeHistory('${attr(item.id)}')">Remove</button>` : '';
  return `<div class="history-item"><div class="history-top"><b>${esc(String(item.event_type || 'event').replace('_', ' '))}</b><span class="muted">${esc(formatDateTime(item.created_at))}</span></div><div class="history-changes">${changes}</div><div class="muted">${esc(item.actor_name || '')} (${esc(roleName(item.actor_role))})${item.notes ? ' - ' + esc(item.notes) : ''}</div>${remove}</div>`;
}

function splitHistoryEntries(history = []) {
  const callHistory = [];
  const profileHistory = [];
  for (const item of Array.isArray(history) ? history : []) {
    if (!item) continue;
    const eventType = String(item.event_type || '').toLowerCase();
    if (eventType === 'call_update') callHistory.push(item);
    else if (eventType !== 'history_clear') profileHistory.push(item);
  }
  return { callHistory, profileHistory };
}

function renderHistorySections(history, callListId, changeListId, removable = false) {
  const callList = document.getElementById(callListId);
  const changeList = document.getElementById(changeListId);
  if (!callList || !changeList) return;
  const { callHistory, profileHistory } = splitHistoryEntries(history);
  callList.innerHTML = callHistory.map(item => historyEntryMarkup(item, removable)).join('') || '<div class="empty">No call history yet</div>';
  changeList.innerHTML = profileHistory.map(item => historyEntryMarkup(item, removable)).join('') || '<div class="empty">No profile change history yet</div>';
}

function renderHistory(history) {
  const table = document.getElementById('profileFollowTable');
  const total = document.getElementById('profileHistoryTotal');
  if (!table) return;
  const entries = Array.isArray(history) ? history : [];
  if (!entries.length) {
    table.innerHTML = '<tr><td colspan="5"><div class="empty">No follow up history yet</div></td></tr>';
    if (total) total.textContent = 'Total 0 records';
    return;
  }
  table.innerHTML = entries.map((item, index) => {
    const changes = Object.entries(item.changes || {}).map(([field, change]) => `${field}: ${formatChangeValue(change.from)} -> ${formatChangeValue(change.to)}`).join('; ');
    const comment = changes || item.notes || 'No details';
    const feedback = item.actor_name ? `${item.actor_name}${item.actor_role ? ` (${roleName(item.actor_role)})` : ''}` : (item.notes || '-');
    const remove = removableHistoryAction(item);
    return `<tr>
      <td>${index + 1}</td>
      <td>${esc(formatDateTime(item.created_at) || '-')}</td>
      <td>${esc(comment)}</td>
      <td class="feedback-cell">${esc(feedback)}</td>
      <td>${remove}</td>
    </tr>`;
  }).join('');
  if (total) total.textContent = `Total ${entries.length} records`;
}

function removableHistoryAction(item) {
  return currentUser?.role === 'admin' && item.id
    ? `<button class="edit-btn" title="Remove" aria-label="Remove" onclick="removeHistory('${attr(item.id)}')">×</button>`
    : '-';
}

async function removeHistory(eventId) {
  if (!selected) return;
  try {
    await apiFetch('/api/dataset-rows/' + encodeURIComponent(selected.id) + '/history/' + encodeURIComponent(eventId), { method: 'DELETE' });
    showToast('History entry removed');
    await loadHistory(selected.id);
  } catch (error) { showToast(error.message || 'Remove failed') }
}

async function clearHistory() {
  if (!selected) return;
  try {
    await apiFetch('/api/dataset-rows/' + encodeURIComponent(selected.id) + '/history', { method: 'DELETE' });
    showToast('History cleared');
    await loadHistory(selected.id);
    await loadOverview();
  } catch (error) { showToast(error.message || 'Clear failed') }
}

function toggleProfileHistory(force) {
  const button = document.getElementById('profileHistoryBtn');
  profileHistoryOpen = typeof force === 'boolean' ? force : true;
  if (button) button.textContent = 'History';
  if (profileHistoryOpen) switchProfileTab('follow');
}

async function loadUsers() {
  if (currentUser?.role !== 'admin') return;
  try {
    const data = await apiFetch('/api/users');
    accountRows = data.users || [];
    selectedAccountIds = new Set([...selectedAccountIds].filter(id => accountRows.some(user => String(user.id) === String(id))));
    await loadBulkAssignExecutives();
    renderUsers();
  } catch (error) {
    document.getElementById('usersBody').innerHTML = `<tr><td colspan="3"><div class="empty">${esc(error.message)}</div></td></tr>`;
  }
}

async function loadExecutiveRequests() {
  if (currentUser?.role !== 'admin') return;
  const body = document.getElementById('executiveRequestsBody');
  if (!body) return;
  try {
    const data = await apiFetch('/api/admin/executive-account-requests');
    executiveRequests = data.requests || [];
    renderExecutiveRequests();
  } catch (error) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty">${esc(error.message)}</div></td></tr>`;
  }
}

function renderExecutiveRequests() {
  const body = document.getElementById('executiveRequestsBody');
  if (!body) return;
  if (!executiveRequests.length) {
    body.innerHTML = '<tr><td colspan="5"><div class="empty">No pending executive requests</div></td></tr>';
    return;
  }
  body.innerHTML = executiveRequests.map(request => {
    const requestedAt = request.requested_at ? formatDateTime(request.requested_at) : '-';
    const phone = request.phone_number || '-';
    return `<tr>
      <td><b>${esc(request.full_name || '-')}</b></td>
      <td><div>${esc(request.email || '-')}</div><div class="muted">${esc(phone)}</div></td>
      <td>${esc(requestedAt)}</td>
      <td><span class="pill pending">Pending</span></td>
      <td><button class="primary" onclick="approveExecutiveRequest('${attr(request.id)}')">Approve</button></td>
    </tr>`;
  }).join('');
}

async function refreshAccounts() {
  if (currentUser?.role !== 'admin') return;
  await Promise.all([loadExecutiveRequests(), loadUsers()]);
}

async function approveExecutiveRequest(id) {
  if (!id || currentUser?.role !== 'admin') return;
  try {
    await apiFetch('/api/admin/executive-account-requests/' + encodeURIComponent(id) + '/approve', { method: 'POST' });
    showToast('Executive request approved');
    await Promise.all([loadExecutiveRequests(), loadUsers(), loadExecutives(), loadOverview()]);
  } catch (error) {
    showToast(error.message || 'Approval failed');
  }
}

function debouncedAccountSearch() {
  clearTimeout(debouncedAccountSearch.timer);
  debouncedAccountSearch.timer = setTimeout(renderUsers, 200);
}

function syncAccountDeleteButton() {
  const selectBtn = document.getElementById('accountSelectToggleBtn');
  const deleteBtn = document.getElementById('accountDeleteBtn');
  if (selectBtn) selectBtn.textContent = accountSelectMode ? 'Cancel Select' : 'Select';
  if (!deleteBtn) return;
  deleteBtn.style.display = currentUser?.role === 'admin' && accountSelectMode ? 'inline-grid' : 'none';
  deleteBtn.disabled = !selectedAccountIds.size;
}

function toggleAccountSelectMode(force) {
  if (currentUser?.role !== 'admin') return;
  const next = typeof force === 'boolean' ? force : !accountSelectMode;
  accountSelectMode = next;
  if (!accountSelectMode) selectedAccountIds = new Set();
  renderUsers();
  syncAccountDeleteButton();
}

function toggleAccountSelection(id, checked) {
  if (!accountSelectMode || currentUser?.role !== 'admin') return;
  const userId = String(id || '');
  if (!userId) return;
  if (checked) selectedAccountIds.add(userId);
  else selectedAccountIds.delete(userId);
  syncAccountDeleteButton();
  renderUsers();
}

function clearAccountSelectMode() {
  accountSelectMode = false;
  selectedAccountIds = new Set();
  syncAccountDeleteButton();
  renderUsers();
}

function openSelectedAccountsDeleteModal() {
  if (!accountSelectMode || currentUser?.role !== 'admin') return;
  if (!selectedAccountIds.size) return showToast('Select at least one executive account');
  const selected = accountRows.filter(user => selectedAccountIds.has(String(user.id)));
  if (!selected.length) return showToast('Select at least one executive account');
  const names = selected.map(user => user.name || user.email || 'Account');
  deleteAccountTarget = {
    bulk: true,
    targets: selected.map(user => ({
      id: String(user.id || ''),
      name: user.name || '',
      email: user.email || '',
      profile_row_id: user.profile_row_id || ''
    })),
    names
  };
  document.getElementById('deleteAccountText').innerHTML = `Delete ${selected.length} selected executive account${selected.length > 1 ? 's' : ''}?<br><br>${names.map(name => `• ${esc(name)}`).join('<br>')}`;
  document.getElementById('deleteAccountConfirmBtn').textContent = 'Delete';
  document.getElementById('deleteAccountModal').style.display = 'flex';
}

function renderUsers() {
  const query = String(document.getElementById('accountSearch')?.value || accountSearchQuery || '').trim().toLowerCase();
  accountSearchQuery = query;
  const visibleSelected = [...selectedAccountIds].filter(id => accountRows.some(user => String(user.id) === String(id)));
  selectedAccountIds = new Set(visibleSelected);
  const visibleRows = !query ? accountRows : accountRows.filter(user => {
    const haystack = [
      user.name,
      user.email,
      user.phone,
      user.mobile,
      roleName(user.role)
    ].map(value => String(value || '').toLowerCase()).join(' ');
    return haystack.includes(query);
  });
  document.getElementById('usersBody').innerHTML = visibleRows.map(user => {
    const selected = accountSelectMode && selectedAccountIds.has(String(user.id));
    const phone = user.phone || user.mobile || '-';
    return `<tr data-account-id="${attr(user.id)}" onclick="openAccountProfile('${attr(user.id)}')" ondblclick="openAccountProfile('${attr(user.id)}')" style="cursor:pointer">
  <td><div class="profile-cell">${accountSelectMode ? `<label class="account-select-cell"><input type="checkbox" onclick="event.stopPropagation()" ${selected ? 'checked' : ''} onchange="toggleAccountSelection('${attr(user.id)}', this.checked)"></label>` : ''}<b>${esc(user.name || '-')}</b></div></td>
  <td><div>${esc(user.email || '-')}</div><div class="muted">${esc(phone)}</div></td>
  <td>${esc(roleName(user.role))}</td>
</tr>`;
  }).join('') || `<tr><td colspan="3"><div class="empty">${query ? 'No matching executive accounts found' : 'No software accounts found'}</div></td></tr>`;
  syncAccountDeleteButton();
}

function setPasswordToggleState(inputId, buttonId, openIconId, closedIconId, show) {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(buttonId);
  const openIcon = document.getElementById(openIconId);
  const closedIcon = document.getElementById(closedIconId);
  if (!input || !btn) return;
  input.type = show ? 'text' : 'password';
  btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  btn.setAttribute('title', show ? 'Hide password' : 'Show password');
  btn.setAttribute('aria-pressed', String(show));
  if (openIcon) openIcon.style.display = show ? 'none' : 'block';
  if (closedIcon) closedIcon.style.display = show ? 'block' : 'none';
}

function toggleCreateAccountForm(force) {
  const wrap = document.getElementById('newAccountForm');
  const btn = document.getElementById('newAccountToggleBtn');
  if (!wrap || !btn) return;
  const open = typeof force === 'boolean' ? force : !wrap.classList.contains('open');
  wrap.classList.toggle('open', open);
  wrap.style.display = open ? 'block' : 'none';
  wrap.style.visibility = open ? 'visible' : 'hidden';
  wrap.style.opacity = open ? '1' : '0';
  wrap.style.pointerEvents = open ? 'auto' : 'none';
  btn.textContent = open ? 'Cancel' : 'Add New';
  if (!open) {
    setPasswordToggleState('newPassword', 'newPasswordToggleBtn', 'newPasswordEyeOpen', 'newPasswordEyeClosed', false);
    setPasswordToggleState('newConfirmPassword', 'newConfirmPasswordToggleBtn', 'newConfirmPasswordEyeOpen', 'newConfirmPasswordEyeClosed', false);
  }
}

function toggleNewAccountPasswordVisibility() {
  const input = document.getElementById('newPassword');
  setPasswordToggleState('newPassword', 'newPasswordToggleBtn', 'newPasswordEyeOpen', 'newPasswordEyeClosed', input?.type === 'password');
}

function toggleNewConfirmPasswordVisibility() {
  const input = document.getElementById('newConfirmPassword');
  setPasswordToggleState('newConfirmPassword', 'newConfirmPasswordToggleBtn', 'newConfirmPasswordEyeOpen', 'newConfirmPasswordEyeClosed', input?.type === 'password');
}

function accountMetadata() {
  return accountProfile?.metadata && typeof accountProfile.metadata === 'object' ? accountProfile.metadata : {};
}

function isAccountProfileEditable() {
  return Boolean(accountProfile && accountProfileEditMode);
}

function accountPersonalValues() {
  const meta = accountMetadata();
  const personal = meta.personal_info && typeof meta.personal_info === 'object' ? meta.personal_info : {};
  const primaryMobile = String(personal.mobile || accountProfile?.mobile || accountProfile?.phone_numbers?.[0] || '').trim();
  const phones = normalizePhoneNumbers(
    meta.phone_numbers ??
    personal.phone_numbers ??
    meta.additional_phone_numbers ??
    accountProfile?.phone_numbers ??
    []
  ).filter(phone => phone && phone !== primaryMobile);
  return {
    full_name: personal.full_name || accountProfile?.name || '',
    email: personal.email || accountProfile?.email || '',
    mobile: primaryMobile,
    phone_numbers: phones,
    father_name: personal.father_name || '',
    mother_name: personal.mother_name || '',
    date_of_birth: personal.date_of_birth || '',
    marital_status: personal.marital_status || '',
    blood_group: personal.blood_group || '',
    occupation: personal.occupation || '',
    present_address: personal.present_address || '',
    permanent_address: personal.permanent_address || ''
  };
}

function collectAccountDatasetPatch(profilePatch) {
  const meta = profilePatch?.metadata && typeof profilePatch.metadata === 'object' ? profilePatch.metadata : {};
  const personal = meta.personal_info && typeof meta.personal_info === 'object' ? meta.personal_info : {};
  const classification = meta.profile_classification || accountProfile?.profile_classification || 'User';
  const stage = meta.stage || 'Interested';
  return {
    app_user_id: String(accountProfile?.id || ''),
    profile_classification: classification,
    role_details: {
      classification,
      is_admin: classification === 'Admin',
      is_executive: classification === 'Executive',
      admin_account_id: null,
      admin_account_name: null,
      admin_account_email: null,
      executive_account_id: classification === 'Executive' ? String(accountProfile?.id || '') : null,
      executive_account_name: classification === 'Executive' ? (profilePatch?.name || accountProfile?.name || '') : null,
      executive_account_email: classification === 'Executive' ? (profilePatch?.email || accountProfile?.email || '') : null,
    },
    personal_info: personal,
    family_info: meta.family_info && typeof meta.family_info === 'object' ? meta.family_info : { members: [] },
    attendance_history: Array.isArray(meta.attendance_history) ? meta.attendance_history : [],
    custom_fields: meta.custom_fields && typeof meta.custom_fields === 'object' ? meta.custom_fields : {},
    Stage: stage,
    Problem: meta.problem || '',
    Remarks: meta.remarks || '',
    call_notes: meta.call_notes || '',
    'Full Name': profilePatch?.name || personal.full_name || accountProfile?.name || '',
    Email: profilePatch?.email || personal.email || accountProfile?.email || '',
    Mobile: personal.mobile || '',
    Occupation: personal.occupation || '',
    Profession: personal.occupation || '',
    Location: personal.present_address || '',
    'Present Address': personal.present_address || '',
    'Permanent Address': personal.permanent_address || '',
    'Father\'s Name': personal.father_name || '',
    'Mother\'s Name': personal.mother_name || '',
    'Date of Birth': personal.date_of_birth || '',
    'Marital Status': personal.marital_status || '',
    'Blood Group': personal.blood_group || '',
  };
}

function renderAccountExecutiveOptions() {
  const select = document.getElementById('accountProfileExecutive');
  if (!select) return;
  const options = bulkAssignExecutiveList().map(exec => `<option value="${attr(exec.id)}">${esc(exec.name || exec.email || 'Executive')}</option>`).join('');
  select.innerHTML = `<option value="">Choose executive</option>${options}`;
}

function updateAccountProfileAssignButtonState() {
  const btn = document.getElementById('accountProfileAssignBtn');
  if (!btn) return;
  btn.disabled = currentUser?.role !== 'admin' || !String(document.getElementById('accountProfileExecutive')?.value || '').trim();
}

async function assignAccountSelected() {
  if (!accountProfile || currentUser?.role !== 'admin') return;
  const assignedTo = String(document.getElementById('accountProfileExecutive')?.value || '').trim();
  const instruction = document.getElementById('accountAssignInstruction')?.value || '';
  if (!assignedTo) return showToast('Choose an executive');
  try {
    const data = await apiFetch('/api/tasks/assign', {
      method: 'POST',
      body: JSON.stringify({
        row_id: accountProfile.profile_row_id || accountProfile.id,
        assigned_to: assignedTo,
        admin_instruction: instruction
      })
    });
    showToast(data.message || 'Assigned');
    if (document.getElementById('accountProfileExecutive')) document.getElementById('accountProfileExecutive').value = '';
    if (document.getElementById('accountAssignInstruction')) document.getElementById('accountAssignInstruction').value = '';
    updateAccountProfileAssignButtonState();
    await Promise.all([loadRecords(false), loadOverview()]);
  } catch (error) {
    showToast(error.message || 'Assign failed');
  }
}

function accountPersonalFields() {
  return [
    'full_name',
    'email',
    'mobile',
    'father_name',
    'mother_name',
    'date_of_birth',
    'marital_status',
    'blood_group',
    'occupation',
    'present_address',
    'permanent_address'
  ];
}

function fillAccountPersonalForm() {
  const values = accountPersonalValues();
  for (const input of document.querySelectorAll('[data-account-personal]')) {
    input.value = values[input.dataset.accountPersonal] || '';
  }
  renderPhoneNumberRows('accountPhoneNumbers', values.phone_numbers || [], 'account', isAccountProfileEditable());
  const meta = accountMetadata();
  if (document.getElementById('accountProfileClass')) document.getElementById('accountProfileClass').textContent = meta.profile_classification || accountProfile?.profile_classification || 'User';
  if (document.getElementById('accountProfileClassification')) document.getElementById('accountProfileClassification').value = meta.profile_classification || accountProfile?.profile_classification || 'User';
  if (document.getElementById('accountEditStage')) document.getElementById('accountEditStage').value = CALL_STAGES.includes(meta.stage) ? meta.stage : 'Interested';
  if (document.getElementById('accountEditProblem')) document.getElementById('accountEditProblem').value = meta.problem || '';
  if (document.getElementById('accountEditRemarks')) document.getElementById('accountEditRemarks').value = meta.remarks || '';
  if (document.getElementById('accountCallNotes')) document.getElementById('accountCallNotes').value = meta.call_notes || '';
  if (document.getElementById('accountCallMobile')) document.getElementById('accountCallMobile').href = values.mobile ? 'tel:' + values.mobile : '#';
}

function addAccountPhoneNumber() {
  if (!accountProfile || !isAccountProfileEditable()) return;
  const next = accountPhoneNumbers();
  next.push('');
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.phone_numbers = next;
  renderPhoneNumberRows('accountPhoneNumbers', next, 'account', true);
  updateAccountProfileControls();
}

function removeAccountPhoneNumber(index) {
  if (!accountProfile || !isAccountProfileEditable()) return;
  const next = accountPhoneNumbers();
  next.splice(index, 1);
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.phone_numbers = next;
  renderPhoneNumberRows('accountPhoneNumbers', next, 'account', true);
  updateAccountProfileControls();
}

function accountCustomFields() {
  const meta = accountMetadata();
  const fields = meta.custom_fields && typeof meta.custom_fields === 'object' ? meta.custom_fields : {};
  return Object.entries(fields);
}

function renderAccountCustomFields() {
  const container = document.getElementById('accountCustomFields');
  if (!container) return;
  const entries = accountCustomFields();
  container.innerHTML = entries.map(([key, value], index) => `<div class="custom-row" data-account-custom-index="${index}">
<input data-account-custom-key value="${attr(key)}" placeholder="Field name">
<input data-account-custom-value value="${attr(value)}" placeholder="Field value">
<button class="danger" onclick="removeAccountCustomField(${index})">Remove</button>
  </div>`).join('') || '<div class="muted">No custom fields yet.</div>';
  updateAccountProfileControls();
}

function addAccountCustomField() {
  if (!isAccountProfileEditable()) return;
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.custom_fields = accountProfile.metadata.custom_fields && typeof accountProfile.metadata.custom_fields === 'object' ? accountProfile.metadata.custom_fields : {};
  let i = Object.keys(accountProfile.metadata.custom_fields).length + 1;
  let key = `Custom Field ${i}`;
  while (Object.prototype.hasOwnProperty.call(accountProfile.metadata.custom_fields, key)) key = `Custom Field ${++i}`;
  accountProfile.metadata.custom_fields[key] = '';
  renderAccountCustomFields();
}

function removeAccountCustomField(index) {
  if (!isAccountProfileEditable()) return;
  const entries = accountCustomFields();
  entries.splice(index, 1);
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.custom_fields = Object.fromEntries(entries);
  renderAccountCustomFields();
}

function collectAccountCustomFields() {
  const fields = {};
  for (const row of document.querySelectorAll('[data-account-custom-index]')) {
    const key = row.querySelector('[data-account-custom-key]').value.trim();
    const value = row.querySelector('[data-account-custom-value]').value.trim();
    if (key) fields[key] = value;
  }
  return fields;
}

function normalizeAccountFamilyMember(member = {}, fallbackRelationship = '') {
  return normalizeFamilyMember(member, fallbackRelationship);
}

function accountFamilyMembersFromSelected() {
  const info = accountMetadata().family_info;
  if (Array.isArray(info)) return info.map(member => normalizeAccountFamilyMember(member));
  if (info && Array.isArray(info.members)) return info.members.map(member => normalizeAccountFamilyMember(member));
  if (info && typeof info === 'object' && Object.keys(info).length) {
    return Object.entries(info).map(([role, member]) => normalizeAccountFamilyMember(member, role));
  }
  return [
    normalizeAccountFamilyMember({}, 'Father'),
    normalizeAccountFamilyMember({}, 'Mother')
  ];
}

function setAccountFamilyMembers(members) {
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.family_info = { members: members.map(member => normalizeAccountFamilyMember(member)) };
}

function renderAccountFamilyInfo() {
  const members = accountFamilyMembersFromSelected();
  setAccountFamilyMembers(members);
  const container = document.getElementById('accountFamilyGrid');
  if (!container) return;
  const editable = isAccountProfileEditable();
  container.innerHTML = members.map((member, index) => renderFamilyMemberCard(member, index, editable, 'account')).join('') || '<div class="muted">No family members added.</div>';
  updateAccountProfileControls();
}

function addAccountFamilyMember() {
  if (!isAccountProfileEditable()) return;
  const members = accountFamilyMembersFromSelected();
  members.push(normalizeAccountFamilyMember({ relationship: '' }));
  setAccountFamilyMembers(members);
  renderAccountFamilyInfo();
}

function removeAccountFamilyMember(index) {
  if (!isAccountProfileEditable()) return;
  const members = accountFamilyMembersFromSelected();
  members.splice(index, 1);
  setAccountFamilyMembers(members);
  renderAccountFamilyInfo();
}

function addAccountFamilyExtraField(index) {
  if (!isAccountProfileEditable()) return;
  const members = accountFamilyMembersFromSelected();
  const member = members[index];
  if (!member) return;
  member.extra_fields = member.extra_fields && typeof member.extra_fields === 'object' ? member.extra_fields : {};
  let i = Object.keys(member.extra_fields).length + 1;
  let key = `Field ${i}`;
  while (Object.prototype.hasOwnProperty.call(member.extra_fields, key)) key = `Field ${++i}`;
  member.extra_fields[key] = '';
  setAccountFamilyMembers(members);
  renderAccountFamilyInfo();
}

function removeAccountFamilyExtraField(memberIndex, extraIndex) {
  if (!isAccountProfileEditable()) return;
  const members = accountFamilyMembersFromSelected();
  const member = members[memberIndex];
  if (!member || !member.extra_fields || typeof member.extra_fields !== 'object') return;
  const entries = Object.entries(member.extra_fields);
  entries.splice(extraIndex, 1);
  member.extra_fields = Object.fromEntries(entries);
  setAccountFamilyMembers(members);
  renderAccountFamilyInfo();
}

function collectAccountFamilyInfo() {
  const members = [];
  for (const card of document.querySelectorAll('#accountFamilyGrid .family-card')) {
    const member = {};
    for (const input of card.querySelectorAll('[data-account-family-field]')) {
      member[input.dataset.accountFamilyField] = input.value.trim();
    }
    const extraFields = {};
    const keyInputs = card.querySelectorAll('[data-account-family-extra-key]');
    const valueInputs = card.querySelectorAll('[data-account-family-extra-value]');
    keyInputs.forEach((input, extraIndex) => {
      const key = input.value.trim();
      const valueInput = valueInputs[extraIndex];
      const value = valueInput ? valueInput.value.trim() : '';
      if (key) extraFields[key] = value;
    });
    member.extra_fields = extraFields;
    members.push(normalizeAccountFamilyMember(member));
  }
  return { members };
}

function normalizeAccountAttendanceItem(item) {
  if (typeof item === 'string') return { event_name: item, timestamp: '' };
  return { event_name: item?.event_name || item?.event || item?.name || '', timestamp: item?.timestamp || item?.time || item?.date || '' };
}

function accountAttendanceHistory() {
  const meta = accountMetadata();
  const list = Array.isArray(meta.attendance_history) ? meta.attendance_history : [];
  return list.map(normalizeAccountAttendanceItem);
}

function renderAccountAttendance() {
  const list = accountAttendanceHistory();
  const counts = {};
  for (const item of list) {
    const name = item.event_name || 'Unnamed Event';
    counts[name] = (counts[name] || 0) + 1;
  }
  const summary = Object.entries(counts).map(([event, count]) => `${event}: ${count} time${count === 1 ? '' : 's'}`).join(' | ');
  const summaryEl = document.getElementById('accountAttendanceSummary');
  if (summaryEl) summaryEl.textContent = summary || 'No attendance recorded';
  const listEl = document.getElementById('accountAttendanceList');
  if (!listEl) return;
  listEl.innerHTML = list.map((item, index) => `<div class="attendance-row">
<b>${esc(item.event_name || 'Unnamed Event')}</b>
<span class="muted">${esc(formatDateTime(item.timestamp))}</span>
<button class="danger" onclick="removeAccountAttendance(${index})">Remove</button>
  </div>`).join('') || '<div class="muted">No attendance history yet.</div>';
  updateAccountProfileControls();
}

function addAccountAttendance() {
  if (!isAccountProfileEditable()) return;
  const event = document.getElementById('accountAttendanceEvent')?.value.trim();
  const time = document.getElementById('accountAttendanceTime')?.value;
  if (!event) return showToast('Event name required');
  const list = accountAttendanceHistory();
  list.push({ event_name: event, timestamp: time ? new Date(time).toISOString() : new Date().toISOString() });
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.attendance_history = list;
  if (document.getElementById('accountAttendanceEvent')) document.getElementById('accountAttendanceEvent').value = '';
  if (document.getElementById('accountAttendanceTime')) document.getElementById('accountAttendanceTime').value = '';
  renderAccountAttendance();
}

function removeAccountAttendance(index) {
  if (!isAccountProfileEditable()) return;
  const list = accountAttendanceHistory();
  list.splice(index, 1);
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.attendance_history = list;
  renderAccountAttendance();
}

function collectAccountProfilePatch() {
  const personal = {};
  for (const input of document.querySelectorAll('#accountModal [data-account-personal]')) {
    personal[input.dataset.accountPersonal] = input.value.trim();
  }
  const phoneNumbers = collectPhoneNumbers('account');
  personal.mobile = phoneNumbers[0] || personal.mobile || '';
  personal.phone_numbers = phoneNumbers;
  const fullName = personal.full_name || accountProfile?.name || '';
  const email = personal.email || accountProfile?.email || '';
  const mobile = phoneNumbers[0] || personal.mobile || '';
  const metadata = accountMetadata();
  metadata.personal_info = personal;
  metadata.family_info = collectAccountFamilyInfo();
  metadata.attendance_history = accountAttendanceHistory();
  metadata.custom_fields = collectAccountCustomFields();
  metadata.profile_classification = document.getElementById('accountProfileClassification')?.value || metadata.profile_classification || 'User';
  metadata.stage = document.getElementById('accountEditStage')?.value || metadata.stage || 'Interested';
  metadata.problem = document.getElementById('accountEditProblem')?.value || '';
  metadata.remarks = document.getElementById('accountEditRemarks')?.value || '';
  metadata.call_notes = document.getElementById('accountCallNotes')?.value || '';
  metadata.full_name = fullName;
  metadata.email = email;
  metadata.mobile = mobile;
  metadata.phone_numbers = phoneNumbers;
  return {
    name: fullName,
    email,
    mobile,
    metadata
  };
}

function renderAccountHistory() {
  const list = Array.isArray(accountMetadata().change_history) ? accountMetadata().change_history : [];
  renderHistorySections(list, 'accountCallHistoryList', 'accountChangeHistoryList', false);
  updateAccountProfileControls();
}

function clearAccountHistory() {
  if (!isAccountProfileEditable()) return;
  accountProfile.metadata = accountMetadata();
  accountProfile.metadata.change_history = [];
  renderAccountHistory();
}

function toggleAccountHistory(force) {
  accountHistoryOpen = typeof force === 'boolean' ? force : !accountHistoryOpen;
  const section = document.getElementById('accountHistorySection');
  const button = document.getElementById('accountHistoryBtn');
  if (section) section.style.display = accountHistoryOpen ? 'block' : 'none';
  if (button) button.textContent = accountHistoryOpen ? 'Hide History' : 'History';
}

function updateAccountProfileControls() {
  const disabled = !isAccountProfileEditable();
  for (const id of ['accountAddCustomFieldBtn', 'accountAddFamilyBtn', 'accountAddAttendanceBtn', 'accountProfileAssignBtn']) {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  }
  updateAccountProfileAssignButtonState();
}

function openAccountProfile(id, edit = false) {
  const user = accountRows.find(item => String(item.id) === String(id));
  if (!user) return;
  accountProfile = clone(user);
  accountProfileSnapshot = clone(user);
  accountHistoryOpen = false;
  document.getElementById('accountModal').style.display = 'flex';
  document.getElementById('accountModal').classList.add('profile-readonly');
  document.getElementById('accountModalAvatar').src = accountAvatarSvg(user.name || user.email || 'Account');
  document.getElementById('accountModalTitle').textContent = `${user.name || 'Account'} Profile`;
  document.getElementById('accountProfileImage').src = accountAvatarSvg(user.name || user.email || 'Account');
  document.getElementById('accountProfileName').textContent = user.name || '-';
  document.getElementById('accountProfileId').textContent = `ID: ${user.id}${user.profile_row_id ? ' | Row: ' + user.profile_row_id : ''}`;
  document.getElementById('accountProfileClass').textContent = user.profile_classification || 'User';
  document.getElementById('accountProfileImage').alt = user.name || 'Account';
  renderAccountExecutiveOptions();
  if (user.assigned_to) document.getElementById('accountProfileExecutive').value = user.assigned_to;
  if (document.getElementById('accountAssignInstruction')) document.getElementById('accountAssignInstruction').value = user.admin_instruction || '';
  fillAccountPersonalForm();
  renderAccountCustomFields();
  renderAccountFamilyInfo();
  renderAccountAttendance();
  renderAccountHistory();
  updateAccountProfileAssignButtonState();
  setAccountProfileEditMode(Boolean(edit));
  toggleAccountHistory(false);
  switchAccountTab('personal');
}

function closeAccountProfile() {
  document.getElementById('accountModal').style.display = 'none';
  document.getElementById('accountModal').classList.remove('profile-readonly');
  document.getElementById('accountModalAvatar').src = accountAvatarSvg('Account');
  accountProfile = null;
  accountProfileSnapshot = null;
  accountProfileEditMode = false;
  accountHistoryOpen = false;
}

function setAccountProfileEditMode(enabled) {
  accountProfileEditMode = Boolean(enabled);
  document.getElementById('accountProfileEditBtn').style.display = accountProfileEditMode ? 'none' : 'inline-grid';
  document.getElementById('accountProfileCancelBtn').style.display = accountProfileEditMode ? 'inline-grid' : 'none';
  document.getElementById('accountProfileSaveBtn').style.display = accountProfileEditMode ? 'inline-grid' : 'none';
  const uploadBtn = document.getElementById('accountUploadBtn');
  if (uploadBtn) uploadBtn.disabled = !accountProfileEditMode;
  for (const el of document.querySelectorAll('#accountModal input, #accountModal select, #accountModal textarea')) {
    if (el.id === 'accountProfileExecutive' || el.id === 'accountAssignInstruction') continue;
    el.disabled = !accountProfileEditMode;
  }
  if (document.getElementById('accountCallMobile')) document.getElementById('accountCallMobile').style.pointerEvents = accountProfileEditMode ? 'none' : 'auto';
  if (uploadBtn) uploadBtn.disabled = !accountProfileEditMode;
  updateAccountProfileControls();
  const modal = document.getElementById('accountModal');
  if (modal) modal.classList.toggle('profile-readonly', !accountProfileEditMode);
  fillAccountPersonalForm();
  renderAccountCustomFields();
  renderAccountFamilyInfo();
  renderAccountAttendance();
}

function cancelAccountProfileEdit() {
  if (!accountProfileSnapshot) return setAccountProfileEditMode(false);
  accountProfile = clone(accountProfileSnapshot);
  document.getElementById('accountProfileImage').src = accountAvatarSvg(accountProfile.name || accountProfile.email || 'Account');
  document.getElementById('accountProfileName').textContent = accountProfile.name || '-';
  document.getElementById('accountProfileId').textContent = `ID: ${accountProfile.id}${accountProfile.profile_row_id ? ' | Row: ' + accountProfile.profile_row_id : ''}`;
  document.getElementById('accountProfileClass').textContent = accountProfile.profile_classification || 'User';
  document.getElementById('accountProfileImage').alt = accountProfile.name || 'Account';
  renderAccountExecutiveOptions();
  if (accountProfile.assigned_to) document.getElementById('accountProfileExecutive').value = accountProfile.assigned_to;
  if (document.getElementById('accountAssignInstruction')) document.getElementById('accountAssignInstruction').value = accountProfile.admin_instruction || '';
  fillAccountPersonalForm();
  renderAccountCustomFields();
  renderAccountFamilyInfo();
  renderAccountAttendance();
  renderAccountHistory();
  updateAccountProfileAssignButtonState();
  setAccountProfileEditMode(false);
  switchAccountTab('personal');
}

function switchAccountTab(tab) {
  for (const el of document.querySelectorAll('#accountModal .tab-panel')) el.classList.remove('active');
  for (const el of document.querySelectorAll('#accountModal .tab-btn')) el.classList.remove('active');
  document.getElementById('accountTab' + tab[0].toUpperCase() + tab.slice(1)).classList.add('active');
  document.getElementById('accountTabBtn' + tab[0].toUpperCase() + tab.slice(1)).classList.add('active');
}

async function saveAccountProfile() {
  if (!accountProfile?.id || !accountProfileEditMode) return;
  try {
    const profilePatch = collectAccountProfilePatch();
    const data = await apiFetch('/api/users/' + encodeURIComponent(accountProfile.id), {
      method: 'PUT',
      body: JSON.stringify(profilePatch)
    });
    const updated = data.user || accountProfile;
    if (updated.profile_row_id) {
      await apiFetch('/api/dataset-rows/' + encodeURIComponent(updated.profile_row_id), {
        method: 'PUT',
        body: JSON.stringify(collectAccountDatasetPatch(profilePatch))
      });
    }
    accountRows = accountRows.map(user => String(user.id) === String(updated.id) ? { ...user, ...updated } : user);
    accountProfile = clone(updated);
    accountProfileSnapshot = clone(updated);
    document.getElementById('accountProfileImage').src = accountAvatarSvg(updated.name || updated.email || 'Account');
    document.getElementById('accountProfileName').textContent = updated.name || '-';
    document.getElementById('accountProfileId').textContent = `ID: ${updated.id}${updated.profile_row_id ? ' | Row: ' + updated.profile_row_id : ''}`;
    document.getElementById('accountProfileClass').textContent = updated.profile_classification || updated.metadata?.profile_classification || 'User';
    renderAccountExecutiveOptions();
    renderAccountCustomFields();
    renderAccountFamilyInfo();
    renderAccountAttendance();
    renderAccountHistory();
    setAccountProfileEditMode(false);
    renderUsers();
    if (currentUser && String(currentUser.id) === String(updated.id)) {
      writeSession(token, { ...currentUser, ...updated });
      document.getElementById('topUser').textContent = `${currentUser.name} (${roleName(currentUser.role)})`;
      document.getElementById('roleLabel').textContent = `${currentUser.name} (${roleName(currentUser.role)})`;
    }
    showToast(data.message || 'Account updated');
    await Promise.all([loadUsers(), loadExecutives(), loadOverview()]);
    renderFilterOptions();
  } catch (error) {
    showToast(error.message || 'Update failed');
  }
}

async function uploadAccountImage() {
  showToast('Image uploads are disabled');
}

function promptDeleteCurrentAccount() {
  if (currentUser?.role !== 'admin' || !accountProfile?.id) return;
  openDeleteAccountModal(accountProfile.id, `${accountProfile.name || 'this executive account'}${accountProfile.email ? ` (${accountProfile.email})` : ''}`);
}

function openDeleteAccountModal(id, name) {
  const user = accountRows.find(item => String(item.id) === String(id)) || accountProfile || {};
  const label = user.name || name || 'this executive account';
  const detail = user.email || user.profile_row_id || user.id ? ` [ID: ${user.id || id}${user.profile_row_id ? `, Row: ${user.profile_row_id}` : ''}${user.email ? `, ${user.email}` : ''}]` : '';
  deleteAccountTarget = {
    id: String(id || ''),
    name: label,
    email: user.email || '',
    profile_row_id: user.profile_row_id || ''
  };
  document.getElementById('deleteAccountText').textContent = `Delete ${label}${detail}? This action cannot be undone.`;
  document.getElementById('deleteAccountConfirmBtn').textContent = 'Delete';
  document.getElementById('deleteAccountModal').style.display = 'flex';
}

function closeDeleteAccountModal() {
  deleteAccountTarget = null;
  document.getElementById('deleteAccountConfirmBtn').textContent = 'Delete';
  document.getElementById('deleteAccountModal').style.display = 'none';
}

async function confirmDeleteAccount() {
  if (!deleteAccountTarget) return;
  const target = deleteAccountTarget;
  try {
    if (Array.isArray(target.targets) && target.targets.length) {
      await Promise.all(target.targets.map(item => apiFetch('/api/users/' + encodeURIComponent(item.id), {
        method: 'DELETE',
        body: JSON.stringify(item)
      })));
      showToast(`${target.targets.length} executive account${target.targets.length > 1 ? 's' : ''} deleted`);
    } else if (target.id) {
      await apiFetch('/api/users/' + encodeURIComponent(target.id), {
        method: 'DELETE',
        body: JSON.stringify({
          id: target.id,
          name: target.name || '',
          email: target.email || '',
          profile_row_id: target.profile_row_id || ''
        })
      });
      showToast(`${target.name || 'Executive account'} deleted`);
    } else {
      return;
    }
    closeDeleteAccountModal();
    if (Array.isArray(target.targets) && target.targets.length) {
      clearAccountSelectMode();
    }
    await Promise.all([loadUsers(), loadExecutives(), loadOverview()]);
  } catch (error) {
    showToast(error.message || 'Delete failed');
  }
}

async function createUser() {
  try {
    await apiFetch('/api/admin/executive-accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('newName').value,
        phoneNumber: document.getElementById('newPhone').value,
        email: document.getElementById('newEmail').value,
        password: document.getElementById('newPassword').value,
        confirmPassword: document.getElementById('newConfirmPassword').value
      })
    });
    for (const id of ['newName', 'newPhone', 'newEmail', 'newPassword', 'newConfirmPassword']) document.getElementById(id).value = '';
    setPasswordToggleState('newPassword', 'newPasswordToggleBtn', 'newPasswordEyeOpen', 'newPasswordEyeClosed', false);
    setPasswordToggleState('newConfirmPassword', 'newConfirmPasswordToggleBtn', 'newConfirmPasswordEyeOpen', 'newConfirmPasswordEyeClosed', false);
    toggleCreateAccountForm(false);
    showToast('Executive account created');
    await Promise.all([refreshAccounts(), loadExecutives(), loadOverview()]);
    renderFilterOptions();
  } catch (error) { showToast(error.message || 'Create failed') }
}

async function savePermissionSettings() {
  try {
    const payload = {
      admin_create_accounts: document.getElementById('permAdminCreateAccounts')?.checked,
      admin_assign_profiles: document.getElementById('permAdminAssignProfiles')?.checked,
      admin_configure_ai: document.getElementById('permAdminConfigureAi')?.checked,
      admin_manage_permissions: true,
      admin_view_dashboard: document.getElementById('permAdminViewDashboard')?.checked,
      admin_rw_all_profiles: document.getElementById('permAdminRwAllProfiles')?.checked,
      admin_use_ai_chat: document.getElementById('permAdminUseAiChat')?.checked,
      admin_clear_history: document.getElementById('permAdminClearHistory')?.checked,
      exec_view_assigned_profiles: document.getElementById('permExecViewAssignedProfiles')?.checked,
      exec_view_client_details: document.getElementById('permExecViewClientDetails')?.checked,
      exec_update_stage_remarks: document.getElementById('permExecUpdateStageRemarks')?.checked,
      executive_can_edit_personal_data: document.getElementById('permExecutiveEdit')?.checked,
      exec_manage_attendance: document.getElementById('permExecManageAttendance')?.checked
    };
    const data = await apiFetch('/api/settings/permissions', { method: 'PUT', body: JSON.stringify(payload) });
    permissions = data.settings || permissions;
    showToast('Permissions saved');
  } catch (error) { showToast(error.message || 'Permission save failed') }
}

async function saveProgramSettings() {
  try {
    const payload = { program_name: document.getElementById('programNameInput')?.value.trim() || '' };
    const data = await apiFetch('/api/settings/program', { method: 'PUT', body: JSON.stringify(payload) });
    programSettings = data.settings || programSettings;
    showToast('Program name saved');
  } catch (error) { showToast(error.message || 'Program name save failed') }
}

function normalizeCommunicationConnector(connector) {
  const name = String(connector?.name || '').trim();
  const url = String(connector?.url || '').trim();
  if (!name) return null;
  return { name, url };
}

function renderCommunicationConnectorList() {
  const body = document.getElementById('communicationConnectorBody');
  if (!body) return;
  if (!communicationConnectors.length) {
    body.innerHTML = '<tr><td colspan="2"><div class="empty">No connectors added yet.</div></td></tr>';
    return;
  }
  body.innerHTML = communicationConnectors.map((connector, index) => `
    <tr>
      <td><b>${esc(connector.name)}</b></td>
      <td><button class="primary" onclick="viewCommunicationConnector(${index})">View</button></td>
    </tr>
  `).join('');
}

async function loadCommunicationConnectors() {
  if (!currentUser || currentUser.role !== 'admin') return;
  try {
    const data = await apiFetch('/api/settings/communication-connectors');
    communicationConnectors = Array.isArray(data.settings?.connectors)
      ? data.settings.connectors.map(normalizeCommunicationConnector).filter(Boolean)
      : [];
  } catch {
    communicationConnectors = [];
  }
  renderCommunicationConnectorList();
  renderAdminOverviewCard();
  renderCommunityConnectorCard();
  if (typeof window.refreshTaskSummaryWidget === 'function') window.refreshTaskSummaryWidget();
}

async function saveCommunicationConnector() {
  try {
    const nameInput = document.getElementById('communicationConnectorName');
    const urlInput = document.getElementById('communicationConnectorUrl');
    const nextItem = normalizeCommunicationConnector({
      name: nameInput?.value,
      url: urlInput?.value,
    });
    if (!nextItem) return showToast('Connector name is required');
    const next = [nextItem, ...communicationConnectors.filter(item => item.name.toLowerCase() !== nextItem.name.toLowerCase())];
    const data = await apiFetch('/api/settings/communication-connectors', {
      method: 'PUT',
      body: JSON.stringify({ connectors: next })
    });
    communicationConnectors = Array.isArray(data.settings?.connectors)
      ? data.settings.connectors.map(normalizeCommunicationConnector).filter(Boolean)
      : next;
    if (nameInput) nameInput.value = '';
    if (urlInput) urlInput.value = '';
    renderCommunicationConnectorList();
    renderAdminOverviewCard();
    renderCommunityConnectorCard();
    if (typeof window.refreshTaskSummaryWidget === 'function') window.refreshTaskSummaryWidget();
    showToast('Connector saved');
  } catch (error) {
    showToast(error.message || 'Connector save failed');
  }
}

function viewCommunicationConnector(index) {
  const connector = communicationConnectors[index];
  if (!connector) return;
  communicationConnectorViewIndex = index;
  const modal = document.getElementById('communicationConnectorModal');
  const nameBox = document.getElementById('communicationConnectorModalName');
  const urlBox = document.getElementById('communicationConnectorModalUrl');
  if (nameBox) nameBox.textContent = connector.name || '-';
  if (urlBox) urlBox.textContent = connector.url || 'No URL saved';
  const openBtn = document.getElementById('communicationConnectorOpenBtn');
  if (openBtn) openBtn.disabled = !connector.url;
  if (modal) modal.style.display = 'flex';
}

function closeCommunicationConnectorModal() {
  const modal = document.getElementById('communicationConnectorModal');
  if (modal) modal.style.display = 'none';
  communicationConnectorViewIndex = -1;
}

function openCommunicationConnectorForm() {
  const modal = document.getElementById('connectorAccountModal');
  if (modal) modal.style.display = 'flex';
}

function closeCommunicationConnectorForm() {
  const modal = document.getElementById('connectorAccountModal');
  if (modal) modal.style.display = 'none';
}

function openCommunicationConnectorUrl() {
  const connector = communicationConnectors[communicationConnectorViewIndex];
  if (!connector?.url) return showToast('No connector URL saved');
  window.open(connector.url, '_blank', 'noopener');
}

async function loadAiSettings() {
  if (currentUser?.role !== 'admin') return;
  try {
    const data = await apiFetch('/api/ai/settings');
    aiSettings = data.settings || {};
    document.getElementById('aiActiveVendorSelect').value = aiSettings.activeProvider || 'openai';
    if (!document.getElementById('aiConfigVendorSelect').value) {
      document.getElementById('aiConfigVendorSelect').value = aiSettings.activeProvider || 'openai';
    }
    renderAiConfigForm();
    renderProviderStatus(aiSettings);
  } catch (error) {
    document.getElementById('providerStatus').innerHTML = `<div class="empty">${esc(error.message)}</div>`;
  }
}

function renderAiConfigForm() {
  const vendor = document.getElementById('aiConfigVendorSelect')?.value || 'openai';
  const models = (aiSettings?.vendors?.[vendor]?.models) || AI_VENDOR_MODELS[vendor] || [];
  const selected = aiSettings?.providers?.[vendor]?.model || models[0] || '';
  document.getElementById('aiModelSelect').innerHTML = models.map(model => `<option value="${attr(model)}" ${model === selected ? 'selected' : ''}>${esc(model)}</option>`).join('');

  const providerInfo = aiSettings?.providers?.[vendor] || {};
  const badge = document.getElementById('vendorConfigBadge');
  const input = document.getElementById('aiApiKey');
  const indicator = document.getElementById('aiApiKeySavedIndicator');

  if (providerInfo.configured) {
    badge.textContent = 'Configured';
    badge.className = 'pill updated';
    input.placeholder = '•••••••• (Saved)';
    indicator.style.display = 'inline';
  } else {
    badge.textContent = 'No Key';
    badge.className = 'pill pending';
    input.placeholder = 'API token / key';
    indicator.style.display = 'none';
  }
}

function renderProviderStatus(settings) {
  const providers = Object.entries(settings.providers || {}).map(([provider, cfg]) => `<div class="history-item"><div class="history-top"><b>${esc(settings.vendors?.[provider]?.label || provider)}</b><span class="pill ${cfg.configured ? 'updated' : ''}">${cfg.configured ? 'Configured' : 'No Key'}</span></div><div class="muted">${esc(cfg.model || '')}</div></div>`).join('');
  const agent = settings.agent ? `<div class="history-item"><div class="history-top"><b>Quantum Agent</b><span class="pill ${settings.agent.initialized ? 'updated' : 'pending'}">${settings.agent.initialized ? 'Initialized' : 'Not Ready'}</span></div><div class="muted">${esc(settings.agent.provider || settings.activeProvider || '')} ${esc(settings.agent.model || '')}${settings.agent.error ? ' - ' + esc(settings.agent.error) : ''}</div></div>` : '';
  document.getElementById('providerStatus').innerHTML = (agent + providers) || '<div class="muted">No AI vendor configured yet.</div>';
}

function normalizeAiMessage(message) {
  if (!message) return null;
  const role = message.role === 'assistant' ? 'ai' : (message.role === 'user' ? 'user' : message.role || 'ai');
  return {
    role,
    html: String(message.content_html || message.html || message.text || ''),
    meta: message.meta || {},
    created_at: message.created_at || message.createdAt || message.meta?.created_at || ''
  };
}

function formatChatTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function buildMsgRow(role, html, timestamp = '') {
  const row = document.createElement('div');
  const alignedRole = role === 'assistant' ? 'ai' : (role === 'user' ? 'user' : role);
  row.className = `msg-row ${alignedRole}`;
  const avatar = document.createElement('div');
  avatar.className = 'msg-avatar';
  avatar.textContent = alignedRole === 'user' ? 'You' : 'AI';
  const stack = document.createElement('div');
  stack.className = 'msg-stack';
  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble';
  bubble.innerHTML = html;
  stack.appendChild(bubble);
  const label = formatChatTimestamp(timestamp);
  if (label) {
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = label;
    meta.title = timestamp;
    stack.appendChild(meta);
  }
  row.appendChild(avatar);
  row.appendChild(stack);
  return row;
}

function renderAiChat() {
  const thread = document.getElementById('aiThread');
  if (!thread) return;
  thread.innerHTML = '';
  if (!aiChatMessages.length) {
    thread.appendChild(buildMsgRow('ai', escapeChatHtml('Ask a question about the dataset and I will filter the table with real rows from the database.'), new Date().toISOString()));
    thread.scrollTop = thread.scrollHeight;
    return;
  }
  for (const message of aiChatMessages) {
    const normalized = normalizeAiMessage(message);
    if (!normalized) continue;
    thread.appendChild(buildMsgRow(normalized.role, normalized.html, normalized.created_at));
  }
  thread.scrollTop = thread.scrollHeight;
}

function addMsg(role, html, createdAt = new Date().toISOString()) {
  const thread = document.getElementById('aiThread');
  const normalizedRole = role === 'assistant' ? 'ai' : (role === 'user' ? 'user' : role);
  const normalizedHtml = String(html || '');
  aiChatMessages.push({ role: normalizedRole, html: normalizedHtml, created_at: createdAt });
  const msg = buildMsgRow(normalizedRole, normalizedHtml, createdAt);
  if (thread) {
    thread.appendChild(msg);
    thread.scrollTop = thread.scrollHeight;
  }
}

function autoGrowChatInput(el) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

async function loadAiChatHistory() {
  const sessionId = ensureAiSessionId();
  if (!sessionId) return;
  try {
    const data = await apiFetch('/api/ai/history?session_id=' + encodeURIComponent(sessionId));
    aiChatMessages = (data.messages || []).map(normalizeAiMessage).filter(Boolean);
    renderAiChat();
  } catch (error) {
    aiChatMessages = [];
    renderAiChat();
  }
}

async function loadActiveModelLabel() {
  try {
    const data = await apiFetch('/api/ai/settings');
    const settings = data.settings || {};
    const activeProv = settings.activeProvider || 'openai';
    const activeModel = settings.providers?.[activeProv]?.model || 'default';
    const labelEl = document.getElementById('aiActiveModelLabel');
    if (labelEl) {
      labelEl.textContent = `${activeProv} (${activeModel})`;
    }
  } catch (error) {
    console.error('Failed to load active model label:', error);
  }
}

function openAiSettingsModal() {
  document.getElementById('aiSettingsModal').style.display = 'flex';
  loadAiSettings();
}

function closeAiSettingsModal() {
  document.getElementById('aiSettingsModal').style.display = 'none';
}

async function saveActiveAiProvider() {
  try {
    const vendor = document.getElementById('aiActiveVendorSelect').value;
    const data = await apiFetch('/api/ai/settings', { method: 'PUT', body: JSON.stringify({ activeProvider: vendor }) });
    aiSettings = data.settings || aiSettings;
    renderProviderStatus(aiSettings);
    renderAiConfigForm();
    await loadActiveModelLabel();
    showToast('Active AI provider updated');
  } catch (error) { showToast(error.message || 'Failed to update active provider') }
}

async function saveAiProviderConfig() {
  try {
    const vendor = document.getElementById('aiConfigVendorSelect').value;
    const keyVal = document.getElementById('aiApiKey').value.trim();
    const data = await apiFetch('/api/ai/settings', {
      method: 'PUT',
      body: JSON.stringify({
        provider: vendor,
        model: document.getElementById('aiModelSelect').value,
        apiKey: keyVal
      })
    });
    aiSettings = data.settings || aiSettings;
    document.getElementById('aiApiKey').value = '';
    renderAiConfigForm();
    renderProviderStatus(aiSettings);
    await loadActiveModelLabel();
    showToast('AI vendor configuration saved');
  } catch (error) { showToast(error.message || 'Failed to save configuration') }
}

function toggleAiChat(force) {
  const drawer = document.getElementById('aiDrawer');
  const backdrop = document.getElementById('aiBackdrop');
  const open = force === undefined ? !drawer.classList.contains('open') : Boolean(force);
  drawer.classList.toggle('open', open);
  backdrop.classList.toggle('open', open);
  if (open) {
    loadAiChatHistory();
    loadActiveModelLabel();
  }
}

function clearFiltersWithoutLoading() {
  document.getElementById('recordSearch').value = '';
  for (const id of ['locationFilter', 'minAgeFilter', 'maxAgeFilter']) document.getElementById(id).value = '';
  for (const id of ['stageFilter', 'statusFilter', 'assignedFilter']) { const el = document.getElementById(id); if (el) el.value = '' }
}

function applyAiFilters(filters) {
  clearFiltersWithoutLoading();
  if (filters.search) document.getElementById('recordSearch').value = filters.search;
  if (filters.mobile) document.getElementById('recordSearch').value = filters.mobile;
  if (filters.stage) document.getElementById('stageFilter').value = filters.stage;
  if (filters.task_status) document.getElementById('statusFilter').value = filters.task_status;
  if (filters.assigned_to) document.getElementById('assignedFilter').value = filters.assigned_to;
  if (filters.location) document.getElementById('locationFilter').value = filters.location;
  if (filters.min_age) document.getElementById('minAgeFilter').value = filters.min_age;
  if (filters.max_age) document.getElementById('maxAgeFilter').value = filters.max_age;
}

async function askAi() {
  const input = document.getElementById('aiQuestion');
  const question = input.value.trim();
  if (!question) return;

  const userTimestamp = new Date().toISOString();
  addMsg('user', escapeChatHtml(question), userTimestamp);

  input.value = '';
  autoGrowChatInput(input);

  // Append Typing Bubble
  const thread = document.getElementById('aiThread');
  let loadingRow = null;
  if (thread) {
    loadingRow = buildMsgRow('ai', '<div class="loading-dots"><span></span><span></span><span></span></div>', new Date().toISOString());
    loadingRow.id = 'aiChatLoadingRow';
    thread.appendChild(loadingRow);
    thread.scrollTop = thread.scrollHeight;
  }

  try {
    const data = await apiFetch('/api/ai/query', {
      method: 'POST',
      body: JSON.stringify({
        question,
        session_id: ensureAiSessionId(),
        pageSize: Number(document.getElementById('pageSize').value || 50)
      })
    });

    // Remove Typing Bubble
    const existingLoading = document.getElementById('aiChatLoadingRow');
    if (existingLoading) existingLoading.remove();

    const total = Number(data.total ?? data.pagination?.total ?? 0);
    const reply = data.reply || (total > 0 ? `I have found ${total} profile${total === 1 ? '' : 's'} matching your request.` : 'No related data found in the database matching your criteria.');
    addMsg('ai', escapeChatHtml(reply), data.messages?.[1]?.created_at || new Date().toISOString());

    rows = data.rows || [];
    pagination = data.pagination || pagination;
    applyAiFilters(data.filters || {});
    switchView('records', { skipLoad: true });
    renderRows();
    renderPagination();
    const focusProfileId = data.preferred_profile_id || (total === 1 && rows[0]?.id ? rows[0].id : '');
    if (focusProfileId) {
      setTimeout(() => openProfile(focusProfileId), 0);
    }
  } catch (error) {
    // Remove Typing Bubble
    const existingLoading = document.getElementById('aiChatLoadingRow');
    if (existingLoading) existingLoading.remove();

    addMsg('ai', escapeChatHtml(error.message || 'AI query failed'));
  }
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') toggleAiChat(false);
});

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

document.addEventListener('DOMContentLoaded', boot);
