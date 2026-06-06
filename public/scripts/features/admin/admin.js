(function () {
  async function loadAdminFragments() {
    const host = document.getElementById('adminFragments');
    if (!host || host.dataset.loaded === 'true') return;
    const response = await fetch('/features/admin/admin.html');
    if (!response.ok) throw new Error('Failed to load admin fragments');
    host.innerHTML = await response.text();
    host.dataset.loaded = 'true';
  }

  window.loadAdminFragments = loadAdminFragments;
})();

let accountTaskRows = [];
let accountNewTaskRows = [];
let adminTaskRows = [];
let adminTaskRowsLoaded = false;
let adminTaskRowsLoading = false;
window.adminTaskState = window.adminTaskState || { tab: 'assign', search: '' };

function adminTaskMatchesSearch(row, search) {
  const text = [
    row.name,
    row.mobile,
    row.email,
    row.phone,
    row.executor_name,
    row.executor_email,
    row.advertisement,
    row.problem,
    row.created_at,
  ].map(value => String(value || '').toLowerCase()).join(' | ');
  return !search || text.includes(search);
}

function debouncedAdminTaskSearch() {
  clearTimeout(debouncedAdminTaskSearch.timer);
  debouncedAdminTaskSearch.timer = setTimeout(() => {
    window.adminTaskState.search = String(document.getElementById('adminTaskSearch')?.value || '').trim().toLowerCase();
    renderAdminTaskAssignRows();
  }, 220);
}

function setAdminTaskTab(tab) {
  window.adminTaskState.tab = tab === 'followup' ? 'followup' : 'assign';
  const buttons = document.querySelectorAll('#adminTaskPanel [data-admin-task-tab]');
  buttons.forEach((button) => {
    button.classList.toggle('active', button.dataset.adminTaskTab === window.adminTaskState.tab);
  });
  const panels = document.querySelectorAll('#adminTaskPanel [data-admin-task-panel]');
  panels.forEach((panel) => {
    panel.style.display = panel.dataset.adminTaskPanel === window.adminTaskState.tab ? 'grid' : 'none';
  });
  if (window.adminTaskState.tab === 'assign' && !adminTaskRows.length && !adminTaskRowsLoaded && !adminTaskRowsLoading) {
    loadAdminTaskRows().catch(() => null);
  }
}

async function loadAdminTaskRows() {
  if (currentUser?.role !== 'admin') return;
  if (adminTaskRowsLoading) return;
  adminTaskRowsLoading = true;
  try {
    const data = await apiFetch('/api/admin/assign-new-tasks');
    adminTaskRows = Array.isArray(data.tasks) ? data.tasks : [];
    adminTaskRowsLoaded = true;
    renderAdminTaskAssignRows();
  } catch (error) {
    adminTaskRows = [];
    adminTaskRowsLoaded = false;
    const body = document.getElementById('adminTaskAssignBody');
    if (body) body.innerHTML = `<tr><td colspan="6"><div class="empty">${esc(error.message || 'Task list failed')}</div></td></tr>`;
  } finally {
    adminTaskRowsLoading = false;
  }
}

function renderAdminTaskAssignRows() {
  const body = document.getElementById('adminTaskAssignBody');
  if (!body) return;
  const search = String(window.adminTaskState.search || '').toLowerCase();
  const filtered = adminTaskRows.filter((row) => adminTaskMatchesSearch(row, search));
  if (!filtered.length) {
    body.innerHTML = '<tr><td colspan="6"><div class="empty">No task records found</div></td></tr>';
    return;
  }
  body.innerHTML = filtered.map((row) => {
    const createdAt = row.created_at ? formatDateTime(row.created_at) : '-';
    const contact = [row.phone || row.mobile || '-', row.email || row.executor_email || 'No email'].filter(Boolean).join(' | ');
    return `<tr>
      <td><b>${esc(row.full_name || row.name || '-')}</b><div class="muted">${esc(row.executor_name || 'Executive')} | ${esc(row.executor_email || '-')}</div></td>
      <td>${esc(contact)}</td>
      <td>${esc(row.advertisement || 'Advertisement')}</td>
      <td>${esc(row.problem || '-')}</td>
      <td>${esc(createdAt)}</td>
      <td><span class="pill pending">New</span></td>
    </tr>`;
  }).join('');
}

window.loadAdminTaskRows = loadAdminTaskRows;
window.setAdminTaskTab = setAdminTaskTab;
window.debouncedAdminTaskSearch = debouncedAdminTaskSearch;
window.renderAdminTaskAssignRows = renderAdminTaskAssignRows;

window.addEventListener('storage', (event) => {
  if (event.key !== 'crm.assignNewTask.updatedAt') return;
  if (window.adminTaskState?.tab !== 'assign') return;
  loadAdminTaskRows().catch(() => null);
});


async function loadBulkAssignExecutives() {
      if (currentUser?.role !== 'admin') return;
      try {
        const data = await apiFetch('/api/executive-accounts');
        executiveAccounts = data.executives || [];
        bulkAssignExecutiveRows = executiveAccounts;
        renderFilterOptions();
        renderAccountExecutiveOptions();
        renderSettingsExecutiveList();
        renderBulkAssignPanel();
        renderBulkSegments();
      } catch {
        executiveAccounts = [];
        bulkAssignExecutiveRows = [];
        renderFilterOptions();
        renderAccountExecutiveOptions();
        renderSettingsExecutiveList();
        renderBulkAssignPanel();
        renderBulkSegments();
      }
    }

    function bulkAssignExecutiveList() {
      if (executiveAccounts.length) return executiveAccounts;
      if (bulkAssignExecutiveRows.length) return bulkAssignExecutiveRows;
      return accountRows.filter(user => String(user.role || '').toLowerCase() === 'executor');
    }

    function renderSettingsExecutiveList() {
      const list = document.getElementById('settingsExecutiveList');
      const count = document.getElementById('settingsExecutiveCount');
      if (!list || !count) return;
      const rows = bulkAssignExecutiveList();
      count.textContent = `${rows.length} executive${rows.length === 1 ? '' : 's'}`;
      if (!rows.length) {
        list.innerHTML = '<div class="empty">No executive accounts found</div>';
        return;
      }
      list.innerHTML = rows.map((executive) => {
        const name = executive.name || executive.email || 'Executive';
        const email = executive.email || '-';
        const phone = executive.phone || executive.mobile || '';
        return `<div class="settings-executive-row">
          <img class="assignment-avatar" src="${attr(accountAvatarSvg(name))}" alt="">
          <div class="settings-executive-info">
            <b title="${attr(name)}">${esc(name)}</b>
            <div class="muted" title="${attr([email, phone].filter(Boolean).join(' | '))}">${esc(email)}${phone ? ` | ${esc(phone)}` : ''}</div>
          </div>
        </div>`;
      }).join('');
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
        document.getElementById('mTotalLabel').textContent = 'Total';
        document.getElementById('mPendingLabel').textContent = 'Pending Queue';
        document.getElementById('mCompletedLabel').textContent = 'Allocated';
        document.getElementById('mUpdatedLabel').textContent = 'Unassigned';
        document.getElementById('mTotal').textContent = overview.total_data_count || 0;
        document.getElementById('mPending').textContent = overview.total_pending_queue_records || 0;
        document.getElementById('mCompleted').textContent = overview.total_allocated_records || 0;
        document.getElementById('mUpdated').textContent = overview.remaining_unassigned_records || 0;
        document.getElementById('progressPanel').style.display = 'block';
        document.getElementById('progressBody').innerHTML = (overview.executive_progress || []).map(e => {
          const percent = Number(e.completion_percentage || 0);
          const avatar = accountAvatarSvg(e.name || e.email || 'Executive');
          const mobileLine = e.mobile ? `<div class="muted">${esc(e.mobile)}</div>` : '';
          return `<tr><td><div class="assigned-cell"><img class="assignment-avatar" src="${attr(avatar)}" alt=""><div><b>${esc(e.name || e.email || 'Executive')}</b><div class="muted">${esc(e.email || '-')}</div>${mobileLine}</div></div></td><td>${e.assigned_count}</td><td>${e.completed_count}</td><td><b>${percent}%</b><div class="progress-wrap"><span style="width:${Math.min(100, percent)}%"></span></div></td></tr>`;
        }).join('') || '<tr><td colspan="4"><div class="empty">No active executives found</div></td></tr>';
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
        const queryDate = typeof executiveOverviewApiDate === 'function' ? executiveOverviewApiDate(selectedDate) : '';
        const data = await apiFetch(`/api/dashboard/executive${queryDate ? `?date=${encodeURIComponent(queryDate)}` : ''}`);
        const overview = data.overview || {};
        executiveOverviewData = overview;
        if (typeof setOverviewMode === 'function') setOverviewMode('legacy');
        if (typeof renderExecutiveOverviewCard === 'function') renderExecutiveOverviewCard();
        executiveAssignedRows = Array.isArray(overview.assigned_rows) ? overview.assigned_rows : [];
        const assignedPanel = document.getElementById('assignedPanel');
        if (assignedPanel) assignedPanel.style.display = executiveAssignedRows.length ? 'block' : 'none';
        if (typeof renderExecutiveAssignments === 'function') renderExecutiveAssignments();
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
      document.getElementById('tbody').innerHTML = `<tr><td colspan="7"><div class="empty">${esc(message)}</div></td></tr>`;
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
        const selectedBulk = bulkAssignMode && bulkAssignRowIds.has(String(row.id));
        return `<tr class="${selectedBulk ? 'bulk-selected' : ''}" onclick="openProfile('${attr(row.id)}')" ondblclick="openProfile('${attr(row.id)}')" style="cursor:pointer">
      <td><div class="profile-cell">${bulkAssignMode && currentUser?.role === 'admin' ? `<label class="row-select-cell"><input type="checkbox" onclick="event.stopPropagation()" ${selectedBulk ? 'checked' : ''} onchange="toggleBulkRowSelection('${attr(row.id)}', this.checked)"></label>` : ''}<div><b>${esc(row.name || '-')}</b><div class="muted">${esc(classification)} | ${esc(profession)} | Age ${esc(age || '-')}</div></div></div></td>
      <td><div>${esc(row.mobile || '-')}</div><div class="muted">${esc(email)} | ${esc(row.location || row.present_address || '-')}</div></td>
      <td>${esc(row.problem || '-')}</td>
      <td>${esc(row.stage || '-')}</td>
      <td><b>${esc(row.assigned_to_name || 'Unassigned')}</b><div class="muted">${esc(row.assigned_to_email || '')}</div></td>
      <td><span class="pill ${attr(taskClass)}">${esc(row.task_status || 'Unassigned')}</span></td>
    </tr>`;
      }).join('');
      if (typeof window.renderTaskReport === 'function') window.renderTaskReport();
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
      document.getElementById('profileModalAvatar').src = accountAvatarSvg(selected.name || selected.email || 'Profile');
      document.getElementById('modalTitle').textContent = selected.name || 'Profile';
      document.getElementById('pName').textContent = selected.name || '-';
      document.getElementById('pId').textContent = `ID: ${selected.id} | Row: ${selected.row_number}`;
      document.getElementById('pImg').src = accountAvatarSvg(selected.name || selected.email || 'Profile');
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
      document.getElementById('uploadBtn').disabled = personalLocked;
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
        const message = `<div class="empty">${esc(error.message || 'History failed')}</div>`;
        const callList = document.getElementById('profileCallHistoryList');
        const changeList = document.getElementById('profileChangeHistoryList');
        if (callList) callList.innerHTML = message;
        if (changeList) changeList.innerHTML = message;
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
      renderHistorySections(history, 'profileCallHistoryList', 'profileChangeHistoryList', true);
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
      profileHistoryOpen = typeof force === 'boolean' ? force : !profileHistoryOpen;
      const section = document.getElementById('profileHistorySection');
      const button = document.getElementById('profileHistoryBtn');
      if (section) section.style.display = profileHistoryOpen ? 'block' : 'none';
      if (button) button.textContent = profileHistoryOpen ? 'Hide History' : 'History';
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

    function accountAssignNewTasks() {
      const meta = accountMetadata();
      return Array.isArray(meta.assign_new_tasks) ? meta.assign_new_tasks : [];
    }

    async function refreshAccountAssignNewTaskData() {
      if (!accountProfile?.id || currentUser?.role !== 'admin') return null;
      try {
        const data = await apiFetch('/api/users/' + encodeURIComponent(accountProfile.id));
        const freshUser = data.user || null;
        const freshTasks = Array.isArray(freshUser?.metadata?.assign_new_tasks) ? freshUser.metadata.assign_new_tasks : [];
        accountProfile.metadata = accountMetadata();
        accountProfile.metadata.assign_new_tasks = freshTasks;
        accountNewTaskRows = freshTasks;
        return freshUser;
      } catch (error) {
        return null;
      }
    }

    function setAccountAssignNewTasks(tasks) {
      accountProfile.metadata = accountMetadata();
      accountProfile.metadata.assign_new_tasks = Array.isArray(tasks) ? tasks : [];
      accountNewTaskRows = accountProfile.metadata.assign_new_tasks;
    }

    function clearAccountTaskForm() {
      for (const id of ['accountTaskFullName', 'accountTaskEmail', 'accountTaskPhone', 'accountTaskAdvertisement', 'accountTaskProblem']) {
        const el = document.getElementById(id);
        if (el) el.value = '';
      }
    }

    function toggleAccountTaskForm(force) {
      const form = document.getElementById('accountTaskForm');
      const button = document.getElementById('accountTaskToggleBtn');
      if (!form || !button) return;
      const open = typeof force === 'boolean' ? force : form.style.display === 'none' || !form.style.display;
      form.style.display = open ? 'block' : 'none';
      button.textContent = open ? 'Close' : '+ Add New';
      if (!open) clearAccountTaskForm();
    }

    async function persistAccountNewTasks(tasks) {
      if (!accountProfile?.id) return;
      const metadata = accountMetadata();
      metadata.assign_new_tasks = tasks;
      const patch = {
        name: accountProfile.name || metadata.full_name || '',
        email: accountProfile.email || metadata.email || '',
        mobile: accountProfile.mobile || metadata.mobile || '',
        metadata
      };
      const data = await apiFetch('/api/users/' + encodeURIComponent(accountProfile.id), {
        method: 'PUT',
        body: JSON.stringify(patch)
      });
      const updated = data.user || accountProfile;
      accountRows = accountRows.map(user => String(user.id) === String(updated.id) ? { ...user, ...updated } : user);
      accountProfile = clone(updated);
      accountProfileSnapshot = clone(updated);
      return updated;
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
        await Promise.all([loadRecords(false), loadOverview(), loadAccountTaskList().catch(() => null)]);
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

    function syncAccountTaskTabVisibility() {
      const tabBtn = document.getElementById('accountTabBtnTask');
      const assignTabBtn = document.getElementById('accountTabBtnAssignNewTask');
      const tabPanel = document.getElementById('accountTabTask');
<<<<<<< HEAD
      const assignTabPanel = document.getElementById('accountTabAssignNewTask');
      const showTasks = String(accountProfile?.role || '').toLowerCase() === 'executor';
=======
      const accountRole = String(accountProfile?.role || '').toLowerCase();
      const showTasks = accountRole === 'executor' || accountRole === 'admin';
>>>>>>> e2609fc (modify setting)
      if (tabBtn) tabBtn.style.display = showTasks ? 'inline-flex' : 'none';
      if (assignTabBtn) assignTabBtn.style.display = showTasks ? 'inline-flex' : 'none';
      if (!showTasks && tabPanel) tabPanel.classList.remove('active');
      if (!showTasks && assignTabPanel) assignTabPanel.classList.remove('active');
      if (!showTasks && document.getElementById('accountTabBtnTask')?.classList.contains('active')) {
        switchAccountTab('personal');
      }
      if (!showTasks && document.getElementById('accountTabBtnAssignNewTask')?.classList.contains('active')) {
        switchAccountTab('personal');
      }
    }

    function renderAccountTaskList(message = '') {
      const list = document.getElementById('accountTaskList');
      const count = document.getElementById('accountTaskCount');
      if (!list || !count) return;
      const accountRole = String(accountProfile?.role || '').toLowerCase();
      if (accountRole !== 'executor' && accountRole !== 'admin') {
        accountTaskRows = [];
        list.innerHTML = '<div class="empty">Task list is available only for admin and executive accounts.</div>';
        count.textContent = '0 tasks';
        return;
      }
      if (!accountTaskRows.length) {
        list.innerHTML = `<div class="empty">${esc(message || 'No assigned tasks')}</div>`;
        count.textContent = '0 tasks';
        return;
      }
      count.textContent = `${accountTaskRows.length} task${accountTaskRows.length === 1 ? '' : 's'}`;
      list.innerHTML = accountTaskRows.map((task, index) => {
        const assignedAt = task.assigned_at ? formatDateTime(task.assigned_at) : '-';
        const status = String(task.task_status || 'Pending').trim() || 'Pending';
        const statusClass = /^(completed|handled)$/i.test(status) ? 'updated' : 'pending';
        const instruction = String(task.admin_instruction || '').trim();
        const detail = [task.stage || 'Task', instruction].filter(Boolean).join(' | ');
        const contact = [task.mobile ? `Mobile: ${task.mobile}` : '', task.email ? `Email: ${task.email}` : ''].filter(Boolean).join(' | ') || '-';
        return `<div class="history-item account-task-item">
          <div class="account-task-main" title="${attr(detail)}">
            <b title="${attr(task.name || '-')}">#${esc(task.row_number || index + 1)} ${esc(task.name || '-')}</b>
            <div class="muted">${esc(detail)}</div>
          </div>
<<<<<<< HEAD
          <div class="muted">${esc(task.stage || 'Task')}</div>
          <div class="muted">Assigned at: ${esc(assignedAt)}</div>
          ${task.mobile ? `<div class="muted">Mobile: ${esc(task.mobile)}</div>` : ''}
          <div class="muted">Email: ${esc(task.email || '-')}</div>
          ${instruction ? `<div class="muted">${esc(instruction)}</div>` : ''}
=======
          <div class="muted account-task-date" title="${attr(assignedAt)}">Assigned at: ${esc(assignedAt)}</div>
          <div class="muted account-task-contact" title="${attr(contact)}">${esc(contact)}</div>
          <div class="account-task-status"><span class="pill ${statusClass}">${esc(status)}</span></div>
>>>>>>> e2609fc (modify setting)
        </div>`;
      }).join('');
    }

    async function loadAccountTaskList() {
      const list = document.getElementById('accountTaskList');
      const count = document.getElementById('accountTaskCount');
      if (!list || !count || !accountProfile?.id) return;
      const accountRole = String(accountProfile?.role || '').toLowerCase();
      if (accountRole !== 'executor' && accountRole !== 'admin') {
        accountTaskRows = [];
        renderAccountTaskList();
        return;
      }
      list.innerHTML = '<div class="empty">Loading tasks...</div>';
      count.textContent = '...';
      try {
        const data = await apiFetch('/api/users/' + encodeURIComponent(accountProfile.id) + '/tasks');
        accountTaskRows = Array.isArray(data.tasks) ? data.tasks : [];
        renderAccountTaskList();
      } catch (error) {
        accountTaskRows = [];
        renderAccountTaskList(error.message || 'Task list failed');
      }
    }

    function renderAccountNewTaskList(message = '') {
      const list = document.getElementById('accountNewTaskList');
      const count = document.getElementById('accountNewTaskCount');
      if (!list || !count) return;
      if (String(accountProfile?.role || '').toLowerCase() !== 'executor') {
        accountNewTaskRows = [];
        list.innerHTML = '<div class="empty">Task creation is available only for executive accounts.</div>';
        count.textContent = '0 tasks';
        return;
      }
      accountNewTaskRows = accountAssignNewTasks();
      if (!accountNewTaskRows.length) {
        list.innerHTML = `<div class="empty">${esc(message || 'No new tasks added yet')}</div>`;
        count.textContent = '0 tasks';
        return;
      }
      count.textContent = `${accountNewTaskRows.length} task${accountNewTaskRows.length === 1 ? '' : 's'}`;
      list.innerHTML = accountNewTaskRows.map((task, index) => {
        const createdAt = task.created_at ? formatDateTime(task.created_at) : '-';
        return `<div class="assign-new-task-row">
          <div class="assign-new-task-cell assign-new-task-cell-primary">
            <b>#${esc(index + 1)} ${esc(task.full_name || task.name || '-')}</b>
            <div class="muted">User | ${esc(task.email || 'No email')} | ${esc(task.phone || '-')}</div>
          </div>
          <div class="assign-new-task-cell">${esc(task.advertisement || 'Advertisement')}</div>
          <div class="assign-new-task-cell">${esc(task.problem || '-')}</div>
          <div class="assign-new-task-cell">${esc(createdAt)}</div>
          <div class="assign-new-task-cell assign-new-task-cell-status">
            <span class="pill pending">New</span>
          </div>
        </div>`;
      }).join('');
    }

    async function loadAccountNewTaskList() {
      await refreshAccountAssignNewTaskData();
      renderAccountNewTaskList();
    }

    async function submitAccountTask(event) {
      event?.preventDefault?.();
      if (String(accountProfile?.role || '').toLowerCase() !== 'executor') return showToast('Task creation is only available for executive accounts');
      const fullName = String(document.getElementById('accountTaskFullName')?.value || '').trim();
      const email = String(document.getElementById('accountTaskEmail')?.value || '').trim();
      const phone = String(document.getElementById('accountTaskPhone')?.value || '').trim();
      const advertisement = String(document.getElementById('accountTaskAdvertisement')?.value || '').trim();
      const problem = String(document.getElementById('accountTaskProblem')?.value || '').trim();
      if (!fullName || !problem) return showToast('Full name and problem are required');
      const tasks = accountAssignNewTasks();
      tasks.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        full_name: fullName,
        email,
        phone,
        advertisement,
        problem,
        created_at: new Date().toISOString()
      });
      try {
        setAccountAssignNewTasks(tasks);
        await persistAccountNewTasks(tasks);
        renderAccountNewTaskList();
        clearAccountTaskForm();
        toggleAccountTaskForm(false);
        showToast('Task added');
      } catch (error) {
        showToast(error.message || 'Task save failed');
      }
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
      syncAccountTaskTabVisibility();
      accountTaskRows = [];
      renderAccountTaskList();
      loadAccountTaskList();
      renderAccountNewTaskList();
      loadAccountNewTaskList();
      toggleAccountTaskForm(false);
      updateAccountProfileAssignButtonState();
      setAccountProfileEditMode(Boolean(edit));
      updateAccountProfileDeleteButtonState();
      toggleAccountHistory(false);
      switchAccountTab('personal');
    }

    function closeAccountProfile() {
      const modal = document.getElementById('accountModal');
      const avatar = document.getElementById('accountModalAvatar');
      if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('profile-readonly');
      }
      if (avatar) avatar.src = accountAvatarSvg('Account');
      accountProfile = null;
      accountProfileSnapshot = null;
      accountProfileEditMode = false;
      accountHistoryOpen = false;
      deleteAccountTarget = null;
      accountTaskRows = [];
      accountNewTaskRows = [];
      toggleAccountTaskForm(false);
    }

    function setAccountProfileEditMode(enabled) {
      accountProfileEditMode = Boolean(enabled);
      document.getElementById('accountProfileEditBtn').style.display = accountProfileEditMode ? 'none' : 'inline-grid';
      document.getElementById('accountProfileCancelBtn').style.display = accountProfileEditMode ? 'inline-grid' : 'none';
      document.getElementById('accountProfileSaveBtn').style.display = accountProfileEditMode ? 'inline-grid' : 'none';
      updateAccountProfileDeleteButtonState();
      const uploadBtn = document.getElementById('accountUploadBtn');
      if (uploadBtn) uploadBtn.disabled = !accountProfileEditMode;
      for (const el of document.querySelectorAll('#accountModal input, #accountModal select, #accountModal textarea')) {
        if (el.id === 'accountProfileExecutive' || el.id === 'accountAssignInstruction') continue;
        if (el.closest('#accountTaskForm')) continue;
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
      syncAccountTaskTabVisibility();
      renderAccountNewTaskList();
      toggleAccountTaskForm(false);
    }

    function updateAccountProfileDeleteButtonState() {
      const btn = document.getElementById('accountProfileDeleteBtn');
      if (!btn) return;
      const canDelete = currentUser?.role === 'admin' && Boolean(accountProfile?.id) && !accountProfileEditMode;
      btn.style.display = canDelete ? 'inline-grid' : 'none';
      btn.disabled = !canDelete;
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
      syncAccountTaskTabVisibility();
      renderAccountTaskList();
      renderAccountNewTaskList();
      updateAccountProfileAssignButtonState();
      toggleAccountTaskForm(false);
      setAccountProfileEditMode(false);
      switchAccountTab('personal');
    }

    function switchAccountTab(tab) {
      const tabKey = String(tab || '').toLowerCase() === 'assignnewtask' ? 'AssignNewTask' : tab[0].toUpperCase() + tab.slice(1);
      for (const el of document.querySelectorAll('#accountModal .tab-panel')) el.classList.remove('active');
      for (const el of document.querySelectorAll('#accountModal .tab-btn')) el.classList.remove('active');
      document.getElementById('accountTab' + tabKey).classList.add('active');
      document.getElementById('accountTabBtn' + tabKey).classList.add('active');
      if (tabKey === 'AssignNewTask') loadAccountNewTaskList();
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
        syncAccountTaskTabVisibility();
        renderAccountTaskList();
        renderAccountNewTaskList();
        await loadAccountTaskList().catch(() => null);
        await loadAccountNewTaskList().catch(() => null);
        setAccountProfileEditMode(false);
        renderUsers();
        if (currentUser && String(currentUser.id) === String(updated.id)) {
          currentUser = { ...currentUser, ...updated };
          if (typeof writeSession === 'function') writeSession(token, currentUser);
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
      if (!drawer || !backdrop) return;
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
