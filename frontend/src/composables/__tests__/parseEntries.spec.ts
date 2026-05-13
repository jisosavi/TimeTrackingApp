import { describe, it, expect } from 'vitest'
import { parseEntriesFromText, parseBlock } from '@/composables/useChat'

describe('parseEntriesFromText', () => {
  it('returns null when no JSON block present', () => {
    expect(parseEntriesFromText('Kerro lisää töistäsi.')).toBeNull()
  })

  it('parses a valid new-action entry', () => {
    const text = `
Yhteenveto:
* Päivämäärä: 21-04-2026
* Aloitusaika: 09:00

\`\`\`json
{"action":"new","entries":[{"date":"21-04-2026","start":"09:00","end":"12:00","hours":3,"mileage":0,"project":"","notes":""}]}
\`\`\`
    `
    const result = parseEntriesFromText(text)
    expect(result).not.toBeNull()
    expect(result!.action).toBe('new')
    expect(result!.entries).toHaveLength(1)
    expect(result!.entries[0]!.start).toBe('09:00')
    expect(result!.entries[0]!.hours).toBe(3)
  })

  it('parses an update action', () => {
    const text = '```json\n{"action":"update","entries":[{"date":"21-04-2026","start":"09:30","end":"12:00","hours":2.5,"mileage":0,"project":"X","notes":""}]}\n```'
    const result = parseEntriesFromText(text)
    expect(result!.action).toBe('update')
    expect(result!.entries[0]!.start).toBe('09:30')
  })

  it('parses an entry with mileage', () => {
    const text = '```json\n{"action":"new","entries":[{"date":"21-04-2026","start":"","end":"","hours":0,"mileage":134,"project":"","notes":"km-korvaus"}]}\n```'
    const result = parseEntriesFromText(text)
    expect(result!.entries[0]!.mileage).toBe(134)
  })

  it('returns null for malformed JSON', () => {
    const text = '```json\n{broken json\n```'
    expect(parseEntriesFromText(text)).toBeNull()
  })
})

describe('parseBlock', () => {
  it('returns null when no JSON block present', () => {
    expect(parseBlock('Kerro lisää töistäsi.')).toBeNull()
  })

  it('parses a time_entry block (type field present)', () => {
    const text = '```json\n{"type":"time_entry","action":"new","entries":[{"date":"05-05-2026","start":"08:00","end":"11:00","hours":3,"mileage":0,"project":"","notes":""}]}\n```'
    const result = parseBlock(text)
    expect(result).not.toBeNull()
    expect('entries' in result!).toBe(true)
  })

  it('parses a time_entry block (no type field, legacy)', () => {
    const text = '```json\n{"action":"new","entries":[{"date":"05-05-2026","start":"08:00","end":"11:00","hours":3,"mileage":0,"project":"","notes":""}]}\n```'
    const result = parseBlock(text)
    expect(result).not.toBeNull()
    expect('entries' in result!).toBe(true)
  })

  it('parses a holiday_proposal block', () => {
    const text = '```json\n{"type":"holiday_proposal","startDate":"2026-06-23","endDate":"2026-07-04","label":"Kesäloma","note":""}\n```'
    const result = parseBlock(text)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('holiday_proposal')
    expect((result as { startDate: string }).startDate).toBe('2026-06-23')
    expect((result as { endDate: string }).endDate).toBe('2026-07-04')
  })

  it('parses an absence block', () => {
    const text = '```json\n{"type":"absence","startDate":"2026-05-05","endDate":"2026-05-07","isPaid":true,"affectsAccrual":true,"reason":"Kertausharjoitus","note":""}\n```'
    const result = parseBlock(text)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('absence')
    expect((result as { isPaid: boolean }).isPaid).toBe(true)
    expect((result as { reason: string }).reason).toBe('Kertausharjoitus')
  })

  it('returns null for malformed JSON', () => {
    expect(parseBlock('```json\n{bad\n```')).toBeNull()
  })

  it('returns null when entries array is empty', () => {
    const text = '```json\n{"action":"new","entries":[]}\n```'
    expect(parseBlock(text)).toBeNull()
  })
})
