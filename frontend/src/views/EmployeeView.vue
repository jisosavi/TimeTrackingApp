<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'
import { Clock, List, Umbrella, TriangleAlert } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { useTimeEntries } from '@/composables/useTimeEntries'
import { useRefresh } from '@/composables/useRefresh'
import { useMobileShell } from '@/composables/useMobileShell'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import BottomTabs from '@/components/ui/bottom-tabs/BottomTabs.vue'
import type { BottomTabItem } from '@/components/ui/bottom-tabs/BottomTabs.vue'
import ChatPanel from '@/components/employee/ChatPanel.vue'
import EntryList from '@/components/employee/EntryList.vue'
import RejectedList from '@/components/employee/RejectedList.vue'

const { t } = useI18n({ useScope: 'global' })
const route = useRoute()
const auth = useAuthStore()
const { rejectedCount, fetchEntries } = useTimeEntries()
const { refreshTick } = useRefresh()
const { isMobile } = useMobileShell()
const { apiFetch } = useApi()

const entryListRef = ref<InstanceType<typeof EntryList> | null>(null)
const rejectedListRef = ref<InstanceType<typeof RejectedList> | null>(null)
const rejectedOtherCount = ref(0)

const VALID_TABS = ['chat', 'entries', 'rejected'] as const
type TabId = (typeof VALID_TABS)[number]
const initialTab = route.query.tab as string
const activeTab = ref<TabId>(VALID_TABS.includes(initialTab as TabId) ? (initialTab as TabId) : 'chat')

watch(
  () => route.query.tab,
  (val) => {
    const t = val as string
    if (VALID_TABS.includes(t as TabId)) activeTab.value = t as TabId
  },
)

async function fetchRejectedOtherCounts() {
  try {
    const [{ proposals }, { absences }] = await Promise.all([
      apiFetch<{ proposals: { id: number }[] }>('/api/holiday_proposals.php?status=rejected'),
      apiFetch<{ absences: { id: number }[] }>('/api/absences.php?status=rejected'),
    ])
    rejectedOtherCount.value = proposals.length + absences.length
  } catch {
    // non-critical
  }
}

onMounted(() => { fetchEntries(); fetchRejectedOtherCounts() })
watch(refreshTick, () => { fetchEntries(); fetchRejectedOtherCounts() })

function setTab(id: string) {
  if (id === 'timeoff') return
  if (VALID_TABS.includes(id as TabId)) activeTab.value = id as TabId
}

function onEntriesSaved() {
  if (activeTab.value === 'entries') {
    entryListRef.value?.refresh()
  } else if (activeTab.value === 'rejected') {
    rejectedListRef.value?.refresh()
  } else {
    fetchEntries()
  }
}

const timeOffRoute = computed(() => ({
  name: 'employee-time-off',
  params: { slug: auth.user?.companySlug },
}))

const bottomTabItems = computed<BottomTabItem[]>(() => [
  { id: 'chat', label: t('nav.log_hours'), icon: Clock },
  { id: 'entries', label: t('nav.my_entries'), icon: List },
  { id: 'timeoff', label: t('timeOff.nav_label'), icon: Umbrella, to: timeOffRoute.value },
  { id: 'rejected', label: t('nav.rejected_tab'), icon: TriangleAlert, badge: rejectedCount.value + rejectedOtherCount.value },
])

const DESKTOP_TAB_BASE = 'inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none'

function desktopTabClass(id: string) {
  return activeTab.value === id
    ? `${DESKTOP_TAB_BASE} border-primary text-primary`
    : `${DESKTOP_TAB_BASE} border-transparent text-muted-foreground hover:text-foreground`
}
</script>

<template>
  <!-- Desktop tab nav -->
  <div v-if="!isMobile" class="-mx-4 px-4 border-b mb-4 flex">
    <button :class="desktopTabClass('chat')" @click="setTab('chat')">
      {{ t('nav.log_hours') }}
    </button>
    <button :class="desktopTabClass('entries')" @click="setTab('entries')">
      {{ t('nav.my_entries') }}
    </button>
    <RouterLink
      :to="timeOffRoute"
      :class="`${DESKTOP_TAB_BASE} border-transparent text-muted-foreground hover:text-foreground`"
    >
      {{ t('timeOff.nav_label') }}
    </RouterLink>
    <button :class="desktopTabClass('rejected')" @click="setTab('rejected')">
      {{ t('nav.rejected_tab') }}
      <Badge v-if="rejectedCount + rejectedOtherCount > 0" variant="destructive" class="h-4 min-w-4 px-1 text-[10px]">
        {{ rejectedCount + rejectedOtherCount }}
      </Badge>
    </button>
  </div>

  <!-- Tab content -->
  <div :class="isMobile ? 'pb-[72px]' : ''">
    <ChatPanel v-if="activeTab === 'chat'" @entries-saved="onEntriesSaved" />
    <EntryList v-if="activeTab === 'entries'" ref="entryListRef" />
    <RejectedList v-if="activeTab === 'rejected'" ref="rejectedListRef" />
  </div>

  <!-- Mobile BottomTabs -->
  <BottomTabs
    v-if="isMobile"
    :items="bottomTabItems"
    :active="activeTab"
    @change="setTab"
  />
</template>
