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
  km_status: 'pending' | 'approved' | 'rejected'
  km_rejection_note: string | null
  km_employee_clarification: string | null
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

export interface Company {
  id: number
  name: string
  slug: string
  active: number
  approvals_enabled: number
  ui_language: string
  employee_count: number
  business_id: string | null
}

export interface Employee {
  id: number
  name: string
  pin: string
  ssn: string | null
  employmentId: string | null
  active: number
  pin_locked: number
  pin_temp_locked: number
  ui_language: string | null
  pending_hours: number
  pending_km: number
  pending_count: number
  hours_this_period: number
  last_entry_at: string | null
  email: string | null
  phone: string | null
  birth_year: number | null
}

export interface TeamMemberDetail {
  id: number
  name: string
  email: string | null
  phone: string | null
  birth_year: number | null
}

export interface Supervisor {
  id: number
  first_name: string
  last_name: string
  email: string
  phone: string
  pin: string
  ssn: string | null
  salaxy_id: string | null
  active: number
  pin_locked: number
  pin_temp_locked: number
  ui_language: string | null
  team_size: number
}

export interface TeamMember {
  id: number
  name: string
  in_team: number
  other_supervisors: string | null
}

export interface ReviewEntry extends TimeEntry {
  employee_name: string
  reviewed_by_name?: string | null
}

export interface PayrollSettings {
  payroll_period: 'monthly' | 'biweekly'
  payday_1: number
  payday_2: number
  payroll_settings_updated_at?: string | null
  salaxy_company_id?: string | null
}

export interface ExportEntryRow {
  id: number
  entry_date: string
  hours: number
  km: number
  project: string | null
  exported_to_salaxy: number
}

export interface ExportEmployee {
  employee_id: number
  employee_name: string
  salaxy_employment_id: string | null
  total_hours: number
  total_km: number
  pending_hours: number
  pending_km: number
  entries: ExportEntryRow[]
}

export interface ExportPeriod {
  period_start: string
  period_end: string
  period_label: string
  existing_payroll_id: string | null
  employees: ExportEmployee[]
}

export interface ExportResult {
  total_sent: number
  total_added: number
  total_already: number
  errors: number
  payrolls: { period_start: string; salaxy_payroll_id: string; url: string }[]
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
