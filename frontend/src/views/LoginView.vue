<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

type LoginType = 'employee' | 'supervisor' | 'admin' | 'superadmin'
const loginType = route.meta.loginType as LoginType
const slug = (route.params.slug as string) ?? ''

const pin = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

const isPinLogin = computed(() => loginType === 'employee' || loginType === 'supervisor')

const title = computed(() => {
  switch (loginType) {
    case 'employee': return 'Employee Login'
    case 'supervisor': return 'Supervisor Login'
    case 'admin': return 'Admin Login'
    case 'superadmin': return 'Super Admin'
  }
})

const subtitle = computed(() =>
  slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : 'TimeTrackingApp',
)

function clearError() {
  error.value = ''
}

async function submit() {
  error.value = ''
  loading.value = true
  try {
    if (loginType === 'employee') await loginEmployee()
    else if (loginType === 'supervisor') await loginSupervisor()
    else await loginWithPassword()
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function loginEmployee() {
  const res = await fetch('/validate_pin.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pin.value, slug }),
  })
  const data = await res.json()
  if (!data.valid) throw new Error(data.error ?? 'Väärä PIN')

  const user: AuthUser = {
    id: data.id,
    type: 'employee',
    companyId: data.companyId,
    companySlug: slug,
    name: data.name,
    uiLanguage: data.ui_language ?? 'en',
  }
  auth.setAuth(data.token, user)
  router.push({ name: 'employee-home', params: { slug } })
}

async function loginSupervisor() {
  const res = await fetch('/api/supervisor_login.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pin.value, slug }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Väärä PIN')

  const user: AuthUser = {
    id: data.supervisor.id,
    type: 'supervisor',
    companyId: data.supervisor.company_id ?? 0,
    companySlug: slug,
    name: `${data.supervisor.first_name} ${data.supervisor.last_name}`,
    uiLanguage: data.ui_language ?? 'en',
  }
  auth.setAuth(data.token, user)
  router.push({ name: 'supervisor-home', params: { slug } })
}

async function loginWithPassword() {
  const res = await fetch('/api/admin_login.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.value, password: password.value }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Invalid credentials')

  // Distinguish super-admin from company admin by role field
  const isSuperAdmin = loginType === 'superadmin'
  const user: AuthUser = {
    id: data.admin.id,
    type: isSuperAdmin ? 'superadmin' : 'admin',
    companyId: data.admin.company_id ?? 0,
    companySlug: slug,
    name: data.admin.name,
    email: data.admin.email,
    uiLanguage: data.ui_language ?? 'en',
  }
  auth.setAuth(data.token, user)

  if (isSuperAdmin) {
    router.push({ name: 'superadmin-dashboard' })
  } else {
    router.push({ name: 'admin-dashboard', params: { slug } })
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <div class="w-full max-w-sm space-y-4">

      <div class="text-center space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">{{ title }}</h1>
        <p class="text-sm text-muted-foreground">{{ subtitle }}</p>
      </div>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base sr-only">Sign in</CardTitle>
          <CardDescription v-if="isPinLogin">Enter your 6-digit PIN</CardDescription>
          <CardDescription v-else>Enter your email and password</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">

          <!-- PIN login (employee + supervisor) -->
          <template v-if="isPinLogin">
            <div class="space-y-2">
              <Label for="pin">PIN</Label>
              <Input
                id="pin"
                v-model="pin"
                type="password"
                inputmode="numeric"
                maxlength="6"
                placeholder="••••••"
                class="text-center text-xl tracking-widest"
                autofocus
                @keyup.enter="submit"
                @input="clearError"
              />
            </div>
          </template>

          <!-- Password login (admin + superadmin) -->
          <template v-else>
            <div class="space-y-2">
              <Label for="email">Email</Label>
              <Input
                id="email"
                v-model="email"
                type="email"
                placeholder="admin@example.com"
                autofocus
                @input="clearError"
              />
            </div>
            <div class="space-y-2">
              <Label for="password">Password</Label>
              <Input
                id="password"
                v-model="password"
                type="password"
                placeholder="••••••••"
                @keyup.enter="submit"
                @input="clearError"
              />
            </div>
          </template>

          <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

          <Button
            class="w-full"
            :disabled="loading || (isPinLogin ? !pin : !email || !password)"
            @click="submit"
          >
            {{ loading ? 'Signing in…' : 'Sign in' }}
          </Button>

        </CardContent>
      </Card>

    </div>
  </div>
</template>
