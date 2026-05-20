<script setup lang="ts">
import { computed } from 'vue'

defineOptions({ name: 'TimeOffOverview' })
import { useI18n } from 'vue-i18n'
import { useMobileShell } from '@/composables/useMobileShell'
import type { TimeOffOverview } from '@/composables/useTimeOff'
import EmptyState from '@/components/ui/EmptyState.vue'

const props = defineProps<{
  overview: TimeOffOverview | null
  year: number
  loading: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:activeSegTab': [val: string]
}>()

const { t } = useI18n({ useScope: 'global' })
const { isMobile } = useMobileShell()

const hy = computed(() => props.overview?.holidayYear ?? null)
const planned = computed(() => hy.value?.plannedDays ?? 0)
const pendingDays = computed(() => props.overview?.pendingDays ?? 0)
const accrued = computed(() => hy.value?.accruedDays ?? 0)
const remaining = computed(() => Math.max(0, accrued.value - planned.value - pendingDays.value))

const plannedPct = computed(() =>
  accrued.value > 0 ? Math.min(100, (planned.value / accrued.value) * 100) : 0,
)
const pendingPct = computed(() =>
  accrued.value > 0
    ? Math.min(100 - plannedPct.value, (pendingDays.value / accrued.value) * 100)
    : 0,
)

function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString(t('locale.date_locale'), opts)
}

function dateRange(start: string, end: string) {
  return `${fmtDate(start, { day: 'numeric', month: 'short' })} – ${fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

interface Badge { line1: string; line2: string; line3: string | null }

function dateBadge(startIso: string, endIso: string): Badge {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const startMon = s.toLocaleString('en', { month: 'short' }).toUpperCase()
  const endMon = e.toLocaleString('en', { month: 'short' })
  const sDay = s.getDate()
  const eDay = e.getDate()
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  return {
    line1: startMon,
    line2: sameMonth ? `${sDay}–${eDay}` : `${sDay}–${eDay}`,
    line3: sameMonth ? null : endMon,
  }
}

function submittedLabel(item: NonNullable<TimeOffOverview['upcoming']>[number]) {
  const created = new Date(item.createdAt)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - created.getTime()) / 86400000)
  if (diffDays === 0) return t('timeOff.submitted_today')
  return t('timeOff.submitted_date', {
    date: fmtDate(item.createdAt, { day: 'numeric', month: 'short' }),
  })
}

function decidedLabel(item: NonNullable<TimeOffOverview['upcoming']>[number]) {
  if (!item.decidedAt) return ''
  return t('timeOff.approved_on', {
    date: fmtDate(item.decidedAt, { day: 'numeric', month: 'short' }),
  })
}

function statusPillLabel(item: NonNullable<TimeOffOverview['upcoming']>[number]): string {
  const status =
    item.status === 'approved'
      ? t('timeOff.status.approved')
      : item.status === 'rejected'
      ? t('timeOff.status.rejected')
      : t('timeOff.status.pending')
  return `${status}: ${item.label}, ${dateRange(item.startDate, item.endDate)}`
}

</script>

<template>
  <!-- ─── MOBILE LAYOUT ─────────────────────────────────────────────────────── -->
  <template v-if="isMobile">
    <!-- Loading / error states -->
    <div v-if="loading" class="py-12 text-center text-sm text-muted-foreground">
      {{ t('timeOff.loading') }}
    </div>
    <div v-else-if="error" class="py-12 text-center text-sm text-destructive">
      {{ t('timeOff.error') }}
    </div>

    <template v-else>
      <!-- No Salaxy account -->
      <div v-if="!hy" class="py-12 text-center text-sm text-muted-foreground">
        {{ t('timeOff.no_salaxy') }}
      </div>

      <template v-else>
        <!-- Hero balance card -->
        <div class="rounded-2xl bg-indigo-600 px-5 py-4 mb-5 text-white">
          <p class="text-[10px] font-semibold tracking-widest uppercase opacity-70 mb-1">
            {{ t('timeOff.balance.label') }}
          </p>
          <p class="leading-none mb-2">
            <span class="text-5xl font-extrabold">{{ remaining }}</span>
            <span class="text-xl font-semibold ml-2 opacity-80">{{ t('timeOff.balance.days_remaining', { count: remaining }).replace(String(remaining) + ' ', '') }}</span>
          </p>
          <!-- Progress bar -->
          <div class="flex h-2 rounded-full overflow-hidden bg-white/20 mb-2">
            <div
              v-if="plannedPct > 0"
              class="bg-white/70 transition-all"
              :style="{ width: `${plannedPct}%` }"
            />
            <div
              v-if="pendingPct > 0"
              class="bg-amber-400 transition-all"
              :style="{ width: `${pendingPct}%` }"
            />
          </div>
          <p class="text-xs opacity-70">
            {{ t('timeOff.balance.planned', { count: planned }) }}
            &nbsp;·&nbsp;
            {{ t('timeOff.balance.pending', { count: pendingDays }) }}
            &nbsp;·&nbsp;
            {{ t('timeOff.balance.accrued', { count: accrued }) }}
          </p>
        </div>

        <!-- Upcoming section -->
        <p class="text-[11px] font-semibold tracking-widest text-muted-foreground mb-3 uppercase">
          {{ t('timeOff.upcoming') }}
        </p>

        <EmptyState
          v-if="!overview?.upcoming.length"
          :title="t('timeOff.empty_upcoming_title')"
          :action-label="t('timeOff.empty_upcoming_cta')"
          :on-action="() => emit('update:activeSegTab', 'calendar')"
        />

        <div v-else class="space-y-2 mb-4">
          <div
            v-for="item in overview!.upcoming"
            :key="item.id"
            class="flex items-center gap-3 min-h-[48px] py-2"
          >
            <!-- Date badge -->
            <div
              :class="[
                'flex-shrink-0 flex flex-col items-center justify-center w-[52px] min-h-[52px] rounded-lg text-center text-xs font-bold leading-tight px-1 py-1',
                item.status === 'approved'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white border border-amber-400 text-foreground',
              ]"
            >
              <span>{{ dateBadge(item.startDate, item.endDate).line1 }}</span>
              <span>{{ dateBadge(item.startDate, item.endDate).line2 }}</span>
              <span v-if="dateBadge(item.startDate, item.endDate).line3" class="opacity-80">
                {{ dateBadge(item.startDate, item.endDate).line3 }}
              </span>
            </div>

            <!-- Label + sub-line -->
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-foreground truncate">{{ item.label }}</p>
              <p class="text-xs text-muted-foreground">
                {{ t('timeOff.work_days', { count: item.days }) }}
                &nbsp;·&nbsp;
                <span v-if="item.status === 'approved'">{{ decidedLabel(item) }}</span>
                <span v-else>{{ submittedLabel(item) }}</span>
              </p>
            </div>

            <!-- Status pill -->
            <span
              :aria-label="statusPillLabel(item)"
              :class="[
                'flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium border',
                item.status === 'approved'
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : item.status === 'rejected'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200',
              ]"
            >
              {{
                item.status === 'approved'
                  ? t('timeOff.status.approved')
                  : item.status === 'rejected'
                  ? t('timeOff.status.rejected')
                  : t('timeOff.status.pending')
              }}
            </span>
          </div>
        </div>
      </template>

      <!-- Sticky propose button (above BottomTabs) -->
      <div class="sticky bottom-[72px] z-20 py-3 bg-background">
        <button
          type="button"
          class="w-full rounded-xl bg-indigo-600 text-white font-semibold py-3.5 text-sm hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
        >
          {{ t('timeOff.propose_holiday') }}
        </button>
      </div>
    </template>

  </template>

  <!-- ─── DESKTOP LAYOUT ────────────────────────────────────────────────────── -->
  <template v-else>
    <!-- Loading / error -->
    <div v-if="loading" class="py-12 text-center text-sm text-muted-foreground">
      {{ t('timeOff.loading') }}
    </div>
    <div v-else-if="error" class="py-12 text-center text-sm text-destructive">
      {{ t('timeOff.error') }}
    </div>

    <template v-else>
      <!-- No Salaxy -->
      <div v-if="!hy" class="py-12 text-center text-sm text-muted-foreground">
        {{ t('timeOff.no_salaxy') }}
      </div>

      <template v-else>
        <!-- Stat cards row -->
        <div class="grid grid-cols-4 gap-4 mb-6">
          <div class="rounded-lg border p-4">
            <p class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">
              {{ t('timeOff.desktop.stat_accrued') }}
            </p>
            <p class="text-3xl font-bold text-foreground">{{ accrued }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">
              {{ t('timeOff.desktop.holiday_year_period', { start: fmtDate(hy.startDate, { day: '2-digit', month: '2-digit' }), end: fmtDate(hy.endDate, { day: '2-digit', month: '2-digit', year: 'numeric' }) }) }}
            </p>
          </div>
          <div class="rounded-lg border p-4">
            <p class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">
              {{ t('timeOff.desktop.stat_planned') }}
            </p>
            <p class="text-3xl font-bold text-foreground">{{ planned }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">{{ t('timeOff.desktop.stat_planned_sub') }}</p>
          </div>
          <div class="rounded-lg border p-4">
            <p class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">
              {{ t('timeOff.desktop.stat_pending') }}
            </p>
            <p class="text-3xl font-bold text-amber-600">{{ pendingDays }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">{{ t('timeOff.desktop.stat_pending_sub') }}</p>
          </div>
          <div class="rounded-lg border p-4">
            <p class="text-[10px] font-semibold tracking-widest text-muted-foreground uppercase mb-1">
              {{ t('timeOff.desktop.stat_remaining') }}
            </p>
            <p class="text-3xl font-bold text-green-600">{{ remaining }}</p>
            <p class="text-xs text-muted-foreground mt-0.5">{{ t('timeOff.desktop.stat_remaining_sub') }}</p>
          </div>
        </div>

        <!-- Holiday season section -->
        <div class="rounded-lg border p-4 mb-6">
          <p class="text-sm font-semibold text-foreground mb-3">
            {{ t('timeOff.desktop.season_section', { year }) }}
          </p>
          <div class="space-y-2">
            <div class="flex items-center gap-3">
              <span class="w-14 text-xs text-muted-foreground">{{ t('timeOff.desktop.season_summer') }}</span>
              <div class="flex-1 h-2 rounded-full overflow-hidden bg-muted">
                <div class="h-full bg-indigo-500" style="width: 50%" />
              </div>
              <span class="text-xs text-muted-foreground w-24 text-right">
                {{ fmtDate(hy.summerSeason.start, { day: 'numeric', month: 'short' }) }}
                –
                {{ fmtDate(hy.summerSeason.end, { day: 'numeric', month: 'short' }) }}
              </span>
            </div>
            <div class="flex items-center gap-3">
              <span class="w-14 text-xs text-muted-foreground">{{ t('timeOff.desktop.season_winter') }}</span>
              <div class="flex-1 h-2 rounded-full overflow-hidden bg-muted">
                <div class="h-full bg-indigo-500" style="width: 40%" />
              </div>
              <span class="text-xs text-muted-foreground w-24 text-right">
                {{ fmtDate(hy.winterSeason.start, { day: 'numeric', month: 'short' }) }}
                –
                {{ fmtDate(hy.winterSeason.end, { day: 'numeric', month: 'short' }) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Upcoming section -->
        <div>
          <div class="flex items-baseline gap-2 mb-3">
            <h2 class="text-sm font-semibold text-foreground">{{ t('timeOff.desktop.upcoming_section') }}</h2>
            <span class="text-xs text-muted-foreground">{{ t('timeOff.desktop.next_90') }}</span>
          </div>

          <div v-if="!overview?.upcoming.length" class="py-6 text-sm text-muted-foreground">
            {{ t('timeOff.no_upcoming') }}
          </div>

          <div v-else class="divide-y">
            <div
              v-for="item in overview!.upcoming"
              :key="item.id"
              class="grid grid-cols-[20px_1fr_auto_auto_auto_auto] items-center gap-4 py-3"
            >
              <!-- Status circle -->
              <div
                :class="[
                  'w-3 h-3 rounded-full flex-shrink-0',
                  item.status === 'approved'
                    ? 'bg-indigo-600'
                    : 'border-2 border-muted-foreground',
                ]"
              />
              <!-- Label + sub -->
              <div class="min-w-0">
                <p class="text-sm font-medium text-foreground truncate">{{ item.label }}</p>
                <p class="text-xs text-muted-foreground">
                  <span v-if="item.status === 'approved'">{{ decidedLabel(item) }}</span>
                  <span v-else>{{ submittedLabel(item) }}</span>
                </p>
              </div>
              <!-- Date range -->
              <span class="text-sm text-muted-foreground whitespace-nowrap">{{ dateRange(item.startDate, item.endDate) }}</span>
              <!-- Days -->
              <span class="text-sm text-muted-foreground whitespace-nowrap">{{ t('timeOff.work_days', { count: item.days }) }}</span>
              <!-- Status pill -->
              <span
                :class="[
                  'rounded-full px-2.5 py-0.5 text-xs font-medium border whitespace-nowrap',
                  item.status === 'approved'
                    ? 'bg-green-50 text-green-700 border-green-200'
                    : item.status === 'rejected'
                    ? 'bg-red-50 text-red-700 border-red-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200',
                ]"
              >
                {{
                  item.status === 'approved'
                    ? t('timeOff.status.approved')
                    : item.status === 'rejected'
                    ? t('timeOff.status.rejected')
                    : t('timeOff.status.pending')
                }}
              </span>
              <!-- Open button -->
              <button
                type="button"
                class="text-xs text-primary hover:underline whitespace-nowrap font-medium"
              >
                {{ t('timeOff.desktop.open_btn') }}
              </button>
            </div>
          </div>
        </div>
      </template>
    </template>

  </template>
</template>
