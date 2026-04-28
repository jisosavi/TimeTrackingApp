<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { Search, Plus, ChevronRight } from 'lucide-vue-next'
import CompanySettingsDrawer from '@/components/super-admin/CompanySettingsDrawer.vue'
import { refDebounced, useEventListener } from '@vueuse/core'
import { formatDistanceToNowStrict } from 'date-fns'
import { enUS, fi, sv, et, uk } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import OnOff from '@/components/ui/OnOff.vue'
import { useSuperAdmin, validateSlug } from '@/composables/useSuperAdmin'
import type { Company } from '@/types'
import { useRefresh } from '@/composables/useRefresh'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n({ useScope: 'global' })
const auth = useAuthStore()
const { companies, loading, error, fetchCompanies, createCompany } = useSuperAdmin()
const { refreshTick } = useRefresh()

onMounted(fetchCompanies)
watch(refreshTick, fetchCompanies)

// ── date-fns locale map ───────────────────────────────────────────────────────
const DATE_FNS_LOCALES: Record<string, Locale> = { en: enUS, fi, sv, et, uk }

function relativeTime(ts: string | null | undefined): string {
  if (!ts) return t('super.list.never')
  const locale = DATE_FNS_LOCALES[auth.user?.uiLanguage ?? 'en'] ?? enUS
  return formatDistanceToNowStrict(new Date(ts.replace(' ', 'T')), { addSuffix: true, locale })
}

// ── Filters ───────────────────────────────────────────────────────────────────
const searchRaw        = ref('')
const searchQuery      = refDebounced(searchRaw, 200)
const timeAppFilter    = ref<string>('all')
const supervisorFilter = ref<string>('all')

const timeAppCounts = computed(() => ({
  on:  companies.value.filter(c => c.time_app_enabled).length,
  off: companies.value.filter(c => !c.time_app_enabled).length,
}))
const supervisorCounts = computed(() => ({
  on:  companies.value.filter(c => c.supervisor_ui_enabled).length,
  off: companies.value.filter(c => !c.supervisor_ui_enabled).length,
}))

const filteredCompanies = computed(() => {
  const q  = searchQuery.value.trim().toLowerCase()
  const ta = timeAppFilter.value    || 'all'
  const sv = supervisorFilter.value || 'all'

  return companies.value
    .filter(c => {
      if (q) {
        const hay = `${c.name} ${c.slug} ${c.business_id ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (ta === 'on'  && !c.time_app_enabled)    return false
      if (ta === 'off' &&  c.time_app_enabled)    return false
      if (sv === 'on'  && !c.supervisor_ui_enabled) return false
      if (sv === 'off' &&  c.supervisor_ui_enabled) return false
      return true
    })
    .sort((a, b) => {
      // last activity desc; nulls last
      if (!a.last_activity_at && !b.last_activity_at) return 0
      if (!a.last_activity_at) return 1
      if (!b.last_activity_at) return -1
      return b.last_activity_at.localeCompare(a.last_activity_at)
    })
})

// ⌘K / Ctrl+K → focus search
const searchInputRef = ref<InstanceType<typeof Input> | null>(null)
useEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    ;(searchInputRef.value?.$el as HTMLInputElement | undefined)?.focus()
  }
})

// ── Segmented filter keyboard nav ─────────────────────────────────────────────
const SEGMENT_OPTS = ['all', 'on', 'off'] as const

function makeSegmentHandler(filter: Ref<string>) {
  return (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const idx = SEGMENT_OPTS.indexOf(filter.value as typeof SEGMENT_OPTS[number])
    filter.value = e.key === 'ArrowRight'
      ? SEGMENT_OPTS[(idx + 1) % SEGMENT_OPTS.length]!
      : SEGMENT_OPTS[(idx - 1 + SEGMENT_OPTS.length) % SEGMENT_OPTS.length]!
    nextTick(() => {
      const btn = (e.currentTarget as HTMLElement).querySelector<HTMLButtonElement>(`[data-value="${filter.value}"]`)
      btn?.focus()
    })
  }
}

const onTimeAppKey      = makeSegmentHandler(timeAppFilter)
const onSupervisorKey   = makeSegmentHandler(supervisorFilter)

// ── Drawer ────────────────────────────────────────────────────────────────────
const drawerOpen    = ref(false)
const drawerCompany = ref<Company | null>(null)

function openDrawer(company: Company) {
  drawerCompany.value = company
  drawerOpen.value    = true
}

function onDrawerSaved(updated: Company) {
  const idx = companies.value.findIndex(c => c.id === updated.id)
  if (idx >= 0) companies.value[idx] = { ...companies.value[idx]!, ...updated }
}

function onDrawerDeleted(companyId: number) {
  companies.value = companies.value.filter(c => c.id !== companyId)
  drawerOpen.value = false
}

// ── Create form ───────────────────────────────────────────────────────────────
const showCreateForm = ref(false)
const createForm = ref({ name: '', slug: '', email: '', password: '' })
const createError = ref<string | null>(null)
const creating = ref(false)

const createSlugError = computed(() => validateSlug(createForm.value.slug))

function openCreateForm() {
  createForm.value = { name: '', slug: '', email: '', password: '' }
  createError.value = null
  showCreateForm.value = true
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function onCreateNameInput() {
  if (!createForm.value.slug) {
    createForm.value.slug = slugify(createForm.value.name)
  }
}

async function submitCreate() {
  const slugErr = validateSlug(createForm.value.slug)
  if (slugErr) { createError.value = slugErr; return }
  if (!createForm.value.name.trim()) { createError.value = 'Company name is required'; return }
  if (!createForm.value.email.trim()) { createError.value = 'Admin email is required'; return }
  if (createForm.value.password.length < 6) { createError.value = 'Password must be at least 6 characters'; return }

  creating.value = true
  createError.value = null
  try {
    await createCompany({
      name: createForm.value.name.trim(),
      slug: createForm.value.slug.trim(),
      email: createForm.value.email.trim(),
      password: createForm.value.password,
    })
    showCreateForm.value = false
  } catch (e) {
    createError.value = e instanceof Error ? e.message : 'Create failed'
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="space-y-3">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <!-- Avatar -->
        <img
          v-if="auth.user?.avatarUrl"
          :src="auth.user.avatarUrl"
          :alt="auth.user.name"
          class="size-9 rounded-full object-cover shrink-0"
        />
        <div
          v-else
          class="size-9 rounded-full bg-muted flex items-center justify-center text-[13px] font-semibold text-muted-foreground shrink-0"
        >
          {{ (auth.user?.name || auth.user?.email || '?').charAt(0).toUpperCase() }}
        </div>
        <div>
          <h2 class="text-lg font-semibold">{{ t('super.title') }}</h2>
          <p class="text-sm text-muted-foreground">
            {{ companies.length }} {{ companies.length === 1 ? t('super.list.company_singular') : t('super.list.company_plural') }}
            <span class="mx-1.5 text-muted-foreground/40">·</span>
            {{ auth.user?.email || auth.user?.name }}
          </p>
        </div>
      </div>
      <Button variant="indigoSoft" size="default" @click="openCreateForm">
        <Plus class="size-[13px]" />{{ t('super.list.actions.newCompany') }}
      </Button>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <!-- Filter bar -->
    <div class="flex items-end gap-6 flex-wrap">

      <!-- Search -->
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref="searchInputRef"
          v-model="searchRaw"
          class="pl-8 h-9 w-[280px] text-sm pr-10"
          :placeholder="t('super.filters.search_placeholder')"
        />
        <kbd class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
          <span class="text-xs">⌘</span>K
        </kbd>
      </div>

      <!-- Time App segmented control -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-semibold text-muted-foreground leading-none">{{ t('super.filters.time_app_label') }}</span>
        <div
          role="radiogroup"
          :aria-label="t('super.filters.time_app_label')"
          class="flex bg-[#F8F7F4] border border-[#E6E5E1] rounded-[9px] p-[3px]"
          @keydown="onTimeAppKey"
        >
          <button
            v-for="opt in [
              { value: 'all', label: t('super.filters.all') },
              { value: 'on',  label: t('super.filters.on'),  count: timeAppCounts.on },
              { value: 'off', label: t('super.filters.off'), count: timeAppCounts.off },
            ]"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="timeAppFilter === opt.value"
            :tabindex="timeAppFilter === opt.value ? 0 : -1"
            :data-value="opt.value"
            class="inline-flex items-center gap-[5px] py-[5px] px-[11px] rounded-[6px] text-xs font-semibold border-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3C1EEB] focus-visible:ring-offset-1"
            :class="timeAppFilter === opt.value
              ? 'bg-white text-foreground shadow-[0_1px_2px_rgba(40,50,55,0.08),0_0_0_1px_rgba(40,50,55,0.06)]'
              : 'bg-transparent text-muted-foreground hover:text-foreground'"
            @click="timeAppFilter = opt.value"
          >
            {{ opt.label }}
            <span
              v-if="opt.count !== undefined"
              class="tabular-nums font-medium"
              :class="timeAppFilter === opt.value ? 'text-muted-foreground' : 'text-muted-foreground/60'"
            >{{ opt.count }}</span>
          </button>
        </div>
      </div>

      <!-- Supervisor UI segmented control -->
      <div class="flex flex-col gap-1.5">
        <span class="text-xs font-semibold text-muted-foreground leading-none">{{ t('super.filters.supervisor_label') }}</span>
        <div
          role="radiogroup"
          :aria-label="t('super.filters.supervisor_label')"
          class="flex bg-[#F8F7F4] border border-[#E6E5E1] rounded-[9px] p-[3px]"
          @keydown="onSupervisorKey"
        >
          <button
            v-for="opt in [
              { value: 'all', label: t('super.filters.all') },
              { value: 'on',  label: t('super.filters.on'),  count: supervisorCounts.on },
              { value: 'off', label: t('super.filters.off'), count: supervisorCounts.off },
            ]"
            :key="opt.value"
            type="button"
            role="radio"
            :aria-checked="supervisorFilter === opt.value"
            :tabindex="supervisorFilter === opt.value ? 0 : -1"
            :data-value="opt.value"
            class="inline-flex items-center gap-[5px] py-[5px] px-[11px] rounded-[6px] text-xs font-semibold border-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3C1EEB] focus-visible:ring-offset-1"
            :class="supervisorFilter === opt.value
              ? 'bg-white text-foreground shadow-[0_1px_2px_rgba(40,50,55,0.08),0_0_0_1px_rgba(40,50,55,0.06)]'
              : 'bg-transparent text-muted-foreground hover:text-foreground'"
            @click="supervisorFilter = opt.value"
          >
            {{ opt.label }}
            <span
              v-if="opt.count !== undefined"
              class="tabular-nums font-medium"
              :class="supervisorFilter === opt.value ? 'text-muted-foreground' : 'text-muted-foreground/60'"
            >{{ opt.count }}</span>
          </button>
        </div>
      </div>

    </div>

    <!-- Create form -->
    <form v-if="showCreateForm" class="rounded-lg border p-4 space-y-4 bg-muted/40" @submit.prevent="submitCreate">
      <p class="text-sm font-semibold">{{ t('super.list.new_company') }}</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="space-y-1">
          <Label class="text-xs">Company Name</Label>
          <Input v-model="createForm.name" placeholder="Acme Oy" @input="onCreateNameInput" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">URL Slug</Label>
          <Input v-model="createForm.slug" placeholder="acme-oy" />
          <p v-if="createSlugError && createForm.slug" class="text-xs text-destructive">{{ createSlugError }}</p>
          <p v-else-if="createForm.slug.trim()" class="text-xs text-muted-foreground font-mono">
            /{{ createForm.slug.trim() }} &nbsp;·&nbsp;
            /{{ createForm.slug.trim() }}/admin &nbsp;·&nbsp;
            /{{ createForm.slug.trim() }}/approval
          </p>
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Admin Email</Label>
          <Input v-model="createForm.email" type="email" placeholder="admin@company.fi" />
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Admin Password</Label>
          <Input v-model="createForm.password" type="password" placeholder="Min 6 characters" />
        </div>
      </div>
      <p v-if="createError" class="text-xs text-destructive">{{ createError }}</p>
      <div class="flex gap-2">
        <Button type="submit" size="sm" :disabled="creating">
          {{ creating ? 'Creating…' : 'Create Company' }}
        </Button>
        <Button type="button" size="sm" variant="ghost" @click="showCreateForm = false">Cancel</Button>
      </div>
    </form>

    <!-- Company table -->
    <div class="rounded-lg border overflow-x-auto">
      <Table class="min-w-max w-full">
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="h-8 px-3 text-xs">{{ t('super.list.col_company') }}</TableHead>
            <TableHead class="h-8 px-3 text-xs">{{ t('super.list.col_salaxy_id') }}</TableHead>
            <TableHead class="h-8 px-3 text-xs text-right">{{ t('super.list.col_emp') }}</TableHead>
            <TableHead class="h-8 px-3 text-xs">{{ t('super.list.col_time_app') }}</TableHead>
            <TableHead class="h-8 px-3 text-xs">{{ t('super.list.col_supervisor_ui') }}</TableHead>
            <TableHead class="h-8 px-3 text-xs">{{ t('super.list.col_last_activity') }}</TableHead>
            <TableHead class="h-8 px-3 w-10"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>

          <TableRow v-if="loading">
            <TableCell colspan="7" class="py-6 text-center text-sm text-muted-foreground">
              {{ t('common.loading') }}
            </TableCell>
          </TableRow>

          <TableRow v-else-if="filteredCompanies.length === 0">
            <TableCell colspan="7" class="py-6 text-center text-sm text-muted-foreground">
              <template v-if="searchQuery.trim()">
                {{ t('super.filters.no_match', { query: searchQuery.trim() }) }}
              </template>
              <template v-else>
                {{ t('super.list.no_companies') }}
              </template>
            </TableCell>
          </TableRow>

          <TableRow
            v-for="company in filteredCompanies"
            v-else
            :key="company.id"
          >
            <TableCell class="px-3 py-1.5">
              <p class="text-sm font-medium leading-none">{{ company.name }}</p>
              <p class="text-[11px] font-mono text-indigo-500 mt-0.5">/{{ company.slug }}</p>
            </TableCell>

            <TableCell class="px-3 py-1.5 font-mono text-xs text-muted-foreground">
              {{ company.business_id || '—' }}
            </TableCell>

            <TableCell class="px-3 py-1.5 text-right tabular-nums text-sm text-muted-foreground">
              {{ company.employee_count }}
            </TableCell>

            <TableCell class="px-3 py-1.5">
              <OnOff :value="!!company.time_app_enabled" color="green" />
            </TableCell>

            <TableCell class="px-3 py-1.5">
              <OnOff :value="!!company.supervisor_ui_enabled" color="green" />
            </TableCell>

            <TableCell class="px-3 py-1.5 text-xs text-muted-foreground">
              {{ relativeTime(company.last_activity_at) }}
            </TableCell>

            <TableCell class="px-3 py-1.5">
              <Button
                variant="indigoSoft"
                size="sm"
                @click="openDrawer(company)"
              >{{ t('super.list.actions.settings') }}<ChevronRight class="size-3" /></Button>
            </TableCell>
          </TableRow>

        </TableBody>
      </Table>
    </div>

  </div>

  <CompanySettingsDrawer
    :open="drawerOpen"
    :company="drawerCompany"
    @close="drawerOpen = false"
    @saved="onDrawerSaved"
    @deleted="onDrawerDeleted"
  />
</template>
