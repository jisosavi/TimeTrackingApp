<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock, CheckCircle2 } from 'lucide-vue-next'
import { useTimeEntries } from '@/composables/useTimeEntries'
import { useRefresh } from '@/composables/useRefresh'
import EmptyState from '@/components/ui/EmptyState.vue'
import EntryCard from './EntryCard.vue'

const props = withDefaults(defineProps<{ showRejectedOnly?: boolean }>(), { showRejectedOnly: false })

const { t } = useI18n({ useScope: 'global' })
const { entries, loading, error, fetchEntries, clarifyEntry, clarifyKmEntry, deleteEntry } = useTimeEntries()
const { refreshTick } = useRefresh()

onMounted(fetchEntries)
watch(refreshTick, fetchEntries)

const displayEntries = computed(() => {
  if (props.showRejectedOnly) {
    return entries.value.filter((e) => e.status === 'rejected' || e.km_status === 'rejected')
  }
  const needsAction = entries.value.filter((e) => e.status === 'rejected' || e.km_status === 'rejected')
  const rest = entries.value.filter((e) => e.status !== 'rejected' && e.km_status !== 'rejected')
  return [...needsAction, ...rest]
})

defineExpose({ refresh: fetchEntries })
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-medium text-muted-foreground">
      {{ t('entries.count', { count: displayEntries.length }) }}
    </h3>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <EmptyState
      v-if="!loading && displayEntries.length === 0"
      :title="t(showRejectedOnly ? 'empty.rejected' : 'empty.my_entries')"
      :body="showRejectedOnly ? undefined : t('empty.my_entries_body')"
    >
      <CheckCircle2 v-if="showRejectedOnly" class="size-10" />
      <Clock v-else class="size-10" />
    </EmptyState>

    <EntryCard
      v-for="entry in displayEntries"
      :key="entry.id"
      :entry="entry"
      @clarify="clarifyEntry"
      @clarify-km="clarifyKmEntry"
      @delete="(id, reason) => deleteEntry(id, reason)"
    />
  </div>
</template>
