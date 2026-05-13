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
import BottomTabs from '@/components/ui/bottom-tabs/BottomTabs.vue'
import type { BottomTabItem } from '@/components/ui/bottom-tabs/BottomTabs.vue'
import Overview from './time-off/Overview.vue'
import Calendar from './time-off/Calendar.vue'
import Proposals from './time-off/Proposals.vue'

const { t } = useI18n({ useScope: 'global' })
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

const bottomTabItems = computed<BottomTabItem[]>(() => [
  { id: 'chat', label: t('nav.log_hours'), icon: Clock, to: homeRoute() },
  { id: 'entries', label: t('nav.my_entries'), icon: List, to: homeRoute('entries') },
  { id: 'timeoff', label: t('timeOff.nav_label'), icon: Umbrella },
  { id: 'rejected', label: t('nav.rejected_tab'), icon: TriangleAlert, to: homeRoute('rejected') },
])

const DESKTOP_TAB_BASE = 'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none'
const DESKTOP_TAB_INACTIVE = `${DESKTOP_TAB_BASE} border-transparent text-muted-foreground hover:text-foreground`
const DESKTOP_TAB_ACTIVE = `${DESKTOP_TAB_BASE} border-primary text-primary`
</script>

<template>
  <!-- Desktop tab nav -->
  <div v-if="!isMobile" class="-mx-4 px-4 border-b mb-6 flex">
    <RouterLink :to="homeRoute()" :class="DESKTOP_TAB_INACTIVE">
      {{ t('nav.log_hours') }}
    </RouterLink>
    <RouterLink :to="homeRoute('entries')" :class="DESKTOP_TAB_INACTIVE">
      {{ t('nav.my_entries') }}
    </RouterLink>
    <span :class="DESKTOP_TAB_ACTIVE">{{ t('timeOff.nav_label') }}</span>
    <RouterLink :to="homeRoute('rejected')" :class="DESKTOP_TAB_INACTIVE">
      {{ t('nav.rejected_tab') }}
    </RouterLink>
  </div>

  <!-- Tab content -->
  <Calendar
    v-if="activeSegTab === 'calendar'"
    :proposals="overview?.proposals ?? []"
    :active-seg-tab="activeSegTab"
    @update:active-seg-tab="activeSegTab = $event"
    @proposed="loadData"
    @absence-saved="loadData"
  />
  <Proposals
    v-else-if="activeSegTab === 'proposals'"
    :proposals="overview?.proposals ?? []"
    :absences="absences"
    :loading="loading"
    :active-seg-tab="activeSegTab"
    @update:active-seg-tab="activeSegTab = $event"
    @absence-saved="loadData"
  />
  <Overview
    v-else
    :overview="overview"
    :year="year"
    :loading="loading"
    :error="error"
    :active-seg-tab="activeSegTab"
    @update:year="year = $event"
    @update:active-seg-tab="activeSegTab = $event"
  />

  <!-- Mobile BottomTabs -->
  <BottomTabs v-if="isMobile" :items="bottomTabItems" active="timeoff" />
</template>
