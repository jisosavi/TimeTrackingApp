// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthGrid from '../MonthGrid.vue'
import type { DayState } from '../MonthGrid.vue'

function mk(
  year: number,
  month: number,
  data: Record<number, DayState> = {},
  selected: number[] = [],
) {
  return mount(MonthGrid, { props: { year, month, data, selected } })
}

describe('MonthGrid', () => {
  // ── day count ────────────────────────────────────────────────────────────

  it('renders 28 day buttons for Feb 2025', () => {
    const w = mk(2025, 2)
    expect(w.findAll('button').length).toBe(28)
  })

  it('renders 31 day buttons for Jan 2025', () => {
    const w = mk(2025, 1)
    expect(w.findAll('button').length).toBe(31)
  })

  it('renders 30 day buttons for Apr 2025', () => {
    const w = mk(2025, 4)
    expect(w.findAll('button').length).toBe(30)
  })

  it('renders 29 day buttons for Feb 2024 (leap year)', () => {
    const w = mk(2024, 2)
    expect(w.findAll('button').length).toBe(29)
  })

  // ── offset blank cells ───────────────────────────────────────────────────

  it('renders 2 blank cells for Jan 2025 (starts Wednesday)', () => {
    // Jan 1 2025 = Wednesday → getDay()=3 → offset=(3+6)%7=2
    const w = mk(2025, 1)
    const blanks = w.findAll('div.w-11.h-11')
    expect(blanks.length).toBe(2)
  })

  it('renders 5 blank cells for Feb 2025 (starts Saturday)', () => {
    // Feb 1 2025 = Saturday → getDay()=6 → offset=(6+6)%7=5
    const w = mk(2025, 2)
    const blanks = w.findAll('div.w-11.h-11')
    expect(blanks.length).toBe(5)
  })

  it('renders 0 blank cells for month starting on Monday', () => {
    // Sep 1 2025 = Monday → getDay()=1 → offset=(1+6)%7=0
    const w = mk(2025, 9)
    const blanks = w.findAll('div.w-11.h-11')
    expect(blanks.length).toBe(0)
  })

  // ── state CSS classes ────────────────────────────────────────────────────

  it('applies bg-indigo-600 to h-app day', () => {
    const w = mk(2025, 5, { 10: 'h-app' })
    const btn = w.findAll('button').find((b) => b.text() === '10')!
    expect(btn.classes()).toContain('bg-indigo-600')
  })

  it('applies bg-amber-50 and border-amber-400 to pending day', () => {
    const w = mk(2025, 5, { 15: 'p' })
    const btn = w.findAll('button').find((b) => b.text() === '15')!
    expect(btn.classes()).toContain('bg-amber-50')
    expect(btn.classes()).toContain('border-amber-400')
  })

  it('applies bg-sky-50 and border-sky-400 to a-paid day', () => {
    const w = mk(2025, 5, { 7: 'a-paid' })
    const btn = w.findAll('button').find((b) => b.text() === '7')!
    expect(btn.classes()).toContain('bg-sky-50')
    expect(btn.classes()).toContain('border-sky-400')
  })

  it('applies bg-gray-100 and border-gray-400 to a-unpaid day', () => {
    const w = mk(2025, 5, { 3: 'a-unpaid' })
    const btn = w.findAll('button').find((b) => b.text() === '3')!
    expect(btn.classes()).toContain('bg-gray-100')
    expect(btn.classes()).toContain('border-gray-400')
  })

  // ── selected range ───────────────────────────────────────────────────────

  it('applies bg-indigo-50 and border-indigo-500 to selected days', () => {
    const w = mk(2025, 5, {}, [5, 6, 7])
    for (const day of [5, 6, 7]) {
      const btn = w.findAll('button').find((b) => b.text() === String(day))!
      expect(btn.classes()).toContain('bg-indigo-50')
      expect(btn.classes()).toContain('border-indigo-500')
    }
  })

  it('does not apply selected class to unselected days', () => {
    const w = mk(2025, 5, {}, [5])
    const btn = w.findAll('button').find((b) => b.text() === '6')!
    expect(btn.classes()).not.toContain('bg-indigo-50')
  })

  // state takes precedence over selected
  it('state class wins over selected', () => {
    const w = mk(2025, 5, { 5: 'h-app' }, [5])
    const btn = w.findAll('button').find((b) => b.text() === '5')!
    expect(btn.classes()).toContain('bg-indigo-600')
    expect(btn.classes()).not.toContain('bg-indigo-50')
  })

  // ── weekend styling ──────────────────────────────────────────────────────

  it('applies text-muted-foreground to Sat/Sun cells with no state', () => {
    // May 2025: offset=3 (May 1=Thu). So day 3 (Sat) is idx 3+3-1=5 → col 5 → weekend
    // May 1=Thu(4), offset=(4+6)%7=3. Day 3 → idx=3+3-1=5, 5%7=5 (Sat)
    const w = mk(2025, 5)
    const btn3 = w.findAll('button').find((b) => b.text() === '3')!
    expect(btn3.classes()).toContain('text-muted-foreground')
  })

  it('does not apply text-muted-foreground to weekday cells', () => {
    // May 1 (Thu) is not a weekend
    const w = mk(2025, 5)
    const btn1 = w.findAll('button').find((b) => b.text() === '1')!
    expect(btn1.classes()).not.toContain('text-muted-foreground')
  })

  // ── @tap emission ────────────────────────────────────────────────────────

  it('emits tap with correct day number when button clicked', async () => {
    const w = mk(2025, 5)
    await w.findAll('button').find((b) => b.text() === '12')!.trigger('click')
    expect(w.emitted('tap')).toEqual([[12]])
  })

  it('emits tap for each distinct day clicked', async () => {
    const w = mk(2025, 5)
    await w.findAll('button').find((b) => b.text() === '5')!.trigger('click')
    await w.findAll('button').find((b) => b.text() === '10')!.trigger('click')
    expect(w.emitted('tap')).toEqual([[5], [10]])
  })

  // ── headers ──────────────────────────────────────────────────────────────

  it('renders 7 weekday header cells', () => {
    const w = mk(2025, 5)
    const headers = w.findAll('.grid')[0]!.findAll('div')
    expect(headers.length).toBe(7)
  })

  it('renders Mo as first header', () => {
    const w = mk(2025, 5)
    const first = w.findAll('.grid')[0]!.find('div')
    expect(first.text()).toBe('Mo')
  })
})
