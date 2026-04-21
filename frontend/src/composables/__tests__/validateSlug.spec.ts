import { describe, it, expect } from 'vitest'
import { validateSlug } from '@/composables/useSuperAdmin'

describe('validateSlug', () => {
  it('returns null for a valid slug', () => {
    expect(validateSlug('my-company')).toBeNull()
  })

  it('returns null for slug with numbers', () => {
    expect(validateSlug('company123')).toBeNull()
  })

  it('returns error for empty string', () => {
    expect(validateSlug('')).toBeTruthy()
  })

  it('returns error for whitespace only', () => {
    expect(validateSlug('   ')).toBeTruthy()
  })

  it('returns error for single character', () => {
    expect(validateSlug('a')).toBeTruthy()
  })

  it('returns error for uppercase letters', () => {
    expect(validateSlug('MyCompany')).toBeTruthy()
  })

  it('returns error for spaces', () => {
    expect(validateSlug('my company')).toBeTruthy()
  })

  it('returns error for special characters', () => {
    expect(validateSlug('my_company')).toBeTruthy()
  })

  it('returns null for minimum 2-character slug', () => {
    expect(validateSlug('ab')).toBeNull()
  })
})
