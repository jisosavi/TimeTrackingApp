import { describe, it, expect } from 'vitest'
import { groupByEmployee } from '@/composables/useApproval'
import type { ReviewEntry } from '@/types'

function makeEntry(id: number, employeeName: string): ReviewEntry {
  return {
    id,
    employee_name: employeeName,
    company_id: 1,
    employee_id: id,
    entry_date: '2026-04-21',
    start_time: '09:00',
    end_time: '12:00',
    hours: 3,
    km: 0,
    project: null,
    comment: null,
    status: 'pending',
    submitted_at: '',
    reviewed_by_type: null,
    reviewed_by_id: null,
    reviewed_at: null,
    rejection_note: null,
    employee_clarification: null,
    clarification_at: null,
    exported_to_salaxy: 0,
    exported_at: null,
    km_status: 'pending',
    km_rejection_note: null,
    km_employee_clarification: null,
  }
}

describe('groupByEmployee', () => {
  it('returns empty array for empty input', () => {
    expect(groupByEmployee([])).toEqual([])
  })

  it('groups entries by employee name', () => {
    const groups = groupByEmployee([
      makeEntry(1, 'Alice'),
      makeEntry(2, 'Bob'),
      makeEntry(3, 'Alice'),
    ])
    expect(groups).toHaveLength(2)
    expect(groups.find(g => g.name === 'Alice')!.entries).toHaveLength(2)
    expect(groups.find(g => g.name === 'Bob')!.entries).toHaveLength(1)
  })

  it('preserves first-seen insertion order', () => {
    const groups = groupByEmployee([
      makeEntry(1, 'Charlie'),
      makeEntry(2, 'Alice'),
    ])
    expect(groups[0]!.name).toBe('Charlie')
    expect(groups[1]!.name).toBe('Alice')
  })
})
