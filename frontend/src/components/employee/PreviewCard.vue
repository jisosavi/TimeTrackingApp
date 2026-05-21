<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import type { LlmParsedBlock, LlmEntry } from '@/types'

const props = defineProps<{
  parsed: LlmParsedBlock
  loading: boolean
}>()

const emit = defineEmits<{
  confirm: [LlmParsedBlock]
  cancel: []
}>()

const { t } = useI18n({ useScope: 'global' })

// ── Time entry state ──────────────────────────────────────────────────────────
interface PreviewRow { date: string; hours: string; km: string; project: string; notes: string }
const entryRows = ref<PreviewRow[]>([])

function toInputDate(raw: string): string {
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split(/[-.]/)
  if (parts.length === 3 && parts[0]!.length === 2) return `${parts[2]}-${parts[1]}-${parts[0]}`
  return raw
}

// ── Holiday proposal state ────────────────────────────────────────────────────
const holidayDraft = ref({ startDate: '', endDate: '', label: '', note: '' })

// ── Absence state ─────────────────────────────────────────────────────────────
const absenceDraft = ref({ startDate: '', endDate: '', isPaid: true, affectsAccrual: true, causeCode: 'other', note: '' })

watch(
  () => props.parsed,
  (p) => {
    if (p.type === 'holiday_proposal') {
      holidayDraft.value = {
        startDate: toInputDate(p.startDate ?? ''),
        endDate: toInputDate(p.endDate ?? ''),
        label: p.label ?? '',
        note: p.note ?? '',
      }
    } else if (p.type === 'absence') {
      absenceDraft.value = {
        startDate: toInputDate(p.startDate ?? ''),
        endDate: toInputDate(p.endDate ?? ''),
        isPaid: p.isPaid ?? true,
        affectsAccrual: p.affectsAccrual ?? true,
        causeCode: p.causeCode ?? 'other',
        note: p.note ?? '',
      }
    } else {
      entryRows.value = p.entries.map((e) => ({
        date: toInputDate(e.date ?? ''),
        hours: e.hours > 0 ? String(e.hours) : '',
        km: e.mileage > 0 ? String(e.mileage) : '',
        project: e.project ?? '',
        notes: e.notes ?? '',
      }))
    }
  },
  { immediate: true },
)

// ── Work days ─────────────────────────────────────────────────────────────────
function workDays(start: string, end: string): number {
  if (!start || !end) return 0
  const s = new Date(start)
  const e = new Date(end)
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return 0
  let count = 0
  const d = new Date(s)
  while (d <= e) {
    if (d.getDay() !== 0 && d.getDay() !== 6) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

const holidayWorkDays = computed(() => workDays(holidayDraft.value.startDate, holidayDraft.value.endDate))
const absenceWorkDays = computed(() => workDays(absenceDraft.value.startDate, absenceDraft.value.endDate))

// ── Type helpers ──────────────────────────────────────────────────────────────
const isHoliday = computed(() => props.parsed.type === 'holiday_proposal')
const isAbsence = computed(() => props.parsed.type === 'absence')
const isTimeEntry = computed(() => !isHoliday.value && !isAbsence.value)

// ── Confirm ───────────────────────────────────────────────────────────────────
function handleConfirm() {
  const p = props.parsed
  if (p.type === 'holiday_proposal') {
    emit('confirm', {
      ...p,
      startDate: holidayDraft.value.startDate,
      endDate: holidayDraft.value.endDate,
      label: holidayDraft.value.label || undefined,
      note: holidayDraft.value.note || undefined,
    })
  } else if (p.type === 'absence') {
    emit('confirm', {
      ...p,
      startDate: absenceDraft.value.startDate,
      endDate: absenceDraft.value.endDate,
      isPaid: absenceDraft.value.isPaid,
      affectsAccrual: absenceDraft.value.affectsAccrual,
      causeCode: absenceDraft.value.causeCode,
      note: absenceDraft.value.note || undefined,
    })
  } else {
    const merged: LlmEntry[] = p.entries.map((orig, i) => {
      const row = entryRows.value[i]!
      return {
        ...orig,
        date: row.date || orig.date,
        hours: parseFloat(row.hours) || orig.hours,
        mileage: row.km !== '' ? parseFloat(row.km) : orig.mileage,
        project: row.project,
        notes: row.notes,
      }
    })
    emit('confirm', { ...p, entries: merged })
  }
}
</script>

<template>
  <Card class="mt-2">
    <!-- Holiday proposal -->
    <template v-if="isHoliday">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">🌴 {{ t('chat.preview_holiday_title') }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <Label class="text-xs">{{ t('absence.start_date') }}</Label>
            <Input v-model="holidayDraft.startDate" type="date" class="h-8 text-sm" />
          </div>
          <div class="space-y-1">
            <Label class="text-xs">{{ t('absence.end_date') }}</Label>
            <Input v-model="holidayDraft.endDate" type="date" class="h-8 text-sm" />
          </div>
        </div>
        <p v-if="holidayWorkDays > 0" class="text-xs text-muted-foreground">
          {{ t('timeOff.work_days', { count: holidayWorkDays }) }}
        </p>
        <div class="space-y-1">
          <Label class="text-xs">{{ t('employee.preview_notes_label') }}</Label>
          <Input v-model="holidayDraft.label" :placeholder="t('chat.preview_label_placeholder')" class="h-8 text-sm" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">{{ t('entries.col_project') }}</Label>
          <Input v-model="holidayDraft.note" class="h-8 text-sm" />
        </div>
      </CardContent>
    </template>

    <!-- Absence -->
    <template v-else-if="isAbsence">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">🏕️ {{ t('chat.preview_absence_title') }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <Label class="text-xs">{{ t('absence.start_date') }}</Label>
            <Input v-model="absenceDraft.startDate" type="date" class="h-8 text-sm" />
          </div>
          <div class="space-y-1">
            <Label class="text-xs">{{ t('absence.end_date') }}</Label>
            <Input v-model="absenceDraft.endDate" type="date" class="h-8 text-sm" />
          </div>
        </div>
        <p v-if="absenceWorkDays > 0" class="text-xs text-muted-foreground">
          {{ t('timeOff.work_days', { count: absenceWorkDays }) }}
        </p>
        <div class="space-y-1">
          <Label class="text-xs">{{ t('absence.reason_label') }}</Label>
          <Input :value="t(`absence.cause.${absenceDraft.causeCode}`, absenceDraft.causeCode)" disabled class="h-8 text-sm" />
        </div>
        <div class="flex items-center justify-between">
          <Label class="text-xs">{{ t('absence.is_paid') }}</Label>
          <Switch v-model:checked="absenceDraft.isPaid" size="sm" />
        </div>
        <div class="flex items-center justify-between">
          <Label class="text-xs">{{ t('absence.affects_accrual') }}</Label>
          <Switch v-model:checked="absenceDraft.affectsAccrual" size="sm" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">{{ t('employee.preview_notes_label') }}</Label>
          <Input v-model="absenceDraft.note" class="h-8 text-sm" />
        </div>
      </CardContent>
    </template>

    <!-- Time entry (default) -->
    <template v-else-if="isTimeEntry">
      <CardHeader class="pb-2">
        <CardTitle class="text-sm">{{ t('employee.preview_title') }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-4">
        <div
          v-for="(row, i) in entryRows"
          :key="i"
          class="space-y-2 border-b pb-3 last:border-0 last:pb-0"
        >
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <Label class="text-xs">{{ t('entries.col_date') }}</Label>
              <Input v-model="row.date" type="date" class="h-8 text-sm" />
            </div>
            <div class="space-y-1">
              <Label class="text-xs">{{ t('employee.preview_hours_label') }}</Label>
              <Input v-model="row.hours" type="number" min="0" step="0.5" class="h-8 text-sm" />
            </div>
          </div>
          <div v-if="row.km !== ''" class="space-y-1">
            <Label class="text-xs">{{ t('employee.preview_km_label') }}</Label>
            <Input v-model="row.km" type="number" min="0" step="1" class="h-8 text-sm" />
          </div>
          <div class="space-y-1">
            <Label class="text-xs">{{ t('entries.col_project') }}</Label>
            <Input v-model="row.project" class="h-8 text-sm" />
          </div>
          <div class="space-y-1">
            <Label class="text-xs">{{ t('employee.preview_notes_label') }}</Label>
            <Input v-model="row.notes" class="h-8 text-sm" />
          </div>
        </div>
      </CardContent>
    </template>

    <CardFooter class="flex gap-2 border-t-0 bg-transparent pt-2">
      <Button size="sm" :disabled="loading" @click="handleConfirm">
        {{ t('employee.preview_confirm') }}
      </Button>
      <Button size="sm" variant="ghost" @click="emit('cancel')">
        {{ t('common.cancel') }}
      </Button>
    </CardFooter>
  </Card>
</template>
