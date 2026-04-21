<script setup lang="ts">
import { ref } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { TimeEntry } from '@/types'

const props = defineProps<{ entry: TimeEntry }>()
const emit = defineEmits<{
  clarify: [id: number, text: string]
  delete: [id: number]
}>()

const clarificationText = ref('')
const showClarifyForm = ref(false)

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:   { label: 'Pending',   variant: 'secondary' },
  approved:  { label: 'Approved',  variant: 'default' },
  rejected:  { label: 'Rejected',  variant: 'destructive' },
  clarified: { label: 'Clarified', variant: 'outline' },
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

function submitClarification() {
  if (!clarificationText.value.trim()) return
  emit('clarify', props.entry.id, clarificationText.value.trim())
  clarificationText.value = ''
  showClarifyForm.value = false
}

const cfg = statusConfig[props.entry.status] ?? { label: props.entry.status, variant: 'outline' as const }
const canDelete = ['pending', 'rejected', 'clarified'].includes(props.entry.status)
</script>

<template>
  <div class="rounded-lg border p-4 space-y-2 bg-card">
    <div class="flex items-start justify-between gap-2">
      <div class="space-y-0.5">
        <p class="font-medium text-sm">{{ formatDate(entry.entry_date) }}</p>
        <p class="text-sm text-muted-foreground">
          <span v-if="entry.start_time && entry.end_time">
            {{ entry.start_time }} – {{ entry.end_time }} &middot; {{ entry.hours }}h
          </span>
          <span v-else-if="entry.hours">{{ entry.hours }}h</span>
          <span v-if="entry.km > 0"> &middot; {{ entry.km }} km</span>
        </p>
        <p v-if="entry.project" class="text-xs text-muted-foreground">{{ entry.project }}</p>
        <p v-if="entry.comment" class="text-xs text-muted-foreground italic">{{ entry.comment }}</p>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <Badge :variant="cfg.variant">{{ cfg.label }}</Badge>
        <Button
          v-if="canDelete"
          variant="ghost"
          size="sm"
          class="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          @click="emit('delete', entry.id)"
        >
          ✕
        </Button>
      </div>
    </div>

    <!-- Rejection note -->
    <div v-if="entry.status === 'rejected' && entry.rejection_note" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <span class="font-medium">Rejected: </span>{{ entry.rejection_note }}
    </div>

    <!-- Clarification actions -->
    <div v-if="entry.status === 'rejected'">
      <Button v-if="!showClarifyForm" variant="outline" size="sm" @click="showClarifyForm = true">
        Add clarification
      </Button>
      <div v-else class="space-y-2">
        <Textarea
          v-model="clarificationText"
          placeholder="Explain the entry…"
          class="text-sm min-h-16"
        />
        <div class="flex gap-2">
          <Button size="sm" :disabled="!clarificationText.trim()" @click="submitClarification">
            Submit
          </Button>
          <Button size="sm" variant="ghost" @click="showClarifyForm = false">Cancel</Button>
        </div>
      </div>
    </div>

    <!-- Employee's previous clarification -->
    <div v-if="entry.status === 'clarified' && entry.employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
      <span class="font-medium">Your clarification: </span>{{ entry.employee_clarification }}
    </div>
  </div>
</template>
