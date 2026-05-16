<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-vue-next'
import { useMobileShell } from '@/composables/useMobileShell'
import { useApi } from '@/composables/useApi'
import PersonRibbon from '@/components/time-off/PersonRibbon.vue'
import type { RibbonSpan, RibbonPerson } from '@/components/time-off/PersonRibbon.vue'

defineOptions({ name: 'TeamCalendarView' })

const { t } = useI18n({ useScope: 'global' })
const { isMobile } = useMobileShell()
const { get } = useApi()

interface CalendarPerson extends RibbonPerson {
  spans: RibbonSpan[]
}

interface Stats {
  total: number
  off_any_day: number
  range_start: string
  range_end: string
  mode: 'month' | 'year'
}

const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth() + 1) // 1-12

const people = ref<CalendarPerson[]>([])
const stats = ref<Stats | null>(null)
const loading = ref(false)
const collapsed = ref<Set<number>>(new Set())

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const monthLabel = computed(() => {
  const name = MONTH_NAMES[viewMonth.value - 1]!
  return `${name} ${viewYear.value}`
})

// Mobile: fetch one month at a time
async function fetchMonth() {
  loading.value = true
  try {
    const month = `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}`
    const data = await get<{ people: CalendarPerson[]; stats: Stats }>(
      `/api/team_calendar?month=${month}`,
    )
    people.value = data.people
    stats.value = data.stats
  } catch (e) {
    console.error('[TeamCalendar] fetch failed', e)
  } finally {
    loading.value = false
  }
}

// Desktop: fetch full year
async function fetchYear() {
  loading.value = true
  try {
    const data = await get<{ people: CalendarPerson[]; stats: Stats }>(
      `/api/team_calendar?year=${viewYear.value}`,
    )
    people.value = data.people
    stats.value = data.stats
  } catch (e) {
    console.error('[TeamCalendar] fetch failed', e)
  } finally {
    loading.value = false
  }
}

function fetch() {
  if (isMobile.value) fetchMonth()
  else fetchYear()
}

onMounted(fetch)
watch(viewMonth, fetch)
watch(viewYear, fetch)
watch(isMobile, fetch)

function prevMonth() {
  if (viewMonth.value === 1) { viewMonth.value = 12; viewYear.value-- }
  else viewMonth.value--
}
function nextMonth() {
  if (viewMonth.value === 12) { viewMonth.value = 1; viewYear.value++ }
  else viewMonth.value++
}

const daysInViewMonth = computed(() => new Date(viewYear.value, viewMonth.value, 0).getDate())

function isWeekend(year: number, month: number, day: number): boolean {
  const dow = new Date(year, month - 1, day).getDay()
  return dow === 0 || dow === 6
}

// Desktop: spans filtered to a specific month
function spansForMonth(person: CalendarPerson, month: number): RibbonSpan[] {
  const y = String(viewYear.value)
  const m = String(month).padStart(2, '0')
  const start = `${y}-${m}-01`
  const end = `${y}-${m}-31`
  return person.spans.filter((s) => s.start_date <= end && s.end_date >= start)
}

function toggleCollapse(id: number) {
  if (collapsed.value.has(id)) collapsed.value.delete(id)
  else collapsed.value.add(id)
  // trigger reactivity
  collapsed.value = new Set(collapsed.value)
}
</script>

<template>
  <!-- Mobile: single-month ribbon view -->
  <div v-if="isMobile" class="pb-20">
    <!-- Month nav -->
    <div class="flex items-center justify-between mb-3">
      <button
        type="button"
        class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
        @click="prevMonth"
      >
        <ChevronLeft class="w-4 h-4" />
      </button>
      <span class="text-sm font-semibold text-foreground">{{ monthLabel }}</span>
      <button
        type="button"
        class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
        @click="nextMonth"
      >
        <ChevronRight class="w-4 h-4" />
      </button>
    </div>

    <!-- Day-number header (aligned with ribbon cells) -->
    <div class="flex items-center mb-1">
      <div class="w-[78px] shrink-0" />
      <div class="flex flex-1 gap-px">
        <div
          v-for="day in daysInViewMonth"
          :key="day"
          class="flex-1 flex items-center justify-center"
          style="height: 18px"
        >
          <span
            :class="[
              'text-[9px] select-none leading-none',
              isWeekend(viewYear, viewMonth, day) ? 'text-muted-foreground/40' : 'text-muted-foreground/70',
            ]"
          >{{ day }}</span>
        </div>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
      {{ t('common.loading') }}
    </div>

    <!-- Ribbons -->
    <div v-else-if="people.length > 0" class="space-y-px">
      <PersonRibbon
        v-for="person in people"
        :key="person.id"
        :year="viewYear"
        :month="viewMonth"
        :person="person"
        :spans="person.spans"
        :cell-height="24"
      />
    </div>

    <p v-else class="py-8 text-center text-sm text-muted-foreground">
      {{ t('supervisor.calendar.empty') }}
    </p>

    <!-- Legend -->
    <div class="flex items-center gap-3 mt-4 flex-wrap">
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-sm bg-indigo-500" />
        <span class="text-[10px] text-muted-foreground">{{ t('supervisor.calendar.legend_holiday') }}</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-sm bg-amber-400" />
        <span class="text-[10px] text-muted-foreground">{{ t('supervisor.calendar.legend_pending') }}</span>
      </div>
      <div class="flex items-center gap-1">
        <div class="w-3 h-3 rounded-sm bg-sky-400" />
        <span class="text-[10px] text-muted-foreground">{{ t('supervisor.calendar.legend_absence') }}</span>
      </div>
    </div>
  </div>

  <!-- Desktop: full-year view per person -->
  <div v-else class="space-y-6">
    <!-- Year nav + stats -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          @click="viewYear--"
        >
          <ChevronLeft class="w-4 h-4" />
        </button>
        <span class="text-base font-semibold text-foreground w-12 text-center">{{ viewYear }}</span>
        <button
          type="button"
          class="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
          @click="viewYear++"
        >
          <ChevronRight class="w-4 h-4" />
        </button>
      </div>

      <!-- Stats -->
      <div v-if="stats" class="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          {{ t('supervisor.calendar.stats_team', { count: stats.total }) }}
        </span>
        <span>
          {{ t('supervisor.calendar.stats_off', { count: stats.off_any_day }) }}
        </span>
      </div>

      <!-- Legend inline -->
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-sm bg-indigo-500" />
          <span class="text-[11px] text-muted-foreground">{{ t('supervisor.calendar.legend_holiday') }}</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-sm bg-amber-400" />
          <span class="text-[11px] text-muted-foreground">{{ t('supervisor.calendar.legend_pending') }}</span>
        </div>
        <div class="flex items-center gap-1">
          <div class="w-3 h-3 rounded-sm bg-sky-400" />
          <span class="text-[11px] text-muted-foreground">{{ t('supervisor.calendar.legend_absence') }}</span>
        </div>
      </div>
    </div>

    <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
      {{ t('common.loading') }}
    </div>

    <!-- Per-person sections -->
    <div v-else-if="people.length > 0" class="space-y-3">
      <div
        v-for="person in people"
        :key="person.id"
        class="border border-border rounded-lg overflow-hidden"
      >
        <!-- Person header -->
        <button
          type="button"
          class="w-full flex items-center gap-3 px-4 py-2.5 bg-muted/30 hover:bg-muted/50 transition-colors"
          @click="toggleCollapse(person.id)"
        >
          <div
            class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0"
          >
            {{ person.initials }}
          </div>
          <span class="text-sm font-medium text-foreground flex-1 text-left">{{ person.name }}</span>
          <span class="text-xs text-muted-foreground mr-1">
            {{ t('supervisor.calendar.spans_count', { count: person.spans.length }) }}
          </span>
          <ChevronUp v-if="!collapsed.has(person.id)" class="w-4 h-4 text-muted-foreground" />
          <ChevronDown v-else class="w-4 h-4 text-muted-foreground" />
        </button>

        <!-- 12-month ribbons -->
        <div v-if="!collapsed.has(person.id)" class="divide-y divide-border">
          <PersonRibbon
            v-for="m in 12"
            :key="m"
            :year="viewYear"
            :month="m"
            :person="person"
            :spans="spansForMonth(person, m)"
            :sidebar-label="MONTH_NAMES[m - 1]"
            :cell-height="28"
            :fixed-cols="true"
            :show-day-numbers="true"
          />
        </div>
      </div>
    </div>

    <p v-else class="py-8 text-center text-sm text-muted-foreground">
      {{ t('supervisor.calendar.empty') }}
    </p>
  </div>
</template>
