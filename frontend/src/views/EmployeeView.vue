<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useTimeEntries } from '@/composables/useTimeEntries'
import { useRefresh } from '@/composables/useRefresh'
import ChatPanel from '@/components/employee/ChatPanel.vue'
import EntryList from '@/components/employee/EntryList.vue'

const { t } = useI18n({ useScope: 'global' })
const { rejectedCount, fetchEntries } = useTimeEntries()
const { refreshTick } = useRefresh()
const entryListRef = ref<InstanceType<typeof EntryList> | null>(null)
const rejectedListRef = ref<InstanceType<typeof EntryList> | null>(null)
const activeTab = ref('chat')

onMounted(fetchEntries)
watch(refreshTick, fetchEntries)

function onEntriesSaved() {
  if (activeTab.value === 'entries') {
    entryListRef.value?.refresh()
  } else if (activeTab.value === 'rejected') {
    rejectedListRef.value?.refresh()
  } else {
    fetchEntries()
  }
}
</script>

<template>
  <Tabs v-model="activeTab" class="w-full">
    <TabsList class="grid w-full grid-cols-3 mb-4 h-12">
      <TabsTrigger value="chat" class="text-sm py-3">{{ t('nav.log_hours') }}</TabsTrigger>
      <TabsTrigger value="entries" class="text-sm py-3">{{ t('nav.my_entries') }}</TabsTrigger>
      <TabsTrigger value="rejected" class="gap-1.5 text-sm py-3">
        {{ t('nav.rejected_tab') }}
        <Badge v-if="rejectedCount > 0" variant="destructive" class="h-4 min-w-4 px-1 text-[10px]">
          {{ rejectedCount }}
        </Badge>
      </TabsTrigger>
    </TabsList>

    <TabsContent value="chat">
      <ChatPanel @entries-saved="onEntriesSaved" />
    </TabsContent>

    <TabsContent value="entries">
      <EntryList ref="entryListRef" />
    </TabsContent>

    <TabsContent value="rejected">
      <EntryList ref="rejectedListRef" :show-rejected-only="true" />
    </TabsContent>
  </Tabs>
</template>
