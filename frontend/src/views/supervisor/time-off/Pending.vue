<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import PendingCard from '@/components/time-off/PendingCard.vue'
import type { SupervisorProposal } from '@/components/time-off/PendingCard.vue'

defineOptions({ name: 'SupervisorPending' })

const props = defineProps<{
  proposals: SupervisorProposal[]
  loading: boolean
}>()

const emit = defineEmits<{
  reviewed: []
}>()

const { t } = useI18n({ useScope: 'global' })
const { apiFetch } = useApi()

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
    await apiFetch('/api/supervisor/review_proposal.php', {
      method: 'POST',
      body: JSON.stringify({ proposalId, decision, note: note ?? null }),
    })
    selectedIds.delete(proposalId)
    emit('reviewed')
  } catch (e) {
    console.error('[Pending] review failed', e)
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
        apiFetch('/api/supervisor/review_proposal.php', {
          method: 'POST',
          body: JSON.stringify({ proposalId: id, decision: 'approve', note: null }),
        }),
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
    <div v-else-if="pendingProposals.length === 0" class="py-12 text-center text-sm text-muted-foreground">
      {{ t('supervisor.pending.empty') }}
    </div>

    <!-- Cards -->
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
