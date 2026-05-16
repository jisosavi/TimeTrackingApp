import { ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { Employee, Supervisor, TeamMember, PayrollSettings, ExportPeriod, ExportResult } from '@/types'

export function validateEmployeeForm(name: string, pin: string, isNew = true): string | null {
  if (!name.trim()) return 'Name is required'
  if (isNew && !pin.trim()) return 'PIN is required'
  if (pin.trim() && !/^\d{3,6}$/.test(pin.trim())) return 'PIN must be 3–6 digits'
  return null
}

export function useAdminData() {
  const employees = ref<Employee[]>([])
  const supervisors = ref<Supervisor[]>([])
  const loadingEmps = ref(false)
  const loadingSups = ref(false)
  const error = ref<string | null>(null)
  const syncMessage = ref<string | null>(null)
  const { get, post, del } = useApi()

  async function fetchEmployees() {
    loadingEmps.value = true
    error.value = null
    try {
      const data = await get<{ employees: Employee[] }>('/api/employees')
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
    pin?: string
    active?: number
    employmentId?: string
    ui_language?: string
    email?: string
    phone?: string
    birth_year?: number | null
  }): Promise<Employee> {
    const data = await post<{ employee: Employee }>('/api/employees', payload)
    const idx = employees.value.findIndex(e => e.id === data.employee.id)
    if (idx >= 0) {
      employees.value[idx] = { ...employees.value[idx]!, ...data.employee }
    } else {
      employees.value.push({ ...data.employee, pending_hours: 0 })
    }
    await fetchEmployees()
    return data.employee
  }

  async function syncFromSalaxy() {
    syncMessage.value = null
    try {
      const data = await post<{ added: number; updated: number; total: number }>('/api/sync_employees_from_salaxy')
      syncMessage.value = `Sync done: ${data.added} added, ${data.updated} updated (${data.total} in Salaxy)`
      await fetchEmployees()
    } catch (e) {
      syncMessage.value = `Sync failed: ${e instanceof Error ? e.message : 'Unknown error'}`
    }
  }

  async function clearSyncFromSalaxy() {
    syncMessage.value = null
    try {
      const data = await post<{ added: number; deleted: number; total: number }>(
        '/api/sync_employees_from_salaxy',
        { clear: true },
      )
      syncMessage.value = `Clear sync done: ${data.deleted} deleted, ${data.added} added from Salaxy (${data.total} in Salaxy)`
      await fetchEmployees()
    } catch (e) {
      syncMessage.value = `Clear sync failed: ${e instanceof Error ? e.message : 'Unknown error'}`
    }
  }

  async function fetchSupervisors() {
    loadingSups.value = true
    error.value = null
    try {
      const data = await get<{ supervisors: Supervisor[] }>('/api/supervisors')
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
    const data = await post<{ supervisor: Supervisor }>('/api/supervisors', payload)
    const idx = supervisors.value.findIndex(s => s.id === data.supervisor.id)
    if (idx >= 0) {
      supervisors.value[idx] = { ...supervisors.value[idx]!, ...data.supervisor }
    } else {
      supervisors.value.push({ ...data.supervisor, team_size: 0 })
    }
    await fetchSupervisors()
    return data.supervisor
  }

  async function deleteSupervisor(id: number) {
    await del('/api/supervisors', { id })
    supervisors.value = supervisors.value.filter(s => s.id !== id)
    await fetchSupervisors()
  }

  async function fetchTeam(supervisorId: number): Promise<TeamMember[]> {
    const data = await get<{ employees: TeamMember[] }>(`/api/supervisor_team?supervisor_id=${supervisorId}`)
    return data.employees
  }

  async function saveTeam(supervisorId: number, employeeIds: number[]) {
    await post('/api/supervisor_team', { supervisor_id: supervisorId, employee_ids: employeeIds })
    const sup = supervisors.value.find(s => s.id === supervisorId)
    if (sup) sup.team_size = employeeIds.length
  }

  async function fetchPayrollSettings(): Promise<PayrollSettings> {
    const data = await get<{ settings: PayrollSettings }>('/api/payroll_settings')
    return data.settings
  }

  async function savePayrollSettings(settings: PayrollSettings): Promise<void> {
    await post('/api/payroll_settings', settings)
  }

  async function fetchExportPreview(dateFrom: string, dateTo: string): Promise<ExportPeriod[]> {
    const data = await get<{ periods: ExportPeriod[] }>(`/api/export_payroll?date_from=${dateFrom}&date_to=${dateTo}`)
    return data.periods
  }

  async function submitExport(
    dateFrom: string,
    dateTo: string,
    employeeIds: number[],
    force = false,
  ): Promise<ExportResult> {
    return post<ExportResult>('/api/export_payroll', { date_from: dateFrom, date_to: dateTo, employee_ids: employeeIds, force })
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
    clearSyncFromSalaxy,
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
