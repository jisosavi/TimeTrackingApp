<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { RefreshCw } from 'lucide-vue-next'
import { useAuthStore } from '@/stores/auth'
import { useApi } from '@/composables/useApi'
import { useRefresh } from '@/composables/useRefresh'
import { Button } from '@/components/ui/button'

const { t } = useI18n({ useScope: 'global' })
const { triggerRefresh } = useRefresh()

const auth = useAuthStore()
const router = useRouter()
const { get, post } = useApi()

const LANG_NAMES: Record<string, string> = {
  en: 'English', fi: 'Suomi', sv: 'Svenska', et: 'Eesti', uk: 'Українська', xh: 'isiXhosa',
}

async function changeLanguage(lang: string) {
  const user = auth.user!
  const targetType =
    user.type === 'employee'   ? 'employee' :
    user.type === 'supervisor' ? 'supervisor_self' :
    user.type === 'superadmin' ? 'superadmin' : 'admin'

  const body: Record<string, unknown> = { lang, target_type: targetType }
  if (targetType === 'employee' || targetType === 'admin') body.target_id = user.id

  await post('/api/update_language', body).catch(() => {})

  auth.setAuth(auth.token!, { ...user, uiLanguage: lang })
}

const pendingCount = ref(0)
const pendingTimeOffCount = ref(0)

onMounted(async () => {
  const type = auth.user?.type
  if (type === 'employee') {
    try {
      const [{ proposals }, { entries }] = await Promise.all([
        get<{ proposals: { status: string }[] }>('/api/holiday_proposals?status=clarifying'),
        get<{ entries: { status: string; km_status: string | null }[] }>('/api/time_entries'),
      ])
      pendingCount.value =
        proposals.length +
        entries.filter(e => e.status === 'rejected' || e.km_status === 'rejected').length
    } catch {}
  }
  if (type === 'admin' || type === 'supervisor') {
    try {
      const data = await get<{ entries: { status: string; km_status: string | null; hours: number; km: number }[] }>('/api/time_entries')
      pendingCount.value = data.entries.reduce((n, e) => {
        const isPending = (s: string | null) => s === 'pending' || s === 'clarified'
        const dual = e.hours > 0 && e.km > 0
        if (dual) return n + (isPending(e.status) ? 1 : 0) + (isPending(e.km_status) ? 1 : 0)
        return n + (isPending(e.status) ? 1 : 0)
      }, 0)
    } catch {}
    try {
      const [{ proposals }, { absences }] = await Promise.all([
        get<{ proposals: { status: string }[] }>('/api/supervisor/holiday_proposals?status=pending'),
        get<{ absences: unknown[] }>('/api/supervisor/pending_absences'),
      ])
      pendingTimeOffCount.value = proposals.filter(p => p.status === 'pending').length + absences.length
    } catch {}
  }
})

const companyDisplayName = computed(() => auth.user?.companyName ?? '')

const navLinks = computed(() => {
  const { type, companySlug: slug } = auth.user ?? {}
  if (type === 'employee') {
    return [{ to: `/${slug}/home`, label: t('nav.log_hours'), badge: pendingCount.value }]
  }
  if (type === 'supervisor') {
    return [
      { to: `/${slug}/approval/home`, label: t('approval.dashboard_title'), badge: pendingCount.value },
      { to: `/${slug}/approval/time-off`, label: t('timeOff.nav_label'), badge: pendingTimeOffCount.value },
    ]
  }
  if (type === 'admin') {
    return [
      { to: `/${slug}/admin/payroll-summary`, label: t('nav.payroll'), badge: 0 },
      { to: `/${slug}/admin/dashboard`, label: t('admin.employees_title'), badge: 0 },
      { to: `/${slug}/approval/home`, label: t('approval.dashboard_title'), badge: pendingCount.value },
      { to: `/${slug}/admin/time-off`, label: t('timeOff.nav_label'), badge: pendingTimeOffCount.value },
      { to: `/${slug}/admin/payroll-settings`, label: t('nav.settings'), badge: 0 },
    ]
  }
  if (type === 'superadmin') {
    return [
      { to: '/admin/dashboard', label: 'Companies', badge: 0 },
      { to: '/admin/audit-log', label: 'Audit Log', badge: 0 },
    ]
  }
  return []
})

async function logout() {
  const user = auth.user
  const slug = user?.companySlug

  await post('/api/logout').catch(() => {})
  auth.clearAuth()

  if (user?.type === 'employee')        router.push(`/${slug}`)
  else if (user?.type === 'supervisor') router.push(`/${slug}/approval`)
  else if (user?.type === 'admin')      router.push(`/${slug}/admin`)
  else                                  router.push('/admin')
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background">
    <header class="border-b sticky top-0 bg-background z-10">
      <div class="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <img src="/salaxy-logo.png" alt="Salaxy" class="h-8 w-auto flex-shrink-0 object-contain" />
          <span v-if="auth.user?.type === 'admin'" class="text-sm font-medium text-foreground">
            {{ companyDisplayName }}
          </span>
        </div>
        <div class="flex items-center gap-3">
          <select
            :value="auth.user?.uiLanguage ?? 'en'"
            class="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
            @change="changeLanguage(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
          </select>
          <Button variant="ghost" size="icon-sm" :title="t('approval.refresh')" @click="triggerRefresh">
            <RefreshCw class="size-4" />
          </Button>
          <Button variant="outline" size="sm" @click="logout">{{ t('common.logout') }}</Button>
        </div>
      </div>
    </header>

    <!-- Employee name above tab selector -->
    <div v-if="auth.user?.type === 'employee'" class="border-b bg-background">
      <p class="max-w-4xl mx-auto px-4 py-2 text-sm font-medium text-center text-foreground">
        {{ auth.user?.name }}
      </p>
    </div>

    <div v-if="navLinks.length > 1" class="border-b bg-background">
      <nav class="max-w-4xl mx-auto px-4 flex gap-1 h-10 items-center">
        <RouterLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="inline-flex items-center gap-1.5 text-sm px-4 py-1.5 rounded-md border border-input bg-background text-foreground font-medium hover:bg-muted transition-colors"
          active-class="bg-primary text-primary-foreground border-primary hover:bg-[#6D56F0]"
        >
          {{ link.label }}
          <span
            v-if="link.badge > 0"
            class="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-red-100 text-red-600 text-[10px] font-semibold leading-none"
          >
            {{ link.badge }}
          </span>
        </RouterLink>
      </nav>
    </div>

    <main class="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
