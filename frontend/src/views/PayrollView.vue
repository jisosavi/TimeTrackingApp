<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { lastName, firstNames } from '@/utils/name'
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

const _now = new Date()
const _todayStr = _now.toISOString().slice(0, 10)
const _curYear = _now.getFullYear()
const _curMonthIdx = _now.getMonth()
const _curMonthStr = String(_curMonthIdx + 1).padStart(2, '0')
const currentMonthStart = `${_curYear}-${_curMonthStr}-01`
const currentMonthLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(_now)

function computeMonthPeriods(s: PayrollSettings, y: number, mIdx: number) {
  const mo = String(mIdx + 1).padStart(2, '0')
  const lastDayNum = new Date(y, mIdx + 1, 0).getDate()
  const lastDay = `${y}-${mo}-${String(lastDayNum).padStart(2, '0')}`
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
  employeeCount: number
  totalEntries: number
  pendingCount: number
  approvedCount: number
  projectRows: ProjectRow[]
  totalHours: number
  totalKm: number
}

function computeStat(period: { from: string; to: string; label: string }, allEntries: typeof approvalEntries.value): PeriodStat {
  const inPeriod = allEntries.filter(
    e => e.status !== 'deleted' && e.entry_date >= period.from && e.entry_date <= period.to,
  )
  const countable = inPeriod.filter(e => e.status !== 'rejected')
  const employees = new Set(countable.map(e => e.employee_id))
  const projectMap = new Map<string, { hours: number; km: number }>()
  for (const e of countable) {
    const key = e.project?.trim() ?? ''
    const row = projectMap.get(key) ?? { hours: 0, km: 0 }
    row.hours += Number(e.hours)
    row.km += Number(e.km)
    projectMap.set(key, row)
  }
  const projectRows: ProjectRow[] = [...projectMap.entries()]
    .map(([project, { hours, km }]) => ({ project, hours, km }))
    .sort((a, b) => b.hours - a.hours)
  return {
    period,
    employeeCount: employees.size,
    totalEntries: countable.length,
    pendingCount: inPeriod.filter(e => {
      if (e.status === 'pending' || e.status === 'clarified') return true
      const isDual = e.hours > 0 && e.km > 0
      return isDual && e.km_status === 'pending'
    }).length,
    approvedCount: inPeriod.filter(e => {
      if (e.status !== 'approved') return false
      const isDual = e.hours > 0 && e.km > 0
      return !isDual || e.km_status === 'approved'
    }).length,
    projectRows,
    totalHours: projectRows.reduce((s, r) => s + r.hours, 0),
    totalKm: projectRows.reduce((s, r) => s + r.km, 0),
  }
}

const periodStats = computed<PeriodStat[]>(() => {
  if (!settings.value) return []
  return computeMonthPeriods(settings.value, _curYear, _curMonthIdx)
    .map(p => computeStat(p, approvalEntries.value))
})

interface PrevMonthGroup { label: string; monthKey: string; stats: PeriodStat[] }
const previousMonthGroups = computed<PrevMonthGroup[]>(() => {
  if (!settings.value) return []
  const prev = approvalEntries.value.filter(
    e => e.status !== 'deleted' && e.entry_date < currentMonthStart,
  )
  if (!prev.length) return []
  const monthKeys = [...new Set(prev.map(e => e.entry_date.slice(0, 7)))]
    .sort((a, b) => b.localeCompare(a))
  return monthKeys.map((monthKey) => {
    const [yStr, moStr] = monthKey.split('-')
    const y = parseInt(yStr!); const mIdx = parseInt(moStr!) - 1
    const stats = computeMonthPeriods(settings.value!, y, mIdx)
      .map(p => computeStat(p, prev))
      .filter(s => s.totalEntries > 0)
    const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
      .format(new Date(y, mIdx, 1))
    return { label, monthKey, stats }
  }).filter(g => g.stats.length > 0)
})

const currentPeriod = computed(() => {
  const hit = periodStats.value.find(s => _todayStr >= s.period.from && _todayStr <= s.period.to)
  return hit?.period ?? periodStats.value[0]?.period ?? null
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

function getPeriodExportedAt(period: ExportPeriod): string {
  let latest = ''
  for (const emp of period.employees) {
    for (const entry of emp.entries) {
      if (entry.exported_at && entry.exported_at > latest) latest = entry.exported_at
    }
  }
  return latest
}

function formatExportedAt(ts: string): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(ts))
}

function periodExportedLabel(period: ExportPeriod): string {
  if (!period.existing_payroll_id) return t('payroll.not_exported_yet')
  const ts = getPeriodExportedAt(period)
  return ts
    ? t('payroll.exported_at_badge', { datetime: formatExportedAt(ts) })
    : t('payroll.previously_exported')
}

onMounted(async () => {
  try {
    settings.value = await fetchPayrollSettings()
  } catch {}
  settingsLoading.value = false

  exportDateFrom.value = currentMonthStart
  const _lastDay = new Date(_curYear, _curMonthIdx + 1, 0).getDate()
  exportDateTo.value = `${_curYear}-${_curMonthStr}-${String(_lastDay).padStart(2, '0')}`

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
  <div class="space-y-6">
    <h2 class="text-lg font-semibold">{{ t('payroll.title') }}</h2>

    <!-- ── Section 1: Export Payroll Data ── -->
    <div class="space-y-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('payroll.section_export') }}</p>

      <div class="rounded-lg border p-4 space-y-4 bg-card">
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
                :variant="period.existing_payroll_id ? 'outline' : 'secondary'"
                class="text-[10px] normal-case ml-1"
              >{{ periodExportedLabel(period) }}</Badge>
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
                <span class="flex-1"><span class="font-bold">{{ lastName(emp.employee_name) }}</span><template v-if="firstNames(emp.employee_name)">, {{ firstNames(emp.employee_name) }}</template></span>
                <span class="text-muted-foreground text-xs">
                  {{ emp.total_hours }}h<span v-if="emp.total_km > 0">, {{ emp.total_km }}km</span>
                  <template v-if="emp.pending_hours < emp.total_hours">
                  <span v-if="emp.pending_hours === 0" class="text-muted-foreground ml-1">{{ t('payroll.no_new_entries') }}</span>
                  <span v-else class="text-orange-500 ml-1">{{ t('payroll.new_hours_badge', { hours: emp.pending_hours }) }}</span>
                </template>
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

    <!-- ── Section 2: Payrolls ── -->
    <div class="space-y-3">
      <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('payroll.section_payrolls') }}</p>

      <div v-if="settingsLoading" class="rounded-lg border px-4 py-3 bg-card text-sm text-muted-foreground">
        {{ t('common.loading') }}
      </div>
      <div v-else class="space-y-3">
        <!-- Month header with draft count -->
        <div class="flex items-baseline justify-between">
          <p class="text-xs font-semibold text-foreground">{{ currentMonthLabel }}</p>
          <p class="text-xs text-muted-foreground">{{ t('payroll.draft_count', { count: periodStats.length }) }}</p>
        </div>

        <!-- Current month period cards -->
        <div
          v-for="stat in periodStats"
          :key="stat.period.from"
          class="rounded-lg border px-4 py-3 bg-card space-y-2"
        >
          <p class="text-sm font-semibold">{{ stat.period.label }}</p>
          <p class="text-xs text-muted-foreground">{{ stat.period.from }} – {{ stat.period.to }}</p>

          <p v-if="stat.totalEntries === 0" class="text-xs text-muted-foreground italic">
            {{ t('payroll.overview_no_entries') }}
          </p>

          <template v-else>
            <p class="text-xs text-muted-foreground">
              {{ t('payroll.overview_employees', { count: stat.employeeCount }) }}
              · {{ t('payroll.overview_entries', { count: stat.totalEntries }) }}
            </p>
            <div class="flex gap-2 flex-wrap">
              <Badge v-if="stat.pendingCount > 0" variant="secondary" class="text-xs">
                {{ t('payroll.pending_entries', { count: stat.pendingCount }) }}
              </Badge>
              <Badge v-if="stat.approvedCount > 0" variant="outline" class="text-xs">
                {{ t('payroll.approved_count', { count: stat.approvedCount }) }}
              </Badge>
            </div>
            <div class="pt-1 space-y-1 border-t">
              <div
                v-for="row in stat.projectRows"
                :key="row.project"
                class="flex items-center justify-between text-xs"
              >
                <span class="truncate pr-2 text-foreground">{{ row.project || t('payroll.overview_no_project') }}</span>
                <span class="tabular-nums text-muted-foreground shrink-0">
                  <template v-if="row.hours > 0">{{ row.hours.toFixed(1) }}h</template>
                  <template v-if="row.hours > 0 && row.km > 0"> · </template>
                  <template v-if="row.km > 0">{{ row.km }} km</template>
                </span>
              </div>
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

        <!-- Previous months (collapsible) -->
        <Accordion
          v-if="previousMonthGroups.length"
          type="multiple"
          class="space-y-1"
        >
          <AccordionItem
            v-for="group in previousMonthGroups"
            :key="group.monthKey"
            :value="group.monthKey"
            class="rounded-lg border px-3"
          >
            <AccordionTrigger class="text-xs font-semibold uppercase tracking-wide text-muted-foreground py-2">
              {{ group.label }}
            </AccordionTrigger>
            <AccordionContent class="pb-3 space-y-3">
              <div
                v-for="stat in group.stats"
                :key="stat.period.from"
                class="rounded-lg border px-4 py-3 bg-card space-y-2"
              >
                <p class="text-sm font-semibold">{{ stat.period.label }}</p>
                <p class="text-xs text-muted-foreground">{{ stat.period.from }} – {{ stat.period.to }}</p>

                <p v-if="stat.totalEntries === 0" class="text-xs text-muted-foreground italic">
                  {{ t('payroll.overview_no_entries') }}
                </p>

                <template v-else>
                  <p class="text-xs text-muted-foreground">
                    {{ t('payroll.overview_employees', { count: stat.employeeCount }) }}
                    · {{ t('payroll.overview_entries', { count: stat.totalEntries }) }}
                  </p>
                  <div class="flex gap-2 flex-wrap">
                    <Badge v-if="stat.pendingCount > 0" variant="secondary" class="text-xs">
                      {{ t('payroll.pending_entries', { count: stat.pendingCount }) }}
                    </Badge>
                    <Badge v-if="stat.approvedCount > 0" variant="outline" class="text-xs">
                      {{ t('payroll.approved_count', { count: stat.approvedCount }) }}
                    </Badge>
                  </div>
                  <div class="pt-1 space-y-1 border-t">
                    <div
                      v-for="row in stat.projectRows"
                      :key="row.project"
                      class="flex items-center justify-between text-xs"
                    >
                      <span class="truncate pr-2 text-foreground">{{ row.project || t('payroll.overview_no_project') }}</span>
                      <span class="tabular-nums text-muted-foreground shrink-0">
                        <template v-if="row.hours > 0">{{ row.hours.toFixed(1) }}h</template>
                        <template v-if="row.hours > 0 && row.km > 0"> · </template>
                        <template v-if="row.km > 0">{{ row.km }} km</template>
                      </span>
                    </div>
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </div>
  </div>
</template>
