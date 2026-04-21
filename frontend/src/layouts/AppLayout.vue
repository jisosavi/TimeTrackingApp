<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { Button } from '@/components/ui/button'

const { t } = useI18n()

const auth = useAuthStore()
const router = useRouter()
const { apiFetch } = useApi()

const LANG_NAMES: Record<string, string> = {
  en: 'English', fi: 'Suomi', sv: 'Svenska', et: 'Eesti', uk: 'Українська', xh: 'isiXhosa',
}

async function changeLanguage(lang: string) {
  const user = auth.user!
  const targetType =
    user.type === 'employee'   ? 'employee' :
    user.type === 'supervisor' ? 'supervisor_self' : 'admin'

  const body: Record<string, unknown> = { lang, target_type: targetType }
  if (targetType === 'employee' || targetType === 'admin') body.target_id = user.id

  await apiFetch('/api/update_language.php', {
    method: 'POST',
    body: JSON.stringify(body),
  }).catch(() => {})

  auth.setAuth(auth.token!, { ...user, uiLanguage: lang })
}

const navLinks = computed(() => {
  const { type, companySlug: slug } = auth.user ?? {}
  if (type === 'employee') {
    return [{ to: `/${slug}/home`, label: t('nav.log_hours') }]
  }
  if (type === 'supervisor') {
    return [{ to: `/${slug}/approval/home`, label: t('approval.dashboard_title') }]
  }
  if (type === 'admin') {
    return [
      { to: `/${slug}/approval/home`, label: t('approval.dashboard_title') },
      { to: `/${slug}/admin/dashboard`, label: t('admin.employees_title') },
    ]
  }
  if (type === 'superadmin') {
    return [{ to: '/admin/dashboard', label: 'Companies' }]
  }
  return []
})

async function logout() {
  await fetch('/api/logout.php', {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}` },
  }).catch(() => {})
  auth.clearAuth()
  router.push('/admin')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background">
    <header class="border-b sticky top-0 bg-background z-10">
      <div class="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <span class="font-semibold text-sm">TimeTrackingApp</span>
        <div class="flex items-center gap-3">
          <span class="text-sm text-muted-foreground">{{ auth.user?.name }}</span>
          <select
            :value="auth.user?.uiLanguage ?? 'en'"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            @change="changeLanguage(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
          </select>
          <Button variant="outline" size="sm" @click="logout">{{ t('common.logout') }}</Button>
        </div>
      </div>
    </header>

    <div v-if="navLinks.length > 1" class="border-b bg-background">
      <nav class="max-w-4xl mx-auto px-4 flex gap-1 h-10 items-center">
        <RouterLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="text-sm px-4 py-1.5 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted transition-colors"
          active-class="bg-primary text-primary-foreground border-primary hover:bg-primary/90"
        >
          {{ link.label }}
        </RouterLink>
      </nav>
    </div>

    <main class="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
