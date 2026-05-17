<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMobileShell } from '@/composables/useMobileShell'
import SegTabs from '@/components/ui/seg-tabs/SegTabs.vue'
import type { SegTab } from '@/components/ui/seg-tabs/SegTabs.vue'
import MonthGrid from '@/components/time-off/MonthGrid.vue'
import type { DayState } from '@/components/time-off/MonthGrid.vue'
import ProposeSheet from '@/components/time-off/ProposeSheet.vue'
import AbsenceSheet from '@/components/time-off/AbsenceSheet.vue'
import type { Proposal } from '@/composables/useTimeOff'

defineOptions({ name: 'TimeOffCalendar' })

const props = defineProps<{
  proposals: Proposal[]
  activeSegTab: string
}>()

const emit = defineEmits<{
  'update:activeSegTab': [val: string]
  proposed: []
  'absence-saved': []
}>()

const { t } = useI18n({ useScope: 'global' })
const { isMobile } = useMobileShell()

// Month navigation
const now = new Date()
const viewYear = ref(now.getFullYear())
const viewMonth = ref(now.getMonth() + 1)

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const monthLabel = computed(() => `${MONTH_NAMES[viewMonth.value - 1]!} ${viewYear.value}`)

function prevMonth() {
  if (viewMonth.value === 1) { viewYear.value--; viewMonth.value = 12 }
  else viewMonth.value--
}
function nextMonth() {
  if (viewMonth.value === 12) { viewYear.value++; viewMonth.value = 1 }
  else viewMonth.value++
}

const segTabs = computed((): SegTab[] => [
  { id: 'overview', label: t('timeOff.overview') },
  { id: 'calendar', label: t('timeOff.calendar') },
  { id: 'proposals', label: t('timeOff.proposals') },
])

// Build grid data from proposals
const gridData = computed((): Record<number, DayState> => {
  const prefix = `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}-`
  const daysInMonth = new Date(viewYear.value, viewMonth.value, 0).getDate()
  const result: Record<number, DayState> = {}
  for (const p of props.proposals) {
    if (p.status === 'withdrawn' || p.status === 'rejected') continue
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = prefix + String(d).padStart(2, '0')
      if (iso >= p.start_date && iso <= p.end_date) {
        result[d] = p.status === 'approved' ? 'h-app' : 'p'
      }
    }
  }
  return result
})

// Pick mode: idle → start-picked → done
const pickStartIso = ref<string | null>(null)
const pickEndIso = ref<string | null>(null)
// 'idle' = no pick active, 'picking' = start set awaiting end, 'done' = both set
type PickState = 'idle' | 'picking' | 'done'
const pickState = ref<PickState>('idle')

function dayToIso(day: number): string {
  return `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function onTap(day: number) {
  const iso = dayToIso(day)
  if (pickState.value === 'idle') {
    pickStartIso.value = iso
    pickEndIso.value = null
    pickState.value = 'picking'
  } else if (pickState.value === 'picking') {
    if (iso >= pickStartIso.value!) {
      pickEndIso.value = iso
      pickState.value = 'done'
    } else {
      pickStartIso.value = iso
      pickEndIso.value = null
    }
  } else {
    // done → start new pick
    pickStartIso.value = iso
    pickEndIso.value = null
    pickState.value = 'picking'
  }
}

function clearPick() {
  pickState.value = 'idle'
  pickStartIso.value = null
  pickEndIso.value = null
}

const selectedDays = computed((): number[] => {
  if (!pickStartIso.value) return []
  const startIso = pickStartIso.value
  const endIso = pickEndIso.value ?? pickStartIso.value
  const prefix = `${viewYear.value}-${String(viewMonth.value).padStart(2, '0')}-`
  const daysInMonth = new Date(viewYear.value, viewMonth.value, 0).getDate()
  const days: number[] = []
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = prefix + String(d).padStart(2, '0')
    if (iso >= startIso && iso <= endIso) days.push(d)
  }
  return days
})

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

const captionText = computed(() => {
  if (!pickStartIso.value) return ''
  if (!pickEndIso.value) return fmtDate(pickStartIso.value)
  return `${fmtDate(pickStartIso.value)} – ${fmtDate(pickEndIso.value)}`
})

// ProposeSheet / AbsenceSheet
const proposeOpen = ref(false)
const absenceOpen = ref(false)

function onContinue() {
  proposeOpen.value = true
}

function onProposed() {
  proposeOpen.value = false
  clearPick()
  emit('proposed')
}
</script>

<template>
  <div :class="isMobile ? '' : 'max-w-md mx-auto'">
    <!-- SegTabs -->
    <SegTabs
      :tabs="segTabs"
      :active="activeSegTab"
      class="mb-4"
      @change="emit('update:activeSegTab', $event)"
    />

    <!-- Month nav -->
    <div class="flex items-center justify-between mb-3">
      <button
        type="button"
        class="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors"
        :aria-label="t('calendar.month_nav_prev')"
        @click="prevMonth"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <span class="text-sm font-semibold text-foreground">{{ monthLabel }}</span>
      <button
        type="button"
        class="flex items-center justify-center w-11 h-11 rounded-full hover:bg-muted transition-colors"
        :aria-label="t('calendar.month_nav_next')"
        @click="nextMonth"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- Grid -->
    <MonthGrid
      :year="viewYear"
      :month="viewMonth"
      :data="gridData"
      :selected="selectedDays"
      class="mb-3"
      @tap="onTap"
    />

    <!-- Caption strip (shown when pick active) -->
    <div
      v-if="pickStartIso"
      class="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2.5 mb-3 flex items-center justify-between"
    >
      <span class="text-sm font-medium text-indigo-700">{{ captionText }}</span>
      <button
        type="button"
        class="text-xs text-muted-foreground hover:text-foreground transition-colors"
        @click="clearPick"
      >
        {{ t('calendar.clear') }}
      </button>
    </div>

    <!-- Legend 2×2 -->
    <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-20">
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-full bg-indigo-600 flex-shrink-0" />
        <span class="text-[11px] text-muted-foreground">{{ t('calendar.legend_h_app') }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-full bg-amber-50 border border-amber-400 flex-shrink-0" />
        <span class="text-[11px] text-muted-foreground">{{ t('calendar.legend_p') }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-full bg-sky-50 border border-sky-400 flex-shrink-0" />
        <span class="text-[11px] text-muted-foreground">{{ t('calendar.legend_a_paid') }}</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-full bg-gray-100 border border-gray-400 flex-shrink-0" />
        <span class="text-[11px] text-muted-foreground">{{ t('calendar.legend_a_unpaid') }}</span>
      </div>
    </div>

    <!-- Sticky bottom CTA -->
    <div
      class="sticky z-20 py-3 bg-background"
      :class="isMobile ? 'bottom-[72px]' : 'bottom-4'"
    >
      <!-- Done: clear + continue -->
      <div v-if="pickState === 'done'" class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-xl border border-input font-medium py-3 text-sm text-foreground hover:bg-muted transition-colors"
          @click="clearPick"
        >
          {{ t('calendar.clear') }}
        </button>
        <button
          type="button"
          class="flex-1 rounded-xl bg-indigo-600 text-white font-semibold py-3 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          @click="onContinue"
        >
          {{ t('calendar.continue') }}
        </button>
      </div>
      <!-- Picking: hint -->
      <div v-else-if="pickState === 'picking'" class="py-2.5 text-center text-xs text-muted-foreground">
        {{ t('calendar.pick_end_hint') }}
      </div>
      <!-- Idle: two action buttons -->
      <div v-else class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-xl border border-input font-medium py-3 text-sm text-foreground hover:bg-muted transition-colors"
          @click="absenceOpen = true"
        >
          {{ t('calendar.add_absence') }}
        </button>
        <button
          type="button"
          class="flex-1 rounded-xl bg-indigo-600 text-white font-semibold py-3 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
          @click="onTap(new Date().getDate())"
        >
          {{ t('calendar.propose_holiday') }}
        </button>
      </div>
    </div>

    <ProposeSheet
      v-model:open="proposeOpen"
      :start-date="pickStartIso"
      :end-date="pickEndIso"
      @submitted="onProposed"
    />

    <AbsenceSheet
      v-model:open="absenceOpen"
      @saved="emit('absence-saved')"
    />
  </div>
</template>
