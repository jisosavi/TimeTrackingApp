<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'

const auth = useAuthStore()
const router = useRouter()

const navLinks = computed(() => {
  const { type, companySlug: slug } = auth.user ?? {}
  if (type === 'employee') {
    return [{ to: `/${slug}/home`, label: 'Log Hours' }]
  }
  if (type === 'supervisor') {
    return [{ to: `/${slug}/approval/home`, label: 'Approvals' }]
  }
  if (type === 'admin') {
    return [
      { to: `/${slug}/approval/home`, label: 'Approvals' },
      { to: `/${slug}/admin/dashboard`, label: 'Admin' },
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
        <div class="flex items-center gap-6">
          <span class="font-semibold text-sm">TimeTrackingApp</span>
          <nav class="flex gap-1">
            <RouterLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="text-sm px-3 py-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              active-class="bg-muted text-foreground"
            >
              {{ link.label }}
            </RouterLink>
          </nav>
        </div>
        <div class="flex items-center gap-3">
          <span class="text-sm text-muted-foreground">{{ auth.user?.name }}</span>
          <Button variant="outline" size="sm" @click="logout">Sign out</Button>
        </div>
      </div>
    </header>

    <main class="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
      <RouterView />
    </main>
  </div>
</template>
