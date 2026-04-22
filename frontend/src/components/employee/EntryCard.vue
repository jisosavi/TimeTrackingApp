<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import type { TimeEntry } from '@/types'

const props = defineProps<{ entry: TimeEntry }>()
const emit = defineEmits<{
  clarify: [id: number, text: string]
  clarifyKm: [id: number, text: string]
  delete: [id: number]
}>()

const { t } = useI18n({ useScope: 'global' })

const clarificationText = ref('')
const showClarifyForm = ref(false)
const kmClarificationText = ref('')
const showKmClarifyForm = ref(false)

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending:   'secondary',
  approved:  'default',
  rejected:  'destructive',
  clarified: 'outline',
}

const statusKey: Record<string, string> = {
  pending:   'status.pending',
  approved:  'status.approved',
  rejected:  'status.rejected',
  clarified: 'status.clarified',
}

const cfg = computed(() => ({
  label:   statusKey[props.entry.status] ? t(statusKey[props.entry.status]!) : props.entry.status,
  variant: statusVariant[props.entry.status] ?? ('outline' as const),
}))

function formatDate(iso: string) {
  const parts = iso.split('-')
  return `${parts[2] ?? ''}.${parts[1] ?? ''}.${parts[0] ?? ''}`
}

function submitClarification() {
  if (!clarificationText.value.trim()) return
  emit('clarify', props.entry.id, clarificationText.value.trim())
  clarificationText.value = ''
  showClarifyForm.value = false
}

function submitKmClarification() {
  if (!kmClarificationText.value.trim()) return
  emit('clarifyKm', props.entry.id, kmClarificationText.value.trim())
  kmClarificationText.value = ''
  showKmClarifyForm.value = false
}

const canDelete = ['pending', 'rejected', 'clarified'].includes(props.entry.status)
</script>

<template>
  <div class="rounded-lg border p-4 space-y-2 bg-card">
    <div class="flex items-start justify-between gap-2">
      <div class="space-y-0.5">
        <div class="flex items-center gap-1.5">
          <p class="font-medium text-sm">{{ formatDate(entry.entry_date) }}</p>
          <span v-if="entry.hours > 0" class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {{ t('approval.type_hours') }}
          </span>
          <span v-if="entry.km > 0" class="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {{ t('approval.type_mileage') }}
          </span>
        </div>
        <p class="text-sm text-muted-foreground">
          <span v-if="entry.start_time && entry.end_time">
            {{ entry.start_time }} – {{ entry.end_time }} &middot; {{ entry.hours }}h
          </span>
          <span v-else-if="entry.hours">{{ entry.hours }}h</span>
          <span v-if="entry.km > 0"><template v-if="entry.hours || (entry.start_time && entry.end_time)"> &middot; </template>{{ entry.km }} km</span>
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
      <span class="font-medium">{{ t('status.rejected') }}: </span>{{ entry.rejection_note }}
    </div>

    <!-- Clarification actions -->
    <div v-if="entry.status === 'rejected'">
      <Button v-if="!showClarifyForm" variant="outline" size="sm" @click="showClarifyForm = true">
        {{ t('entries.add_clarification') }}
      </Button>
      <div v-else class="space-y-2">
        <Textarea
          v-model="clarificationText"
          :placeholder="t('entries.clarification_placeholder')"
          class="text-sm min-h-16"
        />
        <div class="flex gap-2">
          <Button size="sm" :disabled="!clarificationText.trim()" @click="submitClarification">
            {{ t('entries.submit_clarification') }}
          </Button>
          <Button size="sm" variant="ghost" @click="showClarifyForm = false">{{ t('common.cancel') }}</Button>
        </div>
      </div>
    </div>

    <!-- Employee's previous hours clarification -->
    <div v-if="entry.status === 'clarified' && entry.employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
      <span class="font-medium">{{ t('entries.clarification_label') }} </span>{{ entry.employee_clarification }}
    </div>

    <!-- Km rejection note -->
    <div v-if="entry.km_status === 'rejected' && entry.km_rejection_note" class="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <span class="font-medium">{{ t('entries.km_rejection_label') }} </span>{{ entry.km_rejection_note }}
    </div>

    <!-- Km clarification actions -->
    <div v-if="entry.km_status === 'rejected'">
      <Button v-if="!showKmClarifyForm" variant="outline" size="sm" @click="showKmClarifyForm = true">
        {{ t('entries.add_km_clarification') }}
      </Button>
      <div v-else class="space-y-2">
        <Textarea
          v-model="kmClarificationText"
          :placeholder="t('entries.clarification_placeholder')"
          class="text-sm min-h-16"
        />
        <div class="flex gap-2">
          <Button size="sm" :disabled="!kmClarificationText.trim()" @click="submitKmClarification">
            {{ t('entries.submit_clarification') }}
          </Button>
          <Button size="sm" variant="ghost" @click="showKmClarifyForm = false">{{ t('common.cancel') }}</Button>
        </div>
      </div>
    </div>

    <!-- Employee's previous km clarification -->
    <div v-if="entry.km_employee_clarification" class="rounded-md bg-muted px-3 py-2 text-sm">
      <span class="font-medium">{{ t('entries.km_clarification_label') }} </span>{{ entry.km_employee_clarification }}
    </div>
  </div>
</template>
