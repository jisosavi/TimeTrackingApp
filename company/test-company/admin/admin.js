const loginBtn = document.getElementById('loginBtn');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const statusEl = document.getElementById('status');
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboard');
const logoutBtn = document.getElementById('logoutBtn');
const newEmployeeBtn = document.getElementById('newEmployeeBtn');
const syncSalaxyBtn = document.getElementById('syncSalaxyBtn');
const employeesTableBody = document.querySelector('#employeesTable tbody');
const employeeForm = document.getElementById('employeeForm');
const formTitle = document.getElementById('formTitle');
const employeeName = document.getElementById('employeeName');
const employeePin = document.getElementById('employeePin');
const employeeSsn = document.getElementById('employeeSsn');
const employeeEmploymentId = document.getElementById('employeeEmploymentId');
const saveEmployeeBtn = document.getElementById('saveEmployeeBtn');
const cancelEmployeeBtn = document.getElementById('cancelEmployeeBtn');
const pinResetModal = document.getElementById('pinResetModal');
const closePinModalBtn = document.getElementById('closePinModalBtn');
const copyPinBtn = document.getElementById('copyPinBtn');
const resetEmployeeName = document.getElementById('resetEmployeeName');
const newPinDisplay = document.getElementById('newPin');

let editingEmployeeId = null;
let currentEmployees = [];

const syncSlug = window.location.pathname.split('/').filter(Boolean)[0] || 'default';
const syncStorageKey = `lastSync_${syncSlug}`;

function fmtDateTime(iso) {
  const d = new Date(iso);
  const date = d.toLocaleDateString('fi-FI', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
  return `${date}, klo ${time}`;
}

function renderSyncInfo(data) {
  const el = document.getElementById('lastSyncInfo');
  if (!data) {
    el.textContent = 'Ei vielä synkattu Salaxystä';
    return;
  }
  if (!data.success) {
    el.textContent = `Synkronointi ei onnistunut ${fmtDateTime(data.timestamp)}, syy: ${data.error}`;
    return;
  }
  const parts = [];
  if (data.added > 0) parts.push(`tuotu ${data.added} uusi${data.added === 1 ? '' : 'a'} työntekijä${data.added === 1 ? '' : 'ä'}`);
  if (data.updated > 0) parts.push(`muokattu ${data.updated} työntekijän tiedot`);
  if (parts.length === 0) parts.push('ei muutoksia');
  const summary = parts.map((p, i) => i === 0 ? p.charAt(0).toUpperCase() + p.slice(1) : p).join(' ja ');
  el.textContent = `Synkronoitu: ${fmtDateTime(data.timestamp)}. ${summary}.`;
}

function loadSyncStatus() {
  const raw = localStorage.getItem(syncStorageKey);
  try {
    renderSyncInfo(raw ? JSON.parse(raw) : null);
  } catch {
    renderSyncInfo(null);
  }
}

function saveSyncStatus(added, updated) {
  const data = { success: true, timestamp: new Date().toISOString(), added, updated };
  localStorage.setItem(syncStorageKey, JSON.stringify(data));
  renderSyncInfo(data);
}

function saveSyncError(errorMsg) {
  const data = { success: false, timestamp: new Date().toISOString(), error: errorMsg };
  localStorage.setItem(syncStorageKey, JSON.stringify(data));
  renderSyncInfo(data);
}

function showStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#E01541' : '#5E7682';
}

function generateRandomPin() {
  return String(Math.floor(Math.random() * 1000000)).padStart(4, '0');
}

function renderEmployees(employees) {
  employeesTableBody.innerHTML = '';
  currentEmployees = employees;

  if (employees.length === 0) {
    employeesTableBody.innerHTML = '<tr><td colspan="5">Ei työntekijöitä.</td></tr>';
    return;
  }

  for (const employee of employees) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td style="text-align:center;">
        <input type="checkbox" class="active-checkbox" data-id="${employee.id}"
          ${employee.active ? 'checked' : ''}
          style="width:1.1rem;height:1.1rem;accent-color:#3C1EEB;cursor:pointer;" />
      </td>
      <td>${escapeHtml(employee.name)}</td>
      <td><code>${escapeHtml(employee.pin)}</code></td>
      <td>${escapeHtml(employee.ssn || '')}</td>
      <td>${escapeHtml(employee.employmentId || '')}</td>
      <td>
        <div class="action-buttons">
          <button class="action-btn edit-btn" data-id="${employee.id}">Muokkaa</button>
          <button class="action-btn reset-pin-btn" data-id="${employee.id}" data-name="${escapeHtml(employee.name)}">Vaihda PIN</button>
        </div>
      </td>
    `;
    employeesTableBody.appendChild(row);
  }

  attachEmployeeActions();
}

function attachEmployeeActions() {
  document.querySelectorAll('.active-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const employeeId = checkbox.getAttribute('data-id');
      const employee = currentEmployees.find(e => String(e.id) === employeeId);
      if (!employee) return;

      checkbox.disabled = true;
      try {
        const response = await fetch('/api/employees.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: employee.id,
            name: employee.name,
            pin: employee.pin,
            ssn: employee.ssn || '',
            employmentId: employee.employmentId || '',
            active: checkbox.checked ? 1 : 0,
          }),
        });
        const result = await response.json();
        if (!response.ok || !result.success) {
          showStatus(result.error || 'Tilan vaihto epäonnistui.', true);
          checkbox.checked = !checkbox.checked;
        } else {
          employee.active = checkbox.checked ? 1 : 0;
        }
      } catch (error) {
        console.error(error);
        showStatus('Palvelinvirhe tilan vaihdossa.', true);
        checkbox.checked = !checkbox.checked;
      } finally {
        checkbox.disabled = false;
      }
    });
  });

  document.querySelectorAll('.edit-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const employeeId = button.getAttribute('data-id');
      const employee = currentEmployees.find(e => String(e.id) === employeeId);
      if (employee) openEmployeeForm(employee);
    });
  });

  document.querySelectorAll('.reset-pin-btn').forEach((button) => {
    button.addEventListener('click', async () => {
      const employeeId = button.getAttribute('data-id');
      const employeeName = button.getAttribute('data-name');
      const newPin = generateRandomPin();

      try {
        const response = await fetch('/api/employees.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: employeeId, pin: newPin }),
        });
        const result = await response.json();

        if (!response.ok || !result.success) {
          showStatus(result.error || 'PIN-vaihto epäonnistui.', true);
          return;
        }

        resetEmployeeName.textContent = employeeName;
        newPinDisplay.textContent = newPin;
        pinResetModal.classList.add('visible');
        await loadEmployees();
      } catch (error) {
        console.error(error);
        showStatus('Palvelinvirhe PIN-vaihdossa.', true);
      }
    });
  });
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resetForm() {
  editingEmployeeId = null;
  formTitle.textContent = 'Lisää työntekijä';
  employeeName.value = '';
  employeePin.value = '';
  employeeSsn.value = '';
  employeeEmploymentId.value = '';
  employeeForm.classList.add('hidden');
}

function openEmployeeForm(employee = null) {
  if (employee) {
    editingEmployeeId = employee.id;
    formTitle.textContent = 'Muokkaa työntekijää';
    employeeName.value = employee.name;
    employeePin.value = employee.pin;
    employeeSsn.value = employee.ssn || '';
    employeeEmploymentId.value = employee.employmentId || '';
  } else {
    resetForm();
    employeeForm.classList.remove('hidden');
    return;
  }
  employeeForm.classList.remove('hidden');
}

async function loadEmployees() {
  try {
    const response = await fetch('/api/employees.php');
    const result = await response.json();
    if (!response.ok || !result.success) {
      showStatus(result.error || 'Työntekijöiden lataus epäonnistui.', true);
      return;
    }
    renderEmployees(result.employees || []);
  } catch (error) {
    console.error(error);
    showStatus('Palvelinvirhe työntekijöiden latauksessa.', true);
  }
}

async function saveEmployee() {
  const name = employeeName.value.trim();
  const pin = employeePin.value.trim();
  const ssn = employeeSsn.value.trim();
  const employmentId = employeeEmploymentId.value.trim();

  if (!name || !pin) {
    showStatus('Nimi ja PIN ovat pakollisia.', true);
    return;
  }

  const existing = editingEmployeeId
    ? currentEmployees.find(e => String(e.id) === String(editingEmployeeId))
    : null;
  const active = existing ? (existing.active ? 1 : 0) : 1;

  saveEmployeeBtn.disabled = true;
  showStatus('Tallennetaan työntekijää...');

  try {
    const payload = { name, pin, ssn, employmentId, active };
    if (editingEmployeeId) payload.id = editingEmployeeId;

    const response = await fetch('/api/employees.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();

    if (!response.ok || !result.success) {
      showStatus(result.error || 'Tallennus epäonnistui.', true);
      return;
    }

    showStatus('Työntekijä tallennettu.');
    resetForm();
    await loadEmployees();
  } catch (error) {
    console.error(error);
    showStatus('Palvelinvirhe tallennuksessa.', true);
  } finally {
    saveEmployeeBtn.disabled = false;
  }
}

async function logout() {
  await fetch('/api/logout.php');
  window.location.reload();
}

async function tryLogin() {
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    showStatus('Syötä sähköposti ja salasana.', true);
    return;
  }

  loginBtn.disabled = true;
  showStatus('Kirjaudutaan sisään...');

  try {
    const response = await fetch('/api/admin_login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      showStatus(result.error || 'Kirjautuminen epäonnistui.', true);
      return;
    }

    document.getElementById('adminName').textContent = result.admin.name || result.admin.email;
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    showStatus('');
    loadSyncStatus();
    await loadEmployees();
    syncSalaxy();
  } catch (error) {
    console.error(error);
    showStatus('Palvelinvirhe. Yritä myöhemmin uudelleen.', true);
  } finally {
    loginBtn.disabled = false;
  }
}

async function syncSalaxy() {
  syncSalaxyBtn.disabled = true;
  showStatus('Synkronoidaan Salaxysta...');

  try {
    const response = await fetch('/api/sync_employees_from_salaxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      const msg = result.error || `HTTP ${response.status}`;
      saveSyncError(msg);
      showStatus('Synkronointi epäonnistui.', true);
      return;
    }

    saveSyncStatus(result.added ?? 0, result.updated ?? 0);
    showStatus('');
    await loadEmployees();
  } catch (error) {
    console.error(error);
    saveSyncError(error.message || 'Verkkovirhe');
    showStatus('Synkronointi epäonnistui.', true);
  } finally {
    syncSalaxyBtn.disabled = false;
  }
}

loginBtn.addEventListener('click', tryLogin);
passwordInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryLogin(); });
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
