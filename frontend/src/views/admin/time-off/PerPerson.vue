<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import type { RibbonPerson, RibbonSpan } from '@/components/time-off/PersonRibbon.vue'

interface CalendarPerson extends RibbonPerson {
  spans: RibbonSpan[]
}

defineOptions({ name: 'AdminPerPerson' })

const { t } = useI18n({ useScope: 'global' })
const { apiFetch } = useApi()

const people = ref<CalendarPerson[]>([])
const loading = ref(false)
const year = ref(new Date().getFullYear())

function computeWorkDays(start: string, end: string): number {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  let n = 0
  const d = new Date(s)
  while (d <= e) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

interface PersonBalance {
  person: CalendarPerson
  planned: number
  pending: number
}

const balances = computed((): PersonBalance[] =>
  people.value.map((person) => {
    let planned = 0, pending = 0
    for (const span of person.spans) {
      if (span.type !== 'holiday') continue
      const days = computeWorkDays(span.start_date, span.end_date)
      if (span.status === 'approved') planned += days
      else if (span.status === 'pending') pending += days
    }
    return { person, planned, pending }
  }),
)

async function fetch() {
  loading.value = true
  try {
    const data = await apiFetch<{ people: CalendarPerson[] }>(
      `/api/team_calendar.php?year=${year.value}`,
    )
    people.value = data.people
  } catch (e) {
    console.error('[PerPerson] fetch failed', e)
  } finally {
    loading.value = false
  }
}

onMounted(fetch)
</script>

<template>
  <div>
    <div v-if="loading" class="py-8 text-center text-sm text-muted-foreground">
      {{ t('common.loading') }}
    </div>

    <div v-else-if="balances.length === 0" class="py-8 text-center text-sm text-muted-foreground">
      {{ t('supervisor.calendar.empty') }}
    </div>

    <div v-else class="space-y-px rounded-lg border border-border overflow-hidden">
      <!-- Header row -->
      <div class="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-2 bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>{{ t('admin.timeoff.person_col') }}</span>
        <span class="w-20 text-right">{{ t('admin.timeoff.planned_col') }}</span>
        <span class="w-20 text-right">{{ t('admin.timeoff.pending_col') }}</span>
        <span class="w-20 text-right">{{ t('admin.timeoff.remaining_col') }}</span>
      </div>

      <!-- Per-person rows -->
      <div
        v-for="{ person, planned, pending } in balances"
        :key="person.id"
        class="grid grid-cols-[1fr_auto_auto_auto] gap-4 px-4 py-3 bg-card border-t border-border items-center"
      >
        <!-- Avatar + name -->
        <div class="flex items-center gap-2.5 min-w-0">
          <div
            class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 text-[11px] font-bold flex items-center justify-center shrink-0"
          >
            {{ person.initials }}
          </div>
          <span class="text-sm font-medium text-foreground truncate">{{ person.name }}</span>
        </div>

        <!-- Planned -->
        <div class="w-20 text-right">
          <span class="text-sm font-semibold text-indigo-600">{{ planned }}</span>
          <span class="text-xs text-muted-foreground ml-1">{{ t('admin.timeoff.days_unit') }}</span>
        </div>

        <!-- Pending -->
        <div class="w-20 text-right">
          <span
            :class="['text-sm font-semibold', pending > 0 ? 'text-amber-600' : 'text-muted-foreground']"
          >{{ pending }}</span>
          <span class="text-xs text-muted-foreground ml-1">{{ t('admin.timeoff.days_unit') }}</span>
        </div>

        <!-- Remaining (requires Salaxy) -->
        <div class="w-20 text-right">
          <span class="text-sm text-muted-foreground/60">—</span>
        </div>
      </div>
    </div>

    <p class="text-xs text-muted-foreground mt-3">
      {{ t('admin.timeoff.remaining_salaxy_note') }}
    </p>
  </div>
</template>
