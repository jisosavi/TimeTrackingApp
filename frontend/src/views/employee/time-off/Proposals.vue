<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import SegTabs from '@/components/ui/seg-tabs/SegTabs.vue'
import type { SegTab } from '@/components/ui/seg-tabs/SegTabs.vue'
import AbsenceSheet from '@/components/time-off/AbsenceSheet.vue'
import type { Proposal } from '@/composables/useTimeOff'
import type { AbsenceRecord } from '@/composables/useAbsences'

defineOptions({ name: 'TimeOffProposals' })

const props = defineProps<{
  proposals: Proposal[]
  absences: AbsenceRecord[]
  activeSegTab: string
  loading: boolean
}>()

const emit = defineEmits<{
  'update:activeSegTab': [val: string]
  'absence-saved': []
}>()

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const auth = useAuthStore()

const absenceOpen = ref(false)
const filter = ref<'all' | 'pending' | 'approved'>('all')

const segTabs = computed((): SegTab[] => [
  { id: 'overview', label: t('timeOff.overview') },
  { id: 'calendar', label: t('timeOff.calendar') },
  { id: 'proposals', label: t('timeOff.proposals') },
])

// Merge proposals + absences into a unified view model, excluding rejected
interface Row {
  id: string
  type: 'holiday' | 'absence'
  label: string
  startDate: string
  endDate: string
  days: number
  isPaid?: boolean
  affectsAccrual?: boolean
  source?: string | null
  status: 'pending' | 'approved'
  createdAt: string
  decidedAt: string | null
}

const allRows = computed((): Row[] => {
  const rows: Row[] = []

  for (const p of props.proposals) {
    if (p.status === 'rejected' || p.status === 'withdrawn') continue
    rows.push({
      id: `p-${p.id}`,
      type: 'holiday',
      label: p.label ?? t('proposals.untitled'),
      startDate: p.start_date,
      endDate: p.end_date,
      days: p.work_days,
      source: p.source,
      status: p.status === 'approved' ? 'approved' : 'pending',
      createdAt: p.created_at,
      decidedAt: p.decided_at,
    })
  }

  for (const a of props.absences) {
    if (a.status === 'rejected') continue
    rows.push({
      id: `a-${a.id}`,
      type: 'absence',
      label: a.reason,
      startDate: a.start_date,
      endDate: a.end_date,
      days: a.days,
      isPaid: !!a.is_paid,
      affectsAccrual: !!a.affects_accrual,
      status: a.status === 'approved' ? 'approved' : 'pending',
      createdAt: a.created_at,
      decidedAt: a.decided_at,
    })
  }

  return rows.sort((a, b) => b.startDate.localeCompare(a.startDate))
})

const filteredRows = computed(() =>
  filter.value === 'all' ? allRows.value : allRows.value.filter((r) => r.status === filter.value),
)

const pendingCount = computed(() => allRows.value.filter((r) => r.status === 'pending').length)
const approvedCount = computed(() => allRows.value.filter((r) => r.status === 'approved').length)

// ── Date formatting ──────────────────────────────────────────────────────────

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  const sName = DAY[s.getDay()]!
  const eName = DAY[e.getDay()]!
  const eMon = MON[e.getMonth()]!
  const eYear = e.getFullYear()

  if (start === end) {
    return `${sName} ${s.getDate()} ${MON[s.getMonth()]!} ${s.getFullYear()}`
  }
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${sName} ${s.getDate()} – ${eName} ${e.getDate()} ${eMon} ${eYear}`
  }
  return `${sName} ${s.getDate()} ${MON[s.getMonth()]!} – ${eName} ${e.getDate()} ${eMon} ${eYear}`
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${MON[d.getMonth()]!} ${d.getDate()}`
}

function timeSince(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (diff === 0) return t('proposals.submitted_today')
  if (diff === 1) return t('proposals.submitted_ago', { age: t('proposals.age_one_day') })
  if (diff < 30) return t('proposals.submitted_ago', { age: t('proposals.age_days', { count: diff }) })
  const months = Math.floor(diff / 30)
  if (months === 1) return t('proposals.submitted_ago', { age: t('proposals.age_one_month') })
  return t('proposals.submitted_ago', { age: t('proposals.age_months', { count: months }) })
}

function subLine(row: Row): string {
  if (row.type === 'absence') {
    const parts = [t('proposals.auto_approved')]
    if (row.affectsAccrual) parts.push(t('proposals.accrues_holiday'))
    return parts.join(' · ')
  }
  if (row.status === 'approved' && row.decidedAt) {
    return t('proposals.approved_on', { date: fmtShortDate(row.decidedAt) })
  }
  const age = timeSince(row.createdAt)
  if (row.source === 'calendar') return `${age} ${t('proposals.via_calendar')}`
  if (row.source === 'chat') return `${age} ${t('proposals.via_chat')}`
  return age
}

function daysLabel(row: Row): string {
  if (row.type === 'absence') {
    return row.isPaid
      ? t('proposals.paid_days', { count: row.days })
      : t('proposals.unpaid_days', { count: row.days })
  }
  return t('proposals.work_days', { count: row.days })
}

function navigateBack() {
  router.push({ name: 'employee-home', params: { slug: auth.user?.companySlug } })
}
</script>

<template>
  <!-- Header row -->
  <div class="flex items-start justify-between mb-3">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 rounded-full text-foreground hover:bg-muted transition-colors"
        @click="navigateBack"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div>
        <p class="text-lg font-bold leading-tight text-foreground">{{ t('timeOff.title') }}</p>
        <p class="text-xs text-muted-foreground leading-tight">{{ t('proposals.subtitle') }}</p>
      </div>
    </div>
    <button
      type="button"
      class="flex items-center justify-center w-9 h-9 rounded-xl border border-input text-foreground hover:bg-muted transition-colors text-lg font-light"
      :aria-label="t('absence.title')"
      @click="absenceOpen = true"
    >
      +
    </button>
  </div>

  <!-- SegTabs -->
  <SegTabs
    :tabs="segTabs"
    :active="activeSegTab"
    class="mb-4"
    @change="emit('update:activeSegTab', $event)"
  />

  <!-- Filter chips -->
  <div class="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
    <button
      type="button"
      :class="[
        'flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        filter === 'all'
          ? 'bg-indigo-600 text-white'
          : 'border border-indigo-400 text-indigo-600 bg-transparent',
      ]"
      @click="filter = 'all'"
    >
      {{ t('proposals.filter_all', { count: allRows.length }) }}
    </button>
    <button
      type="button"
      :class="[
        'flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        filter === 'pending'
          ? 'bg-amber-500 text-white'
          : 'border border-amber-400 text-amber-700 bg-transparent',
      ]"
      @click="filter = 'pending'"
    >
      {{ t('proposals.filter_pending', { count: pendingCount }) }}
    </button>
    <button
      type="button"
      :class="[
        'flex-shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-colors',
        filter === 'approved'
          ? 'bg-green-600 text-white'
          : 'border border-green-500 text-green-700 bg-transparent',
      ]"
      @click="filter = 'approved'"
    >
      {{ t('proposals.filter_approved', { count: approvedCount }) }}
    </button>
  </div>

  <!-- Loading -->
  <div v-if="loading" class="py-12 text-center text-sm text-muted-foreground">
    {{ t('timeOff.loading') }}
  </div>

  <!-- Empty state -->
  <div v-else-if="filteredRows.length === 0" class="py-12 text-center text-sm text-muted-foreground">
    {{ t('proposals.empty') }}
  </div>

  <!-- List -->
  <div v-else class="divide-y pb-20">
    <div v-for="row in filteredRows" :key="row.id" class="py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <p class="text-sm font-bold text-foreground">{{ row.label }}</p>
          <p class="text-sm text-muted-foreground mt-0.5">
            {{ fmtRange(row.startDate, row.endDate) }}
            &nbsp;·&nbsp;
            {{ daysLabel(row) }}
          </p>
          <p class="text-xs text-muted-foreground mt-0.5">{{ subLine(row) }}</p>
        </div>
        <span
          :class="[
            'flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium border mt-0.5',
            row.status === 'approved'
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-amber-50 text-amber-700 border-amber-200',
          ]"
        >
          {{
            row.status === 'approved'
              ? t('timeOff.status.approved')
              : t('timeOff.status.pending')
          }}
        </span>
      </div>
    </div>
  </div>

  <!-- AbsenceSheet -->
  <AbsenceSheet
    v-model:open="absenceOpen"
    @saved="emit('absence-saved')"
  />
</template>
