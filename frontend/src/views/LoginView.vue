<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

const router = useRouter()
const auth = useAuthStore()

const slug = ref(new URLSearchParams(window.location.search).get('company') ?? '')
const employeePin = ref('')
const managerPin = ref('')
const adminEmail = ref('')
const adminPassword = ref('')
const error = ref('')
const loading = ref(false)

async function loginEmployee() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/validate_pin.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: employeePin.value, slug: slug.value }),
    })
    const data = await res.json()
    if (!data.valid) throw new Error(data.error ?? 'Väärä PIN')
    const user: AuthUser = {
      id: data.id,
      type: 'employee',
      companyId: data.companyId,
      name: data.name,
      uiLanguage: data.ui_language ?? 'en',
    }
    auth.setAuth(data.token, user)
    router.push('/employee')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function loginManager() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/supervisor_login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: managerPin.value, slug: slug.value }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error ?? 'Väärä PIN')
    const user: AuthUser = {
      id: data.supervisor.id,
      type: 'supervisor',
      companyId: data.supervisor.company_id ?? 0,
      name: `${data.supervisor.first_name} ${data.supervisor.last_name}`,
      uiLanguage: data.ui_language ?? 'en',
    }
    auth.setAuth(data.token, user)
    router.push('/manager')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

async function loginAdmin() {
  error.value = ''
  loading.value = true
  try {
    const res = await fetch('/api/admin_login.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail.value, password: adminPassword.value }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error ?? 'Invalid credentials')
    const user: AuthUser = {
      id: data.admin.id,
      type: 'admin',
      companyId: data.admin.company_id,
      name: data.admin.name,
      email: data.admin.email,
      uiLanguage: data.ui_language ?? 'en',
    }
    auth.setAuth(data.token, user)
    router.push('/admin')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function clearError() {
  error.value = ''
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-background p-4">
    <div class="w-full max-w-sm space-y-4">
      <div class="text-center space-y-1">
        <h1 class="text-2xl font-semibold tracking-tight">TimeTrackingApp</h1>
        <p class="text-sm text-muted-foreground">Sign in to continue</p>
      </div>

      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base">Company</CardTitle>
          <CardDescription>Optional — leave blank for default</CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            v-model="slug"
            placeholder="company-slug"
            @input="clearError"
          />
        </CardContent>
      </Card>

      <Tabs default-value="employee" @update:model-value="clearError">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger value="employee">Employee</TabsTrigger>
          <TabsTrigger value="manager">Manager</TabsTrigger>
          <TabsTrigger value="admin">Admin</TabsTrigger>
        </TabsList>

        <TabsContent value="employee">
          <Card>
            <CardContent class="pt-6 space-y-4">
              <div class="space-y-2">
                <Label for="employee-pin">PIN</Label>
                <Input
                  id="employee-pin"
                  v-model="employeePin"
                  type="password"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="••••••"
                  class="text-center text-xl tracking-widest"
                  @keyup.enter="loginEmployee"
                  @input="clearError"
                />
              </div>
              <Button class="w-full" :disabled="loading || !employeePin" @click="loginEmployee">
                {{ loading ? 'Signing in…' : 'Sign in' }}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manager">
          <Card>
            <CardContent class="pt-6 space-y-4">
              <div class="space-y-2">
                <Label for="manager-pin">PIN</Label>
                <Input
                  id="manager-pin"
                  v-model="managerPin"
                  type="password"
                  inputmode="numeric"
                  maxlength="6"
                  placeholder="••••••"
                  class="text-center text-xl tracking-widest"
                  @keyup.enter="loginManager"
                  @input="clearError"
                />
              </div>
              <Button class="w-full" :disabled="loading || !managerPin" @click="loginManager">
                {{ loading ? 'Signing in…' : 'Sign in' }}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="admin">
          <Card>
            <CardContent class="pt-6 space-y-4">
              <div class="space-y-2">
                <Label for="admin-email">Email</Label>
                <Input
                  id="admin-email"
                  v-model="adminEmail"
                  type="email"
                  placeholder="admin@example.com"
                  @input="clearError"
                />
              </div>
              <div class="space-y-2">
                <Label for="admin-password">Password</Label>
                <Input
                  id="admin-password"
                  v-model="adminPassword"
                  type="password"
                  placeholder="••••••••"
                  @keyup.enter="loginAdmin"
                  @input="clearError"
                />
              </div>
              <Button class="w-full" :disabled="loading || !adminEmail || !adminPassword" @click="loginAdmin">
                {{ loading ? 'Signing in…' : 'Sign in' }}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p v-if="error" class="text-sm text-destructive text-center">{{ error }}</p>
    </div>
  </div>
</template>
