export interface Holiday {
  date: string
  localName: string
  name: string
}

export const COUNTRY_NAMES: Record<string, string> = {
  FI: 'Finland',
  SE: 'Sweden',
  NO: 'Norway',
  EE: 'Estonia',
  LT: 'Lithuania',
  LV: 'Latvia',
  UA: 'Ukraine',
  PL: 'Poland',
  DE: 'Germany',
  GB: 'United Kingdom',
}

const cache = new Map<string, Holiday[]>()

export async function fetchHolidays(countryCode: string, year: number): Promise<Holiday[]> {
  const key = `${countryCode}-${year}`
  if (cache.has(key)) return cache.get(key)!
  const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/${countryCode}`)
  if (!res.ok) throw new Error('Failed to fetch holidays')
  const data = (await res.json()) as Holiday[]
  cache.set(key, data)
  return data
}
