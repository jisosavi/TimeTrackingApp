import { createI18n } from 'vue-i18n'
import en from '../../locales/en.json'
import fi from '../../locales/fi.json'
import sv from '../../locales/sv.json'
import et from '../../locales/et.json'
import uk from '../../locales/uk.json'
import xh from '../../locales/xh.json'

// Locale files use flat dot-notation keys; expand to nested objects for vue-i18n
function expand(flat: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.')
    let node = out
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i]!
      if (typeof node[p] !== 'object' || node[p] === null) node[p] = {}
      node = node[p] as Record<string, unknown>
    }
    node[parts.at(-1)!] = value
  }
  return out
}

export const SUPPORTED_LOCALES = ['en', 'fi', 'sv', 'et', 'uk', 'xh'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: {
    en: expand(en as Record<string, string>),
    fi: expand(fi as Record<string, string>),
    sv: expand(sv as Record<string, string>),
    et: expand(et as Record<string, string>),
    uk: expand(uk as Record<string, string>),
    xh: expand(xh as Record<string, string>),
  } as any, // vue-i18n message schema inference not needed at runtime
})
