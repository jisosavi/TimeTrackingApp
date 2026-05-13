<script setup lang="ts">
import { computed } from 'vue'

export type DayState = 'h-app' | 'p' | 'a-paid' | 'a-unpaid'

const props = defineProps<{
  year: number
  month: number // 1-12
  data: Record<number, DayState>
  selected: number[]
}>()

const emit = defineEmits<{ tap: [day: number] }>()

const HEADERS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const daysInMonth = computed(() => new Date(props.year, props.month, 0).getDate())

// Mon-first offset: Mon=0 … Sun=6
const offset = computed(() => {
  const dow = new Date(props.year, props.month - 1, 1).getDay()
  return (dow + 6) % 7
})

interface GridCell {
  idx: number
  day: number | null
}

const cells = computed((): GridCell[] => {
  const out: GridCell[] = []
  for (let i = 0; i < offset.value; i++) out.push({ idx: i, day: null })
  for (let d = 1; d <= daysInMonth.value; d++) out.push({ idx: offset.value + d - 1, day: d })
  return out
})

function cellClass(cell: GridCell): string {
  const d = cell.day!
  const state = props.data[d]
  const isWeekend = cell.idx % 7 === 5 || cell.idx % 7 === 6
  const base = 'flex items-center justify-center w-11 h-11 rounded-full text-sm font-medium cursor-pointer select-none transition-colors'
  if (state === 'h-app') return `${base} bg-indigo-600 text-white`
  if (state === 'p') return `${base} bg-amber-50 border border-amber-400 text-amber-700`
  if (state === 'a-paid') return `${base} bg-sky-50 border border-sky-400 text-sky-700`
  if (state === 'a-unpaid') return `${base} bg-gray-100 border border-gray-400 text-gray-600`
  if (props.selected.includes(d)) return `${base} bg-indigo-50 border border-indigo-500 text-indigo-700`
  if (isWeekend) return `${base} text-muted-foreground`
  return `${base} text-foreground hover:bg-muted`
}
</script>

<template>
  <div>
    <!-- Weekday headers -->
    <div class="grid grid-cols-7 gap-[6px] mb-[6px]">
      <div
        v-for="h in HEADERS"
        :key="h"
        class="flex items-center justify-center h-6 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
      >
        {{ h }}
      </div>
    </div>
    <!-- Day grid -->
    <div class="grid grid-cols-7 gap-[6px]">
      <template v-for="cell in cells" :key="cell.day ?? `b${cell.idx}`">
        <div v-if="cell.day === null" class="w-11 h-11" />
        <button
          v-else
          type="button"
          :class="cellClass(cell)"
          @click="emit('tap', cell.day)"
        >
          {{ cell.day }}
        </button>
      </template>
    </div>
  </div>
</template>
