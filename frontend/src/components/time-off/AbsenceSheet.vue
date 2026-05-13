<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAbsences } from '@/composables/useAbsences'
import BottomSheet from '@/components/ui/bottom-sheet/BottomSheet.vue'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  saved: []
}>()

const { t } = useI18n({ useScope: 'global' })
const { loading, error, submitAbsence } = useAbsences()

const startDate = ref('')
const endDate = ref('')
const isPaid = ref(true)
const affectsAccrual = ref(true)

watch(
  () => props.open,
  (open) => {
    if (open) {
      startDate.value = ''
      endDate.value = ''
      isPaid.value = true
      affectsAccrual.value = true
      error.value = null
    }
  },
)

function workDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  let count = 0
  const d = new Date(s)
  while (d <= e) {
    const dow = d.getDay()
    if (dow !== 0 && dow !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

const daysInPeriod = computed(() => workDays(startDate.value, endDate.value))

const canSave = computed(
  () =>
    !!startDate.value &&
    !!endDate.value &&
    endDate.value >= startDate.value &&
    daysInPeriod.value > 0,
)

async function handleSave() {
  if (!canSave.value) return
  try {
    await submitAbsence({
      startDate: startDate.value,
      endDate: endDate.value,
      isPaid: isPaid.value,
      affectsAccrual: affectsAccrual.value,
    })
    emit('saved')
    emit('update:open', false)
  } catch {
    // error is set by submitAbsence
  }
}

const INPUT_CLASS =
  'w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const LABEL_CLASS =
  'block text-[11px] font-semibold tracking-widest text-muted-foreground uppercase mb-1.5'
</script>

<template>
  <BottomSheet :open="open" :title="t('absence.title')" @update:open="emit('update:open', $event)">
    <!-- Reason (read-only) -->
    <div class="mb-5 mt-1">
      <p :class="LABEL_CLASS">{{ t('absence.reason_label') }}</p>
      <p class="text-sm font-semibold text-foreground">{{ t('absence.reason') }}</p>
      <p class="text-xs text-muted-foreground mt-0.5">{{ t('absence.reason_caption') }}</p>
    </div>

    <!-- Date pickers -->
    <div class="grid grid-cols-2 gap-3 mb-3">
      <div>
        <label :class="LABEL_CLASS">{{ t('absence.start_date') }}</label>
        <input v-model="startDate" type="date" :class="INPUT_CLASS" />
      </div>
      <div>
        <label :class="LABEL_CLASS">{{ t('absence.end_date') }}</label>
        <input
          v-model="endDate"
          type="date"
          :min="startDate"
          :class="INPUT_CLASS"
        />
      </div>
    </div>

    <!-- Days in period -->
    <p
      v-if="startDate && endDate && endDate >= startDate"
      class="text-sm text-muted-foreground mb-5"
    >
      {{ t('absence.days_in_period', { count: daysInPeriod }) }}
    </p>

    <!-- Checkboxes -->
    <div class="space-y-3 mb-5">
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          v-model="isPaid"
          type="checkbox"
          class="w-4 h-4 rounded border-input accent-indigo-600"
        />
        <span class="text-sm text-foreground">{{ t('absence.is_paid') }}</span>
      </label>
      <label class="flex items-center gap-3 cursor-pointer">
        <input
          v-model="affectsAccrual"
          type="checkbox"
          class="w-4 h-4 rounded border-input accent-indigo-600"
        />
        <span class="text-sm text-foreground">{{ t('absence.affects_accrual') }}</span>
      </label>
    </div>

    <!-- Error -->
    <p v-if="error" class="text-xs text-destructive mb-3">{{ error }}</p>

    <template #footer>
      <div class="flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-xl border border-input font-medium py-3 text-sm text-foreground hover:bg-muted transition-colors"
          :disabled="loading"
          @click="emit('update:open', false)"
        >
          {{ t('absence.cancel') }}
        </button>
        <button
          type="button"
          :disabled="!canSave || loading"
          class="flex-1 rounded-xl bg-indigo-600 text-white font-semibold py-3 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors disabled:opacity-50"
          @click="handleSave"
        >
          {{ loading ? t('absence.saving') : t('absence.save') }}
        </button>
      </div>
    </template>
  </BottomSheet>
</template>
