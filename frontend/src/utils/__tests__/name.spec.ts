import { describe, it, expect } from 'vitest'
import { lastName, firstNames, fmtName } from '@/utils/name'

describe('lastName', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(lastName(null)).toBe('')
    expect(lastName(undefined)).toBe('')
    expect(lastName('')).toBe('')
    expect(lastName('   ')).toBe('')
  })

  it('returns the whole name when single word', () => {
    expect(lastName('Madonna')).toBe('Madonna')
  })

  it('returns the last word for two-part names', () => {
    expect(lastName('John Smith')).toBe('Smith')
  })

  it('returns the last word for three-part names', () => {
    expect(lastName('Mary Jane Watson')).toBe('Watson')
  })

  it('handles extra whitespace', () => {
    expect(lastName('  John   Smith  ')).toBe('Smith')
  })
})

describe('firstNames', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(firstNames(null)).toBe('')
    expect(firstNames(undefined)).toBe('')
    expect(firstNames('')).toBe('')
  })

  it('returns empty string for single-word name', () => {
    expect(firstNames('Madonna')).toBe('')
  })

  it('returns everything before the last word', () => {
    expect(firstNames('John Smith')).toBe('John')
    expect(firstNames('Mary Jane Watson')).toBe('Mary Jane')
  })

  it('handles extra whitespace', () => {
    expect(firstNames('  John   Smith  ')).toBe('John')
  })
})

describe('fmtName', () => {
  it('returns empty string for null/undefined/empty', () => {
    expect(fmtName(null)).toBe('')
    expect(fmtName(undefined)).toBe('')
    expect(fmtName('')).toBe('')
  })

  it('returns the name unchanged when single word', () => {
    expect(fmtName('Madonna')).toBe('Madonna')
  })

  it('formats as "Last, First" for two-part name', () => {
    expect(fmtName('John Smith')).toBe('Smith, John')
  })

  it('formats as "Last, First Middle" for three-part name', () => {
    expect(fmtName('Mary Jane Watson')).toBe('Watson, Mary Jane')
  })

  it('handles extra whitespace', () => {
    expect(fmtName('  John   Smith  ')).toBe('Smith, John')
  })
})
