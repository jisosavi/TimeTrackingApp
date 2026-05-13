import { ref } from 'vue'
import { useApi } from './useApi'

export interface HolidayYear {
  id: string
  year: number
  startDate: string
  endDate: string
  accruedDays: number
  plannedDays: number
  paidDays: number
  summerSeason: { start: string; end: string }
  winterSeason: { start: string; end: string }
  accrualRule: string
  monthlyAccrual: number
}

export interface Proposal {
  id: number
  employee_id: number
  start_date: string
  end_date: string
  work_days: number
  label: string | null
  note: string | null
  source: string
  status: 'pending' | 'approved' | 'rejected' | 'clarified' | 'withdrawn'
  decided_by: number | null
  decided_at: string | null
  decision_note: string | null
  salaxy_holiday_id: string | null
  created_at: string
  updated_at: string
}

export interface TimelineItem {
  id: string
  type: 'proposal'
  startDate: string
  endDate: string
  days: number
  label: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  decidedAt: string | null
}

export interface TimeOffOverview {
  holidayYear: HolidayYear | null
  proposals: Proposal[]
  upcoming: TimelineItem[]
  pendingDays: number
}

export function useTimeOff() {
  const { apiFetch } = useApi()
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchOverview(year: number): Promise<TimeOffOverview> {
    loading.value = true
    error.value = null
    try {
      const [hyData, propData] = await Promise.all([
        apiFetch<{ holidayYear: HolidayYear | null }>(`/api/holiday_year.php?year=${year}`),
        apiFetch<{ proposals: Proposal[] }>('/api/holiday_proposals.php?status=all'),
      ])

      const proposals = propData.proposals
      const pendingDays = proposals
        .filter((p) => p.status === 'pending')
        .reduce((sum, p) => sum + p.work_days, 0)

      const now = new Date()
      const cutoff = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)

      const upcoming: TimelineItem[] = proposals
        .filter((p) => p.status !== 'rejected' && p.status !== 'withdrawn')
        .filter((p) => new Date(p.start_date) <= cutoff)
        .map((p) => ({
          id: `proposal-${p.id}`,
          type: 'proposal' as const,
          startDate: p.start_date,
          endDate: p.end_date,
          days: p.work_days,
          label: p.label ?? '',
          status: (p.status === 'approved' ? 'approved' : p.status === 'rejected' ? 'rejected' : 'pending') as TimelineItem['status'],
          createdAt: p.created_at,
          decidedAt: p.decided_at,
        }))
        .sort((a, b) => a.startDate.localeCompare(b.startDate))

      return { holidayYear: hyData.holidayYear, proposals, upcoming, pendingDays }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return { loading, error, fetchOverview }
}
