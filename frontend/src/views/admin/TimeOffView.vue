<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import SegTabs from '@/components/ui/seg-tabs/SegTabs.vue'
import type { SegTab } from '@/components/ui/seg-tabs/SegTabs.vue'
import TeamCalendar from '@/views/supervisor/time-off/TeamCalendar.vue'
import PerPerson from './time-off/PerPerson.vue'
import PendingUnified from '@/components/time-off/PendingUnified.vue'
import type { PendingAbsence } from '@/components/time-off/PendingUnified.vue'
import RecordAbsenceOnBehalf from '@/components/admin/RecordAbsenceOnBehalf.vue'
import type { SupervisorProposal } from '@/components/time-off/PendingCard.vue'
import type { Employee } from '@/types/index'

defineOptions({ name: 'AdminTimeOffView' })

const { t } = useI18n({ useScope: 'global' })
const { get, post } = useApi()

const activeTab = ref('calendar')
const proposals = ref<SupervisorProposal[]>([])
const loadingProposals = ref(false)

interface StatsData {
  on_holiday_this_month: { employee_name: string; work_days: number }[]
  active_absences_today: { employee_name: string; reason: string; end_date: string }[]
}
const stats = ref<StatsData | null>(null)
const employees = ref<Employee[]>([])
const showRecordAbsence = ref(false)
const recordAbsenceForId = ref<number | null>(null)
const syncing = ref(false)
const syncMessage = ref('')

const pendingAbsences = ref<PendingAbsence[]>([])

async function fetchProposals() {
  loadingProposals.value = true
  try {
    const data = await get<{ proposals: SupervisorProposal[] }>(
      '/api/supervisor/holiday_proposals?status=pending',
    )
    proposals.value = data.proposals
  } catch (e) {
    console.error('[AdminTimeOff] proposals fetch failed', e)
  } finally {
    loadingProposals.value = false
  }
}

async function fetchStats() {
  try {
    stats.value = await get<StatsData>('/api/admin/time_off_stats')
  } catch { /* non-critical */ }
}

async function fetchEmployees() {
  try {
    const data = await get<{ employees: Employee[] }>('/api/employees')
    employees.value = data.employees.filter((e) => e.active === 1)
  } catch { /* non-critical */ }
}

async function fetchPendingAbsences() {
  try {
    const data = await get<{ absences: PendingAbsence[] }>('/api/supervisor/pending_absences')
    pendingAbsences.value = data.absences
  } catch { /* non-critical */ }
}

onMounted(() => { fetchProposals(); fetchPendingAbsences(); fetchStats(); fetchEmployees() })

const pendingCount = computed(() => proposals.value.filter((p) => p.status === 'pending').length + pendingAbsences.value.length)

const segTabs = computed((): SegTab[] => [
  { id: 'calendar', label: t('admin.timeoff.tab_calendar') },
  { id: 'per-person', label: t('admin.timeoff.tab_per_person') },
  { id: 'pending', label: t('admin.timeoff.tab_pending', { count: pendingCount.value }) },
  { id: 'paid', label: t('admin.timeoff.tab_paid') },
])

const year = computed(() => new Date().getFullYear())
const totalEmployees = computed(() => employees.value.length)

function openRecordAbsence(employeeId?: number) {
  recordAbsenceForId.value = employeeId ?? null
  showRecordAbsence.value = true
}

async function syncFromSalaxy() {
  syncing.value = true
  syncMessage.value = ''
  try {
    const data = await post<{ imported: number; skipped: number }>('/api/admin/sync_holidays_from_salaxy', {})
    syncMessage.value = t('admin.timeoff.sync_result', { imported: data.imported, skipped: data.skipped })
    if (data.imported > 0) fetchProposals()
  } catch {
    syncMessage.value = t('admin.timeoff.sync_error')
  } finally {
    syncing.value = false
  }
}

function onAbsenceSaved() {
  showRecordAbsence.value = false
  fetchStats()
  fetchProposals()
}
</script>

<template>
  <div class="space-y-5">
    <!-- Header -->
    <div class="flex items-start justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-lg font-semibold">{{ t('admin.timeoff.title', { year }) }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t('admin.timeoff.subtitle', { employees: totalEmployees, pending: pendingCount }) }}
        </p>
      </div>
      <div class="flex items-center gap-2 flex-wrap shrink-0">
        <span v-if="syncMessage" class="text-xs text-muted-foreground">{{ syncMessage }}</span>
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-background hover:bg-muted transition-colors"
          :disabled="syncing"
          @click="syncFromSalaxy"
        >
          {{ syncing ? t('common.loading') : t('admin.timeoff.sync_from_salaxy_btn') }}
        </button>
        <button
          type="button"
          class="px-3 py-1.5 text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
          @click="openRecordAbsence()"
        >
          {{ t('admin.timeoff.record_absence_btn') }}
        </button>
      </div>
    </div>

    <!-- Stats cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <!-- Holiday proposals -->
      <div class="rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 mb-1">
          {{ t('admin.timeoff.stat_proposals') }}
        </p>
        <p class="text-3xl font-bold text-amber-700 dark:text-amber-400">{{ pendingCount }}</p>
        <p class="text-xs text-amber-600 dark:text-amber-500 mt-1">{{ t('admin.timeoff.stat_proposals_sub') }}</p>
      </div>

      <!-- On holiday this month -->
      <div class="rounded-lg border border-border bg-card p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          {{ t('admin.timeoff.stat_holiday_month') }}
        </p>
        <p class="text-3xl font-bold text-foreground">{{ stats?.on_holiday_this_month.length ?? 0 }}</p>
        <p class="text-xs text-muted-foreground mt-1 truncate">
          {{ stats?.on_holiday_this_month.slice(0, 2).map(r => r.employee_name.split(' ')[0]).join(', ') || '—' }}
        </p>
      </div>

      <!-- Active absences -->
      <div class="rounded-lg border border-border bg-card p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          {{ t('admin.timeoff.stat_absences') }}
        </p>
        <p class="text-3xl font-bold text-foreground">{{ stats?.active_absences_today.length ?? 0 }}</p>
        <p class="text-xs text-muted-foreground mt-1 truncate">
          {{ stats?.active_absences_today[0]
            ? `${stats.active_absences_today[0].employee_name.split(' ')[0]} — ${stats.active_absences_today[0].reason}`
            : '—' }}
        </p>
      </div>

      <!-- Days planned vs accrued (placeholder) -->
      <div class="rounded-lg border border-border bg-card p-4">
        <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          {{ t('admin.timeoff.stat_planned') }}
        </p>
        <p class="text-3xl font-bold text-foreground">—</p>
        <p class="text-xs text-muted-foreground mt-1">{{ t('admin.timeoff.stat_planned_sub') }}</p>
      </div>
    </div>

    <!-- SegTabs -->
    <SegTabs :tabs="segTabs" :active="activeTab" @change="activeTab = $event" />

    <!-- Tab content -->
    <TeamCalendar v-if="activeTab === 'calendar'" />
    <PerPerson v-else-if="activeTab === 'per-person'" />
    <PendingUnified
      v-else-if="activeTab === 'pending'"
      :proposals="proposals"
      :absences="pendingAbsences"
      :loading="loadingProposals"
      @reviewed="fetchProposals(); fetchPendingAbsences(); fetchStats()"
    />
    <div v-else class="py-16 text-center text-sm text-muted-foreground">
      {{ t('common.coming_soon') }}
    </div>
  </div>

  <!-- Record absence dialog -->
  <RecordAbsenceOnBehalf
    v-if="showRecordAbsence"
    :employees="employees"
    :preselected-employee-id="recordAbsenceForId ?? undefined"
    @close="showRecordAbsence = false"
    @saved="onAbsenceSaved"
  />
</template>
