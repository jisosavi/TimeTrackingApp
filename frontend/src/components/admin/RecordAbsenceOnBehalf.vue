<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
import type { Employee } from '@/types/index'

defineOptions({ name: 'RecordAbsenceOnBehalf' })

const props = defineProps<{
  employees: Employee[]
  preselectedEmployeeId?: number
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

const { t } = useI18n({ useScope: 'global' })
const { post } = useApi()

const employeeId = ref<number | ''>('')
const startDate = ref('')
const endDate = ref('')
const isPaid = ref(true)
const affectsAccrual = ref(true)
const note = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

watch(() => props.preselectedEmployeeId, (id) => {
  if (id != null) employeeId.value = id
}, { immediate: true })

function computeWorkDays(start: string, end: string): number {
  if (!start || !end || end < start) return 0
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end + 'T12:00:00')
  let n = 0
  const d = new Date(s)
  while (d <= e) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

const daysInPeriod = computed(() => computeWorkDays(startDate.value, endDate.value))

async function submit() {
  if (!employeeId.value || !startDate.value || !endDate.value) {
    error.value = t('admin.absence_on_behalf.missing_fields')
    return
  }
  saving.value = true
  error.value = null
  try {
    await post('/api/admin/record_absence', {
      employeeId: employeeId.value,
      startDate: startDate.value,
      endDate: endDate.value,
      isPaid: isPaid.value,
      affectsAccrual: affectsAccrual.value,
      note: note.value.trim() || null,
    })
    emit('saved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('absence.error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
    @click.self="emit('close')"
  >
    <div class="bg-background rounded-lg shadow-xl border border-border w-full max-w-md mx-4 overflow-hidden">
      <!-- Header -->
      <div class="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {{ t('admin.absence_on_behalf.section_label') }}
          </p>
          <h2 class="text-base font-bold text-foreground leading-tight">
            {{ t('admin.absence_on_behalf.title') }}
          </h2>
        </div>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground mt-0.5"
          @click="emit('close')"
        >
          ×
        </button>
      </div>

      <div class="px-5 pb-5 space-y-4">
        <!-- Employee -->
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {{ t('admin.absence_on_behalf.employee_label') }}
          </label>
          <select
            v-model="employeeId"
            class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{{ t('admin.absence_on_behalf.select_placeholder') }}</option>
            <option v-for="emp in employees" :key="emp.id" :value="emp.id">{{ emp.name }}</option>
          </select>
        </div>

        <!-- Reason (locked to Kertausharjoitus v1) -->
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {{ t('admin.absence_on_behalf.reason_label') }}
          </label>
          <select class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm" disabled>
            <option>Kertausharjoitus</option>
          </select>
          <p class="text-[11px] text-muted-foreground">{{ t('admin.absence_on_behalf.reason_caption') }}</p>
        </div>

        <!-- Dates -->
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {{ t('absence.start_date') }}
            </label>
            <input
              v-model="startDate"
              type="date"
              class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {{ t('absence.end_date') }}
            </label>
            <input
              v-model="endDate"
              type="date"
              :min="startDate"
              class="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            />
          </div>
        </div>

        <!-- Days in period -->
        <div
          v-if="daysInPeriod > 0"
          class="flex items-center justify-between px-3 py-2 rounded-md bg-muted/50 text-sm"
        >
          <span class="text-muted-foreground">{{ t('absence.days_in_period') }}</span>
          <span class="font-semibold text-foreground">
            {{ daysInPeriod }} {{ t('admin.absence_on_behalf.days_excludes') }}
          </span>
        </div>

        <!-- Checkboxes -->
        <div class="space-y-2">
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="isPaid" type="checkbox" class="rounded" />
            {{ t('absence.is_paid') }}
          </label>
          <label class="flex items-center gap-2 text-sm cursor-pointer">
            <input v-model="affectsAccrual" type="checkbox" class="rounded" />
            {{ t('absence.affects_accrual') }}
          </label>
        </div>

        <!-- Note -->
        <div class="space-y-1">
          <label class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {{ t('admin.absence_on_behalf.note_label') }}
          </label>
          <textarea
            v-model="note"
            rows="2"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
            :placeholder="t('admin.absence_on_behalf.note_placeholder')"
          />
        </div>

        <!-- Error -->
        <p v-if="error" class="text-xs text-destructive">{{ error }}</p>

        <!-- Actions -->
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            @click="emit('close')"
          >
            {{ t('absence.cancel') }}
          </button>
          <button
            type="button"
            :disabled="saving"
            class="px-4 py-2 text-sm font-semibold rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            @click="submit"
          >
            {{ saving ? t('absence.saving') : t('admin.absence_on_behalf.save_btn') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
