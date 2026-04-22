<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminData, validateEmployeeForm } from '@/composables/useAdminData'
import type { TeamMember } from '@/types'

const { t } = useI18n()

const {
  employees, supervisors, loadingEmps, loadingSups, error, syncMessage,
  fetchEmployees, saveEmployee, syncFromSalaxy,
  fetchSupervisors, saveSupervisor, deleteSupervisor, fetchTeam, saveTeam,
} = useAdminData()

onMounted(() => {
  fetchEmployees()
  fetchSupervisors()
})

// ── Name helpers ──────────────────────────────────────────────────────────────
// For employees stored as "Firstname Lastname" single string
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

function infoLine(fields: (string | null | undefined)[]): string {
  return fields.filter(Boolean).join(' · ')
}

// ── Employee section ──────────────────────────────────────────────────────────
const LANG_NAMES: Record<string, string> = {
  en: 'English', fi: 'Suomi', sv: 'Svenska', et: 'Eesti', uk: 'Українська', xh: 'isiXhosa',
}

const empSearch = ref('')
const showEmpForm = ref(false)
const editingEmpId = ref<number | null>(null)
const empForm = ref({ name: '', pin: '', active: 1, ui_language: 'en', employmentId: '', email: '', phone: '', birth_year: '' })
const empFormError = ref<string | null>(null)
const empSaving = ref(false)
const syncing = ref(false)

const sortedFilteredEmployees = computed(() => {
  const q = empSearch.value.trim().toLowerCase()
  return [...employees.value]
    .filter(e => !q || lastFirst(e.name).toLowerCase().includes(q))
    .sort((a, b) => empLastName(a.name).localeCompare(empLastName(b.name), 'fi', { sensitivity: 'base' }))
})

function openAddEmp() {
  editingEmpId.value = null
  empForm.value = { name: '', pin: '', active: 1, ui_language: 'en', employmentId: '', email: '', phone: '', birth_year: '' }
  empFormError.value = null
  showEmpForm.value = true
}

function openEditEmp(id: number) {
  const emp = employees.value.find(e => e.id === id)
  if (!emp) return
  editingEmpId.value = id
  empForm.value = { name: emp.name, pin: emp.pin, active: emp.active, ui_language: emp.ui_language ?? 'en', employmentId: emp.employmentId ?? '', email: emp.email ?? '', phone: emp.phone ?? '', birth_year: emp.birth_year != null ? String(emp.birth_year) : '' }
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
    const birthYearNum = empForm.value.birth_year ? parseInt(empForm.value.birth_year, 10) : null
    const payload = editingEmpId.value
      ? { id: editingEmpId.value, ...empForm.value, birth_year: birthYearNum }
      : { name: empForm.value.name, pin: empForm.value.pin, ui_language: empForm.value.ui_language, employmentId: empForm.value.employmentId, email: empForm.value.email, phone: empForm.value.phone, birth_year: birthYearNum }
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
const supSearch = ref('')
const showSupForm = ref(false)
const editingSupId = ref<number | null>(null)
const supForm = ref({ first_name: '', last_name: '', email: '', phone: '', pin: '', active: 1 })
const supFormError = ref<string | null>(null)
const supSaving = ref(false)

const teamExpandedId = ref<number | null>(null)
const teamMembers = ref<TeamMember[]>([])
const teamSelectedIds = ref<number[]>([])
const teamLoading = ref(false)

const sortedFilteredSupervisors = computed(() => {
  const q = supSearch.value.trim().toLowerCase()
  return [...supervisors.value]
    .filter(s => !q || `${s.last_name} ${s.first_name}`.toLowerCase().includes(q))
    .sort((a, b) => a.last_name.localeCompare(b.last_name, 'fi', { sensitivity: 'base' }))
})

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
    pin: sup.pin ?? '',
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
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">{{ t('admin.dashboard_title') }}</h2>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <Tabs default-value="employees" class="w-full">
      <TabsList class="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="employees">
          {{ t('admin.tab_employees', { count: employees.length }) }}
        </TabsTrigger>
        <TabsTrigger value="supervisors">
          {{ t('admin.tab_supervisors', { count: supervisors.length }) }}
        </TabsTrigger>
      </TabsList>

      <!-- ── Employees tab ── -->
      <TabsContent value="employees">
        <div class="space-y-3">

          <!-- Header actions -->
          <div class="flex items-center gap-2 flex-wrap">
            <Button size="sm" @click="openAddEmp">+ {{ t('admin.add_employee') }}</Button>
            <Button variant="outline" size="sm" :disabled="syncing" @click="doSync">
              {{ syncing ? t('admin.syncing') : t('admin.sync_from_salaxy') }}
            </Button>
            <Button variant="ghost" size="sm" :disabled="loadingEmps" @click="fetchEmployees">
              {{ loadingEmps ? t('common.loading') : t('approval.refresh') }}
            </Button>
          </div>

          <p v-if="syncMessage" class="text-sm text-muted-foreground">{{ syncMessage }}</p>

          <!-- Search -->
          <Input
            v-model="empSearch"
            :placeholder="t('approval.search_placeholder')"
            class="h-8 text-sm"
          />

          <!-- Add form -->
          <div v-if="showEmpForm" class="rounded-lg border p-4 space-y-3 bg-muted/40">
            <p class="text-sm font-medium">{{ t('admin.add_employee_title') }}</p>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label class="text-xs">{{ t('admin.col_name') }}</Label>
                <Input v-model="empForm.name" :placeholder="t('admin.full_name_placeholder')" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">{{ t('admin.pin_digits_label') }}</Label>
                <Input v-model="empForm.pin" placeholder="e.g. 1234" maxlength="6" />
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
            <p v-if="empFormError" class="text-xs text-destructive">{{ empFormError }}</p>
            <div class="flex gap-2">
              <Button size="sm" :disabled="empSaving" @click="submitEmpForm">
                {{ empSaving ? t('common.saving') : t('common.save') }}
              </Button>
              <Button size="sm" variant="ghost" @click="cancelEmpForm">{{ t('common.cancel') }}</Button>
            </div>
          </div>

          <!-- Employee list -->
          <div
            v-for="emp in sortedFilteredEmployees"
            :key="emp.id"
            class="rounded-lg border px-3 py-2.5 bg-card"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-medium text-sm"><span class="font-bold">{{ empLastName(emp.name) }}</span><template v-if="empFirstNames(emp.name)">, {{ empFirstNames(emp.name) }}</template></p>
              <div class="flex items-center gap-1.5 shrink-0">
                <Badge v-if="emp.pending_hours > 0" variant="secondary" class="text-[10px]">
                  {{ emp.pending_hours }}{{ t('admin.hours_pending') }}
                </Badge>
                <Badge v-if="emp.pending_km > 0" variant="secondary" class="text-[10px]">
                  {{ emp.pending_km }} {{ t('admin.km_pending') }}
                </Badge>
                <Badge :variant="emp.active ? 'default' : 'outline'" class="text-[10px]">
                  {{ emp.active ? t('admin.active') : t('admin.inactive') }}
                </Badge>
                <Button variant="ghost" size="sm" class="h-7 px-2 text-xs" @click="openEditEmp(emp.id)">
                  {{ t('common.edit') }}
                </Button>
              </div>
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ infoLine([emp.email, emp.phone, emp.birth_year ? t('admin.birth_year_prefix') + ' ' + emp.birth_year : null, 'PIN: ●●●●']) }}
            </p>
            <p v-if="emp.employmentId" class="text-xs text-muted-foreground font-mono truncate">
              Salaxy ID: {{ emp.employmentId }}
            </p>

            <!-- Inline edit form -->
            <div v-if="editingEmpId === emp.id" class="space-y-3 pt-2 mt-2 border-t">
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
            </div>
          </div>

          <p v-if="!loadingEmps && sortedFilteredEmployees.length === 0" class="text-sm text-muted-foreground text-center py-8">
            {{ empSearch ? t('approval.search_no_results') : t('admin.no_employees_empty') }}
          </p>
        </div>
      </TabsContent>

      <!-- ── Supervisors tab ── -->
      <TabsContent value="supervisors">
        <div class="space-y-3">

          <!-- Header actions -->
          <div class="flex items-center gap-2">
            <Button size="sm" @click="openAddSup">{{ t('admin.add_supervisor') }}</Button>
            <Button variant="ghost" size="sm" :disabled="loadingSups" @click="fetchSupervisors">
              {{ loadingSups ? t('common.loading') : t('approval.refresh') }}
            </Button>
          </div>

          <!-- Search -->
          <Input
            v-model="supSearch"
            :placeholder="t('approval.search_placeholder')"
            class="h-8 text-sm"
          />

          <!-- Add form -->
          <div v-if="showSupForm" class="rounded-lg border p-4 space-y-3 bg-muted/40">
            <p class="text-sm font-medium">{{ t('admin.add_supervisor_title') }}</p>
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
              <div class="space-y-1 col-span-2 sm:col-span-1">
                <Label class="text-xs">{{ t('admin.pin_digits_label') }}</Label>
                <Input v-model="supForm.pin" :placeholder="t('admin.sup_pin_placeholder')" maxlength="6" />
              </div>
            </div>
            <p v-if="supFormError" class="text-xs text-destructive">{{ supFormError }}</p>
            <div class="flex gap-2">
              <Button size="sm" :disabled="supSaving" @click="submitSupForm">
                {{ supSaving ? t('common.saving') : t('common.save') }}
              </Button>
              <Button size="sm" variant="ghost" @click="cancelSupForm">{{ t('common.cancel') }}</Button>
            </div>
          </div>

          <!-- Supervisor list -->
          <div
            v-for="sup in sortedFilteredSupervisors"
            :key="sup.id"
            class="rounded-lg border px-3 py-2.5 bg-card"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="font-medium text-sm"><span class="font-bold">{{ sup.last_name }}</span>, {{ sup.first_name }}</p>
              <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                <Badge variant="secondary" class="text-[10px]">{{ t('admin.team_badge', { count: sup.team_size }) }}</Badge>
                <Badge :variant="sup.active ? 'default' : 'outline'" class="text-[10px]">
                  {{ sup.active ? t('admin.active') : t('admin.inactive') }}
                </Badge>
              </div>
            </div>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ infoLine([sup.email, sup.phone, sup.pin ? 'PIN: ' + sup.pin : null]) }}
            </p>

            <div class="flex gap-2 flex-wrap mt-2">
              <Button variant="outline" size="sm" class="h-7 text-xs" @click="openEditSup(sup.id)">
                {{ t('common.edit') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="h-7 text-xs"
                :disabled="teamLoading && teamExpandedId === sup.id"
                @click="toggleTeam(sup.id)"
              >
                {{ teamExpandedId === sup.id ? t('admin.close_team') : t('admin.manage_team') }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="h-7 text-xs text-muted-foreground hover:text-destructive"
                @click="confirmDeleteSup(sup.id)"
              >
                {{ t('common.delete') }}
              </Button>
            </div>

            <!-- Inline edit form -->
            <div v-if="editingSupId === sup.id" class="space-y-3 pt-2 mt-2 border-t">
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
            <div v-if="teamExpandedId === sup.id" class="space-y-2 pt-2 mt-2 border-t">
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
          </div>

          <p v-if="!loadingSups && sortedFilteredSupervisors.length === 0" class="text-sm text-muted-foreground text-center py-8">
            {{ supSearch ? t('approval.search_no_results') : t('admin.no_supervisors_empty') }}
          </p>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
