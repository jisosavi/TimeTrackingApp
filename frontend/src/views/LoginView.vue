<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useAuthStore } from '@/stores/auth'
import type { AuthUser } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const { t, locale } = useI18n({ useScope: 'global' })

const LANG_NAMES: Record<string, string> = {
  en: 'English', fi: 'Suomi', sv: 'Svenska', et: 'Eesti', uk: 'Українська', xh: 'isiXhosa',
}

function applyLang(lang: string) {
  locale.value = lang
  if (slug) localStorage.setItem(`salaxy_ui_lang_${slug}`, lang)
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const apiBase = (import.meta.env.VITE_API_BASE as string | undefined) ?? ''

type LoginType = 'employee' | 'supervisor' | 'admin' | 'superadmin'
const loginType = route.meta.loginType as LoginType
const slug = (route.params.slug as string) ?? ''

const SALAXY_AUTHORIZE_URL = 'https://test-secure.salaxy.com/oauth2/authorize'
const showPasswordLogin = import.meta.env.VITE_SUPERADMIN_PASSWORD_LOGIN === 'true'
const oauthLoading = ref(false)

function getSuperAdminRedirectUri(): string {
  return window.location.origin + import.meta.env.BASE_URL
}

function loginWithSalaxyOAuth() {
  const params = new URLSearchParams({
    client_id: 'time',
    response_type: 'code',
    redirect_uri: getSuperAdminRedirectUri(),
    salaxy_skin: 'salaxy.min',
  })
  window.location.href = `${SALAXY_AUTHORIZE_URL}?${params.toString()}`
}

async function handleOAuthCallback(code: string) {
  oauthLoading.value = true
  error.value = ''
  try {
    const res = await fetch(`${apiBase}/api/salaxy_oauth_callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirect_uri: getSuperAdminRedirectUri() }),
    })
    const data = await res.json()
    if (!data.success) throw new Error(data.error ?? 'Authentication failed')
    const user: AuthUser = {
      id: data.user.id,
      type: 'superadmin',
      companyId: 0,
      companySlug: '',
      name: data.user.name,
      email: data.user.email,
      avatarUrl: data.user.avatarUrl ?? undefined,
      uiLanguage: data.user.uiLanguage ?? 'en',
    }
    auth.setAuth(data.token, user)
    router.push({ name: 'superadmin-dashboard' })
  } catch (e) {
    error.value = (e as Error).message
    oauthLoading.value = false
    router.replace({ path: '/admin' })
  }
}

const PIN_MAX = 6

const pin = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const shaking = ref(false)
const announcement = ref('')

// Rate-limit lockout state
type LockoutType = 'cooldown' | 'locked' | null
const lockoutType = ref<LockoutType>(null)
const lockoutSeconds = ref(0)
let lockoutTimer: ReturnType<typeof setInterval> | null = null
let lockoutUntilMs = 0

function getDeviceId(): string {
  const key = `salaxy_device_id_${slug}`
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

function startCooldown(seconds: number) {
  lockoutType.value = 'cooldown'
  lockoutUntilMs = Date.now() + Math.max(0, seconds) * 1000
  lockoutSeconds.value = Math.max(0, seconds)
  if (lockoutTimer) clearInterval(lockoutTimer)
  lockoutTimer = setInterval(() => {
    const remaining = Math.ceil((lockoutUntilMs - Date.now()) / 1000)
    if (remaining <= 0) {
      clearInterval(lockoutTimer!)
      lockoutTimer = null
      lockoutType.value = null
      lockoutSeconds.value = 0
    } else {
      lockoutSeconds.value = remaining
    }
  }, 1000)
}

function formatCountdown(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function formatTime() {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date())
}
function formatDate() {
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())
}
const clockStr = ref(formatTime())
const dateStr = ref(formatDate())
let clockInterval: ReturnType<typeof setInterval> | null = null

const isPinLogin = computed(() => loginType === 'employee' || loginType === 'supervisor')

const loginTypeLabel = computed(() => {
  switch (loginType) {
    case 'employee':   return t('login.role_employee')
    case 'supervisor': return t('login.role_supervisor')
    case 'admin':      return t('login.role_admin')
    case 'superadmin': return t('login.role_superadmin')
    default:           return ''
  }
})

const companyName = computed(() =>
  slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '',
)

onMounted(() => {
  if (slug) {
    const savedLang = localStorage.getItem(`salaxy_ui_lang_${slug}`)
    if (savedLang && savedLang in LANG_NAMES) locale.value = savedLang
  }
  clockInterval = setInterval(() => {
    clockStr.value = formatTime()
    dateStr.value = formatDate()
  }, 30000)
  if (isPinLogin.value) window.addEventListener('keydown', onGlobalKeydown)
  if (loginType === 'superadmin') {
    const code = route.query.code as string | undefined
    if (code) handleOAuthCallback(code)
  }
})

onUnmounted(() => {
  if (clockInterval) clearInterval(clockInterval)
  if (lockoutTimer) clearInterval(lockoutTimer)
  window.removeEventListener('keydown', onGlobalKeydown)
})

function onGlobalKeydown(e: KeyboardEvent) {
  if (/^[0-9]$/.test(e.key)) {
    appendDigit(e.key)
  } else if (e.key === 'Backspace') {
    e.preventDefault()
    popDigit()
  } else if (e.key === 'Escape') {
    clearPin()
  } else if (e.key === 'Enter') {
    submit()
  }
}

function appendDigit(d: string) {
  if (loading.value || lockoutType.value || pin.value.length >= PIN_MAX) return
  pin.value += d
  error.value = ''
  announcement.value = t('login.announce_digits', { count: pin.value.length })
  if (pin.value.length === PIN_MAX) submit()
}

function popDigit() {
  pin.value = pin.value.slice(0, -1)
  error.value = ''
}

function clearPin() {
  pin.value = ''
  error.value = ''
}

function handleKeypadPress(key: string) {
  navigator.vibrate?.(10)
  if (key === 'clear') clearPin()
  else if (key === 'back') popDigit()
  else appendDigit(key)
}

function clearError() {
  error.value = ''
}

function triggerShake() {
  shaking.value = true
  setTimeout(() => { shaking.value = false }, 600)
}

async function submit() {
  if (loading.value) return
  if (isPinLogin.value && pin.value.length === 0) return
  if (!isPinLogin.value && (!email.value || !password.value)) return

  announcement.value = t('login.logging_in')
  error.value = ''
  loading.value = true
  try {
    if (loginType === 'employee') await loginEmployee()
    else if (loginType === 'supervisor') await loginSupervisor()
    else await loginWithPassword()
  } catch (e) {
    error.value = (e as Error).message
    if (isPinLogin.value) {
      triggerShake()
      setTimeout(() => { pin.value = '' }, 300)
      announcement.value = t('login.error_wrong_pin')
    }
  } finally {
    loading.value = false
  }
}

async function loginEmployee() {
  const res = await fetch(`${apiBase}/validate_pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pin.value, slug, device_id: getDeviceId() }),
  })
  const data = await res.json()
  if (data.lockout === 'cooldown') { startCooldown(data.seconds_remaining ?? 300); return }
  if (data.lockout === 'locked')   { lockoutType.value = 'locked'; return }
  if (!data.valid) {
    const msg = data.attempts_remaining === 1
      ? t('login.error_last_attempt')
      : (data.error ?? t('login.error_wrong_pin'))
    throw new Error(msg)
  }

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
  const res = await fetch(`${apiBase}/api/supervisor_login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin: pin.value, slug, device_id: getDeviceId() }),
  })
  const data = await res.json()
  if (data.lockout === 'cooldown') { startCooldown(data.seconds_remaining ?? 300); return }
  if (data.lockout === 'locked')   { lockoutType.value = 'locked'; return }
  if (!data.success) {
    const msg = data.attempts_remaining === 1
      ? t('login.error_last_attempt')
      : (data.error ?? t('login.error_wrong_pin'))
    throw new Error(msg)
  }

  const user: AuthUser = {
    id: data.supervisor.id,
    type: 'supervisor',
    companyId: data.supervisor.company_id ?? 0,
    companySlug: slug,
    companyName: data.company_name ?? '',
    name: `${data.supervisor.first_name} ${data.supervisor.last_name}`,
    uiLanguage: data.ui_language ?? 'en',
  }
  auth.setAuth(data.token, user)
  router.push({ name: 'supervisor-home', params: { slug } })
}

async function loginWithPassword() {
  const res = await fetch(`${apiBase}/api/admin_login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.value, password: password.value, slug }),
  })
  const data = await res.json()
  if (!data.success) throw new Error(data.error ?? 'Invalid credentials')

  const isSuperAdmin = loginType === 'superadmin'
  const user: AuthUser = {
    id: data.admin.id,
    type: isSuperAdmin ? 'superadmin' : 'admin',
    companyId: data.admin.company_id ?? 0,
    companySlug: slug,
    companyName: data.company?.name ?? '',
    name: data.admin.name,
    email: data.admin.email,
    uiLanguage: data.ui_language ?? 'en',
  }
  auth.setAuth(data.token, user)

  if (isSuperAdmin) {
    router.push({ name: 'superadmin-dashboard' })
  } else {
    router.push({ name: 'admin-payroll-summary', params: { slug } })
  }
}
</script>

<template>

  <!-- ── PIN login (employee / supervisor) ──────────────────────────────── -->
  <div v-if="isPinLogin" class="min-h-screen flex flex-col bg-background select-none">

    <!-- Header -->
    <header class="flex-none pt-5 pb-1 px-6 text-center space-y-0.5">
      <img src="/salaxy-logo.png" alt="Salaxy" class="h-8 mx-auto mb-1" />
      <p v-if="companyName" class="text-base font-semibold tracking-tight">{{ companyName }}</p>
      <p class="text-xs text-muted-foreground">{{ loginTypeLabel }}</p>
      <p class="text-xs text-muted-foreground/40 pt-0.5 tabular-nums">{{ clockStr }} &middot; {{ dateStr }}</p>
    </header>

    <!-- Cooldown screen -->
    <div v-if="lockoutType === 'cooldown'" class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-5xl font-mono tabular-nums font-semibold">{{ formatCountdown(lockoutSeconds) }}</p>
      <p class="text-sm text-muted-foreground max-w-xs">{{ t('login.cooldown_message') }}</p>
    </div>

    <!-- Locked screen -->
    <div v-else-if="lockoutType === 'locked'" class="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
      <p class="text-base font-semibold text-destructive">{{ t('login.locked_title') }}</p>
      <p class="text-sm text-muted-foreground max-w-xs">{{ t('login.locked_message') }}</p>
    </div>

    <!-- Normal PIN entry -->
    <template v-else>
      <!-- PIN dots -->
      <div
        class="flex-none flex justify-center gap-4 py-3"
        :class="shaking ? 'shake' : ''"
        aria-hidden="true"
      >
        <span
          v-for="i in PIN_MAX"
          :key="i"
          class="w-3.5 h-3.5 rounded-full border-2 transition-all duration-100"
          :class="i <= pin.length
            ? 'bg-primary border-primary scale-110'
            : 'bg-transparent border-muted-foreground/30'"
        />
      </div>

      <!-- Error / spacer -->
      <div class="flex-none min-h-[1.25rem] text-center px-6">
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
      </div>

      <!-- Keypad -->
      <div class="flex-none flex justify-center px-4 pt-1 pb-3">
        <div class="grid grid-cols-3 gap-2 w-full max-w-[340px]">
          <Button
            v-for="key in ['1','2','3','4','5','6','7','8','9','clear','0','back']"
            :key="key"
            variant="outline"
            class="h-[60px] text-xl font-medium rounded-2xl active:scale-95 transition-transform"
            :disabled="loading"
            @click="handleKeypadPress(key)"
          >
            <span v-if="key === 'back'">⌫</span>
            <span v-else-if="key === 'clear'" class="text-sm font-normal text-muted-foreground">
              {{ t('login.clear') }}
            </span>
            <span v-else>{{ key }}</span>
          </Button>
        </div>
      </div>
    </template>

    <!-- Hidden input: surfaces numeric keyboard on mobile -->
    <input
      type="text"
      inputmode="numeric"
      autocomplete="one-time-code"
      :value="pin"
      maxlength="6"
      class="sr-only"
      aria-hidden="true"
      tabindex="-1"
    />

    <!-- aria-live region for screen readers -->
    <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ announcement }}
    </div>

    <!-- Language selector + footer -->
    <div class="mt-auto flex flex-col items-center gap-1 pb-3 pt-1">
      <select
        :value="locale"
        class="text-xs text-muted-foreground/60 bg-transparent border-0 outline-none cursor-pointer appearance-none px-1"
        @change="applyLang(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="(name, code) in LANG_NAMES" :key="code" :value="code">{{ name }}</option>
      </select>
      <p class="text-xs text-muted-foreground/30">TimeTrackingApp</p>
    </div>

  </div>

  <!-- ── Salaxy OAuth2 login (superadmin) ──────────────────────────────── -->
  <div v-else-if="loginType === 'superadmin'" class="min-h-screen flex items-center justify-center bg-background p-4">
    <div class="w-full max-w-sm space-y-6">

      <div class="text-center space-y-1">
        <img src="/salaxy-logo.png" alt="Salaxy" class="h-10 mx-auto mb-2" />
        <p class="text-sm text-muted-foreground">{{ loginTypeLabel }}</p>
      </div>

      <div v-if="oauthLoading" class="text-center text-sm text-muted-foreground">
        {{ t('login.logging_in') }}…
      </div>
      <template v-else>
        <Button class="w-full" @click="loginWithSalaxyOAuth">
          {{ t('login.sign_in_with_salaxy') }}
        </Button>
        <p v-if="error" class="text-sm text-destructive text-center">{{ error }}</p>
        <form v-if="showPasswordLogin" class="space-y-4 pt-2 border-t" @submit.prevent="submit">
          <div class="space-y-2">
            <Label for="email">{{ t('login.email_label') }}</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              name="email"
              autocomplete="email"
              placeholder="admin@example.com"
              @input="clearError"
            />
          </div>
          <div class="space-y-2">
            <Label for="password">{{ t('login.password_label') }}</Label>
            <Input
              id="password"
              v-model="password"
              type="password"
              name="password"
              autocomplete="current-password"
              placeholder="••••••••"
              @input="clearError"
            />
          </div>
          <Button
            type="submit"
            variant="outline"
            class="w-full"
            :disabled="loading || !email || !password"
          >
            {{ loading ? t('login.logging_in') : t('login.sign_in_button') }}
          </Button>
        </form>
      </template>

      <p class="text-center text-xs text-muted-foreground/30">TimeTrackingApp</p>

    </div>
  </div>

  <!-- ── Password login (company admin) ────────────────────────────────── -->
  <div v-else class="min-h-screen flex items-center justify-center bg-background p-4">
    <div class="w-full max-w-sm space-y-6">

      <div class="text-center space-y-1">
        <img src="/salaxy-logo.png" alt="Salaxy" class="h-10 mx-auto mb-2" />
        <p class="text-sm text-muted-foreground">{{ loginTypeLabel }}</p>
      </div>

      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-2">
          <Label for="email">{{ t('login.email_label') }}</Label>
          <Input
            id="email"
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            placeholder="admin@example.com"
            autofocus
            @input="clearError"
          />
        </div>
        <div class="space-y-2">
          <Label for="password">{{ t('login.password_label') }}</Label>
          <Input
            id="password"
            v-model="password"
            type="password"
            name="password"
            autocomplete="current-password"
            placeholder="••••••••"
            @input="clearError"
          />
        </div>
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <Button
          type="submit"
          class="w-full"
          :disabled="loading || !email || !password"
        >
          {{ loading ? t('login.logging_in') : t('login.sign_in_button') }}
        </Button>
      </form>

      <p class="text-center text-xs text-muted-foreground/30">TimeTrackingApp</p>

    </div>
  </div>

</template>

<style scoped>
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  15%       { transform: translateX(-8px); }
  30%       { transform: translateX(8px); }
  45%       { transform: translateX(-6px); }
  60%       { transform: translateX(6px); }
  75%       { transform: translateX(-3px); }
  90%       { transform: translateX(3px); }
}
.shake { animation: shake 0.6s ease-in-out; }
</style>
