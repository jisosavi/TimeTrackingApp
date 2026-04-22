<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { useAdminData } from '@/composables/useAdminData'
import { useApproval } from '@/composables/useApproval'
import type { ExportPeriod, ExportResult, PayrollSettings } from '@/types'

const { t } = useI18n({ useScope: 'global' })

const { fetchExportPreview, submitExport, fetchPayrollSettings } = useAdminData()
const { entries: approvalEntries, fetchEntries: fetchApprovalEntries } = useApproval()

// ── Current-period summary ────────────────────────────────────────────────────
const settings = ref<PayrollSettings | null>(null)
const settingsLoading = ref(true)

function computeCurrentPeriod(s: PayrollSettings): { from: string; to: string; label: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const mo = String(m + 1).padStart(2, '0')
  const lastDay = new Date(y, m + 1, 0).toISOString().slice(0, 10)
  if (s.payroll_period === 'monthly') {
    return { from: `${y}-${mo}-01`, to: lastDay, label: `${mo}/${y}` }
  }
  // biweekly: 1–15 or 16–end
  const day = now.getDate()
  if (day <= 15) {
    return { from: `${y}-${mo}-01`, to: `${y}-${mo}-15`, label: `${mo}/01–15 ${y}` }
  }
  return { from: `${y}-${mo}-16`, to: lastDay, label: `${mo}/16–${lastDay.slice(8)} ${y}` }
}

const currentPeriod = computed(() => settings.value ? computeCurrentPeriod(settings.value) : null)

const pendingCount = computed(() =>
  approvalEntries.value.filter(e => e.status === 'pending' || e.status === 'clarified').length,
)

// ── Export state ──────────────────────────────────────────────────────────────
const exportDateFrom = ref('')
const exportDateTo = ref('')
const exportPeriods = ref<ExportPeriod[]>([])
const exportSelectedIds = ref<number[]>([])
const exportLoading = ref(false)
const exportError = ref<string | null>(null)
const exportResult = ref<ExportResult | null>(null)

// Accordion: open new/unexported periods by default, collapse already-exported ones
const accordionOpenItems = ref<string[]>([])
watch(exportPeriods, (periods) => {
  accordionOpenItems.value = periods
    .filter(p => !p.existing_payroll_id)
    .map(p => p.period_start)
})

onMounted(async () => {
  try {
    settings.value = await fetchPayrollSettings()
  } catch {}
  settingsLoading.value = false

  // Seed date range from computed current period (falls back to monthly defaults)
  const period = currentPeriod.value
  if (period) {
    exportDateFrom.value = period.from
    exportDateTo.value = period.to
  } else {
    const now = new Date()
    const y = now.getFullYear()
    const mo = String(now.getMonth() + 1).padStart(2, '0')
    exportDateFrom.value = `${y}-${mo}-01`
    exportDateTo.value = new Date(y, now.getMonth() + 1, 0).toISOString().slice(0, 10)
  }

  fetchApprovalEntries()
})

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

    <!-- ── Current period summary card ── -->
    <div class="rounded-lg border px-4 py-3 bg-card space-y-1">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('payroll.summary_title') }}</p>
      <div v-if="settingsLoading" class="text-sm text-muted-foreground">{{ t('common.loading') }}</div>
      <template v-else-if="currentPeriod">
        <p class="text-base font-semibold">{{ currentPeriod.label }}</p>
        <p class="text-xs text-muted-foreground">{{ t('payroll.period_dates', { from: currentPeriod.from, to: currentPeriod.to }) }}</p>
        <div class="pt-1">
          <Badge v-if="pendingCount > 0" variant="secondary" class="text-xs">
            {{ t('payroll.pending_entries', { count: pendingCount }) }}
          </Badge>
          <span v-else class="text-xs text-muted-foreground">{{ t('payroll.no_pending') }}</span>
        </div>
      </template>
    </div>

    <!-- ── Export section ── -->
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

      <!-- Periods accordion -->
      <Accordion
        v-if="exportPeriods.length"
        v-model="accordionOpenItems"
        type="multiple"
        class="space-y-2"
      >
        <AccordionItem
          v-for="period in exportPeriods"
          :key="period.period_start"
          :value="period.period_start"
          class="rounded-lg border px-3"
        >
          <AccordionTrigger class="gap-2">
            <span>{{ period.period_label }}</span>
            <Badge
              v-if="period.existing_payroll_id"
              variant="outline"
              class="text-[10px] normal-case ml-1"
            >{{ t('payroll.previously_exported') }}</Badge>
          </AccordionTrigger>
          <AccordionContent class="pb-3">
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
                class="h-4 w-4"
                @change="toggleExportEmployee(emp.employee_id)"
              />
              <span class="flex-1">{{ emp.employee_name }}</span>
              <span class="text-muted-foreground text-xs">
                {{ emp.total_hours }}h<span v-if="emp.total_km > 0">, {{ emp.total_km }}km</span>
                <span v-if="emp.pending_hours < emp.total_hours" class="text-orange-500 ml-1">{{ t('payroll.new_hours_badge', { hours: emp.pending_hours }) }}</span>
              </span>
              <span v-if="!emp.salaxy_employment_id" class="text-xs text-destructive">{{ t('payroll.no_salaxy_id') }}</span>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div v-if="exportPeriods.length" class="flex gap-2 pt-1">
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
