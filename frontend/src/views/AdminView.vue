<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminData, validateEmployeeForm } from '@/composables/useAdminData'
import type { TeamMember } from '@/types'

const {
  employees, supervisors, loadingEmps, loadingSups, error, syncMessage,
  fetchEmployees, saveEmployee, syncFromSalaxy,
  fetchSupervisors, saveSupervisor, deleteSupervisor, fetchTeam, saveTeam,
} = useAdminData()

onMounted(() => {
  fetchEmployees()
  fetchSupervisors()
})

// ── Employee section ──────────────────────────────────────────────────────────
const showEmpForm = ref(false)
const editingEmpId = ref<number | null>(null)
const empForm = ref({ name: '', pin: '', active: 1 })
const empFormError = ref<string | null>(null)
const empSaving = ref(false)
const syncing = ref(false)

function openAddEmp() {
  editingEmpId.value = null
  empForm.value = { name: '', pin: '', active: 1 }
  empFormError.value = null
  showEmpForm.value = true
}

function openEditEmp(id: number) {
  const emp = employees.value.find(e => e.id === id)
  if (!emp) return
  editingEmpId.value = id
  empForm.value = { name: emp.name, pin: emp.pin, active: emp.active }
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
      : { name: empForm.value.name, pin: empForm.value.pin }
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
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">Admin Dashboard</h2>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <Tabs default-value="employees" class="w-full">
      <TabsList class="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="employees">
          Employees ({{ employees.length }})
        </TabsTrigger>
        <TabsTrigger value="supervisors">
          Supervisors ({{ supervisors.length }})
        </TabsTrigger>
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
    </Tabs>
  </div>
</template>
