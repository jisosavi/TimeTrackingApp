import { ref } from 'vue'
import { useApi } from './useApi'

export interface AbsenceRecord {
  id: number
  employee_id: number
  salaxy_absence_id: string | null
  reason: string
  start_date: string
  end_date: string
  days: number
  is_paid: number // 0 | 1
  affects_accrual: number // 0 | 1
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  decided_by: number | null
  decided_at: string | null
  decision_note: string | null
  created_at: string
  updated_at: string
}

export function useAbsences() {
  const { apiFetch } = useApi()
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchAbsences(status?: string): Promise<AbsenceRecord[]> {
    const qs = status && status !== 'all' ? `?status=${status}` : '?status=all'
    const data = await apiFetch<{ absences: AbsenceRecord[] }>(`/api/absences.php${qs}`)
    return data.absences
  }

  async function submitAbsence(body: {
    startDate: string
    endDate: string
    isPaid: boolean
    affectsAccrual: boolean
    note?: string | null
  }): Promise<AbsenceRecord> {
    loading.value = true
    error.value = null
    try {
      const data = await apiFetch<{ absence: AbsenceRecord }>('/api/absences.php', {
        method: 'POST',
        body: JSON.stringify(body),
      })
      return data.absence
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return { loading, error, fetchAbsences, submitAbsence }
}
