import { describe, it, expect } from 'vitest'
import { parseEntriesFromText } from '@/composables/useChat'

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
