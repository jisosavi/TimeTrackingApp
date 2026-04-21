<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminData, validateEmployeeForm } from '@/composables/useAdminData'
import type { TeamMember, PayrollSettings, ExportPeriod, ExportResult } from '@/types'

const {
  employees, supervisors, loadingEmps, loadingSups, error, syncMessage,
  fetchEmployees, saveEmployee, syncFromSalaxy,
  fetchSupervisors, saveSupervisor, deleteSupervisor, fetchTeam, saveTeam,
  fetchPayrollSettings, savePayrollSettings, fetchExportPreview, submitExport,
} = useAdminData()

onMounted(() => {
  fetchEmployees()
  fetchSupervisors()
})

// ── Employee section ──────────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  en: 'English', fi: 'Suomi', sv: 'Svenska', et: 'Eesti', uk: 'Українська', xh: 'isiXhosa',
}

const showEmpForm = ref(false)
const editingEmpId = ref<number | null>(null)
const empForm = ref({ name: '', pin: '', active: 1, ui_language: 'en', employmentId: '' })
const empFormError = ref<string | null>(null)
const empSaving = ref(false)
const syncing = ref(false)

function openAddEmp() {
  editingEmpId.value = null
  empForm.value = { name: '', pin: '', active: 1, ui_language: 'en', employmentId: '' }
  empFormError.value = null
  showEmpForm.value = true
}

function openEditEmp(id: number) {
  const emp = employees.value.find(e => e.id === id)
  if (!emp) return
  editingEmpId.value = id
  empForm.value = { name: emp.name, pin: emp.pin, active: emp.active, ui_language: emp.ui_language ?? 'en', employmentId: emp.employmentId ?? '' }
  empFormError.value = null
  showEmpForm.value = false
}

function cancelEmpForm() {
  showEmpForm.value = false
  editingEmpId.value = null
  empFormError.value = null
}

async function submitEmpForm() {
  const err = validateEmployeeForm(empForm.value.name, empForm.value.pin)
  if (err) { empFormError.value = err; return }
  empSaving.value = true
  empFormError.value = null
  try {
    const payload = editingEmpId.value
      ? { id: editingEmpId.value, ...empForm.value }
      : { name: empForm.value.name, pin: empForm.value.pin, ui_language: empForm.value.ui_language, employmentId: empForm.value.employmentId }
    await saveEmployee(payload)
    cancelEmpForm()
  } catch (e) {
    empFormError.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    empSaving.value = false
  }
}

async function doSync() {
  syncing.value = true
  await syncFromSalaxy()
  syncing.value = false
}

// ── Supervisor section ────────────────────────────────────────────────────────
const showSupForm = ref(false)
const editingSupId = ref<number | null>(null)
const supForm = ref({ first_name: '', last_name: '', email: '', phone: '', pin: '', active: 1 })
const supFormError = ref<string | null>(null)
const supSaving = ref(false)

const teamExpandedId = ref<number | null>(null)
const teamMembers = ref<TeamMember[]>([])
const teamSelectedIds = ref<number[]>([])
const teamLoading = ref(false)

function openAddSup() {
  editingSupId.value = null
  supForm.value = { first_name: '', last_name: '', email: '', phone: '', pin: '', active: 1 }
  supFormError.value = null
  showSupForm.value = true
}

function openEditSup(id: number) {
  const sup = supervisors.value.find(s => s.id === id)
  if (!sup) return
  editingSupId.value = id
  supForm.value = {
    first_name: sup.first_name,
    last_name: sup.last_name,
    email: sup.email,
    phone: sup.phone,
    pin: '',
    active: sup.active,
  }
  supFormError.value = null
  showSupForm.value = false
  teamExpandedId.value = null
}

function cancelSupForm() {
  showSupForm.value = false
  editingSupId.value = null
  supFormError.value = null
}

function validateSupForm(): string | null {
  if (!supForm.value.first_name.trim() || !supForm.value.last_name.trim())
    return 'First and last name are required'
  if (!supForm.value.email.trim()) return 'Email is required'
  if (!supForm.value.phone.trim()) return 'Phone is required'
  if (!editingSupId.value && !supForm.value.pin.trim()) return 'PIN is required for new supervisors'
  if (supForm.value.pin.trim() && !/^\d{3,6}$/.test(supForm.value.pin.trim()))
    return 'PIN must be 3–6 digits'
  return null
}

async function submitSupForm() {
  const err = validateSupForm()
  if (err) { supFormError.value = err; return }
  supSaving.value = true
  supFormError.value = null
  try {
    const payload: Record<string, unknown> = {
      first_name: supForm.value.first_name.trim(),
      last_name: supForm.value.last_name.trim(),
      email: supForm.value.email.trim(),
      phone: supForm.value.phone.trim(),
      active: supForm.value.active,
    }
    if (editingSupId.value) payload.id = editingSupId.value
    if (supForm.value.pin.trim()) payload.pin = supForm.value.pin.trim()
    await saveSupervisor(payload as Parameters<typeof saveSupervisor>[0])
    cancelSupForm()
  } catch (e) {
    supFormError.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    supSaving.value = false
  }
}

async function confirmDeleteSup(id: number) {
  const sup = supervisors.value.find(s => s.id === id)
  if (!sup) return
  if (!confirm(`Delete supervisor ${sup.first_name} ${sup.last_name}? This cannot be undone.`)) return
  try {
    await deleteSupervisor(id)
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Delete failed')
  }
}

async function toggleTeam(supervisorId: number) {
  if (teamExpandedId.value === supervisorId) {
    teamExpandedId.value = null
    return
  }
  teamLoading.value = true
  try {
    const members = await fetchTeam(supervisorId)
    teamMembers.value = members
    teamSelectedIds.value = members.filter(m => m.in_team).map(m => m.id)
    teamExpandedId.value = supervisorId
  } finally {
    teamLoading.value = false
  }
}

function toggleTeamMember(id: number) {
  const idx = teamSelectedIds.value.indexOf(id)
  if (idx >= 0) {
    teamSelectedIds.value.splice(idx, 1)
  } else {
    teamSelectedIds.value.push(id)
  }
}

async function submitTeam() {
  if (teamExpandedId.value === null) return
  teamLoading.value = true
  try {
    await saveTeam(teamExpandedId.value, teamSelectedIds.value)
    teamExpandedId.value = null
  } finally {
    teamLoading.value = false
  }
}

// ── Payroll settings ──────────────────────────────────────────────────────────
const payrollSettings = ref<PayrollSettings>({ payroll_period: 'monthly', payday_1: 15, payday_2: 0 })
const payrollSettingsLoading = ref(false)
const payrollSettingsSaved = ref(false)
const payrollSettingsError = ref<string | null>(null)

const DAY_OPTIONS = [
  { value: 0, label: 'Last day' },
  ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
]

async function loadPayrollSettings() {
  payrollSettingsLoading.value = true
  try {
    payrollSettings.value = await fetchPayrollSettings()
  } catch (e) {
    payrollSettingsError.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    payrollSettingsLoading.value = false
  }
}

async function doSavePayrollSettings() {
  payrollSettingsLoading.value = true
  payrollSettingsSaved.value = false
  payrollSettingsError.value = null
  try {
    await savePayrollSettings(payrollSettings.value)
    payrollSettingsSaved.value = true
    setTimeout(() => { payrollSettingsSaved.value = false }, 2000)
  } catch (e) {
    payrollSettingsError.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    payrollSettingsLoading.value = false
  }
}

// ── Salaxy export ─────────────────────────────────────────────────────────────
const exportDateFrom = ref('')
const exportDateTo = ref('')
const exportPeriods = ref<ExportPeriod[]>([])
const exportSelectedIds = ref<number[]>([])
const exportLoading = ref(false)
const exportError = ref<string | null>(null)
const exportResult = ref<ExportResult | null>(null)

// Default date range: current month
const now = new Date()
const y = now.getFullYear()
const m = String(now.getMonth() + 1).padStart(2, '0')
exportDateFrom.value = `${y}-${m}-01`
exportDateTo.value = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10)

async function doFetchPreview() {
  exportError.value = null
  exportResult.value = null
  exportPeriods.value = []
  exportLoading.value = true
  try {
    exportPeriods.value = await fetchExportPreview(exportDateFrom.value, exportDateTo.value)
    exportSelectedIds.value = exportPeriods.value
      .flatMap(p => p.employees)
      .filter(e => e.pending_hours > 0 || e.pending_km > 0)
      .map(e => e.employee_id)
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : 'Fetch failed'
  } finally {
    exportLoading.value = false
  }
}

function toggleExportEmployee(id: number) {
  const idx = exportSelectedIds.value.indexOf(id)
  if (idx >= 0) exportSelectedIds.value.splice(idx, 1)
  else exportSelectedIds.value.push(id)
}

const exportAllEmployeeIds = computed(() =>
  exportPeriods.value.flatMap(p => p.employees).map(e => e.employee_id),
)

async function doExport(force = false) {
  exportError.value = null
  exportResult.value = null
  exportLoading.value = true
  const ids = force ? exportAllEmployeeIds.value : exportSelectedIds.value
  try {
    exportResult.value = await submitExport(exportDateFrom.value, exportDateTo.value, ids, force)
    exportPeriods.value = []
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : 'Export failed'
  } finally {
    exportLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">Admin Dashboard</h2>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <Tabs default-value="employees" class="w-full" @update:model-value="(v) => { if (v === 'payroll') loadPayrollSettings() }">
      <TabsList class="grid w-full grid-cols-3 mb-4">
        <TabsTrigger value="employees">
          Employees ({{ employees.length }})
        </TabsTrigger>
        <TabsTrigger value="supervisors">
          Supervisors ({{ supervisors.length }})
        </TabsTrigger>
        <TabsTrigger value="payroll">Payroll</TabsTrigger>
      </TabsList>

      <!-- ── Employees tab ── -->
      <TabsContent value="employees">
        <div class="space-y-3">

          <!-- Header actions -->
          <div class="flex items-center gap-2 flex-wrap">
            <Button size="sm" @click="openAddEmp">+ Add Employee</Button>
            <Button variant="outline" size="sm" :disabled="syncing" @click="doSync">
              {{ syncing ? 'Syncing…' : 'Sync from Salaxy' }}
            </Button>
            <Button variant="ghost" size="sm" :disabled="loadingEmps" @click="fetchEmployees">
              {{ loadingEmps ? 'Loading…' : 'Refresh' }}
            </Button>
          </div>

          <!-- Sync result -->
          <p v-if="syncMessage" class="text-sm text-muted-foreground">{{ syncMessage }}</p>

          <!-- Add form -->
          <div v-if="showEmpForm" class="rounded-lg border p-4 space-y-3 bg-muted/40">
            <p class="text-sm font-medium">New Employee</p>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label class="text-xs">Name</Label>
                <Input v-model="empForm.name" placeholder="Full name" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">PIN (3–6 digits)</Label>
                <Input v-model="empForm.pin" placeholder="e.g. 1234" maxlength="6" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Language</Label>
                <select v-model="empForm.ui_language" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
                </select>
              </div>
              <div class="space-y-1 col-span-2">
                <Label class="text-xs">Salaxy ID</Label>
                <Input v-model="empForm.employmentId" placeholder="e.g. 4cae3d5c-29fb-47ba-b7af-e937123cfd4b" class="font-mono text-xs" />
              </div>
            </div>
            <p v-if="empFormError" class="text-xs text-destructive">{{ empFormError }}</p>
            <div class="flex gap-2">
              <Button size="sm" :disabled="empSaving" @click="submitEmpForm">
                {{ empSaving ? 'Saving…' : 'Save' }}
              </Button>
              <Button size="sm" variant="ghost" @click="cancelEmpForm">Cancel</Button>
            </div>
          </div>

          <!-- Employee list -->
          <div
            v-for="emp in employees"
            :key="emp.id"
            class="rounded-lg border p-4 space-y-3 bg-card"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <p class="font-medium text-sm">{{ emp.name }}</p>
                <p class="text-xs text-muted-foreground">PIN: ●●●●</p>
                <p class="text-xs text-muted-foreground font-mono">
                  Salaxy ID: {{ emp.employmentId ?? '—' }}
                </p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <Badge v-if="emp.pending_hours > 0" variant="secondary" class="text-[10px]">
                  {{ emp.pending_hours }}h pending
                </Badge>
                <Badge :variant="emp.active ? 'default' : 'outline'">
                  {{ emp.active ? 'Active' : 'Inactive' }}
                </Badge>
                <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="openEditEmp(emp.id)">
                  Edit
                </Button>
              </div>
            </div>

            <!-- Inline edit form -->
            <div v-if="editingEmpId === emp.id" class="space-y-3 pt-1 border-t">
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <Label class="text-xs">Name</Label>
                  <Input v-model="empForm.name" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">PIN</Label>
                  <Input v-model="empForm.pin" maxlength="6" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Language</Label>
                  <select v-model="empForm.ui_language" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
                  </select>
                </div>
                <div class="space-y-1 col-span-2">
                  <Label class="text-xs">Salaxy ID</Label>
                  <Input v-model="empForm.employmentId" placeholder="e.g. 4cae3d5c-29fb-47ba-b7af-e937123cfd4b" class="font-mono text-xs" />
                </div>
              </div>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" :checked="empForm.active === 1" @change="empForm.active = ($event.target as HTMLInputElement).checked ? 1 : 0" />
                Active
              </label>
              <p v-if="empFormError" class="text-xs text-destructive">{{ empFormError }}</p>
              <div class="flex gap-2">
                <Button size="sm" :disabled="empSaving" @click="submitEmpForm">
                  {{ empSaving ? 'Saving…' : 'Save' }}
                </Button>
                <Button size="sm" variant="ghost" @click="cancelEmpForm">Cancel</Button>
              </div>
            </div>
          </div>

          <p v-if="!loadingEmps && employees.length === 0" class="text-sm text-muted-foreground text-center py-8">
            No employees yet. Add one or sync from Salaxy.
          </p>
        </div>
      </TabsContent>

      <!-- ── Supervisors tab ── -->
      <TabsContent value="supervisors">
        <div class="space-y-3">

          <!-- Header actions -->
          <div class="flex items-center gap-2">
            <Button size="sm" @click="openAddSup">+ Add Supervisor</Button>
            <Button variant="ghost" size="sm" :disabled="loadingSups" @click="fetchSupervisors">
              {{ loadingSups ? 'Loading…' : 'Refresh' }}
            </Button>
          </div>

          <!-- Add form -->
          <div v-if="showSupForm" class="rounded-lg border p-4 space-y-3 bg-muted/40">
            <p class="text-sm font-medium">New Supervisor</p>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label class="text-xs">First Name</Label>
                <Input v-model="supForm.first_name" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Last Name</Label>
                <Input v-model="supForm.last_name" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Email</Label>
                <Input v-model="supForm.email" type="email" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Phone</Label>
                <Input v-model="supForm.phone" type="tel" />
              </div>
              <div class="space-y-1 col-span-2 sm:col-span-1">
                <Label class="text-xs">PIN (3–6 digits)</Label>
                <Input v-model="supForm.pin" placeholder="Required for new" maxlength="6" />
              </div>
            </div>
            <p v-if="supFormError" class="text-xs text-destructive">{{ supFormError }}</p>
            <div class="flex gap-2">
              <Button size="sm" :disabled="supSaving" @click="submitSupForm">
                {{ supSaving ? 'Saving…' : 'Save' }}
              </Button>
              <Button size="sm" variant="ghost" @click="cancelSupForm">Cancel</Button>
            </div>
          </div>

          <!-- Supervisor list -->
          <div
            v-for="sup in supervisors"
            :key="sup.id"
            class="rounded-lg border p-4 space-y-3 bg-card"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="space-y-0.5">
                <p class="font-medium text-sm">{{ sup.first_name }} {{ sup.last_name }}</p>
                <p class="text-xs text-muted-foreground">{{ sup.email }}</p>
                <p class="text-xs text-muted-foreground">{{ sup.phone }}</p>
              </div>
              <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <Badge variant="secondary" class="text-[10px]">Team: {{ sup.team_size }}</Badge>
                <Badge :variant="sup.active ? 'default' : 'outline'">
                  {{ sup.active ? 'Active' : 'Inactive' }}
                </Badge>
              </div>
            </div>

            <div class="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" class="h-7 text-xs" @click="openEditSup(sup.id)">
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-xs"
                :disabled="teamLoading && teamExpandedId === sup.id"
                @click="toggleTeam(sup.id)"
              >
                {{ teamExpandedId === sup.id ? 'Close Team' : 'Manage Team' }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 text-xs text-muted-foreground hover:text-destructive"
                @click="confirmDeleteSup(sup.id)"
              >
                Delete
              </Button>
            </div>

            <!-- Inline edit form -->
            <div v-if="editingSupId === sup.id" class="space-y-3 pt-1 border-t">
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <Label class="text-xs">First Name</Label>
                  <Input v-model="supForm.first_name" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Last Name</Label>
                  <Input v-model="supForm.last_name" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Email</Label>
                  <Input v-model="supForm.email" type="email" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">Phone</Label>
                  <Input v-model="supForm.phone" type="tel" />
                </div>
                <div class="space-y-1">
                  <Label class="text-xs">New PIN (leave blank to keep)</Label>
                  <Input v-model="supForm.pin" maxlength="6" />
                </div>
              </div>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" :checked="supForm.active === 1" @change="supForm.active = ($event.target as HTMLInputElement).checked ? 1 : 0" />
                Active
              </label>
              <p v-if="supFormError" class="text-xs text-destructive">{{ supFormError }}</p>
              <div class="flex gap-2">
                <Button size="sm" :disabled="supSaving" @click="submitSupForm">
                  {{ supSaving ? 'Saving…' : 'Save' }}
                </Button>
                <Button size="sm" variant="ghost" @click="cancelSupForm">Cancel</Button>
              </div>
            </div>

            <!-- Team assignment -->
            <div v-if="teamExpandedId === sup.id" class="space-y-2 pt-1 border-t">
              <p class="text-xs font-medium text-muted-foreground">Team members</p>
              <div v-if="teamLoading" class="text-xs text-muted-foreground">Loading…</div>
              <div v-else class="space-y-1.5 max-h-48 overflow-y-auto">
                <label
                  v-for="member in teamMembers"
                  :key="member.id"
                  class="flex items-center gap-2 text-sm cursor-pointer py-0.5"
                >
                  <input
                    type="checkbox"
                    :checked="teamSelectedIds.includes(member.id)"
                    @change="toggleTeamMember(member.id)"
                  />
                  <span>{{ member.name }}</span>
                  <span v-if="member.other_supervisors" class="text-xs text-muted-foreground">
                    (also: {{ member.other_supervisors }})
                  </span>
                </label>
                <p v-if="teamMembers.length === 0" class="text-xs text-muted-foreground py-2">
                  No employees in this company yet.
                </p>
              </div>
              <div class="flex gap-2 pt-1">
                <Button size="sm" :disabled="teamLoading" @click="submitTeam">Save Team</Button>
                <Button size="sm" variant="ghost" @click="teamExpandedId = null">Cancel</Button>
              </div>
            </div>
          </div>

          <p v-if="!loadingSups && supervisors.length === 0" class="text-sm text-muted-foreground text-center py-8">
            No supervisors yet.
          </p>
        </div>
      </TabsContent>
      <!-- ── Payroll tab ── -->
      <TabsContent value="payroll">
        <div class="space-y-6">

          <!-- Payroll period settings -->
          <div class="rounded-lg border p-4 space-y-4 bg-card">
            <p class="text-sm font-semibold">Payroll Period Settings</p>

            <div class="flex gap-6">
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" value="monthly" v-model="payrollSettings.payroll_period" />
                Monthly
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" value="biweekly" v-model="payrollSettings.payroll_period" />
                Biweekly (1–15 / 16–end)
              </label>
            </div>

            <div v-if="payrollSettings.payroll_period === 'monthly'" class="space-y-1">
              <Label class="text-xs">Payday</Label>
              <select v-model.number="payrollSettings.payday_1" class="h-9 rounded-md border border-input bg-background px-3 text-sm">
                <option v-for="opt in DAY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>

            <div v-else class="flex gap-4">
              <div class="space-y-1">
                <Label class="text-xs">Payday (1–15)</Label>
                <select v-model.number="payrollSettings.payday_1" class="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option v-for="opt in DAY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
              <div class="space-y-1">
                <Label class="text-xs">Payday (16–end)</Label>
                <select v-model.number="payrollSettings.payday_2" class="h-9 rounded-md border border-input bg-background px-3 text-sm">
                  <option v-for="opt in DAY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
              </div>
            </div>

            <p v-if="payrollSettingsError" class="text-xs text-destructive">{{ payrollSettingsError }}</p>
            <div class="flex items-center gap-3">
              <Button size="sm" :disabled="payrollSettingsLoading" @click="doSavePayrollSettings">
                {{ payrollSettingsLoading ? 'Saving…' : 'Save Settings' }}
              </Button>
              <span v-if="payrollSettingsSaved" class="text-xs text-green-600">Saved!</span>
            </div>
          </div>

          <!-- Export to Salaxy -->
          <div class="rounded-lg border p-4 space-y-4 bg-card">
            <p class="text-sm font-semibold">Vie kirjaukset Salaxyyn</p>

            <div class="flex gap-3 flex-wrap items-end">
              <div class="space-y-1">
                <Label class="text-xs">From</Label>
                <Input v-model="exportDateFrom" type="date" class="w-36" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">To</Label>
                <Input v-model="exportDateTo" type="date" class="w-36" />
              </div>
              <Button size="sm" :disabled="exportLoading || !exportDateFrom || !exportDateTo" @click="doFetchPreview">
                {{ exportLoading && !exportPeriods.length ? 'Loading…' : 'Fetch approved entries' }}
              </Button>
            </div>

            <p v-if="exportError" class="text-sm text-destructive">{{ exportError }}</p>

            <!-- Preview -->
            <div v-if="exportPeriods.length" class="space-y-4">
              <div v-for="period in exportPeriods" :key="period.period_start" class="space-y-2">
                <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {{ period.period_label }}
                  <span v-if="period.existing_payroll_id" class="normal-case text-orange-500 ml-2">(previously exported)</span>
                </p>
                <div v-for="emp in period.employees" :key="emp.employee_id" class="flex items-center gap-3 text-sm py-1 border-b last:border-0">
                  <input
                    type="checkbox"
                    :checked="exportSelectedIds.includes(emp.employee_id)"
                    @change="toggleExportEmployee(emp.employee_id)"
                    class="h-4 w-4"
                  />
                  <span class="flex-1">{{ emp.employee_name }}</span>
                  <span class="text-muted-foreground text-xs">
                    {{ emp.total_hours }}h<span v-if="emp.total_km > 0">, {{ emp.total_km }}km</span>
                    <span v-if="emp.pending_hours < emp.total_hours" class="text-orange-500 ml-1">({{ emp.pending_hours }}h new)</span>
                  </span>
                  <span v-if="!emp.salaxy_employment_id" class="text-xs text-destructive">no Salaxy ID</span>
                </div>
              </div>

              <div class="flex gap-2 pt-1">
                <Button
                  size="sm"
                  :disabled="exportLoading || exportSelectedIds.length === 0"
                  @click="doExport(false)"
                >
                  {{ exportLoading ? 'Exporting…' : 'Export to Salaxy' }}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  :disabled="exportLoading || exportAllEmployeeIds.length === 0"
                  @click="doExport(true)"
                >
                  Re-export all
                </Button>
              </div>
            </div>

            <!-- Result -->
            <div v-if="exportResult" class="rounded-md bg-muted p-3 text-sm space-y-1">
              <p class="font-medium text-green-700">Export complete</p>
              <p>Sent: {{ exportResult.total_sent }} entries · Added: {{ exportResult.total_added }} · Already exported: {{ exportResult.total_already }}</p>
              <p v-if="exportResult.errors > 0" class="text-destructive">Errors: {{ exportResult.errors }}</p>
              <div v-for="payroll in exportResult.payrolls" :key="payroll.period_start">
                <a :href="payroll.url" target="_blank" class="text-primary hover:underline text-xs">
                  Open {{ payroll.period_start }} in Salaxy ↗
                </a>
              </div>
            </div>
          </div>

        </div>
      </TabsContent>

    </Tabs>
  </div>
</template>
