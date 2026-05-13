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
import Pending from './time-off/Pending.vue'
import Day from './time-off/Day.vue'
import TeamCalendar from './time-off/TeamCalendar.vue'
import type { SupervisorProposal } from '@/components/time-off/PendingCard.vue'
import { ListChecks, Users, Umbrella, User } from 'lucide-vue-next'

defineOptions({ name: 'SupervisorTimeOffView' })

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const { isMobile } = useMobileShell()
const { apiFetch } = useApi()

const activeSegTab = ref('pending')
const proposals = ref<SupervisorProposal[]>([])
const loading = ref(false)

async function fetchProposals() {
  loading.value = true
  try {
    const data = await apiFetch<{ proposals: SupervisorProposal[] }>(
      '/api/supervisor/holiday_proposals.php?status=pending',
    )
    proposals.value = data.proposals
  } catch (e) {
    console.error('[SupervisorTimeOff] fetch failed', e)
  } finally {
    loading.value = false
  }
}

onMounted(fetchProposals)

const pendingCount = computed(() => proposals.value.filter((p) => p.status === 'pending').length)

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
</script>

<template>
  <!-- Mobile layout -->
  <template v-if="isMobile">
    <!-- Header -->
    <div class="flex items-start justify-between mb-3">
      <div>
        <p class="text-lg font-bold leading-tight text-foreground">{{ t('supervisor.timeoff.title') }}</p>
        <p class="text-xs text-muted-foreground leading-tight">
          {{ t('supervisor.timeoff.subtitle', { count: pendingCount }) }}
        </p>
      </div>
    </div>

    <!-- SegTabs -->
    <SegTabs
      :tabs="segTabs"
      :active="activeSegTab"
      class="mb-4"
      @change="activeSegTab = $event"
    />

    <!-- Tab content -->
    <Pending
      v-if="activeSegTab === 'pending'"
      :proposals="proposals"
      :loading="loading"
      @reviewed="fetchProposals"
    />
    <Day v-else-if="activeSegTab === 'day'" />
    <TeamCalendar v-else />

    <!-- BottomTabs -->
    <BottomTabs :items="bottomTabItems" active="timeoff" />
  </template>

  <!-- Desktop layout -->
  <template v-else>
    <div class="space-y-4">
      <div>
        <h2 class="text-lg font-semibold">{{ t('supervisor.timeoff.title') }}</h2>
        <p class="text-sm text-muted-foreground">{{ t('supervisor.timeoff.subtitle', { count: pendingCount }) }}</p>
      </div>

      <!-- SegTabs -->
      <SegTabs
        :tabs="segTabs"
        :active="activeSegTab"
        @change="activeSegTab = $event"
      />

      <!-- Tab content -->
      <Pending
        v-if="activeSegTab === 'pending'"
        :proposals="proposals"
        :loading="loading"
        @reviewed="fetchProposals"
      />
      <Day v-else-if="activeSegTab === 'day'" />
      <div v-else class="py-16 text-center text-sm text-muted-foreground">
        {{ t('common.coming_soon') }}
      </div>
    </div>
  </template>
</template>
