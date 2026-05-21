<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import { lastName, firstNames } from '@/utils/name'
import { useMobileShell } from '@/composables/useMobileShell'
import PendingCard from './PendingCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { SupervisorProposal } from './PendingCard.vue'

export interface PendingAbsence {
  id: number
  employee_id?: number
  employee_name: string
  reason: string
  start_date: string
  end_date: string
  days: number
}

const props = defineProps<{
  proposals: SupervisorProposal[]
  absences: PendingAbsence[]
  loading: boolean
}>()

const emit = defineEmits<{ reviewed: [] }>()

const { t } = useI18n({ useScope: 'global' })
const { post } = useApi()
const { isMobile } = useMobileShell()

type FilterType = 'all' | 'holidays' | 'absences'
const filterType = ref<FilterType>('all')
const search = ref('')

const pendingProposals = computed(() => props.proposals.filter((p) => p.status === 'pending'))

const filteredProposals = computed(() => {
  if (filterType.value === 'absences') return []
  const q = search.value.toLowerCase().trim()
  return [...pendingProposals.value]
    .filter((p) => !q || p.employee_name.toLowerCase().includes(q))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
})

const filteredAbsences = computed(() => {
  if (filterType.value === 'holidays') return []
  const q = search.value.toLowerCase().trim()
  return [...props.absences]
    .filter((a) => !q || a.employee_name.toLowerCase().includes(q))
    .sort((a, b) => b.start_date.localeCompare(a.start_date))
})

const isEmpty = computed(
  () => filteredProposals.value.length === 0 && filteredAbsences.value.length === 0,
)

// Holiday proposal review
const submitting = ref(false)
const selectedIds = reactive(new Set<number>())
const rejectingProposalId = ref<number | null>(null)
const rejectNote = ref('')

function startReject(id: number) {
  rejectingProposalId.value = id
  rejectNote.value = ''
}

function cancelReject() {
  rejectingProposalId.value = null
  rejectNote.value = ''
}

async function submitReject(proposalId: number) {
  if (!rejectNote.value.trim()) return
  await reviewProposal(proposalId, 'reject', rejectNote.value.trim())
  rejectingProposalId.value = null
  rejectNote.value = ''
}

function toggleSelect(id: number, selected: boolean) {
  if (selected) selectedIds.add(id)
  else selectedIds.delete(id)
}

async function reviewProposal(
  proposalId: number,
  decision: 'approve' | 'reject' | 'clarify',
  note?: string,
) {
  submitting.value = true
  try {
    await post('/api/supervisor/review_proposal', { proposalId, decision, note: note ?? null })
    selectedIds.delete(proposalId)
    emit('reviewed')
  } catch (e) {
    console.error('[PendingUnified] review proposal failed', e)
  } finally {
    submitting.value = false
  }
}

async function bulkApprove() {
  submitting.value = true
  const ids = [...selectedIds]
  try {
    await Promise.all(
      ids.map((id) =>
        post('/api/supervisor/review_proposal', { proposalId: id, decision: 'approve', note: null }),
      ),
    )
    selectedIds.clear()
    emit('reviewed')
  } catch (e) {
    console.error('[PendingUnified] bulk approve failed', e)
  } finally {
    submitting.value = false
  }
}

// Absence review
const reviewingAbsence = ref<number | null>(null)

async function reviewAbsence(id: number, decision: 'approve' | 'reject') {
  reviewingAbsence.value = id
  try {
    await post('/api/supervisor/review_absence', { absenceId: id, decision })
    emit('reviewed')
  } catch (e) {
    console.error('[PendingUnified] review absence failed', e)
  } finally {
    reviewingAbsence.value = null
  }
}

// Date formatting
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (start === end) return `${s.getDate()} ${MON[s.getMonth()]!} ${s.getFullYear()}`
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
    return `${s.getDate()}–${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
  return `${s.getDate()} ${MON[s.getMonth()]!} – ${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
}
</script>

<template>
  <!-- Filter bar -->
  <div class="flex flex-wrap items-center gap-2 mb-4">
    <div class="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
      <button
        type="button"
        :class="['px-3 py-1.5 transition-colors', filterType === 'all' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground']"
        @click="filterType = 'all'"
      >
        {{ t('pending.filter_all', { count: pendingProposals.length + absences.length }) }}
      </button>
      <button
        type="button"
        :class="['px-3 py-1.5 border-l border-border transition-colors', filterType === 'holidays' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground']"
        @click="filterType = 'holidays'"
      >
        {{ t('pending.filter_holidays', { count: pendingProposals.length }) }}
      </button>
      <button
        type="button"
        :class="['px-3 py-1.5 border-l border-border transition-colors', filterType === 'absences' ? 'bg-foreground text-background' : 'bg-background text-muted-foreground hover:text-foreground']"
        @click="filterType = 'absences'"
      >
        {{ t('pending.filter_absences', { count: absences.length }) }}
      </button>
    </div>
    <input
      v-model="search"
      type="search"
      :placeholder="t('pending.search_placeholder')"
      class="flex-1 min-w-[160px] rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  </div>

  <!-- Loading -->
  <div v-if="loading" class="py-12 text-center text-sm text-muted-foreground">
    {{ t('timeOff.loading') }}
  </div>

  <!-- Empty -->
  <EmptyState v-else-if="isEmpty" :title="t('supervisor.pending.empty')" />

  <!-- Desktop table -->
  <table v-else-if="!isMobile" class="w-full text-sm border-collapse">
    <thead>
      <tr class="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
        <th class="pb-2 pr-3">{{ t('pending.col_type') }}</th>
        <th class="pb-2 pr-4">{{ t('supervisor.pending.col_employee') }}</th>
        <th class="pb-2 pr-4">{{ t('supervisor.pending.col_dates') }}</th>
        <th class="pb-2 pr-4">{{ t('supervisor.pending.col_days') }}</th>
        <th class="pb-2 pr-4">{{ t('supervisor.pending.col_label') }}</th>
        <th class="pb-2" />
      </tr>
    </thead>
    <tbody class="divide-y">
      <tr v-for="p in filteredProposals" :key="`h-${p.id}`" class="hover:bg-muted/30">
        <td class="py-3 pr-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            {{ t('pending.type_holiday') }}
          </span>
        </td>
        <td class="py-3 pr-4">
          <p class="font-medium"><span class="font-bold">{{ lastName(p.employee_name) }}</span><template v-if="firstNames(p.employee_name)">, {{ firstNames(p.employee_name) }}</template></p>
          <p v-if="p.employee_clarification" class="text-xs text-blue-600 dark:text-blue-400 mt-0.5">↩ {{ p.employee_clarification }}</p>
        </td>
        <td class="py-3 pr-4 text-muted-foreground tabular-nums">{{ fmtRange(p.start_date, p.end_date) }}</td>
        <td class="py-3 pr-4 text-muted-foreground tabular-nums">{{ p.work_days }}</td>
        <td class="py-3 pr-4 text-muted-foreground">{{ p.label ?? '—' }}</td>
        <td class="py-3">
          <div v-if="rejectingProposalId === p.id" class="flex flex-col gap-1.5 min-w-[200px]">
            <input
              v-model="rejectNote"
              type="text"
              :placeholder="t('supervisor.pending.reject_placeholder')"
              class="rounded-md border border-input bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              @keydown.enter="submitReject(p.id)"
              @keydown.escape="cancelReject"
            />
            <div class="flex gap-1.5">
              <button
                type="button"
                :disabled="!rejectNote.trim() || submitting"
                class="flex-1 rounded-md bg-red-600 text-white text-xs font-semibold px-2 py-1 hover:bg-red-700 disabled:opacity-50 transition-colors"
                @click="submitReject(p.id)"
              >
                {{ t('supervisor.pending.reject_submit') }}
              </button>
              <button
                type="button"
                class="rounded-md border text-xs px-2 py-1 hover:bg-muted transition-colors"
                @click="cancelReject"
              >
                {{ t('common.cancel') }}
              </button>
            </div>
          </div>
          <div v-else class="flex gap-2">
            <button
              type="button"
              :disabled="submitting"
              class="rounded-lg bg-green-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-50"
              @click="reviewProposal(p.id, 'approve')"
            >
              {{ t('supervisor.pending.approve') }}
            </button>
            <button
              type="button"
              :disabled="submitting"
              class="rounded-lg border text-xs font-semibold px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50"
              @click="startReject(p.id)"
            >
              {{ t('supervisor.pending.reject') }}
            </button>
          </div>
        </td>
      </tr>
      <tr v-for="a in filteredAbsences" :key="`a-${a.id}`" class="hover:bg-muted/30">
        <td class="py-3 pr-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
            {{ t('pending.type_absence') }}
          </span>
        </td>
        <td class="py-3 pr-4 font-medium"><span class="font-bold">{{ lastName(a.employee_name) }}</span><template v-if="firstNames(a.employee_name)">, {{ firstNames(a.employee_name) }}</template></td>
        <td class="py-3 pr-4 text-muted-foreground tabular-nums">{{ fmtRange(a.start_date, a.end_date) }}</td>
        <td class="py-3 pr-4 text-muted-foreground tabular-nums">{{ a.days }}</td>
        <td class="py-3 pr-4 text-muted-foreground">{{ t(`absence.cause.${a.reason}`, a.reason) }}</td>
        <td class="py-3">
          <div class="flex gap-2">
            <button
              type="button"
              :disabled="reviewingAbsence === a.id"
              class="rounded-lg bg-green-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-50"
              @click="reviewAbsence(a.id, 'approve')"
            >
              {{ t('supervisor.pending.approve') }}
            </button>
            <button
              type="button"
              :disabled="reviewingAbsence === a.id"
              class="rounded-lg border text-xs font-semibold px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50"
              @click="reviewAbsence(a.id, 'reject')"
            >
              {{ t('supervisor.pending.reject') }}
            </button>
          </div>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- Mobile cards -->
  <template v-else>
    <div class="space-y-3 pb-28">
      <PendingCard
        v-for="p in filteredProposals"
        :key="`h-${p.id}`"
        :proposal="p"
        :selected="selectedIds.has(p.id)"
        @update:selected="(v) => toggleSelect(p.id, v)"
        @approve="(id) => reviewProposal(id, 'approve')"
        @reject="(id, note) => reviewProposal(id, 'reject', note)"
        @clarify="(id, note) => reviewProposal(id, 'clarify', note)"
      />
      <div
        v-for="a in filteredAbsences"
        :key="`a-${a.id}`"
        class="rounded-xl border bg-card p-4 space-y-3"
      >
        <div class="flex items-start gap-3">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 mt-0.5 shrink-0">
            {{ t('pending.type_absence') }}
          </span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-foreground"><span class="font-bold">{{ lastName(a.employee_name) }}</span><template v-if="firstNames(a.employee_name)">, {{ firstNames(a.employee_name) }}</template></p>
            <p class="text-sm text-foreground mt-0.5">{{ fmtRange(a.start_date, a.end_date) }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ t(`absence.cause.${a.reason}`, a.reason) }} · {{ a.days }}d
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="reviewingAbsence === a.id"
            class="flex-1 rounded-xl border border-red-300 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            @click="reviewAbsence(a.id, 'reject')"
          >
            {{ t('supervisor.pending.reject') }}
          </button>
          <button
            type="button"
            :disabled="reviewingAbsence === a.id"
            class="flex-1 rounded-xl bg-green-600 text-white py-2.5 text-sm font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
            @click="reviewAbsence(a.id, 'approve')"
          >
            {{ t('supervisor.pending.approve') }}
          </button>
        </div>
      </div>
      <p v-if="filteredProposals.length > 0" class="text-xs text-muted-foreground px-1 pt-2">
        {{ t('supervisor.pending.tip') }}
      </p>
    </div>
  </template>

  <!-- Sticky bulk approve bar (mobile, holidays selected) -->
  <div
    v-if="selectedIds.size > 0"
    class="fixed bottom-[72px] left-0 right-0 z-20 border-t bg-background/95 backdrop-blur-sm px-4 py-3"
  >
    <div class="flex items-center justify-between gap-3">
      <span class="text-sm text-muted-foreground">
        {{ t('supervisor.pending.bulk_bar', { count: selectedIds.size }) }}
      </span>
      <button
        type="button"
        :disabled="submitting"
        class="rounded-xl bg-green-600 text-white text-sm font-semibold px-5 py-2.5 hover:bg-green-700 transition-colors disabled:opacity-50"
        @click="bulkApprove"
      >
        {{ t('supervisor.pending.bulk_approve', { count: selectedIds.size }) }}
      </button>
    </div>
  </div>
</template>
