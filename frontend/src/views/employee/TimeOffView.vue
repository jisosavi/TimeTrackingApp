<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useMobileShell } from '@/composables/useMobileShell'
import { useTimeOff } from '@/composables/useTimeOff'
import type { TimeOffOverview } from '@/composables/useTimeOff'
import { useAbsences } from '@/composables/useAbsences'
import type { AbsenceRecord } from '@/composables/useAbsences'
import { Clock, List, Umbrella, TriangleAlert } from 'lucide-vue-next'
import { useRouter } from 'vue-router'
import BottomTabs from '@/components/ui/bottom-tabs/BottomTabs.vue'
import type { BottomTabItem } from '@/components/ui/bottom-tabs/BottomTabs.vue'
import SegTabs from '@/components/ui/seg-tabs/SegTabs.vue'
import type { SegTab } from '@/components/ui/seg-tabs/SegTabs.vue'
import Overview from './time-off/Overview.vue'
import Calendar from './time-off/Calendar.vue'
import Proposals from './time-off/Proposals.vue'

const { t } = useI18n({ useScope: 'global' })
const router = useRouter()
const auth = useAuthStore()
const { isMobile } = useMobileShell()
const { loading, error, fetchOverview } = useTimeOff()
const { fetchAbsences } = useAbsences()

const year = ref(new Date().getFullYear())
const overview = ref<TimeOffOverview | null>(null)
const absences = ref<AbsenceRecord[]>([])
const activeSegTab = ref('overview')

async function loadData() {
  try {
    const [ov, abs] = await Promise.all([fetchOverview(year.value), fetchAbsences()])
    overview.value = ov
    absences.value = abs
  } catch {
    // error is set on useTimeOff
  }
}

onMounted(loadData)
watch(year, loadData)

const slug = computed(() => auth.user?.companySlug ?? '')

function homeRoute(tab?: string) {
  return {
    name: 'employee-home' as const,
    params: { slug: slug.value },
    ...(tab ? { query: { tab } } : {}),
  }
}

function navigateBack() {
  router.push({ name: 'employee-home', params: { slug: slug.value } })
}

const yearOptions = computed(() => {
  const cur = new Date().getFullYear()
  return [cur - 1, cur, cur + 1]
})

const hy = computed(() => overview.value?.holidayYear ?? null)

function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(iso).toLocaleDateString(t('locale.date_locale'), opts)
}

const timeOffSegTabs = computed((): SegTab[] => [
  { id: 'overview', label: t('timeOff.overview') },
  { id: 'calendar', label: t('timeOff.calendar') },
  { id: 'proposals', label: t('timeOff.proposals') },
])

const bottomTabItems = computed<BottomTabItem[]>(() => [
  { id: 'chat', label: t('nav.log_hours'), icon: Clock, to: homeRoute() },
  { id: 'entries', label: t('nav.my_entries'), icon: List, to: homeRoute('entries') },
  { id: 'timeoff', label: t('timeOff.nav_label'), icon: Umbrella },
  { id: 'rejected', label: t('nav.rejected_tab'), icon: TriangleAlert, to: homeRoute('rejected') },
])

const desktopTabs = computed(() => [
  { id: 'chat', label: t('nav.log_hours') },
  { id: 'entries', label: t('nav.my_entries') },
  { id: 'timeoff', label: t('timeOff.nav_label') },
  { id: 'rejected', label: t('nav.rejected_tab') },
])

function setMainTab(id: string) {
  if (id === 'timeoff') return
  if (id === 'chat') router.push(homeRoute())
  else if (id === 'entries') router.push(homeRoute('entries'))
  else if (id === 'rejected') router.push(homeRoute('rejected'))
}
</script>

<template>
  <!-- Desktop main nav -->
  <div v-if="!isMobile" class="mb-6">
    <SegTabs :tabs="desktopTabs" active="timeoff" @change="setMainTab" />
  </div>

  <!-- Mobile: back btn + title + holiday year subtitle + year select -->
  <div v-if="isMobile" class="flex items-start justify-between mb-3">
    <div class="flex items-center gap-2">
      <button
        type="button"
        class="flex items-center justify-center w-8 h-8 rounded-full text-foreground hover:bg-muted transition-colors"
        @click="navigateBack"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div>
        <p class="text-lg font-bold leading-tight text-foreground">{{ t('timeOff.title') }}</p>
        <p class="text-xs text-muted-foreground leading-tight">
          {{ hy
            ? t('timeOff.desktop.holiday_year_period', { start: fmtDate(hy.startDate, { day: '2-digit', month: '2-digit', year: 'numeric' }), end: fmtDate(hy.endDate, { day: '2-digit', month: '2-digit', year: 'numeric' }) })
            : t('timeOff.holiday_year', { year }) }}
        </p>
      </div>
    </div>
    <select
      :value="year"
      class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
      @change="year = Number(($event.target as HTMLSelectElement).value)"
    >
      <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
    </select>
  </div>

  <!-- Desktop: heading + holiday year period + year select + propose btn -->
  <div v-else class="flex items-start justify-between mb-1">
    <div>
      <h1 class="text-xl font-bold text-foreground">
        {{ t('timeOff.desktop.heading', { year }) }}
      </h1>
      <p v-if="hy" class="text-sm text-muted-foreground mt-0.5">
        {{ t('timeOff.desktop.holiday_year_period', { start: fmtDate(hy.startDate, { day: '2-digit', month: '2-digit', year: 'numeric' }), end: fmtDate(hy.endDate, { day: '2-digit', month: '2-digit', year: 'numeric' }) }) }}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <select
        :value="year"
        class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
        @change="year = Number(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="y in yearOptions" :key="y" :value="y">{{ y }}</option>
      </select>
      <button
        type="button"
        class="rounded-lg bg-indigo-600 text-white font-semibold px-4 py-1.5 text-sm hover:bg-indigo-700 transition-colors"
        @click="activeSegTab = 'calendar'"
      >
        {{ t('timeOff.propose_holiday') }}
      </button>
    </div>
  </div>

  <!-- Sub-tab SegTabs (overview / calendar / proposals) -->
  <SegTabs
    :tabs="timeOffSegTabs"
    :active="activeSegTab"
    :class="isMobile ? 'mb-4' : 'mb-5 mt-3'"
    @change="activeSegTab = $event"
  />

  <!-- Tab content -->
  <Calendar
    v-if="activeSegTab === 'calendar'"
    :proposals="overview?.proposals ?? []"
    @proposed="loadData"
    @absence-saved="loadData"
  />
  <Proposals
    v-else-if="activeSegTab === 'proposals'"
    :proposals="overview?.proposals ?? []"
    :absences="absences"
    :loading="loading"
    @absence-saved="loadData"
  />
  <Overview
    v-else
    :overview="overview"
    :year="year"
    :loading="loading"
    :error="error"
    @update:active-seg-tab="activeSegTab = $event"
  />

  <!-- Mobile BottomTabs -->
  <BottomTabs v-if="isMobile" :items="bottomTabItems" active="timeoff" />
</template>
