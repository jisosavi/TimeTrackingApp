<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAdminData } from '@/composables/useAdminData'
import type { ExportPeriod, ExportResult } from '@/types'

const { t } = useI18n({ useScope: 'global' })

const { fetchExportPreview, submitExport } = useAdminData()

const exportDateFrom = ref('')
const exportDateTo = ref('')
const exportPeriods = ref<ExportPeriod[]>([])
const exportSelectedIds = ref<number[]>([])
const exportLoading = ref(false)
const exportError = ref<string | null>(null)
const exportResult = ref<ExportResult | null>(null)

const now = new Date()
const y = now.getFullYear()
const mo = String(now.getMonth() + 1).padStart(2, '0')
exportDateFrom.value = `${y}-${mo}-01`
exportDateTo.value = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10)

async function doFetchPreview() {
  exportError.value = null
  exportResult.value = null
  exportPeriods.value = []
  exportLoading.value = true
  try {
    exportPeriods.value = await fetchExportPreview(exportDateFrom.value, exportDateTo.value)
    exportSelectedIds.value = exportPeriods.value
      .flatMap(p => p.employees)
      .filter(e => e.pending_hours > 0 || e.pending_km > 0)
      .map(e => e.employee_id)
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : 'Fetch failed'
  } finally {
    exportLoading.value = false
  }
}

function toggleExportEmployee(id: number) {
  const idx = exportSelectedIds.value.indexOf(id)
  if (idx >= 0) exportSelectedIds.value.splice(idx, 1)
  else exportSelectedIds.value.push(id)
}

const exportAllEmployeeIds = computed(() =>
  exportPeriods.value.flatMap(p => p.employees).map(e => e.employee_id),
)

async function doExport(force = false) {
  exportError.value = null
  exportResult.value = null
  exportLoading.value = true
  const ids = force ? exportAllEmployeeIds.value : exportSelectedIds.value
  try {
    exportResult.value = await submitExport(exportDateFrom.value, exportDateTo.value, ids, force)
    exportPeriods.value = []
  } catch (e) {
    exportError.value = e instanceof Error ? e.message : 'Export failed'
  } finally {
    exportLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">{{ t('payroll.title') }}</h2>

    <div class="rounded-lg border p-4 space-y-4 bg-card">
      <p class="text-sm font-semibold">{{ t('payroll.export_section_title') }}</p>

      <div class="flex gap-3 flex-wrap items-end">
        <div class="space-y-1">
          <Label class="text-xs">{{ t('payroll.date_from_label') }}</Label>
          <Input v-model="exportDateFrom" type="date" class="w-36" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">{{ t('payroll.date_to_label') }}</Label>
          <Input v-model="exportDateTo" type="date" class="w-36" />
        </div>
        <Button size="sm" :disabled="exportLoading || !exportDateFrom || !exportDateTo" @click="doFetchPreview">
          {{ exportLoading && !exportPeriods.length ? t('payroll.fetching') : t('payroll.fetch_button') }}
        </Button>
      </div>

      <p v-if="exportError" class="text-sm text-destructive">{{ exportError }}</p>

      <div v-if="exportPeriods.length" class="space-y-4">
        <div v-for="period in exportPeriods" :key="period.period_start" class="space-y-2">
          <p class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {{ period.period_label }}
            <span v-if="period.existing_payroll_id" class="normal-case text-orange-500 ml-2">{{ t('payroll.previously_exported') }}</span>
          </p>
          <p v-if="period.employees.length === 0" class="text-xs text-muted-foreground py-1 italic">
            {{ t('payroll.no_entries_empty') }}
          </p>
          <div
            v-for="emp in period.employees"
            :key="emp.employee_id"
            class="flex items-center gap-3 text-sm py-1 border-b last:border-0"
          >
            <input
              type="checkbox"
              :checked="exportSelectedIds.includes(emp.employee_id)"
              @change="toggleExportEmployee(emp.employee_id)"
              class="h-4 w-4"
            />
            <span class="flex-1">{{ emp.employee_name }}</span>
            <span class="text-muted-foreground text-xs">
              {{ emp.total_hours }}h<span v-if="emp.total_km > 0">, {{ emp.total_km }}km</span>
              <span v-if="emp.pending_hours < emp.total_hours" class="text-orange-500 ml-1">{{ t('payroll.new_hours_badge', { hours: emp.pending_hours }) }}</span>
            </span>
            <span v-if="!emp.salaxy_employment_id" class="text-xs text-destructive">{{ t('payroll.no_salaxy_id') }}</span>
          </div>
        </div>

        <div class="flex gap-2 pt-1">
          <Button
            size="sm"
            :disabled="exportLoading || exportPeriods.length === 0"
            @click="doExport(false)"
          >
            {{ exportLoading ? t('payroll.exporting') : t('payroll.export_button') }}
          </Button>
          <Button
            size="sm"
            variant="outline"
            :disabled="exportLoading || exportAllEmployeeIds.length === 0"
            @click="doExport(true)"
          >
            {{ t('payroll.reexport_button') }}
          </Button>
        </div>
      </div>

      <div v-if="exportResult" class="rounded-md bg-muted p-3 text-sm space-y-1">
        <p class="font-medium text-green-700">{{ t('payroll.export_complete') }}</p>
        <p>{{ t('payroll.export_summary', { sent: exportResult.total_sent, added: exportResult.total_added, already: exportResult.total_already }) }}</p>
        <p v-if="exportResult.errors > 0" class="text-destructive">{{ t('payroll.export_errors', { count: exportResult.errors }) }}</p>
        <div v-for="payroll in exportResult.payrolls" :key="payroll.period_start">
          <a :href="payroll.url" target="_blank" class="text-primary hover:underline text-xs">
            {{ t('payroll.open_in_salaxy', { period: payroll.period_start }) }}
          </a>
        </div>
      </div>
    </div>
  </div>
</template>
