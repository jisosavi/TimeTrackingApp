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

function computeAllPeriods(s: PayrollSettings): { from: string; to: string; label: string }[] {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const mo = String(m + 1).padStart(2, '0')
  const lastDay = new Date(y, m + 1, 0).toISOString().slice(0, 10)
  if (s.payroll_period === 'monthly') {
    return [{ from: `${y}-${mo}-01`, to: lastDay, label: `${mo}/${y}` }]
  }
  return [
    { from: `${y}-${mo}-01`, to: `${y}-${mo}-15`, label: `${mo}/01–15 ${y}` },
    { from: `${y}-${mo}-16`, to: lastDay, label: `${mo}/16–${lastDay.slice(8)} ${y}` },
  ]
}

interface ProjectRow { project: string; hours: number; km: number }
interface PeriodStat {
  period: { from: string; to: string; label: string }
  isCurrent: boolean
  employeeCount: number
  totalEntries: number
  pendingCount: number
  approvedCount: number
  projectRows: ProjectRow[]
  totalHours: number
  totalKm: number
}

const periodStats = computed<PeriodStat[]>(() => {
  if (!settings.value) return []
  const today = new Date().toISOString().slice(0, 10)
  const periods = computeAllPeriods(settings.value)
  const allEntries = approvalEntries.value

  return periods.map((period) => {
    const inPeriod = allEntries.filter(
      e => e.status !== 'deleted' && e.entry_date >= period.from && e.entry_date <= period.to,
    )
    const countable = inPeriod.filter(e => e.status !== 'rejected')
    const employees = new Set(countable.map(e => e.employee_id))
    const projectMap = new Map<string, { hours: number; km: number }>()
    for (const e of countable) {
      const key = e.project?.trim() ?? ''
      const row = projectMap.get(key) ?? { hours: 0, km: 0 }
      row.hours += e.hours
      row.km += e.km
      projectMap.set(key, row)
    }
    const projectRows: ProjectRow[] = [...projectMap.entries()]
      .map(([project, { hours, km }]) => ({ project, hours, km }))
      .sort((a, b) => b.hours - a.hours)
    return {
      period,
      isCurrent: today >= period.from && today <= period.to,
      employeeCount: employees.size,
      totalEntries: countable.length,
      pendingCount: inPeriod.filter(e => e.status === 'pending' || e.status === 'clarified').length,
      approvedCount: inPeriod.filter(e => e.status === 'approved').length,
      projectRows,
      totalHours: projectRows.reduce((s, r) => s + r.hours, 0),
      totalKm: projectRows.reduce((s, r) => s + r.km, 0),
    }
  })
})

const currentPeriod = computed(() => {
  const today = new Date().toISOString().slice(0, 10)
  return periodStats.value.find(s => s.isCurrent)?.period
    ?? periodStats.value[0]?.period
    ?? null
})

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

    <!-- ── Current period summary ── -->
    <div>
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{{ t('payroll.summary_title') }}</p>
      <div v-if="settingsLoading" class="rounded-lg border px-4 py-3 bg-card text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </div>
      <div v-else class="space-y-3">
        <div
          v-for="stat in periodStats"
          :key="stat.period.from"
          class="rounded-lg border px-4 py-3 bg-card space-y-2"
          :class="stat.isCurrent ? 'border-primary/40' : 'opacity-60'"
        >
          <!-- Period header -->
          <div class="flex items-center justify-between">
            <p class="text-sm font-semibold">{{ stat.period.label }}</p>
            <span v-if="stat.isCurrent" class="text-[10px] font-semibold uppercase tracking-wide text-primary">
              {{ t('payroll.overview_current') }}
            </span>
          </div>
          <p class="text-xs text-muted-foreground">{{ stat.period.from }} – {{ stat.period.to }}</p>

          <!-- Empty state -->
          <p v-if="stat.totalEntries === 0" class="text-xs text-muted-foreground italic">
            {{ t('payroll.overview_no_entries') }}
          </p>

          <template v-else>
            <!-- Overview line -->
            <p class="text-xs text-muted-foreground">
              {{ t('payroll.overview_employees', { count: stat.employeeCount }) }}
              · {{ t('payroll.overview_entries', { count: stat.totalEntries }) }}
            </p>

            <!-- Status badges -->
            <div class="flex gap-2 flex-wrap">
              <Badge v-if="stat.pendingCount > 0" variant="secondary" class="text-xs">
                {{ t('payroll.pending_entries', { count: stat.pendingCount }) }}
              </Badge>
              <Badge v-if="stat.approvedCount > 0" variant="outline" class="text-xs">
                ✓ {{ stat.approvedCount }} {{ t('status.approved').toLowerCase() }}
              </Badge>
            </div>

            <!-- Project / cost-centre breakdown -->
            <div class="pt-1 space-y-1 border-t">
              <div
                v-for="row in stat.projectRows"
                :key="row.project"
                class="flex items-center justify-between text-xs"
              >
                <span class="truncate pr-2 text-foreground">
                  {{ row.project || t('payroll.overview_no_project') }}
                </span>
                <span class="tabular-nums text-muted-foreground shrink-0">
                  <template v-if="row.hours > 0">{{ row.hours.toFixed(1) }}h</template>
                  <template v-if="row.hours > 0 && row.km > 0"> · </template>
                  <template v-if="row.km > 0">{{ row.km }} km</template>
                </span>
              </div>
              <!-- Total row -->
              <div class="flex items-center justify-between text-xs font-semibold pt-1 border-t">
                <span>{{ t('payroll.overview_total') }}</span>
                <span class="tabular-nums">
                  <template v-if="stat.totalHours > 0">{{ stat.totalHours.toFixed(1) }}h</template>
                  <template v-if="stat.totalHours > 0 && stat.totalKm > 0"> · </template>
                  <template v-if="stat.totalKm > 0">{{ stat.totalKm }} km</template>
                </span>
              </div>
            </div>
          </template>
        </div>
      </div>
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
