import { ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { ReviewEntry } from '@/types'

export interface EntryGroup {
  name: string
  entries: ReviewEntry[]
}

export function groupByEmployee(entries: ReviewEntry[]): EntryGroup[] {
  const map = new Map<string, ReviewEntry[]>()
  for (const e of entries) {
    const group = map.get(e.employee_name)
    if (group) {
      group.push(e)
    } else {
      map.set(e.employee_name, [e])
    }
  }
  return Array.from(map.entries()).map(([name, entries]) => ({ name, entries }))
}

export function useApproval() {
  const entries = ref<ReviewEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const { apiFetch } = useApi()

  async function fetchEntries() {
    loading.value = true
    error.value = null
    try {
      const data = await apiFetch<{ success: boolean; entries: ReviewEntry[] }>(
        '/api/time_entries.php',
      )
      entries.value = data.entries
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load entries'
    } finally {
      loading.value = false
    }
  }

  async function reviewEntries(
    ids: number[],
    action: 'approve' | 'reject',
    rejectionNote = '',
    field: 'status' | 'km_status' = 'status',
  ): Promise<number> {
    const result = await apiFetch<{ success: boolean; updated: number }>(
      '/api/review_entries.php',
      {
        method: 'POST',
        body: JSON.stringify({ ids, action, rejection_note: rejectionNote, field }),
      },
    )
    if (field === 'km_status') {
      entries.value = entries.value.map(e =>
        ids.includes(e.id)
          ? { ...e, km_status: action === 'approve' ? 'approved' : 'rejected', km_rejection_note: action === 'reject' ? rejectionNote : null }
          : e,
      )
    } else if (action === 'approve') {
      entries.value = entries.value.map(e =>
        ids.includes(e.id) ? { ...e, status: 'approved' } : e,
      )
    } else {
      entries.value = entries.value.map(e =>
        ids.includes(e.id) ? { ...e, status: 'rejected', rejection_note: rejectionNote } : e,
      )
    }
    await fetchEntries()
    return result.updated
  }

  async function deleteEntry(id: number): Promise<void> {
    await apiFetch('/api/review_entries.php', {
      method: 'POST',
      body: JSON.stringify({ ids: [id], action: 'delete' }),
    })
    entries.value = entries.value.filter(e => e.id !== id)
  }

  return { entries, loading, error, fetchEntries, reviewEntries, deleteEntry }
}
