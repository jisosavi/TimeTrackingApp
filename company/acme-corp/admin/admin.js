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

const syncSlug       = window.location.pathname.split('/').filter(Boolean)[0] || 'default';
const syncStorageKey = `lastSync_${syncSlug}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtDateTime(iso) {
  const d    = new Date(iso);
  const date = d.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  return `${date}, klo ${time}`;
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

// ─── Sync status ─────────────────────────────────────────────────────────────
function renderSyncInfo(data) {
  const el = document.getElementById('lastSyncInfo');
  if (!data) { el.textContent = 'Ei vielä synkattu Salaxystä'; return; }
  if (!data.success) {
    el.textContent = `Synkronointi ei onnistunut ${fmtDateTime(data.timestamp)}, syy: ${data.error}`;
    return;
  }
  const parts = [];
  if (data.added   > 0) parts.push(`tuotu ${data.added} uusi${data.added === 1 ? '' : 'a'} työntekijä${data.added === 1 ? '' : 'ä'}`);
  if (data.updated > 0) parts.push(`muokattu ${data.updated} työntekijän tiedot`);
  if (parts.length === 0) parts.push('ei muutoksia');
  const summary = parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(' ja ');
  el.textContent = `Synkronoitu: ${fmtDateTime(data.timestamp)}. ${summary}.`;
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
    employeesTableBody.innerHTML = '<tr><td colspan="6">Ei työntekijöitä.</td></tr>';
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
      <td>${escapeHtml(emp.name)}</td>
      <td><code>${escapeHtml(emp.pin)}</code></td>
      <td>${escapeHtml(emp.ssn || '')}</td>
      <td>${escapeHtml(emp.employmentId || '')}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-id="${emp.id}">Muokkaa</button>
          <button class="action-btn reset-pin-btn" data-id="${emp.id}" data-name="${escapeHtml(emp.name)}">Vaihda PIN</button>
          <button class="action-btn entries-btn" data-id="${emp.id}" data-name="${escapeHtml(emp.name)}">Kirjaukset →</button>
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
        if (!res.ok || !result.success) { showStatus(result.error || 'Tilan vaihto epäonnistui.', true); cb.checked = !cb.checked; }
        else emp.active = cb.checked ? 1 : 0;
      } catch { showStatus('Palvelinvirhe.', true); cb.checked = !cb.checked; }
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
        if (!res.ok || !result.success) { showStatus(result.error || 'PIN-vaihto epäonnistui.', true); return; }
        resetEmployeeName.textContent = employeeName;
        newPinDisplay.textContent     = newPin;
        pinResetModal.classList.add('visible');
        await loadEmployees();
      } catch { showStatus('Palvelinvirhe PIN-vaihdossa.', true); }
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
  formTitle.textContent = 'Lisää työntekijä';
  employeeName.value = ''; employeePin.value = '';
  employeeSsn.value = ''; employeeEmploymentId.value = '';
  employeeForm.classList.add('hidden');
}

function openEmployeeForm(emp = null) {
  if (emp) {
    editingEmployeeId = emp.id;
    formTitle.textContent  = 'Muokkaa työntekijää';
    employeeName.value     = emp.name;
    employeePin.value      = emp.pin;
    employeeSsn.value      = emp.ssn || '';
    employeeEmploymentId.value = emp.employmentId || '';
  } else {
    resetForm();
  }
  employeeForm.classList.remove('hidden');
}

async function loadEmployees() {
  try {
    const res    = await fetch('/api/employees.php');
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || 'Lataus epäonnistui.', true); return; }
    renderEmployees(result.employees || []);
  } catch { showStatus('Palvelinvirhe.', true); }
}

async function saveEmployee() {
  const name         = employeeName.value.trim();
  const pin          = employeePin.value.trim();
  const ssn          = employeeSsn.value.trim();
  const employmentId = employeeEmploymentId.value.trim();
  if (!name || !pin) { showStatus('Nimi ja PIN ovat pakollisia.', true); return; }

  const existing = editingEmployeeId
    ? currentEmployees.find(e => String(e.id) === String(editingEmployeeId))
    : null;
  const active = existing ? (existing.active ? 1 : 0) : 1;

  saveEmployeeBtn.disabled = true;
  showStatus('Tallennetaan...');
  try {
    const payload = { name, pin, ssn, employmentId, active };
    if (editingEmployeeId) payload.id = editingEmployeeId;
    const res    = await fetch('/api/employees.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || 'Tallennus epäonnistui.', true); return; }
    showStatus('Tallennettu.');
    resetForm();
    await loadEmployees();
  } catch { showStatus('Palvelinvirhe.', true); }
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
    pending:   '<span style="color:#7D95A1">Odottaa</span>',
    approved:  '<span style="color:#0E9537;font-weight:600">✓ Hyväksytty</span>',
    rejected:  '<span style="color:#E01541;font-weight:600">✗ Hylätty</span>',
    clarified: '<span style="color:#F25A02;font-weight:600">↩ Selvitetty</span>',
  };
  return map[status] || status;
}

function renderEntries(entries, grouping) {
  if (!entries.length) {
    entriesTbody.innerHTML = '<tr><td colspan="7" style="color:#7D95A1;padding:1rem 0.75rem">Ei kirjauksia.</td></tr>';
    return;
  }

  // Group entries
  const grouped = {};
  entries.forEach(e => {
    let key;
    const d = e.entry_date; // YYYY-MM-DD
    if      (grouping === 'day')   key = d;
    else if (grouping === 'week') {
      const dt = new Date(d); const day = dt.getDay() || 7;
      const mon = new Date(dt); mon.setDate(dt.getDate() - (day - 1));
      key = 'Viikko ' + mon.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit' });
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
        ? `<div style="margin-top:0.25rem;font-size:0.75rem;color:#F25A02;border-left:2px solid #F25A02;padding-left:0.4rem">Selvitys: ${escapeHtml(e.employee_clarification)}</div>`
        : '';
      const rejHtml = e.rejection_note
        ? `<div style="margin-top:0.25rem;font-size:0.75rem;color:#E01541;border-left:2px solid #E01541;padding-left:0.4rem">Syy: ${escapeHtml(e.rejection_note)}</div>`
        : '';
      html += `<tr data-entry-id="${e.id}">
        <td style="text-align:center;"><input type="checkbox" class="entry-checkbox" data-id="${e.id}" style="accent-color:#3C1EEB;width:1rem;height:1rem;"></td>
        <td>${fmtDate(e.entry_date)}</td>
        <td>${escapeHtml(e.start_time || '')}${e.end_time ? '–' + escapeHtml(e.end_time) : ''}</td>
        <td>${parseFloat(e.hours).toFixed(1)}h${parseFloat(e.km) > 0 ? ' / ' + e.km + ' km' : ''}</td>
        <td>${escapeHtml(e.project || '')}${e.comment ? '<br><span style="color:#7D95A1;font-size:0.75rem">' + escapeHtml(e.comment) + '</span>' : ''}</td>
        <td>${statusLabel(e.status)}${clarHtml}${rejHtml}</td>
        <td>
          <div style="display:flex;gap:0.25rem;">
            <button class="action-btn approve-btn" data-id="${e.id}" style="color:#0E9537;border-color:#A7E3B5;">✓</button>
            <button class="action-btn reject-btn"  data-id="${e.id}" style="color:#E01541;border-color:#F5AABB;">✗</button>
          </div>
        </td></tr>`;
    });
  }
  entriesTbody.innerHTML = html;

  // Single approve/reject
  entriesTbody.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', () => reviewEntries([Number(btn.dataset.id)], 'approve'));
  });
  entriesTbody.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', () => openRejectDialog([Number(btn.dataset.id)]));
  });
}

async function openEntriesModal(employeeId, employeeName) {
  currentEntriesEmployeeId        = employeeId;
  entriesModalTitle.textContent   = `Kirjaukset – ${employeeName}`;
  entriesTbody.innerHTML          = '<tr><td colspan="7" style="color:#7D95A1;padding:1rem">Ladataan...</td></tr>';
  entriesModal.classList.add('visible');
  await refreshEntries();
}

async function refreshEntries() {
  if (!currentEntriesEmployeeId) return;
  try {
    const res    = await fetch(`/api/time_entries.php?employee_id=${currentEntriesEmployeeId}`);
    const result = await res.json();
    if (!res.ok || !result.success) { entriesTbody.innerHTML = '<tr><td colspan="7">Virhe.</td></tr>'; return; }
    renderEntries(result.entries || [], entriesGrouping.value);
  } catch { entriesTbody.innerHTML = '<tr><td colspan="7">Virhe.</td></tr>'; }
}

async function reviewEntries(ids, action, rejectionNote = '') {
  try {
    const res    = await fetch('/api/review_entries.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action, rejection_note: rejectionNote }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || 'Virhe.', true); return; }
    await refreshEntries();
  } catch { showStatus('Palvelinvirhe.', true); }
}

// Reject dialog (inline)
const rejectDialog = document.getElementById('rejectDialog');
const rejectNoteInput = document.getElementById('rejectNoteInput');
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
    supervisorsTbody.innerHTML = '<tr><td colspan="5" style="color:#7D95A1;padding:1rem 0.75rem">Ei esihenkilöitä.</td></tr>';
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
            Tiimi (${s.team_size})
          </button>
          <button class="action-btn sup-edit-btn" data-id="${s.id}">Muokkaa</button>
          <button class="action-btn sup-del-btn" data-id="${s.id}" style="color:#E01541;border-color:#F5AABB;">Poista</button>
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
      if (!confirm('Poistetaanko esihenkilö?')) return;
      const res = await fetch('/api/supervisors.php', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: Number(btn.dataset.id) }),
      });
      const result = await res.json();
      if (result.success) await loadSupervisors();
      else showStatus(result.error || 'Poisto epäonnistui.', true);
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
const supervisorModal  = document.getElementById('supervisorModal');
const supModalTitle    = document.getElementById('supModalTitle');
const supFirstName     = document.getElementById('supFirstName');
const supLastName      = document.getElementById('supLastName');
const supEmail         = document.getElementById('supEmail');
const supPhone         = document.getElementById('supPhone');
const supPin           = document.getElementById('supPin');
const supSsn           = document.getElementById('supSsn');
const supSalaxyId      = document.getElementById('supSalaxyId');
const saveSupervisorBtn = document.getElementById('saveSupervisorBtn');
const closeSupervisorModal = document.getElementById('closeSupervisorModal');
let editingSupervisorId = null;

function openSupervisorModal(sup = null) {
  editingSupervisorId = sup ? sup.id : null;
  supModalTitle.textContent = sup ? 'Muokkaa esihenkilöä' : 'Lisää esihenkilö';
  supFirstName.value = sup?.first_name || '';
  supLastName.value  = sup?.last_name  || '';
  supEmail.value     = sup?.email      || '';
  supPhone.value     = sup?.phone      || '';
  supPin.value       = sup?.pin        || '';
  supSsn.value       = sup?.ssn        || '';
  supSalaxyId.value  = sup?.salaxy_id  || '';
  supervisorModal.classList.add('visible');
  supFirstName.focus();
}

closeSupervisorModal.addEventListener('click', () => supervisorModal.classList.remove('visible'));

saveSupervisorBtn.addEventListener('click', async () => {
  const payload = {
    first_name: supFirstName.value.trim(),
    last_name:  supLastName.value.trim(),
    email:      supEmail.value.trim(),
    phone:      supPhone.value.trim(),
    pin:        supPin.value.trim(),
    ssn:        supSsn.value.trim(),
    salaxy_id:  supSalaxyId.value.trim(),
  };
  if (editingSupervisorId) payload.id = editingSupervisorId;

  saveSupervisorBtn.disabled = true;
  try {
    const res    = await fetch('/api/supervisors.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || 'Tallennus epäonnistui.', true); return; }
    supervisorModal.classList.remove('visible');
    await loadSupervisors();
    showStatus('Esihenkilö tallennettu.');
  } catch { showStatus('Palvelinvirhe.', true); }
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
  teamModalTitle.textContent = `Tiimi – ${supervisorName}`;
  teamList.innerHTML         = '<div style="color:#7D95A1;padding:0.5rem">Ladataan...</div>';
  teamModal.classList.add('visible');

  const res    = await fetch(`/api/supervisor_team.php?supervisor_id=${supervisorId}`);
  const result = await res.json();
  if (!result.success) { teamList.innerHTML = '<div style="color:#E01541">Virhe.</div>'; return; }

  teamList.innerHTML = result.employees.map(e => `
    <label style="display:flex;align-items:baseline;gap:0.5rem;padding:0.375rem 0;border-bottom:1px solid #F3F0F0;cursor:pointer;">
      <input type="checkbox" value="${e.id}" ${e.in_team ? 'checked' : ''}
        style="accent-color:#3C1EEB;width:1rem;height:1rem;flex-shrink:0;margin-top:0.1rem;">
      <span>${escapeHtml(e.name)}${e.other_supervisors ? '<span style="color:#7D95A1;font-size:0.75rem;margin-left:0.375rem">Myös: ' + escapeHtml(e.other_supervisors) + '</span>' : ''}</span>
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
    if (!res.ok || !result.success) { showStatus(result.error || 'Tiimin tallennus epäonnistui.', true); return; }
    teamModal.classList.remove('visible');
    await loadSupervisors();
    showStatus('Tiimi tallennettu.');
  } catch { showStatus('Palvelinvirhe.', true); }
  finally { saveTeamBtn.disabled = false; }
});

// ─── Payroll export modal ─────────────────────────────────────────────────────
const payrollModal     = document.getElementById('payrollModal');
const payrollDateFrom  = document.getElementById('payrollDateFrom');
const payrollDateTo    = document.getElementById('payrollDateTo');
const payrollPreviewBtn = document.getElementById('payrollPreviewBtn');
const payrollPreview   = document.getElementById('payrollPreview');
const exportToSalaxy   = document.getElementById('exportToSalaxy');
const closePayrollModal = document.getElementById('closePayrollModal');
let   payrollPreviewData = [];

exportPayrollBtn.addEventListener('click', () => {
  // Default: last 14 days
  const today = new Date(); const from = new Date(); from.setDate(today.getDate() - 14);
  payrollDateFrom.value = from.toISOString().split('T')[0];
  payrollDateTo.value   = today.toISOString().split('T')[0];
  payrollPreview.innerHTML = '';
  exportToSalaxy.classList.add('hidden');
  payrollModal.classList.add('visible');
});

closePayrollModal.addEventListener('click', () => payrollModal.classList.remove('visible'));

payrollPreviewBtn.addEventListener('click', async () => {
  const from = payrollDateFrom.value; const to = payrollDateTo.value;
  if (!from || !to) { showStatus('Valitse aikaväli.', true); return; }

  payrollPreviewBtn.disabled = true;
  payrollPreview.innerHTML   = '<div style="color:#7D95A1;padding:0.5rem">Ladataan...</div>';
  exportToSalaxy.classList.add('hidden');

  try {
    const res    = await fetch(`/api/export_payroll.php?date_from=${from}&date_to=${to}`);
    const result = await res.json();
    if (!res.ok || !result.success) { payrollPreview.innerHTML = `<div style="color:#E01541">${result.error || 'Virhe.'}</div>`; return; }

    payrollPreviewData = result.employees || [];
    if (!payrollPreviewData.length) {
      payrollPreview.innerHTML = '<div style="color:#7D95A1;padding:0.5rem">Ei hyväksyttyjä kirjauksia valitulle ajanjaksolle.</div>';
      return;
    }

    payrollPreview.innerHTML = payrollPreviewData.map(emp => `
      <div style="margin-bottom:0.875rem;border:1px solid #C4CFD4;border-radius:6px;overflow:hidden;">
        <div style="background:#F3F0F0;padding:0.5rem 0.75rem;display:flex;align-items:center;gap:0.625rem;">
          <input type="checkbox" class="export-emp-cb" data-id="${emp.employee_id}" checked
            style="accent-color:#3C1EEB;width:1rem;height:1rem;">
          <strong>${escapeHtml(emp.employee_name)}</strong>
          <span style="color:#7D95A1;font-size:0.8rem;">${emp.total_hours.toFixed(1)}h${emp.total_km > 0 ? ' / ' + emp.total_km + ' km' : ''}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;">
          ${emp.entries.map(e => `
          <tr>
            <td style="padding:0.375rem 0.75rem;font-size:0.8rem;color:#5E7682;border-bottom:1px solid #F3F0F0;">${fmtDate(e.entry_date)}</td>
            <td style="padding:0.375rem 0.75rem;font-size:0.8rem;border-bottom:1px solid #F3F0F0;">${escapeHtml(e.project || '')}</td>
            <td style="padding:0.375rem 0.75rem;font-size:0.8rem;border-bottom:1px solid #F3F0F0;">${parseFloat(e.hours).toFixed(1)}h${parseFloat(e.km) > 0 ? ' / ' + e.km + ' km' : ''}</td>
          </tr>`).join('')}
        </table>
      </div>`).join('');

    exportToSalaxy.classList.remove('hidden');
  } catch { payrollPreview.innerHTML = '<div style="color:#E01541">Palvelinvirhe.</div>'; }
  finally { payrollPreviewBtn.disabled = false; }
});

exportToSalaxy.addEventListener('click', async () => {
  const from = payrollDateFrom.value; const to = payrollDateTo.value;
  const ids  = [...document.querySelectorAll('.export-emp-cb:checked')].map(cb => Number(cb.dataset.id));
  if (!ids.length) { showStatus('Valitse vähintään yksi työntekijä.', true); return; }

  exportToSalaxy.disabled = true;
  showStatus('Viedään Salaxyyn...');
  try {
    const res    = await fetch('/api/export_payroll.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date_from: from, date_to: to, employee_ids: ids }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || 'Vienti epäonnistui.', true); return; }
    showStatus(`Viety Salaxyyn! Palkkalista: ${result.payroll_id}`);
    payrollModal.classList.remove('visible');
  } catch { showStatus('Palvelinvirhe.', true); }
  finally { exportToSalaxy.disabled = false; }
});

// ─── Salaxy sync ──────────────────────────────────────────────────────────────
async function syncSalaxy() {
  syncSalaxyBtn.disabled = true;
  showStatus('Synkronoidaan...');
  try {
    const res    = await fetch('/api/sync_employees_from_salaxy.php', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const result = await res.json();
    if (!res.ok || !result.success) { saveSyncError(result.error || `HTTP ${res.status}`); showStatus('Synkronointi epäonnistui.', true); return; }
    saveSyncStatus(result.added ?? 0, result.updated ?? 0);
    showStatus('');
    await loadEmployees();
  } catch (e) { saveSyncError(e.message || 'Verkkovirhe'); showStatus('Synkronointi epäonnistui.', true); }
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
  if (!email || !password) { showStatus('Syötä sähköposti ja salasana.', true); return; }
  loginBtn.disabled = true;
  showStatus('Kirjaudutaan...');
  try {
    const res    = await fetch('/api/admin_login.php', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await res.json();
    if (!res.ok || !result.success) { showStatus(result.error || 'Kirjautuminen epäonnistui.', true); return; }

    approvalsEnabled = !!(result.company?.approvals_enabled);
    document.getElementById('adminName').textContent = result.admin.name || result.admin.email;
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');

    if (approvalsEnabled) {
      supervisorsSection.classList.remove('hidden');
      exportPayrollBtn.classList.remove('hidden');
      await loadSupervisors();
    }

    showStatus('');
    loadSyncStatus();
    await loadEmployees();
    syncSalaxy();
  } catch { showStatus('Palvelinvirhe.', true); }
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
    copyPinBtn.textContent = 'Kopioitu!';
    setTimeout(() => { copyPinBtn.textContent = 'Kopioi PIN'; }, 2000);
  }).catch(() => alert('PIN: ' + pin));
});
