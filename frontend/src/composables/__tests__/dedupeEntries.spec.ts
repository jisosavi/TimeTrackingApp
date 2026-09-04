import { describe, it, expect } from 'vitest'
import { dedupeEntries } from '@/composables/useChat'
import type { LlmEntry } from '@/types'

function entry(over: Partial<LlmEntry> = {}): LlmEntry {
  return {
    date: '04-09-2026', start: '08:00', end: '16:00',
    hours: 8, mileage: 0, project: 'Laituri', notes: '',
    ...over,
  }
}

describe('dedupeEntries', () => {
  it('keeps a single new entry', () => {
    expect(dedupeEntries([entry()], new Set())).toHaveLength(1)
  })

  it('drops a repeat inside one payload', () => {
    const result = dedupeEntries([entry(), entry()], new Set())
    expect(result).toHaveLength(1)
  })

  it('drops an entry already saved this conversation', () => {
    const first = dedupeEntries([entry()], new Set())
    const saved = new Set(first.map((f) => f.sig))
    expect(dedupeEntries([entry()], saved)).toHaveLength(0)
  })

  it('keeps entries that differ by date', () => {
    expect(dedupeEntries([entry(), entry({ date: '05-09-2026' })], new Set())).toHaveLength(2)
  })

  it('keeps entries that differ by hours', () => {
    expect(dedupeEntries([entry(), entry({ hours: 6 })], new Set())).toHaveLength(2)
  })

  it('keeps entries that differ by kilometres', () => {
    expect(dedupeEntries([entry(), entry({ mileage: 45 })], new Set())).toHaveLength(2)
  })

  it('treats a different cost centre as a different entry', () => {
    const rows = [entry({ dimensionValue: 'LAI-01' }), entry({ dimensionValue: 'LAI-02' })]
    expect(dedupeEntries(rows, new Set())).toHaveLength(2)
  })

  it('ignores project case when comparing', () => {
    expect(dedupeEntries([entry({ project: 'Laituri' }), entry({ project: 'laituri' })], new Set())).toHaveLength(1)
  })

  it('collapses three copies to one', () => {
    expect(dedupeEntries([entry(), entry(), entry()], new Set())).toHaveLength(1)
  })
})
