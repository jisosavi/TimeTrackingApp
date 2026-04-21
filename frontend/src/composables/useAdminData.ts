import { ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { Employee, Supervisor, TeamMember, PayrollSettings, ExportPeriod, ExportResult } from '@/types'

export function validateEmployeeForm(name: string, pin: string): string | null {
  if (!name.trim()) return 'Name is required'
  if (!/^\d{3,6}$/.test(pin.trim())) return 'PIN must be 3–6 digits'
  return null
}

export function useAdminData() {
  const employees = ref<Employee[]>([])
  const supervisors = ref<Supervisor[]>([])
  const loadingEmps = ref(false)
  const loadingSups = ref(false)
  const error = ref<string | null>(null)
  const syncMessage = ref<string | null>(null)
  const { apiFetch } = useApi()

  async function fetchEmployees() {
    loadingEmps.value = true
    error.value = null
    try {
      const data = await apiFetch<{ employees: Employee[] }>('/api/employees.php')
      employees.value = data.employees
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load employees'
    } finally {
      loadingEmps.value = false
    }
  }

  async function saveEmployee(payload: {
    id?: number
    name: string
    pin: string
    active?: number
    employmentId?: string
    ui_language?: string
  }): Promise<Employee> {
    const data = await apiFetch<{ employee: Employee }>('/api/employees.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const idx = employees.value.findIndex(e => e.id === data.employee.id)
    if (idx >= 0) {
      employees.value[idx] = { ...employees.value[idx]!, ...data.employee }
    } else {
      employees.value.push({ ...data.employee, pending_hours: 0 })
    }
    return data.employee
  }

  async function syncFromSalaxy() {
    syncMessage.value = null
    try {
      const data = await apiFetch<{ added: number; updated: number; total: number }>(
        '/api/sync_employees_from_salaxy.php',
        { method: 'POST' },
      )
      syncMessage.value = `Sync done: ${data.added} added, ${data.updated} updated (${data.total} in Salaxy)`
      await fetchEmployees()
    } catch (e) {
      syncMessage.value = `Sync failed: ${e instanceof Error ? e.message : 'Unknown error'}`
    }
  }

  async function fetchSupervisors() {
    loadingSups.value = true
    error.value = null
    try {
      const data = await apiFetch<{ supervisors: Supervisor[] }>('/api/supervisors.php')
      supervisors.value = data.supervisors
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load supervisors'
    } finally {
      loadingSups.value = false
    }
  }

  async function saveSupervisor(payload: {
    id?: number
    first_name: string
    last_name: string
    email: string
    phone: string
    pin?: string
    active?: number
  }): Promise<Supervisor> {
    const data = await apiFetch<{ supervisor: Supervisor }>('/api/supervisors.php', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    const idx = supervisors.value.findIndex(s => s.id === data.supervisor.id)
    if (idx >= 0) {
      supervisors.value[idx] = { ...supervisors.value[idx]!, ...data.supervisor }
    } else {
      supervisors.value.push({ ...data.supervisor, team_size: 0 })
    }
    return data.supervisor
  }

  async function deleteSupervisor(id: number) {
    await apiFetch('/api/supervisors.php', {
      method: 'DELETE',
      body: JSON.stringify({ id }),
    })
    supervisors.value = supervisors.value.filter(s => s.id !== id)
  }

  async function fetchTeam(supervisorId: number): Promise<TeamMember[]> {
    const data = await apiFetch<{ employees: TeamMember[] }>(
      `/api/supervisor_team.php?supervisor_id=${supervisorId}`,
    )
    return data.employees
  }

  async function saveTeam(supervisorId: number, employeeIds: number[]) {
    await apiFetch('/api/supervisor_team.php', {
      method: 'POST',
      body: JSON.stringify({ supervisor_id: supervisorId, employee_ids: employeeIds }),
    })
    const sup = supervisors.value.find(s => s.id === supervisorId)
    if (sup) sup.team_size = employeeIds.length
  }

  async function fetchPayrollSettings(): Promise<PayrollSettings> {
    const data = await apiFetch<{ settings: PayrollSettings }>('/api/payroll_settings.php')
    return data.settings
  }

  async function savePayrollSettings(settings: PayrollSettings): Promise<void> {
    await apiFetch('/api/payroll_settings.php', {
      method: 'POST',
      body: JSON.stringify(settings),
    })
  }

  async function fetchExportPreview(dateFrom: string, dateTo: string): Promise<ExportPeriod[]> {
    const data = await apiFetch<{ periods: ExportPeriod[] }>(
      `/api/export_payroll.php?date_from=${dateFrom}&date_to=${dateTo}`,
    )
    return data.periods
  }

  async function submitExport(
    dateFrom: string,
    dateTo: string,
    employeeIds: number[],
    force = false,
  ): Promise<ExportResult> {
    return apiFetch<ExportResult>('/api/export_payroll.php', {
      method: 'POST',
      body: JSON.stringify({ date_from: dateFrom, date_to: dateTo, employee_ids: employeeIds, force }),
    })
  }

  return {
    employees,
    supervisors,
    loadingEmps,
    loadingSups,
    error,
    syncMessage,
    fetchEmployees,
    saveEmployee,
    syncFromSalaxy,
    fetchSupervisors,
    saveSupervisor,
    deleteSupervisor,
    fetchTeam,
    saveTeam,
    fetchPayrollSettings,
    savePayrollSettings,
    fetchExportPreview,
    submitExport,
  }
}
