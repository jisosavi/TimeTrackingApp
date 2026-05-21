<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useMobileShell } from '@/composables/useMobileShell'
import { useApi } from '@/composables/useApi'
import BottomTabs from '@/components/ui/bottom-tabs/BottomTabs.vue'
import type { BottomTabItem } from '@/components/ui/bottom-tabs/BottomTabs.vue'
import SegTabs from '@/components/ui/seg-tabs/SegTabs.vue'
import type { SegTab } from '@/components/ui/seg-tabs/SegTabs.vue'
import PendingUnified from '@/components/time-off/PendingUnified.vue'
import type { PendingAbsence } from '@/components/time-off/PendingUnified.vue'
import Day from './time-off/Day.vue'
import TeamCalendar from './time-off/TeamCalendar.vue'
import type { SupervisorProposal } from '@/components/time-off/PendingCard.vue'
import { ListChecks, Users, Umbrella, User } from 'lucide-vue-next'

defineOptions({ name: 'SupervisorTimeOffView' })

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const { isMobile } = useMobileShell()
const { get } = useApi()

const activeSegTab = ref('pending')
const proposals = ref<SupervisorProposal[]>([])
const loading = ref(false)
const pendingAbsences = ref<PendingAbsence[]>([])

async function fetchProposals() {
  loading.value = true
  try {
    const data = await get<{ proposals: SupervisorProposal[] }>(
      '/api/supervisor/holiday_proposals?status=pending',
    )
    proposals.value = data.proposals
  } catch (e) {
    console.error('[SupervisorTimeOff] fetch failed', e)
  } finally {
    loading.value = false
  }
}

async function fetchPendingAbsences() {
  try {
    const data = await get<{ absences: PendingAbsence[] }>('/api/supervisor/pending_absences')
    pendingAbsences.value = data.absences
  } catch { /* non-critical */ }
}

onMounted(() => { fetchProposals(); fetchPendingAbsences() })

const pendingCount = computed(
  () => proposals.value.filter((p) => p.status === 'pending').length + pendingAbsences.value.length,
)

const segTabs = computed((): SegTab[] => [
  { id: 'calendar', label: t('supervisor.timeoff.tab_calendar') },
  { id: 'day', label: t('supervisor.timeoff.tab_day') },
  { id: 'pending', label: t('supervisor.timeoff.tab_pending', { count: pendingCount.value }) },
])

const slug = computed(() => auth.user?.companySlug ?? '')

function homeRoute() {
  return { name: 'supervisor-home' as const, params: { slug: slug.value } }
}

const bottomTabItems = computed<BottomTabItem[]>(() => [
  { id: 'team', label: t('nav.team'), icon: Users, to: { ...homeRoute(), query: { mob: 'team' } } },
  { id: 'approvals', label: t('nav.approvals'), icon: ListChecks, to: homeRoute() },
  { id: 'timeoff', label: t('timeOff.nav_label'), icon: Umbrella },
  { id: 'me', label: t('nav.me'), icon: User, to: { ...homeRoute(), query: { mob: 'me' } } },
])

function onReviewed() {
  fetchProposals()
  fetchPendingAbsences()
}
</script>

<template>
  <!-- Mobile layout -->
  <template v-if="isMobile">
    <div class="flex items-start justify-between mb-3">
      <div>
        <p class="text-lg font-bold leading-tight text-foreground">{{ t('supervisor.timeoff.title') }}</p>
        <p class="text-xs text-muted-foreground leading-tight">
          {{ t('supervisor.timeoff.subtitle', { count: pendingCount }) }}
        </p>
      </div>
    </div>

    <SegTabs :tabs="segTabs" :active="activeSegTab" class="mb-4" @change="activeSegTab = $event" />

    <PendingUnified
      v-if="activeSegTab === 'pending'"
      :proposals="proposals"
      :absences="pendingAbsences"
      :loading="loading"
      @reviewed="onReviewed"
    />
    <Day v-else-if="activeSegTab === 'day'" />
    <TeamCalendar v-else />

    <BottomTabs :items="bottomTabItems" active="timeoff" />
  </template>

  <!-- Desktop layout -->
  <template v-else>
    <div class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">{{ t('supervisor.timeoff.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('supervisor.timeoff.subtitle', { count: pendingCount }) }}</p>
      </div>

      <SegTabs :tabs="segTabs" :active="activeSegTab" @change="activeSegTab = $event" />

      <PendingUnified
        v-if="activeSegTab === 'pending'"
        :proposals="proposals"
        :absences="pendingAbsences"
        :loading="loading"
        @reviewed="onReviewed"
      />
      <Day v-else-if="activeSegTab === 'day'" />
      <TeamCalendar v-else-if="activeSegTab === 'calendar'" />
    </div>
  </template>
</template>
