import { ref, computed } from 'vue'
import { useApi } from '@/composables/useApi'
import type { TimeEntry } from '@/types'

export function useTimeEntries() {
  const entries = ref<TimeEntry[]>([])
  const loading = ref(false)
  const error = ref('')
  const { apiFetch } = useApi()

  const rejectedCount = computed(() => entries.value.filter((e) => e.status === 'rejected').length)

  async function fetchEntries() {
    loading.value = true
    error.value = ''
    try {
      const data = await apiFetch<{ success: boolean; entries: TimeEntry[] }>(
        '/api/time_entries.php?view=mine',
      )
      entries.value = data.entries
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function clarifyEntry(entryId: number, clarification: string) {
    await apiFetch('/api/clarify_entry.php', {
      method: 'POST',
      body: JSON.stringify({ action: 'clarify', id: entryId, clarification }),
    })
    await fetchEntries()
  }

  async function deleteEntry(entryId: number) {
    const entry = entries.value.find((e) => e.id === entryId)
    if (!entry) return

    if (entry.status === 'rejected') {
      await apiFetch('/api/clarify_entry.php', {
        method: 'POST',
        body: JSON.stringify({ action: 'delete', id: entryId }),
      })
    } else {
      await apiFetch('/api/time_entries.php', {
        method: 'DELETE',
        body: JSON.stringify({ id: entryId }),
      })
    }

    entries.value = entries.value.filter((e) => e.id !== entryId)
  }

  return { entries, loading, error, rejectedCount, fetchEntries, clarifyEntry, deleteEntry }
}
