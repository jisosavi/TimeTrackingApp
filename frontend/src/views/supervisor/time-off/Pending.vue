<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import PendingCard from '@/components/time-off/PendingCard.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import type { SupervisorProposal } from '@/components/time-off/PendingCard.vue'

defineOptions({ name: 'SupervisorPending' })

const props = defineProps<{
  proposals: SupervisorProposal[]
  loading: boolean
  showAsTable?: boolean
}>()

const emit = defineEmits<{
  reviewed: []
}>()

const { t } = useI18n({ useScope: 'global' })
const { post } = useApi()

const submitting = ref(false)
const selectedIds = reactive(new Set<number>())

const pendingProposals = computed(() =>
  props.proposals.filter((p) => p.status === 'pending'),
)

function toggleSelect(id: number, selected: boolean) {
  if (selected) selectedIds.add(id)
  else selectedIds.delete(id)
}

async function review(proposalId: number, decision: 'approve' | 'reject' | 'clarify', note?: string) {
  submitting.value = true
  try {
    await post('/api/supervisor/review_proposal', { proposalId, decision, note: note ?? null })
    selectedIds.delete(proposalId)
    emit('reviewed')
  } catch (e) {
    console.error('[Pending] review failed', e)
  } finally {
    submitting.value = false
  }
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function fmtRange(start: string, end: string): string {
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  if (start === end) return `${s.getDate()} ${MON[s.getMonth()]!} ${s.getFullYear()}`
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth())
    return `${s.getDate()}–${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
  return `${s.getDate()} ${MON[s.getMonth()]!} – ${e.getDate()} ${MON[e.getMonth()]!} ${e.getFullYear()}`
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
    console.error('[Pending] bulk approve failed', e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-3 pb-28">
    <!-- Hint -->
    <p class="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground px-1">
      {{ t('supervisor.pending.hint') }}
    </p>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center text-sm text-muted-foreground">
      {{ t('timeOff.loading') }}
    </div>

    <!-- Empty -->
    <EmptyState v-else-if="pendingProposals.length === 0" :title="t('supervisor.pending.empty')" />

    <!-- Table (admin desktop) -->
    <table v-else-if="showAsTable" class="w-full text-sm border-collapse">
      <thead>
        <tr class="text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b">
          <th class="pb-2 pr-4">{{ t('supervisor.pending.col_employee') }}</th>
          <th class="pb-2 pr-4">{{ t('supervisor.pending.col_dates') }}</th>
          <th class="pb-2 pr-4">{{ t('supervisor.pending.col_days') }}</th>
          <th class="pb-2 pr-4">{{ t('supervisor.pending.col_label') }}</th>
          <th class="pb-2"></th>
        </tr>
      </thead>
      <tbody class="divide-y">
        <tr v-for="p in pendingProposals" :key="p.id" class="hover:bg-muted/30">
          <td class="py-3 pr-4 font-medium">{{ p.employee_name }}</td>
          <td class="py-3 pr-4 text-muted-foreground">{{ fmtRange(p.start_date, p.end_date) }}</td>
          <td class="py-3 pr-4 text-muted-foreground">{{ p.work_days }}</td>
          <td class="py-3 pr-4 text-muted-foreground">{{ p.label ?? '—' }}</td>
          <td class="py-3">
            <div class="flex gap-2">
              <button
                type="button"
                :disabled="submitting"
                class="rounded-lg bg-green-600 text-white text-xs font-semibold px-3 py-1.5 hover:bg-green-700 transition-colors disabled:opacity-50"
                @click="review(p.id, 'approve')"
              >
                {{ t('supervisor.pending.approve') }}
              </button>
              <button
                type="button"
                :disabled="submitting"
                class="rounded-lg border text-xs font-semibold px-3 py-1.5 hover:bg-muted transition-colors disabled:opacity-50"
                @click="review(p.id, 'reject')"
              >
                {{ t('supervisor.pending.reject') }}
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Cards (mobile) -->
    <template v-else>
      <PendingCard
        v-for="p in pendingProposals"
        :key="p.id"
        :proposal="p"
        :selected="selectedIds.has(p.id)"
        @update:selected="(v) => toggleSelect(p.id, v)"
        @approve="(id) => review(id, 'approve')"
        @reject="(id, note) => review(id, 'reject', note)"
        @clarify="(id, note) => review(id, 'clarify', note)"
      />

      <!-- Tip -->
      <p class="text-xs text-muted-foreground px-1 pt-2">
        {{ t('supervisor.pending.tip') }}
      </p>
    </template>
  </div>

  <!-- Sticky bulk approve bar -->
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
