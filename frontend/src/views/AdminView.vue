<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Users, Search } from 'lucide-vue-next'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import EmptyState from '@/components/ui/EmptyState.vue'
import HolidayRulesPanel from '@/components/admin/HolidayRulesPanel.vue'
import RecordAbsenceOnBehalf from '@/components/admin/RecordAbsenceOnBehalf.vue'
import { useAdminData, validateEmployeeForm } from '@/composables/useAdminData'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { useRefresh } from '@/composables/useRefresh'
import type { Employee, Supervisor, TeamMember } from '@/types'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const { post } = useApi()

const {
  employees, supervisors, loadingEmps, loadingSups, error, syncMessage,
  fetchEmployees, saveEmployee, syncFromSalaxy, clearSyncFromSalaxy,
  fetchSupervisors, saveSupervisor, deleteSupervisor, fetchTeam, saveTeam,
} = useAdminData()

const { refreshTick } = useRefresh()
watch(refreshTick, () => { fetchEmployees(); fetchSupervisors() })

onMounted(() => {
  fetchEmployees()
  fetchSupervisors()
})

// ── Name helpers ──────────────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  en: 'English', fi: 'Suomi', sv: 'Svenska', et: 'Eesti', uk: 'Українська', xh: 'isiXhosa',
}

function empLastName(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? parts[parts.length - 1]! : name
}

function lastFirst(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2) return name
  return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(' ')}`
}

function empFirstNames(name: string): string {
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? parts.slice(0, -1).join(' ') : ''
}



// ── Unified list ──────────────────────────────────────────────────────────────
type PersonRow = { kind: 'employee'; data: Employee } | { kind: 'supervisor'; data: Supervisor }

const search = ref('')
const roleFilter = ref<string>('all')

const sortedFilteredPeople = computed((): PersonRow[] => {
  const q = search.value.trim().toLowerCase()
  const filter = roleFilter.value || 'all'
  const rows: PersonRow[] = [
    ...employees.value.map(e => ({ kind: 'employee' as const, data: e })),
    ...supervisors.value.map(s => ({ kind: 'supervisor' as const, data: s })),
  ]
  return rows
    .filter(r => {
      if (filter !== 'all' && r.kind !== filter) return false
      if (!q) return true
      const name = r.kind === 'employee'
        ? lastFirst(r.data.name).toLowerCase()
        : `${r.data.last_name} ${r.data.first_name}`.toLowerCase()
      return name.includes(q)
    })
    .sort((a, b) => {
      const aLast = a.kind === 'employee' ? empLastName(a.data.name) : a.data.last_name
      const bLast = b.kind === 'employee' ? empLastName(b.data.name) : b.data.last_name
      return aLast.localeCompare(bLast, 'fi', { sensitivity: 'base' })
    })
})

// ── Employee form ─────────────────────────────────────────────────────────────
const editingEmpId = ref<number | null>(null)
const empForm = ref({ name: '', pin: '', active: 1, ui_language: 'en', employmentId: '', email: '', phone: '', birth_year: '' })
const empFormError = ref<string | null>(null)
const empSaving = ref(false)
const syncing = ref(false)

function openEditEmp(id: number) {
  const emp = employees.value.find(e => e.id === id)
  if (!emp) return
  editingEmpId.value = id
  empForm.value = { name: emp.name, pin: '', active: emp.active, ui_language: emp.ui_language ?? 'en', employmentId: emp.salaxy_employment_id ?? emp.employmentId ?? '', email: emp.email ?? '', phone: emp.phone ?? '', birth_year: emp.birth_year != null ? String(emp.birth_year) : '' }
  empFormError.value = null
}

function cancelEmpForm() {
  editingEmpId.value = null
  empFormError.value = null
}

async function submitEmpForm() {
  const err = validateEmployeeForm(empForm.value.name, empForm.value.pin, !editingEmpId.value)
  if (err) { empFormError.value = err; return }
  empSaving.value = true
  empFormError.value = null
  try {
    const birthYearNum = empForm.value.birth_year ? parseInt(empForm.value.birth_year, 10) : null
    const payload: Parameters<typeof saveEmployee>[0] = {
      name: empForm.value.name,
      active: empForm.value.active,
      ui_language: empForm.value.ui_language,
      employmentId: empForm.value.employmentId,
      email: empForm.value.email,
      phone: empForm.value.phone,
      birth_year: birthYearNum,
    }
    if (editingEmpId.value) {
      payload.id = editingEmpId.value
      if (empForm.value.pin.trim()) payload.pin = empForm.value.pin.trim()
    } else {
      payload.pin = empForm.value.pin.trim()
    }
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

const showClearConfirm = ref(false)
const clearSyncing = ref(false)

async function doClearSync() {
  clearSyncing.value = true
  showClearConfirm.value = false
  await clearSyncFromSalaxy()
  clearSyncing.value = false
}

// ── Supervisor form ───────────────────────────────────────────────────────────
const editingSupId = ref<number | null>(null)
const supForm = ref({ first_name: '', last_name: '', email: '', phone: '', pin: '', active: 1 })
const supFormError = ref<string | null>(null)
const supSaving = ref(false)

const teamExpandedId = ref<number | null>(null)
const teamMembers = ref<TeamMember[]>([])
const teamSelectedIds = ref<number[]>([])
const teamLoading = ref(false)

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
  teamExpandedId.value = null
}

function cancelSupForm() {
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

// ── Record absence on behalf ─────────────────────────────────────────────────
const recordAbsenceForId = ref<number | null>(null)

function openRecordAbsence(employeeId: number) {
  recordAbsenceForId.value = employeeId
}

// ── PIN unlock ───────────────────────────────────────────────────────────────
const unlocking = ref<number | null>(null)

async function unlockPinAccount(id: number, kind: 'employee' | 'supervisor') {
  unlocking.value = id
  const endpoint = kind === 'employee' ? '/api/employees' : '/api/supervisors'
  try {
    const data = await post<{ success: boolean; error?: string }>(endpoint, { id, action: 'unlock_pin' })
    if (!data.success) throw new Error(data.error ?? 'Unlock failed')
    if (kind === 'employee') await fetchEmployees()
    else await fetchSupervisors()
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Unlock failed')
  } finally {
    unlocking.value = null
  }
}

// ── Add drawer ────────────────────────────────────────────────────────────────
const showAddDrawer = ref(false)
const addRole = ref<'employee' | 'supervisor'>('employee')

function openAddDrawer() {
  editingEmpId.value = null
  editingSupId.value = null
  empForm.value = { name: '', pin: '', active: 1, ui_language: 'en', employmentId: '', email: '', phone: '', birth_year: '' }
  supForm.value = { first_name: '', last_name: '', email: '', phone: '', pin: '', active: 1 }
  empFormError.value = null
  supFormError.value = null
  showAddDrawer.value = true
}

function closeAddDrawer() {
  showAddDrawer.value = false
}

async function submitAddForm() {
  if (addRole.value === 'employee') {
    await submitEmpForm()
    if (!empFormError.value) closeAddDrawer()
  } else {
    await submitSupForm()
    if (!supFormError.value) closeAddDrawer()
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">{{ t('admin.employees_title') }}</h2>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <!-- Top action bar -->
    <div class="flex items-center gap-2 flex-wrap">
      <Button size="sm" @click="openAddDrawer">{{ t('admin.people.add_person') }}</Button>
      <Button variant="outline" size="sm" :disabled="syncing" @click="doSync">
        {{ syncing ? t('admin.syncing') : t('admin.sync_from_salaxy') }}
      </Button>
    </div>

    <p v-if="syncMessage" class="text-sm text-muted-foreground">{{ syncMessage }}</p>

    <!-- Testing tools -->
    <div class="rounded border border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20 p-3 space-y-2">
      <p class="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide">Testing only</p>
      <div v-if="!showClearConfirm" class="flex items-center gap-3">
        <Button variant="outline" size="sm" class="text-xs border-amber-400/60 text-amber-700 dark:text-amber-400" :disabled="clearSyncing" @click="showClearConfirm = true">
          {{ clearSyncing ? 'Clearing…' : 'Clear all employees &amp; re-sync from Salaxy' }}
        </Button>
      </div>
      <div v-else class="space-y-2">
        <p class="text-xs text-amber-800 dark:text-amber-300 font-medium">
          This will permanently delete all {{ employees.length }} employees and their time entries from this company, then fetch fresh from Salaxy. This cannot be undone.
        </p>
        <div class="flex gap-2">
          <Button size="sm" class="text-xs bg-destructive hover:bg-destructive/90 text-destructive-foreground" :disabled="clearSyncing" @click="doClearSync">
            Delete all &amp; sync from Salaxy
          </Button>
          <Button size="sm" variant="ghost" class="text-xs" @click="showClearConfirm = false">Cancel</Button>
        </div>
      </div>
    </div>

    <!-- Filter + search bar -->
    <div class="flex items-center gap-3 flex-wrap">
      <ToggleGroup
        :model-value="roleFilter"
        type="single"
        variant="outline"
        :spacing="1"
        @update:model-value="v => roleFilter = (v as string) || 'all'"
      >
        <ToggleGroupItem value="all" class="h-11 px-5 text-sm font-medium">{{ t('admin.people.filter_all') }}</ToggleGroupItem>
        <ToggleGroupItem value="employee" class="h-11 px-5 text-sm font-medium">{{ t('admin.people.filter_employee') }}</ToggleGroupItem>
        <ToggleGroupItem value="supervisor" class="h-11 px-5 text-sm font-medium">{{ t('admin.people.filter_supervisor') }}</ToggleGroupItem>
      </ToggleGroup>
      <Input
        v-model="search"
        :placeholder="t('approval.search_placeholder')"
        class="h-11 text-sm flex-1 min-w-[180px]"
      />
    </div>

    <!-- People list -->
    <div
      v-for="r in sortedFilteredPeople"
      :key="`${r.kind}-${r.data.id}`"
      class="rounded-lg border px-3 py-2.5 bg-card"
    >
      <!-- Employee row -->
      <template v-if="r.kind === 'employee'">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <Badge variant="secondary" class="text-[10px] shrink-0">{{ t('admin.people.badge_employee') }}</Badge>
            <p class="font-medium text-sm truncate">
              <span class="font-bold">{{ empLastName(r.data.name) }}</span><template v-if="empFirstNames(r.data.name)">, {{ empFirstNames(r.data.name) }}</template>
            </p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <RouterLink
              v-if="r.data.pending_count > 0"
              :to="{ name: 'supervisor-home', params: { slug: auth.user?.companySlug }, query: { employee: r.data.id } }"
            >
              <Badge variant="secondary" class="text-[10px] cursor-pointer hover:opacity-80">
                {{ t('admin.pending_approvals', { count: r.data.pending_count }) }}
              </Badge>
            </RouterLink>
            <Badge v-if="r.data.pin_locked" variant="destructive" class="text-[10px]">
              {{ t('admin.pin_locked_badge') }}
            </Badge>
            <Badge v-else-if="r.data.pin_temp_locked" variant="secondary" class="text-[10px] text-amber-600 dark:text-amber-400">
              {{ t('admin.pin_temp_locked_badge') }}
            </Badge>
            <Badge :variant="r.data.active ? 'default' : 'outline'" class="text-[10px]">
              {{ r.data.active ? t('admin.active') : t('admin.inactive') }}
            </Badge>
            <Button
              v-if="r.data.pin_locked"
              variant="outline"
              size="sm"
              class="h-7 px-2 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
              :disabled="unlocking === r.data.id"
              @click="unlockPinAccount(r.data.id, 'employee')"
            >
              {{ t('admin.pin_unlock') }}
            </Button>
            <Button variant="outline" size="sm" class="h-7 px-2 text-xs" @click="openRecordAbsence(r.data.id)">
              {{ t('admin.absence_on_behalf.record_btn') }}
            </Button>
            <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="openEditEmp(r.data.id)">
              {{ t('common.edit') }}
            </Button>
          </div>
        </div>

        <!-- Employee inline edit -->
        <div v-if="editingEmpId === r.data.id" class="space-y-3 pt-2 mt-2 border-t">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_name') }}</Label>
              <Input v-model="empForm.name" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_pin') }}</Label>
              <Input v-model="empForm.pin" maxlength="6" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.language_label') }}</Label>
              <select v-model="empForm.ui_language" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
              </select>
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_email') }}</Label>
              <Input v-model="empForm.email" type="email" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_phone') }}</Label>
              <Input v-model="empForm.phone" type="tel" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_birth_year') }}</Label>
              <Input v-model="empForm.birth_year" maxlength="4" placeholder="e.g. 1990" />
            </div>
            <div class="space-y-1 col-span-2">
              <Label class="text-xs">{{ t('admin.col_employment_id') }}</Label>
              <Input v-model="empForm.employmentId" placeholder="e.g. 4cae3d5c-29fb-47ba-b7af-e937123cfd4b" class="font-mono text-xs" />
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" :checked="empForm.active === 1" @change="empForm.active = ($event.target as HTMLInputElement).checked ? 1 : 0" />
            {{ t('admin.active') }}
          </label>
          <p v-if="empFormError" class="text-xs text-destructive">{{ empFormError }}</p>
          <div class="flex gap-2">
            <Button size="sm" :disabled="empSaving" @click="submitEmpForm">
              {{ empSaving ? t('common.saving') : t('common.save') }}
            </Button>
            <Button size="sm" variant="ghost" @click="cancelEmpForm">{{ t('common.cancel') }}</Button>
          </div>
          <HolidayRulesPanel :employee-id="editingEmpId" />
        </div>
      </template>

      <!-- Supervisor row -->
      <template v-else>
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-1.5 min-w-0">
            <Badge variant="outline" class="text-[10px] shrink-0">{{ t('admin.people.badge_supervisor') }}</Badge>
            <p class="font-medium text-sm truncate"><span class="font-bold">{{ r.data.last_name }}</span>, {{ r.data.first_name }}</p>
          </div>
          <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <Badge variant="secondary" class="text-[10px]">{{ t('admin.team_badge', { count: r.data.team_size }) }}</Badge>
            <Badge v-if="r.data.pin_locked" variant="destructive" class="text-[10px]">
              {{ t('admin.pin_locked_badge') }}
            </Badge>
            <Badge v-else-if="r.data.pin_temp_locked" variant="secondary" class="text-[10px] text-amber-600 dark:text-amber-400">
              {{ t('admin.pin_temp_locked_badge') }}
            </Badge>
            <Badge :variant="r.data.active ? 'default' : 'outline'" class="text-[10px]">
              {{ r.data.active ? t('admin.active') : t('admin.inactive') }}
            </Badge>
            <Button
              v-if="r.data.pin_locked"
              variant="outline"
              size="sm"
              class="h-7 px-2 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
              :disabled="unlocking === r.data.id"
              @click="unlockPinAccount(r.data.id, 'supervisor')"
            >
              {{ t('admin.pin_unlock') }}
            </Button>
          </div>
        </div>

        <div class="flex gap-2 flex-wrap mt-2">
          <Button variant="outline" size="sm" class="h-7 text-xs" @click="openEditSup(r.data.id)">
            {{ t('common.edit') }}
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="h-7 text-xs"
            :disabled="teamLoading && teamExpandedId === r.data.id"
            @click="toggleTeam(r.data.id)"
          >
            {{ teamExpandedId === r.data.id ? t('admin.close_team') : t('admin.manage_team') }}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 text-xs text-muted-foreground hover:text-destructive"
            @click="confirmDeleteSup(r.data.id)"
          >
            {{ t('common.delete') }}
          </Button>
        </div>

        <!-- Supervisor inline edit -->
        <div v-if="editingSupId === r.data.id" class="space-y-3 pt-2 mt-2 border-t">
          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.first_name_label') }}</Label>
              <Input v-model="supForm.first_name" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.last_name_label') }}</Label>
              <Input v-model="supForm.last_name" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_email') }}</Label>
              <Input v-model="supForm.email" type="email" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_phone') }}</Label>
              <Input v-model="supForm.phone" type="tel" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('admin.col_pin') }}</Label>
              <Input v-model="supForm.pin" maxlength="6" :placeholder="t('admin.pin_keep_blank')" />
            </div>
          </div>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" :checked="supForm.active === 1" @change="supForm.active = ($event.target as HTMLInputElement).checked ? 1 : 0" />
            {{ t('admin.active') }}
          </label>
          <p v-if="supFormError" class="text-xs text-destructive">{{ supFormError }}</p>
          <div class="flex gap-2">
            <Button size="sm" :disabled="supSaving" @click="submitSupForm">
              {{ supSaving ? t('common.saving') : t('common.save') }}
            </Button>
            <Button size="sm" variant="ghost" @click="cancelSupForm">{{ t('common.cancel') }}</Button>
          </div>
        </div>

        <!-- Team assignment -->
        <div v-if="teamExpandedId === r.data.id" class="space-y-2 pt-2 mt-2 border-t">
          <p class="text-xs font-medium text-muted-foreground">{{ t('admin.team_members_label') }}</p>
          <div v-if="teamLoading" class="text-xs text-muted-foreground">{{ t('common.loading') }}</div>
          <div v-else class="space-y-1 max-h-48 overflow-y-auto">
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
              <span><span class="font-bold">{{ empLastName(member.name) }}</span><template v-if="empFirstNames(member.name)">, {{ empFirstNames(member.name) }}</template></span>
              <span v-if="member.other_supervisors" class="text-xs text-muted-foreground">
                ({{ t('admin.also') }} {{ member.other_supervisors }})
              </span>
            </label>
            <p v-if="teamMembers.length === 0" class="text-xs text-muted-foreground py-2">
              {{ t('admin.no_company_employees') }}
            </p>
          </div>
          <div class="flex gap-2 pt-1">
            <Button size="sm" :disabled="teamLoading" @click="submitTeam">{{ t('admin.save_team') }}</Button>
            <Button size="sm" variant="ghost" @click="teamExpandedId = null">{{ t('common.cancel') }}</Button>
          </div>
        </div>
      </template>
    </div>

    <EmptyState
      v-if="!loadingEmps && !loadingSups && sortedFilteredPeople.length === 0"
      :title="search ? t('empty.search') : t('empty.people')"
      :body="search ? t('empty.search_body') : t('empty.people_body')"
      :action-label="!search ? t('admin.people.add_person') : undefined"
      :on-action="!search ? openAddDrawer : undefined"
    >
      <Search v-if="search" class="size-10" />
      <Users v-else class="size-10" />
    </EmptyState>

    <!-- Add person drawer -->
    <Sheet v-model:open="showAddDrawer">
      <SheetContent
        side="right"
        :show-close-button="false"
        class="!w-[520px] sm:!max-w-[520px] p-0 flex flex-col overflow-hidden"
      >
        <SheetHeader class="px-6 pt-5 pb-3 border-b shrink-0">
          <SheetTitle class="text-base">{{ t('admin.people.add_title') }}</SheetTitle>
        </SheetHeader>

        <div class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <!-- Role picker -->
          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('admin.people.role_label') }}</Label>
            <div class="flex gap-4">
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" v-model="addRole" value="employee" />
                {{ t('admin.people.role_employee') }}
              </label>
              <label class="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" v-model="addRole" value="supervisor" />
                {{ t('admin.people.role_supervisor') }}
              </label>
            </div>
          </div>

          <!-- Employee fields -->
          <template v-if="addRole === 'employee'">
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.col_name') }}</Label>
                <Input v-model="empForm.name" :placeholder="t('admin.full_name_placeholder')" />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.pin_digits_label') }}</Label>
                <Input v-model="empForm.pin" placeholder="e.g. 1234" maxlength="6" />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.language_label') }}</Label>
                <select v-model="empForm.ui_language" class="h-9 w-full rounded-md border border-input bg-background px-3 text-sm">
                  <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
                </select>
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.col_email') }}</Label>
                <Input v-model="empForm.email" type="email" />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.col_phone') }}</Label>
                <Input v-model="empForm.phone" type="tel" />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.col_birth_year') }}</Label>
                <Input v-model="empForm.birth_year" maxlength="4" placeholder="e.g. 1990" />
              </div>
              <div class="space-y-1.5 col-span-2">
                <Label class="text-xs">{{ t('admin.col_employment_id') }}</Label>
                <Input v-model="empForm.employmentId" placeholder="e.g. 4cae3d5c-29fb-47ba-b7af-e937123cfd4b" class="font-mono text-xs" />
              </div>
            </div>
            <p v-if="empFormError" class="text-xs text-destructive">{{ empFormError }}</p>
          </template>

          <!-- Supervisor fields -->
          <template v-else>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.first_name_label') }}</Label>
                <Input v-model="supForm.first_name" />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.last_name_label') }}</Label>
                <Input v-model="supForm.last_name" />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.col_email') }}</Label>
                <Input v-model="supForm.email" type="email" />
              </div>
              <div class="space-y-1.5">
                <Label class="text-xs">{{ t('admin.col_phone') }}</Label>
                <Input v-model="supForm.phone" type="tel" />
              </div>
              <div class="space-y-1.5 col-span-2 sm:col-span-1">
                <Label class="text-xs">{{ t('admin.pin_digits_label') }}</Label>
                <Input v-model="supForm.pin" :placeholder="t('admin.sup_pin_placeholder')" maxlength="6" />
              </div>
            </div>
            <p v-if="supFormError" class="text-xs text-destructive">{{ supFormError }}</p>
          </template>
        </div>

        <SheetFooter class="px-6 py-4 border-t shrink-0 flex items-center gap-2">
          <span class="flex-1" />
          <Button variant="ghost" size="sm" @click="closeAddDrawer">{{ t('common.cancel') }}</Button>
          <Button size="sm" :disabled="empSaving || supSaving" @click="submitAddForm">
            {{ (empSaving || supSaving) ? t('common.saving') : t('common.save') }}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  </div>

  <RecordAbsenceOnBehalf
    v-if="recordAbsenceForId !== null"
    :employees="employees"
    :preselected-employee-id="recordAbsenceForId"
    @close="recordAbsenceForId = null"
    @saved="recordAbsenceForId = null"
  />
</template>
