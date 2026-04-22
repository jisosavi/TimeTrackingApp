<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Clock } from 'lucide-vue-next'
import { useTimeEntries } from '@/composables/useTimeEntries'
import { useRefresh } from '@/composables/useRefresh'
import EmptyState from '@/components/ui/EmptyState.vue'
import EntryCard from './EntryCard.vue'

const { t } = useI18n({ useScope: 'global' })
const { entries, loading, error, fetchEntries, clarifyEntry, deleteEntry } = useTimeEntries()
const { refreshTick } = useRefresh()

onMounted(fetchEntries)
watch(refreshTick, fetchEntries)

defineExpose({ refresh: fetchEntries })
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-sm font-medium text-muted-foreground">{{ t('entries.count', { count: entries.length }) }}</h3>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <EmptyState
      v-if="!loading && entries.length === 0"
      :title="t('empty.my_entries')"
      :body="t('empty.my_entries_body')"
    >
      <Clock class="size-10" />
    </EmptyState>

    <EntryCard
      v-for="entry in entries"
      :key="entry.id"
      :entry="entry"
      @clarify="clarifyEntry"
      @delete="deleteEntry"
    />
  </div>
</template>
