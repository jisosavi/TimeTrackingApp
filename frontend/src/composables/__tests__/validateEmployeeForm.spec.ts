import { describe, it, expect } from 'vitest'
import { validateEmployeeForm } from '@/composables/useAdminData'

describe('validateEmployeeForm', () => {
  it('returns null for valid name and 4-digit PIN', () => {
    expect(validateEmployeeForm('Alice', '1234')).toBeNull()
  })

  it('returns error for empty name', () => {
    expect(validateEmployeeForm('', '1234')).toBeTruthy()
  })

  it('returns error for whitespace-only name', () => {
    expect(validateEmployeeForm('   ', '1234')).toBeTruthy()
  })

  it('returns error for non-numeric PIN', () => {
    expect(validateEmployeeForm('Alice', 'abc')).toBeTruthy()
  })

  it('returns error for PIN shorter than 3 digits', () => {
    expect(validateEmployeeForm('Alice', '12')).toBeTruthy()
  })

  it('returns null for minimum 3-digit PIN', () => {
    expect(validateEmployeeForm('Alice', '123')).toBeNull()
  })

  it('returns null for maximum 6-digit PIN', () => {
    expect(validateEmployeeForm('Alice', '123456')).toBeNull()
  })

  it('returns error for PIN longer than 6 digits', () => {
    expect(validateEmployeeForm('Alice', '1234567')).toBeTruthy()
  })
})
