export interface TimeEntry {
  id: number
  company_id: number
  employee_id: number
  entry_date: string
  start_time: string | null
  end_time: string | null
  hours: number
  km: number
  project: string | null
  comment: string | null
  status: 'pending' | 'approved' | 'rejected' | 'clarified' | 'deleted'
  submitted_at: string
  reviewed_by_type: string | null
  reviewed_by_id: number | null
  reviewed_at: string | null
  rejection_note: string | null
  employee_clarification: string | null
  clarification_at: string | null
  exported_to_salaxy: number
  exported_at: string | null
}

export interface LlmEntry {
  date: string
  start: string
  end: string
  hours: number
  mileage: number
  project: string
  notes: string
}

export interface LlmParsedResponse {
  action: 'new' | 'update'
  entries: LlmEntry[]
}
