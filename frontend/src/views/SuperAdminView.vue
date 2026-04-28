<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Settings, Search } from 'lucide-vue-next'
import { refDebounced, useEventListener } from '@vueuse/core'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSuperAdmin, validateSlug } from '@/composables/useSuperAdmin'
import { useRefresh } from '@/composables/useRefresh'

const { t } = useI18n({ useScope: 'global' })
const { companies, loading, error, fetchCompanies, createCompany } = useSuperAdmin()
const { refreshTick } = useRefresh()

onMounted(fetchCompanies)
watch(refreshTick, fetchCompanies)

// ── Filters ───────────────────────────────────────────────────────────────────
const searchRaw       = ref('')
const searchQuery     = refDebounced(searchRaw, 200)
const timeAppFilter   = ref<string>('all')
const supervisorFilter = ref<string>('all')

// Counts for the ToggleGroup labels — over the full unfiltered list
const timeAppCounts = computed(() => ({
  on:  companies.value.filter(c => c.active).length,
  off: companies.value.filter(c => !c.active).length,
}))
const supervisorCounts = computed(() => ({
  on:  companies.value.filter(c => c.approvals_enabled).length,
  off: companies.value.filter(c => !c.approvals_enabled).length,
}))

const filteredCompanies = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  const ta = timeAppFilter.value || 'all'
  const sv = supervisorFilter.value || 'all'

  return companies.value.filter(c => {
    if (q) {
      const haystack = `${c.name} ${c.slug} ${c.business_id ?? ''}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (ta === 'on'  && !c.active) return false
    if (ta === 'off' &&  c.active) return false
    if (sv === 'on'  && !c.approvals_enabled) return false
    if (sv === 'off' &&  c.approvals_enabled) return false
    return true
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
      <div>
        <h2 class="text-lg font-semibold">{{ t('super.title') }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ companies.length }} {{ companies.length === 1 ? t('super.list.company_singular') : t('super.list.company_plural') }}
        </p>
      </div>
      <Button size="sm" @click="openCreateForm">+ {{ t('super.list.new_company') }}</Button>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <!-- Filter bar -->
    <div class="flex items-center gap-3 flex-wrap">

      <!-- Search -->
      <div class="relative">
        <Search class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref="searchInputRef"
          v-model="searchRaw"
          class="pl-8 h-8 w-56 text-sm pr-10"
          :placeholder="t('super.filters.search_placeholder')"
        />
        <kbd class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:flex">
          <span class="text-xs">⌘</span>K
        </kbd>
      </div>

      <!-- Time App filter -->
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-muted-foreground shrink-0">{{ t('super.filters.time_app_label') }}</span>
        <ToggleGroup v-model="timeAppFilter" type="single" variant="outline" size="sm">
          <ToggleGroupItem value="all" class="h-7 px-2 text-xs">{{ t('super.filters.all') }}</ToggleGroupItem>
          <ToggleGroupItem value="on" class="h-7 px-2 text-xs">{{ t('super.filters.on') }} ({{ timeAppCounts.on }})</ToggleGroupItem>
          <ToggleGroupItem value="off" class="h-7 px-2 text-xs">{{ t('super.filters.off') }} ({{ timeAppCounts.off }})</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <!-- Supervisor UI filter -->
      <div class="flex items-center gap-1.5">
        <span class="text-xs text-muted-foreground shrink-0">{{ t('super.filters.supervisor_label') }}</span>
        <ToggleGroup v-model="supervisorFilter" type="single" variant="outline" size="sm">
          <ToggleGroupItem value="all" class="h-7 px-2 text-xs">{{ t('super.filters.all') }}</ToggleGroupItem>
          <ToggleGroupItem value="on" class="h-7 px-2 text-xs">{{ t('super.filters.on') }} ({{ supervisorCounts.on }})</ToggleGroupItem>
          <ToggleGroupItem value="off" class="h-7 px-2 text-xs">{{ t('super.filters.off') }} ({{ supervisorCounts.off }})</ToggleGroupItem>
        </ToggleGroup>
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
            class="group"
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

            <!-- Time App status (placeholder dot — will become a toggle with confirm) -->
            <TableCell class="px-3 py-1.5">
              <span
                :class="company.active ? 'bg-green-500' : 'bg-muted-foreground/30'"
                class="inline-block size-2 rounded-full"
                :title="company.active ? 'Active' : 'Inactive'"
              />
            </TableCell>

            <!-- Supervisor UI status (placeholder dot — will become a toggle with confirm) -->
            <TableCell class="px-3 py-1.5">
              <span
                :class="company.approvals_enabled ? 'bg-green-500' : 'bg-muted-foreground/30'"
                class="inline-block size-2 rounded-full"
                :title="company.approvals_enabled ? 'On' : 'Off'"
              />
            </TableCell>

            <TableCell class="px-3 py-1.5 text-xs text-muted-foreground">
              —
            </TableCell>

            <TableCell class="px-3 py-1.5">
              <Button
                size="sm"
                variant="ghost"
                class="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Settings class="size-3.5" />
              </Button>
            </TableCell>
          </TableRow>

        </TableBody>
      </Table>
    </div>

  </div>
</template>
