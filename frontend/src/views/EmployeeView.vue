<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useTimeEntries } from '@/composables/useTimeEntries'
import ChatPanel from '@/components/employee/ChatPanel.vue'
import EntryList from '@/components/employee/EntryList.vue'

const { rejectedCount, fetchEntries } = useTimeEntries()
const entryListRef = ref<InstanceType<typeof EntryList> | null>(null)
const activeTab = ref('chat')

onMounted(fetchEntries)

// When the AI saves entries, refresh the list if it's visible; otherwise show badge prompt
function onEntriesSaved() {
  if (activeTab.value === 'entries') {
    entryListRef.value?.refresh()
  } else {
    fetchEntries()
  }
}
</script>

<template>
  <Tabs v-model="activeTab" class="w-full">
    <TabsList class="grid w-full grid-cols-2 mb-4">
      <TabsTrigger value="chat">Log Hours</TabsTrigger>
      <TabsTrigger value="entries" class="gap-1.5">
        My Entries
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
  </Tabs>
</template>
