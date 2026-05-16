import { ref, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import type { TimeEntry } from '@/types'

export function useTimeEntries() {
  const entries = ref<TimeEntry[]>([])
  const loading = ref(false)
  const error = ref('')
  const { get, post, del } = useApi()

  const rejectedCount = computed(() =>
    entries.value.filter((e) => e.status === 'rejected' || e.km_status === 'rejected').length,
  )

  async function fetchEntries() {
    loading.value = true
    error.value = ''
    try {
      const data = await get<{ success: boolean; entries: TimeEntry[] }>('/api/time_entries?view=mine')
      entries.value = data.entries
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function clarifyEntry(entryId: number, clarification: string) {
    await post('/api/clarify_entry', { action: 'clarify', id: entryId, clarification })
    await fetchEntries()
  }

  async function clarifyKmEntry(entryId: number, clarification: string) {
    await post('/api/clarify_entry', { action: 'clarify_km', id: entryId, clarification })
    await fetchEntries()
  }

  async function deleteEntry(entryId: number) {
    const entry = entries.value.find((e) => e.id === entryId)
    if (!entry) return

    if (entry.status === 'rejected') {
      await post('/api/clarify_entry', { action: 'delete', id: entryId })
    } else {
      await del('/api/time_entries', { id: entryId })
    }

    entries.value = entries.value.filter((e) => e.id !== entryId)
    await fetchEntries()
  }

  return { entries, loading, error, rejectedCount, fetchEntries, clarifyEntry, clarifyKmEntry, deleteEntry }
}
