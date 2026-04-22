<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { Building2 } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import EmptyState from '@/components/ui/EmptyState.vue'
import { useSuperAdmin, validateSlug } from '@/composables/useSuperAdmin'
import { useRefresh } from '@/composables/useRefresh'

const { t } = useI18n({ useScope: 'global' })

const { companies, loading, error, fetchCompanies, createCompany, updateCompany, fetchBusinessId } = useSuperAdmin()
const { refreshTick } = useRefresh()

onMounted(fetchCompanies)
watch(refreshTick, fetchCompanies)

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

// ── Edit form ─────────────────────────────────────────────────────────────────
const editingId = ref<number | null>(null)
const editForm = ref({ name: '', slug: '', business_id: '' })
const editError = ref<string | null>(null)
const saving = ref(false)
const fetchingBid = ref(false)

const editSlugError = computed(() => editForm.value.slug ? validateSlug(editForm.value.slug) : null)

function openEdit(id: number) {
  const c = companies.value.find(c => c.id === id)
  if (!c) return
  editingId.value = id
  editForm.value = { name: c.name, slug: c.slug, business_id: c.business_id ?? '' }
  editError.value = null
  showCreateForm.value = false
}

function cancelEdit() {
  editingId.value = null
  editError.value = null
}

async function autoFetchBusinessId() {
  if (!editingId.value) return
  fetchingBid.value = true
  editError.value = null
  try {
    const bid = await fetchBusinessId(editingId.value)
    editForm.value.business_id = bid
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Could not fetch Business ID'
  } finally {
    fetchingBid.value = false
  }
}

async function submitEdit() {
  if (!editForm.value.name.trim()) { editError.value = 'Name is required'; return }
  const slugErr = validateSlug(editForm.value.slug)
  if (slugErr) { editError.value = slugErr; return }

  saving.value = true
  editError.value = null
  try {
    await updateCompany(editingId.value!, {
      name: editForm.value.name.trim(),
      slug: editForm.value.slug.trim(),
      business_id: editForm.value.business_id.trim() || null,
    })
    cancelEdit()
  } catch (e) {
    editError.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    saving.value = false
  }
}

async function toggleActive(id: number, currentActive: number) {
  try {
    await updateCompany(id, { active: currentActive ? 0 : 1 })
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Update failed')
  }
}

async function toggleApprovals(id: number, currentValue: number) {
  try {
    await updateCompany(id, { approvals_enabled: currentValue ? 0 : 1 })
  } catch (e) {
    alert(e instanceof Error ? e.message : 'Update failed')
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">Super Admin</h2>
        <p class="text-sm text-muted-foreground">{{ companies.length }} {{ companies.length === 1 ? 'company' : 'companies' }}</p>
      </div>
      <div class="flex gap-2">
        <Button size="sm" @click="openCreateForm">+ New Company</Button>
      </div>
    </div>

    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <!-- ── Create form ── -->
    <div v-if="showCreateForm" class="rounded-lg border p-4 space-y-4 bg-muted/40">
      <p class="text-sm font-semibold">New Company</p>

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
        <Button size="sm" :disabled="creating" @click="submitCreate">
          {{ creating ? 'Creating…' : 'Create Company' }}
        </Button>
        <Button size="sm" variant="ghost" @click="showCreateForm = false">Cancel</Button>
      </div>
    </div>

    <!-- ── Company list ── -->
    <div
      v-for="company in companies"
      :key="company.id"
      class="rounded-lg border p-4 space-y-3 bg-card"
    >
      <div class="flex items-start justify-between gap-2">
        <div class="space-y-0.5 min-w-0">
          <p class="font-medium text-sm">{{ company.name }}</p>
          <p class="text-xs text-muted-foreground font-mono">/{{ company.slug }}</p>
          <p v-if="company.business_id" class="text-xs text-muted-foreground font-mono">
            Business ID: {{ company.business_id }}
          </p>
          <p v-else class="text-xs text-muted-foreground italic">No Business ID set</p>
        </div>
        <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          <Badge variant="secondary" class="text-[10px]">{{ company.employee_count }} emp</Badge>
          <Badge
            :variant="company.active ? 'default' : 'outline'"
            class="cursor-pointer text-[10px]"
            @click="toggleActive(company.id, company.active)"
          >
            {{ company.active ? 'Active' : 'Inactive' }}
          </Badge>
          <Badge
            :variant="company.approvals_enabled ? 'default' : 'secondary'"
            class="cursor-pointer text-[10px]"
            @click="toggleApprovals(company.id, company.approvals_enabled)"
          >
            {{ company.approvals_enabled ? 'Supervisor approvals: on' : 'Supervisor approvals: off' }}
          </Badge>
        </div>
      </div>

      <!-- URL preview (always shown, clickable) -->
      <div class="text-xs font-mono space-y-0.5">
        <p>
          <span class="text-muted-foreground">Employee: </span>
          <RouterLink :to="`/${company.slug}`" target="_blank" class="text-primary hover:underline">/{{ company.slug }}</RouterLink>
        </p>
        <p>
          <span class="text-muted-foreground">Admin: </span>
          <RouterLink :to="`/${company.slug}/admin`" target="_blank" class="text-primary hover:underline">/{{ company.slug }}/admin</RouterLink>
        </p>
        <p>
          <span class="text-muted-foreground">Approvals: </span>
          <RouterLink :to="`/${company.slug}/approval`" target="_blank" class="text-primary hover:underline">/{{ company.slug }}/approval</RouterLink>
        </p>
      </div>

      <Button variant="outline" size="sm" class="h-7 text-xs" @click="openEdit(company.id)">
        Edit
      </Button>

      <!-- Inline edit form -->
      <div v-if="editingId === company.id" class="space-y-3 pt-1 border-t">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="space-y-1">
            <Label class="text-xs">Company Name</Label>
            <Input v-model="editForm.name" />
          </div>
          <div class="space-y-1">
            <Label class="text-xs">URL Slug</Label>
            <Input v-model="editForm.slug" />
            <p v-if="editSlugError" class="text-xs text-destructive">{{ editSlugError }}</p>
            <p v-else-if="editForm.slug.trim()" class="text-xs text-muted-foreground font-mono">
              /{{ editForm.slug.trim() }}
            </p>
          </div>
          <div class="space-y-1 sm:col-span-2">
            <Label class="text-xs">Business ID (Y-tunnus)</Label>
            <div class="flex gap-2">
              <Input v-model="editForm.business_id" placeholder="e.g. 1234567-8" class="font-mono text-xs" />
              <Button
                size="sm"
                variant="outline"
                class="shrink-0 text-xs"
                :disabled="fetchingBid"
                @click="autoFetchBusinessId"
              >
                {{ fetchingBid ? 'Fetching…' : 'Fetch from Salaxy' }}
              </Button>
            </div>
          </div>
        </div>
        <p v-if="editError" class="text-xs text-destructive">{{ editError }}</p>
        <div class="flex gap-2">
          <Button size="sm" :disabled="saving" @click="submitEdit">
            {{ saving ? 'Saving…' : 'Save' }}
          </Button>
          <Button size="sm" variant="ghost" @click="cancelEdit">Cancel</Button>
        </div>
      </div>
    </div>

    <EmptyState
      v-if="!loading && companies.length === 0"
      :title="t('empty.companies')"
      :body="t('empty.companies_body')"
    >
      <Building2 class="size-10" />
    </EmptyState>
  </div>
</template>
