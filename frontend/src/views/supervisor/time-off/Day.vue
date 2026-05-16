<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import EmptyState from '@/components/ui/EmptyState.vue'

defineOptions({ name: 'SupervisorDay' })

interface OffEntry {
  employee_id: number
  employee_name: string
  initials: string
  type: 'holiday' | 'absence'
  label: string | null
  start_date: string
  end_date: string
  total_days: number
  day_index: number
  status: string
  source_id: number
}

interface InEntry {
  employee_id: number
  employee_name: string
  initials: string
}

interface WeekDay {
  date: string
  off_count: number
  is_weekend: boolean
}

interface DayViewData {
  offToday: OffEntry[]
  inToday: InEntry[]
  weekStrip: WeekDay[]
  team_total: number
}

const { t } = useI18n({ useScope: 'global' })
const { get } = useApi()

// Date state
const now = new Date()
const viewDate = ref(now.toISOString().slice(0, 10))

const data = ref<DayViewData | null>(null)
const loading = ref(false)

async function fetchDay(date: string) {
  loading.value = true
  try {
    data.value = await get<DayViewData>(`/api/supervisor/day_view?date=${date}`)
  } catch (e) {
    console.error('[Day] fetch failed', e)
  } finally {
    loading.value = false
  }
}

watch(viewDate, fetchDay, { immediate: true })

function prevDay() {
  const d = new Date(viewDate.value + 'T12:00:00')
  d.setDate(d.getDate() - 1)
  viewDate.value = d.toISOString().slice(0, 10)
}

function nextDay() {
  const d = new Date(viewDate.value + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  viewDate.value = d.toISOString().slice(0, 10)
}

const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const parsedDate = computed(() => new Date(viewDate.value + 'T12:00:00'))

const dateLabel = computed(() => {
  const d = parsedDate.value
  return `${DAY_FULL[d.getDay()]!.slice(0, 3).toUpperCase()} ${d.getDate()} ${MON[d.getMonth()]!} ${d.getFullYear()}`
})

const summaryLabel = computed(() => {
  if (!data.value) return ''
  const off = data.value.offToday.length
  const inCount = data.value.inToday.length
  const total = data.value.team_total
  return t('supervisor.day.summary', { off, total, in: inCount })
})

const summaryAvatars = computed((): string[] => {
  if (!data.value) return []
  return data.value.offToday.slice(0, 3).map((e) => e.initials)
})

function weekDayLabel(iso: string): { dow: string; num: number } {
  const d = new Date(iso + 'T12:00:00')
  return { dow: DAY_SHORT[d.getDay()]!, num: d.getDate() }
}

function fmtDecision(entry: OffEntry): string {
  if (entry.status === 'approved') return t('supervisor.day.status_approved')
  return t('supervisor.day.status_pending')
}

function statusColor(entry: OffEntry): string {
  if (entry.type === 'holiday') {
    return entry.status === 'approved' ? 'bg-indigo-600' : 'bg-amber-400'
  }
  return entry.status === 'approved' ? 'bg-sky-500' : 'bg-gray-400'
}

function shortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  return `${MON_SHORT[d.getMonth()]!} ${d.getDate()}`
}
</script>

<template>
  <div class="space-y-4">
    <!-- Date stepper -->
    <div class="flex items-center justify-between">
      <button
        type="button"
        class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors"
        :aria-label="t('calendar.month_nav_prev')"
        @click="prevDay"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="text-sm font-semibold text-foreground">{{ dateLabel }}</span>
      <button
        type="button"
        class="flex items-center justify-center w-9 h-9 rounded-full hover:bg-muted transition-colors"
        :aria-label="t('calendar.month_nav_next')"
        @click="nextDay"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- Week strip -->
    <div v-if="data" class="grid grid-cols-7 gap-1">
      <button
        v-for="wd in data.weekStrip"
        :key="wd.date"
        type="button"
        :disabled="wd.is_weekend"
        :class="[
          'flex flex-col items-center rounded-lg py-1.5 transition-colors',
          wd.date === viewDate
            ? 'bg-indigo-600 text-white'
            : wd.is_weekend
            ? 'opacity-40 cursor-default'
            : 'hover:bg-muted text-foreground',
        ]"
        @click="!wd.is_weekend && (viewDate = wd.date)"
      >
        <span class="text-[9px] font-semibold leading-none">{{ weekDayLabel(wd.date).dow }}</span>
        <span class="text-sm font-bold leading-tight mt-0.5">{{ weekDayLabel(wd.date).num }}</span>
        <span
          :class="[
            'text-[9px] leading-none mt-0.5',
            wd.date === viewDate ? 'text-indigo-200' : 'text-muted-foreground',
          ]"
        >
          {{ wd.off_count > 0 ? t('supervisor.day.off_count', { count: wd.off_count }) : '—' }}
        </span>
      </button>
    </div>

    <!-- Loading spinner -->
    <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
      {{ t('timeOff.loading') }}
    </div>

    <template v-else-if="data">
      <!-- Summary band -->
      <div class="rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3 flex items-center gap-3">
        <div class="flex -space-x-1.5">
          <div
            v-for="(ini, i) in summaryAvatars"
            :key="i"
            class="w-6 h-6 rounded-full bg-indigo-200 border-2 border-white flex items-center justify-center text-[9px] font-bold text-indigo-700"
          >
            {{ ini }}
          </div>
        </div>
        <span class="text-sm font-semibold text-indigo-800">{{ summaryLabel }}</span>
      </div>

      <!-- Off this day -->
      <div v-if="data.offToday.length > 0">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          {{ t('supervisor.day.off_this_day') }}
        </p>
        <div class="divide-y">
          <div v-for="entry in data.offToday" :key="`${entry.type}-${entry.source_id}`" class="flex items-center gap-3 py-3">
            <!-- Avatar -->
            <div class="flex-shrink-0 w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-foreground">
              {{ entry.initials }}
            </div>
            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-foreground">{{ entry.employee_name }}</p>
              <p class="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <span :class="['w-2.5 h-2.5 rounded-sm flex-shrink-0', statusColor(entry)]" />
                {{ entry.label ?? (entry.type === 'holiday' ? t('proposals.untitled') : entry.label) }}
              </p>
              <p class="text-xs text-muted-foreground mt-0.5">
                {{ t('supervisor.day.day_of', { index: entry.day_index, total: entry.total_days }) }}
                · {{ fmtDecision(entry) }}
                <span v-if="entry.status === 'approved' && entry.end_date"> · {{ t('supervisor.day.approved_until', { date: shortDate(entry.end_date) }) }}</span>
              </p>
            </div>
            <!-- Chevron -->
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" class="flex-shrink-0 text-muted-foreground">
              <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- In today -->
      <div v-if="data.inToday.length > 0">
        <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
          {{ t('supervisor.day.in_today') }}
        </p>
        <div class="flex flex-wrap gap-2">
          <div
            v-for="emp in data.inToday"
            :key="emp.employee_id"
            class="flex items-center gap-2 rounded-xl border bg-card px-3 py-2"
          >
            <div class="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground">
              {{ emp.initials }}
            </div>
            <span class="text-sm text-foreground">{{ emp.employee_name.split(' ')[0] }} {{ emp.employee_name.split(' ').slice(1).map((p) => p[0] + '.').join(' ') }}</span>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <EmptyState
        v-if="data.offToday.length === 0 && data.inToday.length === 0"
        :title="t('supervisor.day.everyone_in')"
      />
    </template>
  </div>
</template>
