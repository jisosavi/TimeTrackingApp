<script setup lang="ts">
import { computed } from 'vue'

export interface RibbonSpan {
  type: 'holiday' | 'absence'
  status: string
  start_date: string
  end_date: string
  label: string | null
}

export interface RibbonPerson {
  id: number
  name: string
  initials: string
}

const props = defineProps<{
  year: number
  month: number // 1-12
  person: RibbonPerson
  spans: RibbonSpan[]
  sidebarLabel?: string // when set, shows this text instead of person info (e.g. month name on desktop)
  cellHeight?: number  // px, default 24
  fixedCols?: boolean  // if true, always render 31 cells at fixed 28px width
  showDayNumbers?: boolean
}>()

const CELL_W = 28 // px, used when fixedCols=true

const daysInMonth = computed(() => new Date(props.year, props.month, 0).getDate())

const days = computed(() =>
  props.fixedCols
    ? Array.from({ length: 31 }, (_, i) => i + 1)
    : Array.from({ length: daysInMonth.value }, (_, i) => i + 1),
)

function isoDay(day: number): string {
  return `${props.year}-${String(props.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function isWeekend(day: number): boolean {
  const dow = new Date(props.year, props.month - 1, day).getDay()
  return dow === 0 || dow === 6
}

type CellKind = 'holiday-approved' | 'holiday-pending' | 'absence' | 'weekend' | 'out-of-month' | 'normal'

function cellKind(day: number): CellKind {
  if (day > daysInMonth.value) return 'out-of-month'
  if (isWeekend(day)) return 'weekend'
  const iso = isoDay(day)
  for (const span of props.spans) {
    if (iso >= span.start_date && iso <= span.end_date) {
      if (span.type === 'holiday') return span.status === 'approved' ? 'holiday-approved' : 'holiday-pending'
      return 'absence'
    }
  }
  return 'normal'
}

function cellBg(kind: CellKind): string {
  if (kind === 'holiday-approved') return 'bg-indigo-500'
  if (kind === 'holiday-pending') return 'bg-amber-400'
  if (kind === 'absence') return 'bg-sky-400'
  if (kind === 'weekend') return 'bg-muted/50'
  if (kind === 'out-of-month') return 'bg-transparent opacity-0'
  return 'bg-transparent'
}

function cellTextColor(kind: CellKind): string {
  if (['holiday-approved', 'holiday-pending', 'absence'].includes(kind)) return 'text-white'
  return 'text-muted-foreground/60'
}

const cellH = computed(() => props.cellHeight ?? 24)
</script>

<template>
  <div class="flex items-stretch">
    <!-- Sidebar: 78px -->
    <div class="w-[78px] shrink-0 flex items-center gap-1.5 pr-2 overflow-hidden">
      <template v-if="sidebarLabel">
        <span class="text-[11px] font-medium text-muted-foreground">{{ sidebarLabel }}</span>
      </template>
      <template v-else>
        <div
          class="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0"
        >
          {{ person.initials }}
        </div>
        <span class="text-[11px] text-muted-foreground truncate leading-tight">
          {{ person.name.split(' ')[0] }}
        </span>
      </template>
    </div>

    <!-- Day cells -->
    <div class="flex gap-px" :class="fixedCols ? '' : 'flex-1'">
      <div
        v-for="day in days"
        :key="day"
        :class="[cellBg(cellKind(day)), 'flex items-center justify-center']"
        :style="{ height: `${cellH}px`, width: fixedCols ? `${CELL_W}px` : undefined, flex: fixedCols ? undefined : '1 1 0%' }"
        :title="day <= daysInMonth ? isoDay(day) : undefined"
      >
        <span
          v-if="showDayNumbers && day <= daysInMonth"
          :class="['text-[9px] font-medium leading-none select-none', cellTextColor(cellKind(day))]"
        >{{ day }}</span>
      </div>
    </div>
  </div>
</template>
