<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import BottomSheet from '@/components/ui/bottom-sheet/BottomSheet.vue'

const props = defineProps<{
  open: boolean
  startDate: string | null
  endDate: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  submitted: []
}>()

const { t } = useI18n({ useScope: 'global' })
const { post } = useApi()

const label = ref('')
const note = ref('')
const submitting = ref(false)
const submitError = ref<string | null>(null)

// Reset form when sheet opens
watch(() => props.open, (open) => {
  if (open) {
    label.value = ''
    note.value = ''
    submitError.value = null
    submitting.value = false
  }
})

function fmtDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const dateRangeText = (() => {
  if (!props.startDate) return ''
  if (!props.endDate || props.startDate === props.endDate) return fmtDate(props.startDate)
  return `${fmtDate(props.startDate)} – ${fmtDate(props.endDate)}`
})

async function handleSubmit() {
  if (!props.startDate || !props.endDate || !label.value.trim()) return
  submitting.value = true
  submitError.value = null
  try {
    await post('/api/holiday_proposals', {
      start_date: props.startDate,
      end_date: props.endDate,
      label: label.value.trim(),
      note: note.value.trim() || null,
    })
    emit('submitted')
    emit('update:open', false)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    submitError.value = msg === 'overlap' ? t('propose.error_overlap') : t('propose.error')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <BottomSheet :open="open" :title="t('propose.title')" @update:open="emit('update:open', $event)">
    <!-- Date range (read-only) -->
    <div class="mb-4 mt-1">
      <p class="text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">
        {{ t('propose.date_range') }}
      </p>
      <p class="text-sm font-medium text-foreground">{{ dateRangeText() }}</p>
    </div>

    <!-- Label input -->
    <div class="mb-4">
      <label class="block text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mb-1.5">
        {{ t('propose.label_input') }}
      </label>
      <input
        v-model="label"
        type="text"
        :placeholder="t('propose.label_placeholder')"
        class="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        maxlength="100"
      />
    </div>

    <!-- Note textarea -->
    <div class="mb-4">
      <label class="block text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mb-1.5">
        {{ t('propose.note_input') }}
      </label>
      <textarea
        v-model="note"
        :placeholder="t('propose.note_placeholder')"
        rows="3"
        class="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
        maxlength="500"
      />
    </div>

    <!-- Error -->
    <p v-if="submitError" class="text-xs text-destructive mb-3">{{ submitError }}</p>

    <template #footer>
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-xl border border-input font-medium py-3 text-sm text-foreground hover:bg-muted transition-colors"
          :disabled="submitting"
          @click="emit('update:open', false)"
        >
          {{ t('propose.back') }}
        </button>
        <button
          type="button"
          :disabled="submitting || !label.trim()"
          class="flex-1 rounded-xl bg-indigo-600 text-white font-semibold py-3 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50"
          @click="handleSubmit"
        >
          {{ submitting ? t('propose.submitting') : t('propose.submit') }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
