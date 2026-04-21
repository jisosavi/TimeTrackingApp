<script setup lang="ts">
import { onMounted } from 'vue'
import { useTimeEntries } from '@/composables/useTimeEntries'
import EntryCard from './EntryCard.vue'
import { Button } from '@/components/ui/button'

const { entries, loading, error, fetchEntries, clarifyEntry, deleteEntry } = useTimeEntries()

onMounted(fetchEntries)

defineExpose({ refresh: fetchEntries })
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted-foreground">{{ entries.length }} entries</h3>
      <Button variant="ghost" size="sm" :disabled="loading" @click="fetchEntries">
        {{ loading ? 'Loading…' : 'Refresh' }}
      </Button>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <p v-if="!loading && entries.length === 0" class="text-sm text-muted-foreground text-center py-8">
      No entries yet. Log your hours in the chat.
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
