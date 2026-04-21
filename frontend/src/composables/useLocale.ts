import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { SUPPORTED_LOCALES } from '@/i18n'

export function useLocale() {
  const { locale } = useI18n({ useScope: 'global' })
  const auth = useAuthStore()

  function apply(lang: string | undefined) {
    const supported = SUPPORTED_LOCALES as readonly string[]
    locale.value = lang && supported.includes(lang) ? lang : 'en'
  }

  apply(auth.user?.uiLanguage)
  watch(() => auth.user?.uiLanguage, apply)

  return { locale }
}
