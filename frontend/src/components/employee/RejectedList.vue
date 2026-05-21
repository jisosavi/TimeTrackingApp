<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import { useTimeEntries } from '@/composables/useTimeEntries'
import type { TimeEntry } from '@/types'
import type { Proposal } from '@/composables/useTimeOff'
import type { AbsenceRecord } from '@/composables/useAbsences'
import EntryCard from '@/components/employee/EntryCard.vue'

const { t } = useI18n({ useScope: 'global' })
const { get, post } = useApi()
const { entries, clarifyEntry, clarifyKmEntry, deleteEntry, fetchEntries } = useTimeEntries()

const clarifyTexts = ref<Record<number, string>>({})
const clarifyingId = ref<number | null>(null)

async function submitClarification(proposalId: number) {
  const text = clarifyTexts.value[proposalId]?.trim()
  if (!text) return
  clarifyingId.value = proposalId
  try {
    await post(`/api/holiday_proposals/${proposalId}/clarify`, { text })
    await refresh()
  } catch { /* error visible via failed request */ } finally {
    clarifyingId.value = null
  }
}

const rejectedEntries = ref<TimeEntry[]>([])
const rejectedProposals = ref<Proposal[]>([])
const rejectedAbsences = ref<AbsenceRecord[]>([])
const loading = ref(false)

watch(
  entries,
  (all) => {
    rejectedEntries.value = all.filter(
      (e) => e.status === 'rejected' || e.km_status === 'rejected',
    )
  },
  { immediate: true },
)

async function refresh() {
  loading.value = true
  try {
    const [, { proposals }, { absences }] = await Promise.all([
      fetchEntries(),
      get<{ proposals: Proposal[] }>('/api/holiday_proposals?status=rejected'),
      get<{ absences: AbsenceRecord[] }>('/api/absences?status=rejected'),
    ])
    rejectedProposals.value = proposals
    rejectedAbsences.value = absences
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
defineExpose({ refresh })

// ── Date formatting ──────────────────────────────────────────────────────────

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (start === end) return `${DAY[s.getDay()]!} ${s.getDate()} ${MON[s.getMonth()]!} ${s.getFullYear()}`
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${DAY[s.getDay()]!} ${s.getDate()} – ${DAY[e.getDay()]!} ${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
  }
  return `${DAY[s.getDay()]!} ${s.getDate()} ${MON[s.getMonth()]!} – ${DAY[e.getDay()]!} ${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
}
</script>

<template>
  <div>
    <div v-if="loading" class="py-12 text-center text-sm text-muted-foreground">
      {{ t('timeOff.loading') }}
    </div>

    <div
      v-else-if="rejectedEntries.length === 0 && rejectedProposals.length === 0 && rejectedAbsences.length === 0"
      class="py-12 text-center text-sm text-muted-foreground"
    >
      {{ t('rejected.empty') }}
    </div>

    <div v-else class="space-y-3">
      <!-- Rejected time entries (with full clarify flow via EntryCard) -->
      <div v-for="entry in rejectedEntries" :key="`entry-${entry.id}`" class="relative">
        <span
          class="absolute -top-1.5 left-3 z-10 rounded-full bg-muted px-2 py-px text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
        >
          {{ t('rejected.type_hours') }}
        </span>
        <EntryCard
          :entry="entry"
          @clarify="(id, text) => clarifyEntry(id, text)"
          @clarify-km="(id, text) => clarifyKmEntry(id, text)"
          @delete="(id, reason) => deleteEntry(id, reason)"
        />
      </div>

      <!-- Holiday proposals: clarifying or rejected -->
      <div
        v-for="p in rejectedProposals"
        :key="`proposal-${p.id}`"
        class="rounded-lg border p-4 bg-card"
        :class="p.status === 'clarifying' ? 'border-amber-300' : ''"
      >
        <span
          class="inline-block mb-2 rounded-full bg-muted px-2 py-px text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
        >
          {{ t('rejected.type_holiday') }}
        </span>
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-medium text-foreground truncate">
              {{ p.label ?? t('proposals.untitled') }}
            </p>
            <p class="text-xs text-muted-foreground mt-0.5">{{ fmtRange(p.start_date, p.end_date) }}</p>
            <p class="text-xs text-muted-foreground">{{ t('proposals.work_days', { count: p.work_days }) }}</p>
          </div>
          <span
            v-if="p.status === 'clarifying'"
            class="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-amber-50 text-amber-700 border-amber-300"
          >
            {{ t('rejected.status_clarification_needed') }}
          </span>
          <span
            v-else
            class="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-red-50 text-red-700 border-red-200"
          >
            {{ t('timeOff.status.rejected') }}
          </span>
        </div>

        <!-- Supervisor's clarification question -->
        <div
          v-if="p.decision_note"
          class="mt-3 rounded-md px-3 py-2 text-sm"
          :class="p.status === 'clarifying' ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-destructive/10 text-destructive'"
        >
          {{ p.decision_note }}
        </div>

        <!-- Employee reply form (clarifying only) -->
        <div v-if="p.status === 'clarifying'" class="mt-3 space-y-2">
          <textarea
            v-model="clarifyTexts[p.id]"
            :placeholder="t('rejected.clarification_placeholder')"
            rows="2"
            class="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
          <button
            type="button"
            :disabled="!clarifyTexts[p.id]?.trim() || clarifyingId === p.id"
            class="w-full rounded-lg bg-amber-500 text-white text-sm font-semibold py-2 hover:bg-amber-600 transition-colors disabled:opacity-50"
            @click="submitClarification(p.id)"
          >
            {{ clarifyingId === p.id ? t('common.saving') : t('rejected.clarification_submit') }}
          </button>
        </div>
      </div>

      <!-- Rejected absences (read-only) -->
      <div
        v-for="a in rejectedAbsences"
        :key="`absence-${a.id}`"
        class="rounded-lg border p-4 bg-card"
      >
        <span
          class="inline-block mb-2 rounded-full bg-muted px-2 py-px text-[10px] font-semibold text-muted-foreground uppercase tracking-wide"
        >
          {{ t('rejected.type_absence') }}
        </span>
        <div class="flex items-start justify-between gap-2">
          <div class="min-w-0">
            <p class="text-sm font-medium text-foreground">{{ a.reason }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">{{ fmtRange(a.start_date, a.end_date) }}</p>
            <p class="text-xs text-muted-foreground">
              {{
                a.is_paid
                  ? t('proposals.paid_days', { count: a.days })
                  : t('proposals.unpaid_days', { count: a.days })
              }}
            </p>
          </div>
          <span class="flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-red-50 text-red-700 border-red-200">
            {{ t('timeOff.status.rejected') }}
          </span>
        </div>
        <div
          v-if="a.decision_note"
          class="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {{ a.decision_note }}
        </div>
      </div>
    </div>
  </div>
</template>
