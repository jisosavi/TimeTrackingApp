<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTimeEntries } from '@/composables/useTimeEntries'
import { useRefresh } from '@/composables/useRefresh'
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

    <p v-if="!loading && entries.length === 0" class="text-sm text-muted-foreground text-center py-8">
      {{ t('entries.empty') }}
    </p>

    <EntryCard
      v-for="entry in entries"
      :key="entry.id"
      :entry="entry"
      @clarify="clarifyEntry"
      @delete="deleteEntry"
    />
  </div>
</template>
