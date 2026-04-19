// ─── DOM refs ────────────────────────────────────────────────────────────────
const loginBtn          = document.getElementById('loginBtn');
const emailInput        = document.getElementById('email');
const passwordInput     = document.getElementById('password');
const statusEl          = document.getElementById('status');
const loginSection      = document.getElementById('loginSection');
const dashboardSection  = document.getElementById('dashboard');
const logoutBtn         = document.getElementById('logoutBtn');
const newEmployeeBtn    = document.getElementById('newEmployeeBtn');
const syncSalaxyBtn     = document.getElementById('syncSalaxyBtn');
const employeesTableBody = document.querySelector('#employeesTable tbody');
const employeeForm      = document.getElementById('employeeForm');
const formTitle         = document.getElementById('formTitle');
const employeeName      = document.getElementById('employeeName');
const employeePin       = document.getElementById('employeePin');
const employeeSsn       = document.getElementById('employeeSsn');
const employeeEmploymentId = document.getElementById('employeeEmploymentId');
const saveEmployeeBtn   = document.getElementById('saveEmployeeBtn');
const cancelEmployeeBtn = document.getElementById('cancelEmployeeBtn');
const employeeLang      = document.getElementById('employeeLang');
const pinResetModal     = document.getElementById('pinResetModal');
const closePinModalBtn  = document.getElementById('closePinModalBtn');
const copyPinBtn        = document.getElementById('copyPinBtn');
const resetEmployeeName = document.getElementById('resetEmployeeName');
const newPinDisplay     = document.getElementById('newPin');
const exportPayrollBtn  = document.getElementById('exportPayrollBtn');
const supervisorsSection = document.getElementById('supervisorsSection');
const supervisorsTbody  = document.getElementById('supervisorsTbody');
const addSupervisorBtn  = document.getElementById('addSupervisorBtn');

let editingEmployeeId = null;
let currentEmployees  = [];
let currentSupervisors = [];
let approvalsEnabled  = false;
let currentAdminId    = null;

const syncSlug       = window.location.pathname.split('/').filter(Boolean)[0] || 'default';
const syncStorageKey = `lastSync_${syncSlug}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDateTime(iso) {
  const d      = new Date(iso);
  const locale = i18n.t('locale.date_locale');
  const at     = i18n.t('time.at');
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ', ' + at + ' ' +
    d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-');
  return `${d}.${m}.${y}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#E01541' : '#5E7682';
}

function generateRandomPin() {
  return String(Math.floor(Math.random() * 1000000)).padStart(4, '0');
}

// ─── Language bar ─────────────────────────────────────────────────────────────
function renderAdminLangBar(adminId, adminEffectiveLang, companyLang) {
  const langBar = document.getElementById('langBar');
  const companyContainer = document.getElementById('companyLangContainer');
  const adminContainer   = document.getElementById('adminLangContainer');

  companyContainer.innerHTML = i18n.buildLangSelect(companyLang, 'company', null);
  adminContainer.innerHTML   = i18n.buildLangSelect(adminEffectiveLang, 'admin', adminId);

  langBar.classList.remove('hidden');

  companyContainer.querySelector('select').addEventListener('change', async (e) => {
    const ok = await switchUserLang(e.target.value, 'company', null);
    if (ok) { i18n.applyToDOM(); renderEmployees(currentEmployees); renderSupervisors(currentSupervisors); }
  });

  adminContainer.querySelector('select').addEventListener('change', async (e) => {
    const ok = await switchUserLang(e.target.value, 'admin', adminId);
    if (ok) { i18n.applyToDOM(); renderEmployees(currentEmployees); renderSupervisors(currentSupervisors); }
  });
}

// ─── Sync status ─────────────────────────────────────────────────────────────
function renderSyncInfo(data) {
  const el = document.getElementById('lastSyncInfo');
  if (!data) { el.textContent = i18n.t('admin.no_sync_yet'); return; }
  if (!data.success) {
    el.textContent = i18n.t('admin.sync_failed') + ' ' + fmtDateTime(data.timestamp);
    return;
  }
  const parts = [];
  if (data.added   > 0) parts.push(i18n.t('admin.sync_added',   { count: data.added }));
  if (data.updated > 0) parts.push(i18n.t('admin.sync_updated', { count: data.updated }));
  if (parts.length === 0) parts.push(i18n.t('admin.sync_no_changes'));
  const summary = parts.length > 1
    ? parts[0] + ' ' + i18n.t('admin.sync_and') + ' ' + parts[1]
    : parts[0];
  el.textContent = i18n.t('admin.sync_status', { date: fmtDateTime(data.timestamp), summary });
}
function loadSyncStatus() {
  try { renderSyncInfo(JSON.parse(localStorage.getItem(syncStorageKey))); } catch { renderSyncInfo(null); }
}
function saveSyncStatus(added, updated) {
  const d = { success: true, timestamp: new Date().toISOString(), added, updated };
  localStorage.setItem(syncStorageKey, JSON.stringify(d)); renderSyncInfo(d);
}
function saveSyncError(msg) {
  const d = { success: false, timestamp: new Date().toISOString(), error: msg };
  localStorage.setItem(syncStorageKey, JSON.stringify(d)); renderSyncInfo(d);
}

// ─── Employees ────────────────────────────────────────────────────────────────
function renderEmployees(employees) {
  employeesTableBody.innerHTML = '';
  currentEmployees = employees;
  if (employees.length === 0) {
    employeesTableBody.innerHTML = `<tr><td colspan="6">${i18n.t('admin.no_employees')}</td></tr>`;
    return;
  }
  for (const emp of employees) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="active-checkbox" data-id="${emp.id}"
          ${emp.active ? 'checked' : ''}
          style="width:1.1rem;height:1.1rem;accent-color:#3C1EEB;cursor:pointer;" />
      </td>
      <td>
        ${escapeHtml(emp.name)}
        ${parseFloat(emp.pending_hours) > 0 ? `<span style="margin-left:0.5rem;background:#FEF0E0;color:#C45800;border-radius:4px;padding:0.1rem 0.4rem;font-size:0.72rem;font-weight:600;white-space:nowrap;">▲ ${parseFloat(emp.pending_hours).toFixed(1)}h ${i18n.t('admin.hours_pending')}</span>` : ''}
      </td>
      <td><code>${escapeHtml(emp.pin)}</code></td>
      <td>${escapeHtml(emp.ssn || '')}</td>
      <td>${escapeHtml(emp.employmentId || '')}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-id="${emp.id}">${i18n.t('common.edit')}</button>
          <button class="action-btn reset-pin-btn" data-id="${emp.id}" data-name="${escapeHtml(emp.name)}">${i18n.t('admin.reset_pin')}</button>
          <button class="action-btn entries-btn" data-id="${emp.id}" data-name="${escapeHtml(emp.name)}">${i18n.t('admin.view_entries')}</button>
        </div>
      </td>`;
    employeesTableBody.appendChild(row);
  }
  attachEmployeeActions();
}

function attachEmployeeActions() {
  document.querySelectorAll('.active-checkbox').forEach(cb => {
    cb.addEventListener('change', async () => {
      const emp = currentEmployees.find(e => String(e.id) === cb.getAttribute('data-id'));
      if (!emp) return;
      cb.disabled = true;
      try {
        const res    = await fetch('/api/employees.php', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: emp.id, name: emp.name, pin: emp.pin,
            ssn: emp.ssn || '', employmentId: emp.employmentId || '', active: cb.checked ? 1 : 0 }),
        });
        const result = await res.json();
        if (!res.ok || !result.success) { showStatus(result.error || i18n.t('admin.error_status_change'), true); cb.checked = !cb.checked; }
        else emp.active = cb.checked ? 1 : 0;
      } catch { showStatus(i18n.t('common.server_error'), true); cb.checked = !cb.checked; }
      finally { cb.disabled = false; }
    });
  });

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emp = currentEmployees.find(e => String(e.id) === btn.getAttribute('data-id'));
      if (emp) openEmployeeForm(emp);
    });
  });

  document.querySelectorAll('.reset-pin-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const employeeId   = btn.getAttribute('data-id');
      const employeeName = btn.getAttribute('data-name');
      const newPin       = generateRandomPin();
      try {
        const res    = await fetch('/api/employees.php', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: employeeId, pin: newPin }),
        });
        const result = await res.json();
        if (!res.ok || !result.success) { showStatus(result.error || i18n.t('admin.error_pin_reset_failed'), true); return; }
        resetEmployeeName.textContent = employeeName;
        newPinDisplay.textContent     = newPin;
        pinResetModal.classList.add('visible');
        await loadEmployees();
      } catch { showStatus(i18n.t('admin.error_pin_reset_server'), true); }
    });
  });

  document.querySelectorAll('.entries-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      openEntriesModal(Number(btn.getAttribute('data-id')), btn.getAttribute('data-name'));
    });
  });

}

function resetForm() {
  editingEmployeeId = null;
  formTitle.textContent = i18n.t('admin.add_employee_title');
  employeeName.value = ''; employeePin.value = '';
  employeeSsn.value = ''; employeeEmploymentId.value = '';
  employeeLang.value = '';
  employeeForm.classList.add('hidden');
}

function openEmployeeForm(emp = null) {
  if (emp) {
    editingEmployeeId      = emp.id;
    formTitle.textContent  = i18n.t('admin.edit_employee_title');
    employeeName.value     = emp.name;
    employeePin.value      = emp.pin;
    employeeSsn.value      = emp.ssn || '';
    employeeEmploymentId.value = emp.employmentId || '';
    employeeLang.value     = emp.ui_language || '';
  } else {
    resetForm();
  }
  employeeForm.classList.remove('hidden');
}

async function loadEmployees() {
  try {
    const res    = await fetch('/api/employees.php');
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || i18n.t('common.load_failed'), true); return; }
    renderEmployees(result.employees || []);
  } catch { showStatus(i18n.t('common.server_error'), true); }
}

async function saveEmployee() {
  const name         = employeeName.value.trim();
  const pin          = employeePin.value.trim();
  const ssn          = employeeSsn.value.trim();
  const employmentId = employeeEmploymentId.value.trim();
  if (!name || !pin) { showStatus(i18n.t('admin.error_name_pin_required'), true); return; }

  const existing = editingEmployeeId
    ? currentEmployees.find(e => String(e.id) === String(editingEmployeeId))
    : null;
  const active = existing ? (existing.active ? 1 : 0) : 1;

  saveEmployeeBtn.disabled = true;
  showStatus(i18n.t('common.saving'));
  try {
    const payload = { name, pin, ssn, employmentId, active, ui_language: employeeLang.value };
    if (editingEmployeeId) payload.id = editingEmployeeId;
    const res    = await fetch('/api/employees.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || i18n.t('common.save_failed'), true); return; }
    showStatus(i18n.t('common.saved'));
    resetForm();
    await loadEmployees();
  } catch { showStatus(i18n.t('common.server_error'), true); }
  finally { saveEmployeeBtn.disabled = false; }
}

// ─── Entries modal ────────────────────────────────────────────────────────────
const entriesModal      = document.getElementById('entriesModal');
const entriesModalTitle = document.getElementById('entriesModalTitle');
const entriesTbody      = document.getElementById('entriesTbody');
const entriesGrouping   = document.getElementById('entriesGrouping');
const approveSelectedBtn = document.getElementById('approveSelectedBtn');
const rejectSelectedBtn  = document.getElementById('rejectSelectedBtn');
const selectAllEntries   = document.getElementById('selectAllEntries');
let   currentEntriesEmployeeId = null;

function statusLabel(status) {
  const map = {
    pending:   `<span style="color:#7D95A1">${i18n.t('status.pending')}</span>`,
    approved:  `<span style="color:#0E9537;font-weight:600">${i18n.t('status.approved')}</span>`,
    rejected:  `<span style="color:#E01541;font-weight:600">${i18n.t('status.rejected')}</span>`,
    clarified: `<span style="color:#F25A02;font-weight:600">${i18n.t('status.clarified')}</span>`,
  };
  return map[status] || status;
}

function renderEntries(entries, grouping) {
  if (!entries.length) {
    entriesTbody.innerHTML = `<tr><td colspan="7" style="color:#7D95A1;padding:1rem 0.75rem">${i18n.t('common.no_entries')}</td></tr>`;
    return;
  }

  const grouped = {};
  entries.forEach(e => {
    let key;
    const d = e.entry_date;
    if      (grouping === 'day')   key = d;
    else if (grouping === 'week') {
      const dt = new Date(d); const day = dt.getDay() || 7;
      const mon = new Date(dt); mon.setDate(dt.getDate() - (day - 1));
      key = i18n.t('time.week_label') + ' ' + mon.toLocaleDateString(i18n.t('locale.date_locale'), { day: '2-digit', month: '2-digit' });
    }
    else if (grouping === 'month') key = d.slice(0, 7);
    else                           key = d.slice(0, 4);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(e);
  });

  let html = '';
  for (const [group, rows] of Object.entries(grouped)) {
    const totH  = rows.reduce((s, r) => s + (parseFloat(r.hours) || 0), 0);
    const totKm = rows.reduce((s, r) => s + (parseFloat(r.km)    || 0), 0);
    html += `<tr style="background:#F3F0F0;">
      <td colspan="7" style="padding:0.375rem 0.75rem;font-size:0.75rem;font-weight:600;color:#5E7682;letter-spacing:0.04em;text-transform:uppercase;">
        ${escapeHtml(group)} — ${totH.toFixed(1)}h${totKm > 0 ? ' / ' + totKm + ' km' : ''}
      </td></tr>`;
    rows.forEach(e => {
      const clarHtml = e.employee_clarification
        ? `<div style="margin-top:0.25rem;font-size:0.75rem;color:#F25A02;border-left:2px solid #F25A02;padding-left:0.4rem">${i18n.t('entries.clarification_label')} ${escapeHtml(e.employee_clarification)}</div>`
        : '';
      const rejHtml = e.rejection_note
        ? `<div style="margin-top:0.25rem;font-size:0.75rem;color:#E01541;border-left:2px solid #E01541;padding-left:0.4rem">${i18n.t('entries.rejection_reason_label')} ${escapeHtml(e.rejection_note)}</div>`
        : '';
      html += `<tr data-entry-id="${e.id}">
        <td style="text-align:center;"><input type="checkbox" class="entry-checkbox" data-id="${e.id}" style="accent-color:#3C1EEB;width:1rem;height:1rem;"></td>
        <td>${fmtDate(e.entry_date)}</td>
        <td>${escapeHtml(e.start_time || '')}${e.end_time ? '–' + escapeHtml(e.end_time) : ''}</td>
        <td>${parseFloat(e.hours).toFixed(1)}h${parseFloat(e.km) > 0 ? ' / ' + e.km + ' km' : ''}</td>
        <td>${escapeHtml(e.project || '')}${e.comment ? '<br><span style="color:#7D95A1;font-size:0.75rem">' + escapeHtml(e.comment) + '</span>' : ''}</td>
        <td>${statusLabel(e.status)}${clarHtml}${rejHtml}${e.exported_to_salaxy ? `<div style="margin-top:0.25rem;font-size:0.72rem;color:#3C1EEB;">${i18n.t('entries.exported_on')} ${fmtDateTime(e.exported_at)}</div>` : ''}</td>
        <td>
          <div style="display:flex;gap:0.25rem;">
            <button class="action-btn approve-btn" data-id="${e.id}" style="color:#0E9537;border-color:#A7E3B5;">✓</button>
            <button class="action-btn reject-btn"  data-id="${e.id}" style="color:#E01541;border-color:#F5AABB;">✗</button>
          </div>
        </td></tr>`;
    });
  }
  entriesTbody.innerHTML = html;

  entriesTbody.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => reviewEntries([Number(btn.dataset.id)], 'approve'));
  });
  entriesTbody.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => openRejectDialog([Number(btn.dataset.id)]));
  });
}

async function openEntriesModal(employeeId, empName) {
  currentEntriesEmployeeId      = employeeId;
  entriesModalTitle.textContent = i18n.t('entries.modal_title', { name: empName });
  entriesTbody.innerHTML        = `<tr><td colspan="7" style="color:#7D95A1;padding:1rem">${i18n.t('common.loading')}</td></tr>`;
  entriesModal.classList.add('visible');
  await refreshEntries();
}

async function refreshEntries() {
  if (!currentEntriesEmployeeId) return;
  try {
    const res    = await fetch(`/api/time_entries.php?employee_id=${currentEntriesEmployeeId}`);
    const result = await res.json();
    if (!res.ok || !result.success) { entriesTbody.innerHTML = `<tr><td colspan="7">${i18n.t('common.error')}</td></tr>`; return; }
    renderEntries(result.entries || [], entriesGrouping.value);
  } catch { entriesTbody.innerHTML = `<tr><td colspan="7">${i18n.t('common.error')}</td></tr>`; }
}

async function reviewEntries(ids, action, rejectionNote = '') {
  try {
    const res    = await fetch('/api/review_entries.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action, rejection_note: rejectionNote }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || i18n.t('common.error'), true); return; }
    await refreshEntries();
  } catch { showStatus(i18n.t('common.server_error'), true); }
}

// Reject dialog (inline)
const rejectDialog     = document.getElementById('rejectDialog');
const rejectNoteInput  = document.getElementById('rejectNoteInput');
const confirmRejectBtn = document.getElementById('confirmRejectBtn');
const cancelRejectBtn  = document.getElementById('cancelRejectBtn');
let pendingRejectIds = [];

function openRejectDialog(ids) {
  pendingRejectIds = ids;
  rejectNoteInput.value = '';
  rejectDialog.classList.remove('hidden');
  rejectNoteInput.focus();
}

confirmRejectBtn.addEventListener('click', async () => {
  rejectDialog.classList.add('hidden');
  await reviewEntries(pendingRejectIds, 'reject', rejectNoteInput.value.trim());
});
cancelRejectBtn.addEventListener('click', () => rejectDialog.classList.add('hidden'));

selectAllEntries.addEventListener('change', () => {
  document.querySelectorAll('.entry-checkbox').forEach(cb => cb.checked = selectAllEntries.checked);
});

approveSelectedBtn.addEventListener('click', async () => {
  const ids = [...document.querySelectorAll('.entry-checkbox:checked')].map(cb => Number(cb.dataset.id));
  if (!ids.length) return;
  await reviewEntries(ids, 'approve');
});

rejectSelectedBtn.addEventListener('click', () => {
  const ids = [...document.querySelectorAll('.entry-checkbox:checked')].map(cb => Number(cb.dataset.id));
  if (!ids.length) return;
  openRejectDialog(ids);
});

entriesGrouping.addEventListener('change', refreshEntries);

document.getElementById('closeEntriesModal').addEventListener('click', () => {
  entriesModal.classList.remove('visible');
  currentEntriesEmployeeId = null;
});

// ─── Supervisors ──────────────────────────────────────────────────────────────
function renderSupervisors(supervisors) {
  currentSupervisors = supervisors;
  if (!supervisors.length) {
    supervisorsTbody.innerHTML = `<tr><td colspan="5" style="color:#7D95A1;padding:1rem 0.75rem">${i18n.t('admin.no_supervisors')}</td></tr>`;
    return;
  }
  supervisorsTbody.innerHTML = supervisors.map(s => `
    <tr>
      <td>${escapeHtml(s.first_name)} ${escapeHtml(s.last_name)}</td>
      <td>${escapeHtml(s.email)}</td>
      <td>${escapeHtml(s.phone)}</td>
      <td><code>${escapeHtml(s.pin)}</code></td>
      <td>
        <div style="display:flex;gap:0.375rem;">
          <button class="action-btn sup-team-btn" data-id="${s.id}" data-name="${escapeHtml(s.first_name + ' ' + s.last_name)}">
            ${i18n.t('supervisor.team_button', { count: s.team_size })}
          </button>
          <button class="action-btn sup-edit-btn" data-id="${s.id}">${i18n.t('common.edit')}</button>
          <button class="action-btn sup-del-btn" data-id="${s.id}" style="color:#E01541;border-color:#F5AABB;">${i18n.t('common.delete')}</button>
        </div>
      </td>
    </tr>`).join('');

  supervisorsTbody.querySelectorAll('.sup-team-btn').forEach(btn => {
    btn.addEventListener('click', () => openTeamModal(Number(btn.dataset.id), btn.dataset.name));
  });
  supervisorsTbody.querySelectorAll('.sup-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const s = currentSupervisors.find(x => String(x.id) === btn.dataset.id);
      if (s) openSupervisorModal(s);
    });
  });
  supervisorsTbody.querySelectorAll('.sup-del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(i18n.t('admin.confirm_delete_supervisor'))) return;
      const res = await fetch('/api/supervisors.php', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(btn.dataset.id) }),
      });
      const result = await res.json();
      if (result.success) await loadSupervisors();
      else showStatus(result.error || i18n.t('admin.delete_failed'), true);
    });
  });

}

async function loadSupervisors() {
  try {
    const res    = await fetch('/api/supervisors.php');
    const result = await res.json();
    if (result.success) renderSupervisors(result.supervisors || []);
  } catch { /* silent */ }
}

// Supervisor modal
const supervisorModal      = document.getElementById('supervisorModal');
const supModalTitle        = document.getElementById('supModalTitle');
const supFirstName         = document.getElementById('supFirstName');
const supLastName          = document.getElementById('supLastName');
const supEmail             = document.getElementById('supEmail');
const supPhone             = document.getElementById('supPhone');
const supPin               = document.getElementById('supPin');
const supSsn               = document.getElementById('supSsn');
const supSalaxyId          = document.getElementById('supSalaxyId');
const supLang              = document.getElementById('supLang');
const saveSupervisorBtn    = document.getElementById('saveSupervisorBtn');
const closeSupervisorModal = document.getElementById('closeSupervisorModal');
let editingSupervisorId = null;

function openSupervisorModal(sup = null) {
  editingSupervisorId    = sup ? sup.id : null;
  supModalTitle.textContent = sup ? i18n.t('admin.edit_supervisor_title') : i18n.t('admin.add_supervisor_title');
  supFirstName.value = sup?.first_name  || '';
  supLastName.value  = sup?.last_name   || '';
  supEmail.value     = sup?.email       || '';
  supPhone.value     = sup?.phone       || '';
  supPin.value       = sup?.pin         || '';
  supSsn.value       = sup?.ssn         || '';
  supSalaxyId.value  = sup?.salaxy_id   || '';
  supLang.value      = sup?.ui_language || '';
  supervisorModal.classList.add('visible');
  supFirstName.focus();
}

closeSupervisorModal.addEventListener('click', () => supervisorModal.classList.remove('visible'));

saveSupervisorBtn.addEventListener('click', async () => {
  const payload = {
    first_name:  supFirstName.value.trim(),
    last_name:   supLastName.value.trim(),
    email:       supEmail.value.trim(),
    phone:       supPhone.value.trim(),
    pin:         supPin.value.trim(),
    ssn:         supSsn.value.trim(),
    salaxy_id:   supSalaxyId.value.trim(),
    ui_language: supLang.value,
  };
  if (editingSupervisorId) payload.id = editingSupervisorId;

  saveSupervisorBtn.disabled = true;
  try {
    const res    = await fetch('/api/supervisors.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || i18n.t('common.save_failed'), true); return; }
    supervisorModal.classList.remove('visible');
    await loadSupervisors();
    showStatus(i18n.t('admin.supervisor_saved'));
  } catch { showStatus(i18n.t('common.server_error'), true); }
  finally { saveSupervisorBtn.disabled = false; }
});

addSupervisorBtn.addEventListener('click', () => openSupervisorModal());

// Team modal
const teamModal      = document.getElementById('teamModal');
const teamModalTitle = document.getElementById('teamModalTitle');
const teamList       = document.getElementById('teamList');
const saveTeamBtn    = document.getElementById('saveTeamBtn');
const closeTeamModal = document.getElementById('closeTeamModal');
let   teamSupervisorId = null;

async function openTeamModal(supervisorId, supervisorName) {
  teamSupervisorId           = supervisorId;
  teamModalTitle.textContent = i18n.t('admin.team_modal_title', { name: supervisorName });
  teamList.innerHTML         = `<div style="color:#7D95A1;padding:0.5rem">${i18n.t('common.loading')}</div>`;
  teamModal.classList.add('visible');

  const res    = await fetch(`/api/supervisor_team.php?supervisor_id=${supervisorId}`);
  const result = await res.json();
  if (!result.success) { teamList.innerHTML = `<div style="color:#E01541">${i18n.t('common.error')}</div>`; return; }

  teamList.innerHTML = result.employees.map(e => `
    <label style="display:flex;align-items:baseline;gap:0.5rem;padding:0.375rem 0;border-bottom:1px solid #F3F0F0;cursor:pointer;">
      <input type="checkbox" value="${e.id}" ${e.in_team ? 'checked' : ''}
        style="accent-color:#3C1EEB;width:1rem;height:1rem;flex-shrink:0;margin-top:0.1rem;">
      <span>${escapeHtml(e.name)}${e.other_supervisors ? `<span style="color:#7D95A1;font-size:0.75rem;margin-left:0.375rem">${i18n.t('admin.also')} ${escapeHtml(e.other_supervisors)}</span>` : ''}</span>
    </label>`).join('');
}

closeTeamModal.addEventListener('click', () => teamModal.classList.remove('visible'));

saveTeamBtn.addEventListener('click', async () => {
  const ids = [...teamList.querySelectorAll('input[type=checkbox]:checked')].map(cb => Number(cb.value));
  saveTeamBtn.disabled = true;
  try {
    const res    = await fetch('/api/supervisor_team.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supervisor_id: teamSupervisorId, employee_ids: ids }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || i18n.t('admin.team_save_failed'), true); return; }
    teamModal.classList.remove('visible');
    await loadSupervisors();
    showStatus(i18n.t('admin.team_saved'));
  } catch { showStatus(i18n.t('common.server_error'), true); }
  finally { saveTeamBtn.disabled = false; }
});

// ─── Payroll export modal ─────────────────────────────────────────────────────
const payrollModal        = document.getElementById('payrollModal');
const payrollDateFrom     = document.getElementById('payrollDateFrom');
const payrollDateTo       = document.getElementById('payrollDateTo');
const payrollPreviewBtn   = document.getElementById('payrollPreviewBtn');
const payrollPreview      = document.getElementById('payrollPreview');
const exportToSalaxy      = document.getElementById('exportToSalaxy');
const forceExportToSalaxy = document.getElementById('forceExportToSalaxy');
const closePayrollModal   = document.getElementById('closePayrollModal');
let   payrollPreviewData  = [];

function hideExportBtns() {
  exportToSalaxy.classList.add('hidden');
  forceExportToSalaxy.classList.add('hidden');
}

exportPayrollBtn.addEventListener('click', () => {
  const today = new Date(); const from = new Date(); from.setDate(today.getDate() - 14);
  payrollDateFrom.value = from.toISOString().split('T')[0];
  payrollDateTo.value   = today.toISOString().split('T')[0];
  payrollPreview.innerHTML = '';
  hideExportBtns();
  payrollModal.classList.add('visible');
});

closePayrollModal.addEventListener('click', () => payrollModal.classList.remove('visible'));

payrollPreviewBtn.addEventListener('click', async () => {
  const from = payrollDateFrom.value; const to = payrollDateTo.value;
  if (!from || !to) { showStatus(i18n.t('payroll.error_select_period'), true); return; }

  payrollPreviewBtn.disabled = true;
  payrollPreview.innerHTML   = `<div style="color:#7D95A1;padding:0.5rem">${i18n.t('common.loading')}</div>`;
  hideExportBtns();

  try {
    const res    = await fetch(`/api/export_payroll.php?date_from=${from}&date_to=${to}`);
    const result = await res.json();
    if (!res.ok || !result.success) { payrollPreview.innerHTML = `<div style="color:#E01541">${result.error || i18n.t('common.error')}</div>`; return; }

    const periods = result.periods || [];
    if (!periods.length) {
      payrollPreview.innerHTML = `<div style="color:#7D95A1;padding:0.5rem">${i18n.t('payroll.no_approved')}</div>`;
      return;
    }
    payrollPreviewData = periods.flatMap(p => p.employees);

    payrollPreview.innerHTML = periods.map(period => `
      <div style="margin-bottom:1rem;">
        <div style="font-weight:600;font-size:0.85rem;color:#3C1EEB;padding:0.4rem 0.25rem 0.3rem;">
          ${escapeHtml(period.period_label)}
          ${period.existing_payroll_id
            ? `<span style="font-weight:400;color:#7D95A1;margin-left:0.5rem;">${i18n.t('payroll.existing_payroll')}</span>`
            : `<span style="font-weight:400;color:#7D95A1;margin-left:0.5rem;">${i18n.t('payroll.new_payroll')}</span>`}
        </div>
        ${period.employees.map(emp => {
          const hasPending = emp.pending_hours > 0 || emp.pending_km > 0;
          return `
        <div style="margin-bottom:0.5rem;border:1px solid #C4CFD4;border-radius:6px;overflow:hidden;">
          <div style="background:#F3F0F0;padding:0.5rem 0.75rem;display:flex;align-items:center;gap:0.625rem;">
            ${hasPending
              ? `<input type="checkbox" class="export-emp-cb" data-id="${emp.employee_id}" checked style="accent-color:#3C1EEB;width:1rem;height:1rem;">`
              : `<span style="width:1rem;height:1rem;display:inline-block;"></span>`}
            <strong>${escapeHtml(emp.employee_name)}</strong>
            <span style="color:#7D95A1;font-size:0.8rem;">${emp.total_hours.toFixed(1)}h${emp.total_km > 0 ? ' / ' + emp.total_km + ' km' : ''}</span>
            ${!hasPending ? `<span style="font-size:0.75rem;color:#0E9537;margin-left:auto;">${i18n.t('payroll.all_exported_label')}</span>` : ''}
          </div>
          <table style="width:100%;border-collapse:collapse;">
            ${emp.entries.map(e => {
              const exported = e.exported_to_salaxy == 1;
              const style = exported ? 'color:#9DB4BF;' : 'color:#5E7682;';
              return `<tr style="${exported ? 'background:#FAFAFA;' : ''}">
                <td style="padding:0.375rem 0.75rem;font-size:0.8rem;${style}border-bottom:1px solid #F3F0F0;">${fmtDate(e.entry_date)}</td>
                <td style="padding:0.375rem 0.75rem;font-size:0.8rem;${style}border-bottom:1px solid #F3F0F0;">${escapeHtml(e.project || '')}</td>
                <td style="padding:0.375rem 0.75rem;font-size:0.8rem;${style}border-bottom:1px solid #F3F0F0;">${parseFloat(e.hours).toFixed(1)}h${parseFloat(e.km) > 0 ? ' / ' + e.km + ' km' : ''}</td>
                <td style="padding:0.375rem 0.75rem;font-size:0.75rem;border-bottom:1px solid #F3F0F0;text-align:right;">
                  ${exported ? `<span style="color:#3C1EEB;">${i18n.t('payroll.exported_on', { date: fmtDateTime(e.exported_at) })}</span>` : ''}
                </td>
              </tr>`;
            }).join('')}
          </table>
        </div>`;}).join('')}
      </div>`).join('');

    const anyPending = periods.some(p => p.employees.some(e => e.pending_hours > 0 || e.pending_km > 0));
    if (anyPending) {
      exportToSalaxy.classList.remove('hidden');
      forceExportToSalaxy.classList.add('hidden');
    } else {
      exportToSalaxy.classList.add('hidden');
      forceExportToSalaxy.classList.remove('hidden');
    }
  } catch { payrollPreview.innerHTML = `<div style="color:#E01541">${i18n.t('common.server_error')}</div>`; }
  finally { payrollPreviewBtn.disabled = false; }
});

async function doExport(force) {
  const from = payrollDateFrom.value; const to = payrollDateTo.value;
  let ids;
  if (force) {
    ids = [...new Set(payrollPreviewData.map(e => e.employee_id))];
  } else {
    ids = [...document.querySelectorAll('.export-emp-cb:checked')].map(cb => Number(cb.dataset.id));
    if (!ids.length) { showStatus(i18n.t('payroll.error_select_employee'), true); return; }
  }

  const activeBtn = force ? forceExportToSalaxy : exportToSalaxy;
  activeBtn.disabled = true;
  hideExportBtns();

  if (!document.getElementById('spin-kf')) {
    const s = document.createElement('style');
    s.id = 'spin-kf';
    s.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(s);
  }
  payrollPreview.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:2.5rem 1rem;gap:1rem;">
      <div style="width:2.25rem;height:2.25rem;border:3px solid #C4CFD4;border-top-color:#3C1EEB;border-radius:50%;animation:spin 0.75s linear infinite;"></div>
      <div style="color:#5E7682;font-size:0.875rem;">${force ? i18n.t('payroll.re_exporting') : i18n.t('payroll.exporting')}</div>
    </div>`;

  try {
    const body = { date_from: from, date_to: to, employee_ids: ids };
    if (force) body.force = true;
    const res    = await fetch('/api/export_payroll.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await res.json();
    if (!res.ok || !result.success) {
      payrollPreview.innerHTML = `
        <div style="background:#FEF2F4;border:1px solid #F5AABB;border-radius:8px;padding:1.25rem 1.5rem;">
          <div style="font-weight:700;color:#E01541;margin-bottom:0.5rem;">${i18n.t('payroll.export_failed')}</div>
          <div style="color:#5E7682;font-size:0.85rem;">${escapeHtml(result.error || i18n.t('common.unknown_error'))}</div>
          <button onclick="payrollModal.classList.remove('visible')" style="margin-top:1rem;padding:0.5rem 1.25rem;background:#3C1EEB;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;font-family:inherit;">OK</button>
        </div>`;
      hideExportBtns();
      return;
    }
    const ts = fmtDateTime(new Date().toISOString());
    const payrollLinks = (result.payrolls || []).map(p =>
      `<a href="${p.url}" target="_blank" style="color:#3C1EEB;text-decoration:underline;">${p.period_start}</a>`
    ).join(', ');
    if (result.errors > 0 || result.total_sent === 0) {
      const errDetails = (result.errors_detail || []).map(err =>
        `<li style="margin-bottom:0.25rem;">${escapeHtml(err.employee || '')} — ${escapeHtml(err.funcError || err.error || i18n.t('common.error'))} (HTTP ${err.createHttpCode || err.saveHttpCode || '?'})</li>`
      ).join('');
      payrollPreview.innerHTML = `
        <div style="background:#FFFBEB;border:1px solid #FCD34D;border-radius:8px;padding:1.25rem 1.5rem;">
          <div style="font-weight:700;color:#92400E;margin-bottom:0.25rem;">${i18n.t('payroll.partial_export')}</div>
          <div style="color:#5E7682;font-size:0.85rem;margin-bottom:0.5rem;">${i18n.t('payroll.export_partial_info', { sent: result.total_sent, failed: result.errors })} — ${payrollLinks || ''}</div>
          ${errDetails ? `<ul style="color:#E01541;font-size:0.8rem;margin:0.5rem 0 0 1rem;padding:0;">${errDetails}</ul>` : ''}
          <button onclick="payrollModal.classList.remove('visible')" style="margin-top:1rem;padding:0.5rem 1.25rem;background:#3C1EEB;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;font-family:inherit;">OK</button>
        </div>`;
      hideExportBtns();
      loadEntries();
      return;
    }
    const totalAdded   = result.total_added   ?? result.total_sent;
    const totalAlready = result.total_already ?? 0;
    const countLine = (force && totalAlready > 0)
      ? `${totalAdded} ${i18n.t('salaxy.entries_added', { count: '' }).trim()}, ${totalAlready} — ${payrollLinks || ''}`
      : `${result.total_sent} — ${payrollLinks || ''}`;
    payrollPreview.innerHTML = `
      <div style="background:#E8F5EC;border:1px solid #A7E3B5;border-radius:8px;padding:1.25rem 1.5rem;text-align:center;">
        <div style="font-size:1.5rem;margin-bottom:0.5rem;">✅</div>
        <div style="font-weight:700;font-size:1rem;color:#0E9537;margin-bottom:0.25rem;">${i18n.t('payroll.export_success')}</div>
        <div style="color:#5E7682;font-size:0.85rem;margin-bottom:0.5rem;">${i18n.t('entries.exported_on')} ${ts}</div>
        <div style="color:#5E7682;font-size:0.85rem;margin-bottom:1rem;">${countLine}</div>
        <button onclick="payrollModal.classList.remove('visible')" style="padding:0.5rem 1.5rem;background:#3C1EEB;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.875rem;font-family:inherit;font-weight:600;">OK</button>
      </div>`;
    hideExportBtns();
    loadEntries();
  } catch { showStatus(i18n.t('common.server_error'), true); }
  finally { activeBtn.disabled = false; }
}

exportToSalaxy.addEventListener('click', () => doExport(false));
forceExportToSalaxy.addEventListener('click', () => doExport(true));

// ─── Payroll settings ─────────────────────────────────────────────────────────
const payrollSettingsBtn         = document.getElementById('payrollSettingsBtn');
const payrollSettingsModal       = document.getElementById('payrollSettingsModal');
const savePayrollSettingsBtn     = document.getElementById('savePayrollSettingsBtn');
const closePayrollSettingsModal  = document.getElementById('closePayrollSettingsModal');
const settingsMonthly            = document.getElementById('settingsMonthly');
const settingsBiweekly           = document.getElementById('settingsBiweekly');
const monthlyPaydayEl            = document.getElementById('monthlyPayday');
const biweeklyPayday1El          = document.getElementById('biweeklyPayday1');
const biweeklyPayday2El          = document.getElementById('biweeklyPayday2');

let payrollSettings = { payroll_period: 'monthly', payday_1: 15, payday_2: 0 };

function buildDayOptions(selected) {
  let html = '';
  for (let d = 1; d <= 31; d++) {
    html += `<option value="${d}"${selected == d ? ' selected' : ''}>${i18n.t('payroll.day_of_month', { day: d })}</option>`;
  }
  html += `<option value="0"${selected == 0 ? ' selected' : ''}>${i18n.t('payroll.last_day')}</option>`;
  return html;
}

function updatePeriodVisibility() {
  const isBiweekly = document.querySelector('input[name=payrollPeriod]:checked')?.value === 'biweekly';
  settingsMonthly.classList.toggle('hidden', isBiweekly);
  settingsBiweekly.classList.toggle('hidden', !isBiweekly);
}

document.querySelectorAll('input[name=payrollPeriod]').forEach(r =>
  r.addEventListener('change', updatePeriodVisibility)
);

async function loadPayrollSettings() {
  try {
    const res    = await fetch('/api/payroll_settings.php');
    const result = await res.json();
    if (result.success && result.settings) payrollSettings = result.settings;
  } catch { /* silent */ }
}

function openPayrollSettingsModal() {
  const s = payrollSettings;
  const isBi = s.payroll_period === 'biweekly';
  document.getElementById(isBi ? 'periodBiweekly' : 'periodMonthly').checked = true;
  monthlyPaydayEl.innerHTML    = buildDayOptions(s.payday_1);
  biweeklyPayday1El.innerHTML  = buildDayOptions(s.payday_1);
  biweeklyPayday2El.innerHTML  = buildDayOptions(s.payday_2);
  updatePeriodVisibility();
  payrollSettingsModal.classList.add('visible');
}

payrollSettingsBtn.addEventListener('click', openPayrollSettingsModal);
closePayrollSettingsModal.addEventListener('click', () => payrollSettingsModal.classList.remove('visible'));

savePayrollSettingsBtn.addEventListener('click', async () => {
  const period  = document.querySelector('input[name=payrollPeriod]:checked')?.value || 'monthly';
  const payday1 = period === 'biweekly' ? Number(biweeklyPayday1El.value) : Number(monthlyPaydayEl.value);
  const payday2 = period === 'biweekly' ? Number(biweeklyPayday2El.value) : 0;

  savePayrollSettingsBtn.disabled = true;
  try {
    const res    = await fetch('/api/payroll_settings.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payroll_period: period, payday_1: payday1, payday_2: payday2 }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || i18n.t('common.save_failed'), true); return; }
    payrollSettings = { payroll_period: period, payday_1: payday1, payday_2: payday2 };
    payrollSettingsModal.classList.remove('visible');
    showStatus(i18n.t('admin.payroll_period_saved'));
  } catch { showStatus(i18n.t('common.server_error'), true); }
  finally { savePayrollSettingsBtn.disabled = false; }
});

// ─── Salaxy sync ──────────────────────────────────────────────────────────────
async function syncSalaxy() {
  syncSalaxyBtn.disabled = true;
  showStatus(i18n.t('admin.syncing'));
  try {
    const res    = await fetch('/api/sync_employees_from_salaxy.php', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const result = await res.json();
    if (!res.ok || !result.success) { saveSyncError(result.error || `HTTP ${res.status}`); showStatus(i18n.t('admin.sync_failed'), true); return; }
    saveSyncStatus(result.added ?? 0, result.updated ?? 0);
    showStatus('');
    await loadEmployees();
  } catch (e) { saveSyncError(e.message || i18n.t('common.network_error')); showStatus(i18n.t('admin.sync_failed'), true); }
  finally { syncSalaxyBtn.disabled = false; }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function logout() {
  await fetch('/api/logout.php');
  window.location.reload();
}

async function tryLogin() {
  const email    = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) { showStatus(i18n.t('login.error_missing_credentials'), true); return; }
  loginBtn.disabled = true;
  showStatus(i18n.t('login.logging_in'));
  try {
    const res    = await fetch('/api/admin_login.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || i18n.t('login.error_failed'), true); return; }

    currentAdminId = result.admin.id;
    approvalsEnabled = !!(result.company?.approvals_enabled);
    document.getElementById('adminName').textContent = result.admin.name || result.admin.email;
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    // Switch to admin's effective language
    if (result.ui_language && result.ui_language !== i18n.getLang()) {
      await i18n.load(result.ui_language);
      localStorage.setItem('company_lang_' + (syncSlug || '_'), result.ui_language);
    }

    // Render language selectors
    renderAdminLangBar(currentAdminId, result.admin.ui_language, result.company.ui_language);
    i18n.applyToDOM();

    if (approvalsEnabled) {
      supervisorsSection.classList.remove('hidden');
      exportPayrollBtn.classList.remove('hidden');
      await loadSupervisors();
    }

    showStatus('');
    loadSyncStatus();
    await Promise.all([loadEmployees(), loadPayrollSettings()]);
    syncSalaxy();
  } catch { showStatus(i18n.t('common.server_error'), true); }
  finally { loginBtn.disabled = false; }
}

// ─── Event listeners ──────────────────────────────────────────────────────────
loginBtn.addEventListener('click', tryLogin);
passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
newEmployeeBtn.addEventListener('click', () => openEmployeeForm());
syncSalaxyBtn.addEventListener('click', syncSalaxy);
saveEmployeeBtn.addEventListener('click', saveEmployee);
cancelEmployeeBtn.addEventListener('click', resetForm);
logoutBtn.addEventListener('click', logout);
closePinModalBtn.addEventListener('click', () => pinResetModal.classList.remove('visible'));
copyPinBtn.addEventListener('click', () => {
  const pin = newPinDisplay.textContent;
  navigator.clipboard.writeText(pin).then(() => {
    copyPinBtn.textContent = i18n.t('admin.pin_copied');
    setTimeout(() => { copyPinBtn.textContent = i18n.t('admin.copy_pin'); }, 2000);
  }).catch(() => alert('PIN: ' + pin));
});
