<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ChevronRight } from 'lucide-vue-next'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'vue-sonner'
import FeatureToggleCard from './FeatureToggleCard.vue'
import { useApi } from '@/composables/useApi'
import type { Company } from '@/types'

const props = defineProps<{
  open: boolean
  company: Company | null
}>()

const emit = defineEmits<{
  close: []
  saved: [company: Company]
}>()

const { t } = useI18n({ useScope: 'global' })
const { apiFetch } = useApi()

// ── Tab ───────────────────────────────────────────────────────────────────────
const activeTab = ref('general')

// ── General form ──────────────────────────────────────────────────────────────
const generalForm    = reactive({ name: '', slug: '' })
const generalInitial = ref({ name: '', slug: '' })

// ── Salaxy form ───────────────────────────────────────────────────────────────
const salaxyForm    = reactive({ business_id: '', salaxy_api_url: '', salaxy_username: '', salaxy_password: '' })
const salaxyInitial = ref({ business_id: '', salaxy_api_url: '', salaxy_username: '' })
const fetchingId    = ref(false)
const fetchedId     = ref<string | null>(null)
const fetchIdError  = ref<string | null>(null)

// ── Admins ────────────────────────────────────────────────────────────────────
interface Admin { id: number; email: string; name: string | null; role: string; active: number }
const admins        = ref<Admin[]>([])
const adminsLoaded  = ref(false)
const adminsLoading = ref(false)
const adminsError   = ref<string | null>(null)
const showAddAdmin  = ref(false)
const addForm       = reactive({ email: '', password: '' })
const addError      = ref<string | null>(null)
const addSaving     = ref(false)
const editingPwFor  = ref<number | null>(null)
const editPw        = ref('')
const editPwError   = ref<string | null>(null)
const editPwSaving  = ref(false)

// ── Features ──────────────────────────────────────────────────────────────────
const features = reactive<{ time_app_enabled: 0|1; supervisor_ui_enabled: 0|1 }>({
  time_app_enabled: 1, supervisor_ui_enabled: 1,
})
const featureSaving = ref<'time_app_enabled' | 'supervisor_ui_enabled' | null>(null)

// ── Saving / debug ────────────────────────────────────────────────────────────
const saving    = ref(false)
const saveError = ref<string | null>(null)
const debugOpen = ref(false)
const copiedKey = ref<string | null>(null)

// ── Reset when company changes ────────────────────────────────────────────────
watch(
  () => props.company,
  (c) => {
    activeTab.value = 'general'
    saveError.value = null
    debugOpen.value = false
    admins.value    = []
    adminsLoaded.value = false
    showAddAdmin.value = false
    editingPwFor.value = null
    fetchedId.value    = null
    fetchIdError.value = null

    if (c) {
      generalForm.name  = c.name
      generalForm.slug  = c.slug
      generalInitial.value = { name: c.name, slug: c.slug }

      features.time_app_enabled     = (c.time_app_enabled     ? 1 : 0) as 0|1
      features.supervisor_ui_enabled = (c.supervisor_ui_enabled ? 1 : 0) as 0|1

      salaxyForm.business_id     = c.business_id ?? ''
      salaxyForm.salaxy_api_url  = c.salaxy_api_url ?? ''
      salaxyForm.salaxy_username = c.salaxy_username ?? ''
      salaxyForm.salaxy_password = ''
      salaxyInitial.value = {
        business_id:    c.business_id ?? '',
        salaxy_api_url:  c.salaxy_api_url ?? '',
        salaxy_username: c.salaxy_username ?? '',
      }
    }
  },
  { immediate: true },
)

watch(activeTab, (tab) => {
  if (tab === 'admins' && props.company && !adminsLoaded.value && !adminsLoading.value) {
    fetchAdmins()
  }
})

// ── Validation ────────────────────────────────────────────────────────────────
function slugError(s: string): string | null {
  if (s.length < 2)  return t('super.drawer.slug_min')
  if (s.length > 40) return t('super.drawer.slug_max')
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/.test(s)) return t('super.drawer.slug_chars')
  return null
}

const slugErr        = computed(() => slugError(generalForm.slug))
const nameErr        = computed(() => generalForm.name.trim() === '' ? t('super.drawer.name_required') : null)
const isGeneralDirty = computed(() => generalForm.name !== generalInitial.value.name || generalForm.slug !== generalInitial.value.slug)
const isGeneralValid = computed(() => !nameErr.value && !slugErr.value)

const isSalaxyDirty = computed(() =>
  salaxyForm.business_id     !== salaxyInitial.value.business_id    ||
  salaxyForm.salaxy_api_url  !== salaxyInitial.value.salaxy_api_url ||
  salaxyForm.salaxy_username !== salaxyInitial.value.salaxy_username ||
  salaxyForm.salaxy_password !== '',
)

const isAnyDirty = computed(() => isGeneralDirty.value || isSalaxyDirty.value)

const isSaveable = computed(() => {
  if (activeTab.value === 'general') return isGeneralDirty.value && isGeneralValid.value
  if (activeTab.value === 'salaxy')  return isSalaxyDirty.value
  return false
})

const showFooterSave = computed(() => activeTab.value === 'general' || activeTab.value === 'salaxy')

// ── Debug links ───────────────────────────────────────────────────────────────
const debugLinks = computed(() => {
  const slug = props.company?.slug ?? ''
  return [
    { key: 'l0', path: `/${slug}` },
    { key: 'l1', path: `/${slug}/admin` },
    { key: 'l2', path: `/${slug}/approval` },
  ]
})

// ── Close ─────────────────────────────────────────────────────────────────────
function requestClose() {
  if (isAnyDirty.value && !confirm(t('super.drawer.discard_confirm'))) return
  emit('close')
}

function handleSheetOpenChange(val: boolean) {
  if (!val) requestClose()
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  if (!props.company) return
  saving.value    = true
  saveError.value = null
  try {
    const body: Record<string, unknown> = { id: props.company.id }
    if (activeTab.value === 'general') {
      body.name = generalForm.name.trim()
      body.slug = generalForm.slug.trim()
    } else {
      body.business_id    = salaxyForm.business_id.trim()
      body.salaxy_api_url = salaxyForm.salaxy_api_url.trim()
      body.salaxy_username = salaxyForm.salaxy_username.trim()
      if (salaxyForm.salaxy_password !== '') body.salaxy_password = salaxyForm.salaxy_password
    }
    const res = await apiFetch<{ success: boolean; company: Company }>(
      '/api/super_admin/update_company.php',
      { method: 'PATCH', body: JSON.stringify(body) },
    )
    if (activeTab.value === 'general') {
      generalInitial.value = { name: generalForm.name.trim(), slug: generalForm.slug.trim() }
    } else {
      salaxyInitial.value = {
        business_id:    salaxyForm.business_id.trim(),
        salaxy_api_url:  salaxyForm.salaxy_api_url.trim(),
        salaxy_username: salaxyForm.salaxy_username.trim(),
      }
      salaxyForm.salaxy_password = ''
    }
    emit('saved', res.company)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('common.save_failed')
  } finally {
    saving.value = false
  }
}

// ── Fetch Salaxy ID ───────────────────────────────────────────────────────────
async function fetchSalaxyId() {
  if (!props.company) return
  fetchingId.value  = true
  fetchedId.value   = null
  fetchIdError.value = null
  try {
    const res = await apiFetch<{ success: boolean; business_id: string }>(
      `/api/fetch_business_id.php?company_id=${props.company.id}`,
    )
    fetchedId.value = res.business_id
    salaxyForm.business_id = res.business_id
  } catch (e) {
    fetchIdError.value = e instanceof Error ? e.message : 'Fetch failed'
  } finally {
    fetchingId.value = false
  }
}

// ── Admins CRUD ───────────────────────────────────────────────────────────────
async function fetchAdmins() {
  if (!props.company) return
  adminsLoading.value = true
  adminsError.value   = null
  try {
    const res = await apiFetch<{ success: boolean; admins: Admin[] }>(
      `/api/company_admins.php?company_id=${props.company.id}`,
    )
    admins.value = res.admins
    adminsLoaded.value = true
  } catch (e) {
    adminsError.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    adminsLoading.value = false
  }
}

async function addAdmin() {
  if (!props.company) return
  addError.value = null
  if (!addForm.email.trim()) { addError.value = 'Email required'; return }
  if (addForm.password.length < 6) { addError.value = t('super.drawer.admin_pw_hint'); return }
  addSaving.value = true
  try {
    const res = await apiFetch<{ success: boolean; admin: Admin }>(
      '/api/company_admins.php',
      {
        method: 'POST',
        body: JSON.stringify({
          company_id: props.company.id,
          email: addForm.email.trim(),
          name: '',
          password: addForm.password,
        }),
      },
    )
    admins.value.push(res.admin)
    addForm.email    = ''
    addForm.password = ''
    showAddAdmin.value = false
  } catch (e) {
    addError.value = e instanceof Error ? e.message : 'Failed to add'
  } finally {
    addSaving.value = false
  }
}

function toggleEditPw(id: number) {
  if (editingPwFor.value === id) {
    editingPwFor.value = null
    editPw.value       = ''
    editPwError.value  = null
  } else {
    editingPwFor.value = id
    editPw.value       = ''
    editPwError.value  = null
  }
}

async function setAdminPassword(admin: Admin) {
  if (!props.company) return
  if (editPw.value.length < 6) { editPwError.value = t('super.drawer.admin_pw_hint'); return }
  editPwSaving.value = true
  editPwError.value  = null
  try {
    await apiFetch('/api/company_admins.php', {
      method: 'POST',
      body: JSON.stringify({
        company_id: props.company.id,
        id: admin.id,
        email: admin.email,
        name: admin.name ?? '',
        password: editPw.value,
      }),
    })
    editingPwFor.value = null
    editPw.value = ''
  } catch (e) {
    editPwError.value = e instanceof Error ? e.message : 'Failed'
  } finally {
    editPwSaving.value = false
  }
}

async function removeAdmin(admin: Admin) {
  if (!props.company) return
  if (!confirm(t('super.drawer.admin_remove_confirm', { email: admin.email, name: props.company.name }))) return
  try {
    await apiFetch('/api/company_admins.php', {
      method: 'DELETE',
      body: JSON.stringify({ company_id: props.company.id, id: admin.id }),
    })
    admins.value = admins.value.filter(a => a.id !== admin.id)
  } catch (e) {
    adminsError.value = e instanceof Error ? e.message : 'Failed to remove'
  }
}

// ── Feature toggles ───────────────────────────────────────────────────────────
function onToggleFeature(feature: 'time_app_enabled' | 'supervisor_ui_enabled', newValue: boolean) {
  if (!props.company || featureSaving.value !== null) return
  void applyFeatureToggle(feature, newValue)
}

async function applyFeatureToggle(feature: 'time_app_enabled' | 'supervisor_ui_enabled', newEnabled: boolean) {
  if (!props.company) return
  const prev = features[feature]
  const enabled = newEnabled ? 1 as const : 0 as const
  features[feature] = enabled
  featureSaving.value = feature
  emit('saved', { ...props.company, [feature]: enabled } as Company)
  try {
    const res = await apiFetch<{ success: boolean; company: Company }>(
      '/api/super_admin/set_feature.php',
      { method: 'POST', body: JSON.stringify({ company_id: props.company.id, feature, enabled }) },
    )
    emit('saved', res.company)
  } catch (e) {
    features[feature] = prev
    emit('saved', { ...props.company, [feature]: prev } as Company)
    toast.error(e instanceof Error ? e.message : t('common.save_failed'))
  } finally {
    featureSaving.value = null
  }
}

// ── Copy to clipboard ─────────────────────────────────────────────────────────
function copyText(key: string, text: string) {
  navigator.clipboard.writeText(text)
  copiedKey.value = key
  setTimeout(() => { copiedKey.value = null }, 1500)
}
</script>

<template>
  <Sheet :open="open" @update:open="handleSheetOpenChange">
    <SheetContent
      side="right"
      :show-close-button="false"
      class="!w-[520px] sm:!max-w-[520px] p-0 flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <SheetHeader class="px-6 pt-5 pb-3 border-b shrink-0">
        <SheetTitle class="text-base">{{ company?.name ?? '—' }}</SheetTitle>
        <SheetDescription class="font-mono text-[11px] text-indigo-500">/{{ company?.slug }}</SheetDescription>
      </SheetHeader>

      <!-- Tabs -->
      <Tabs v-model="activeTab" class="flex-1 flex flex-col overflow-hidden">
        <TabsList class="mx-6 mt-3 mb-0 shrink-0 w-auto justify-start">
          <TabsTrigger value="general"  class="text-xs">{{ t('super.drawer.tab_general') }}</TabsTrigger>
          <TabsTrigger value="salaxy"   class="text-xs">{{ t('super.drawer.tab_salaxy') }}</TabsTrigger>
          <TabsTrigger value="admins"   class="text-xs">{{ t('super.drawer.tab_admins') }}</TabsTrigger>
          <TabsTrigger value="danger" class="text-xs" disabled>{{ t('super.drawer.tab_danger') }}</TabsTrigger>
        </TabsList>

        <!-- General tab -->
        <TabsContent value="general" class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <!-- Feature cards -->
          <div class="grid grid-cols-2 gap-3">
            <FeatureToggleCard
              :title="t('super.list.col_time_app')"
              :description="t('super.drawer.features_time_app_desc')"
              :model-value="features.time_app_enabled === 1"
              :company-name="company?.name ?? ''"
              feature-key="time_app"
              :consequences-copy="t('super.features.timeApp.consequences', { company: company?.name ?? '' })"
              :disabled="featureSaving !== null"
              @update:model-value="(v: boolean) => onToggleFeature('time_app_enabled', v)"
            />
            <FeatureToggleCard
              :title="t('super.list.col_supervisor_ui')"
              :description="t('super.drawer.features_supervisor_desc')"
              :model-value="features.supervisor_ui_enabled === 1"
              :company-name="company?.name ?? ''"
              feature-key="supervisor_ui"
              :consequences-copy="t('super.features.approvals.consequences', { company: company?.name ?? '' })"
              :disabled="featureSaving !== null"
              @update:model-value="(v: boolean) => onToggleFeature('supervisor_ui_enabled', v)"
            />
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.name_label') }}</Label>
            <Input v-model="generalForm.name" :class="nameErr && generalForm.name !== '' ? 'border-destructive' : ''" />
            <p v-if="nameErr && generalForm.name !== ''" class="text-xs text-destructive">{{ nameErr }}</p>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.slug_label') }}</Label>
            <Input
              v-model="generalForm.slug"
              class="font-mono"
              :class="slugErr ? 'border-destructive' : ''"
              @input="generalForm.slug = (generalForm.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '')"
            />
            <p v-if="slugErr" class="text-xs text-destructive">{{ slugErr }}</p>
            <p v-else class="text-xs text-muted-foreground font-mono">/{{ generalForm.slug || '…' }}</p>
          </div>

          <!-- Debug & links -->
          <div class="pt-2 border-t">
            <button
              type="button"
              class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
              @click="debugOpen = !debugOpen"
            >
              <ChevronRight :class="['size-3 transition-transform duration-150', debugOpen ? 'rotate-90' : '']" />
              {{ t('super.drawer.debug_title') }}
            </button>

            <div v-if="debugOpen" class="mt-3 space-y-3">
              <!-- DB path -->
              <div v-if="company?.db_file" class="space-y-1">
                <span class="text-xs text-muted-foreground">{{ t('super.drawer.debug_db') }}</span>
                <div class="flex items-center gap-1.5">
                  <code class="text-[11px] font-mono bg-muted px-2 py-0.5 rounded flex-1 truncate">{{ company.db_file }}</code>
                  <Button
                    variant="ghost" size="sm"
                    class="h-5 px-2 text-[10px] shrink-0"
                    @click="copyText('db', company!.db_file!)"
                  >{{ copiedKey === 'db' ? t('super.drawer.debug_copied') : 'Copy' }}</Button>
                </div>
              </div>

              <!-- Deep links -->
              <div class="space-y-1">
                <span class="text-xs text-muted-foreground">{{ t('super.drawer.debug_links') }}</span>
                <div v-for="link in debugLinks" :key="link.key" class="flex items-center gap-1.5">
                  <code class="text-[11px] font-mono bg-muted px-2 py-0.5 rounded flex-1 truncate">{{ link.path }}</code>
                  <Button
                    variant="ghost" size="sm"
                    class="h-5 px-2 text-[10px] shrink-0"
                    @click="copyText(link.key, link.path)"
                  >{{ copiedKey === link.key ? t('super.drawer.debug_copied') : 'Copy' }}</Button>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <!-- Salaxy tab -->
        <TabsContent value="salaxy" class="flex-1 overflow-y-auto">
          <form class="px-6 py-4 space-y-4" autocomplete="off" @submit.prevent="save">
          <!-- Salaxy Company ID + fetch -->
          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.salaxy_id_label') }}</Label>
            <div class="flex gap-2">
              <Input v-model="salaxyForm.business_id" class="font-mono flex-1" autocomplete="off" />
              <Button
                variant="outline" size="sm"
                :disabled="fetchingId"
                class="shrink-0"
                @click="fetchSalaxyId"
              >{{ fetchingId ? t('super.drawer.fetching') : t('super.drawer.fetch_button') }}</Button>
            </div>
            <p v-if="fetchIdError" class="text-xs text-destructive">{{ fetchIdError }}</p>
            <div
              v-if="fetchedId"
              class="text-xs text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 px-2 py-1.5 rounded"
            >
              ✓ {{ t('super.drawer.fetch_found') }}: <span class="font-mono">{{ fetchedId }}</span>
            </div>
          </div>

          <!-- API URL -->
          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.salaxy_api_url_label') }}</Label>
            <Input v-model="salaxyForm.salaxy_api_url" class="font-mono text-sm" autocomplete="off" />
          </div>

          <!-- Username -->
          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.salaxy_username_label') }}</Label>
            <Input v-model="salaxyForm.salaxy_username" autocomplete="username" />
          </div>

          <!-- Password -->
          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.salaxy_password_label') }}</Label>
            <Input
              v-model="salaxyForm.salaxy_password"
              type="password"
              autocomplete="new-password"
              :placeholder="t('super.drawer.salaxy_pw_hint')"
            />
          </div>
          </form>
        </TabsContent>

        <!-- Admins tab -->
        <TabsContent value="admins" class="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          <p v-if="adminsLoading" class="text-sm text-muted-foreground py-2">{{ t('common.loading') }}</p>

          <p v-else-if="adminsError" class="text-xs text-destructive">{{ adminsError }}</p>

          <template v-else>
            <p v-if="admins.length === 0 && !showAddAdmin" class="text-sm text-muted-foreground py-2">
              {{ t('super.drawer.admins_empty') }}
            </p>

            <div v-for="admin in admins" :key="admin.id" class="space-y-1">
              <div class="flex items-center gap-1.5">
                <span class="text-sm flex-1 truncate">{{ admin.email }}</span>
                <Button
                  variant="ghost" size="sm"
                  class="h-6 text-xs px-2 shrink-0"
                  @click="toggleEditPw(admin.id)"
                >{{ t('super.drawer.admin_set_pw') }}</Button>
                <Button
                  variant="ghost" size="sm"
                  class="h-6 text-xs px-2 shrink-0 text-destructive hover:text-destructive"
                  @click="removeAdmin(admin)"
                >{{ t('super.drawer.admin_remove') }}</Button>
              </div>

              <div v-if="editingPwFor === admin.id" class="pl-2 space-y-1">
                <div class="flex items-center gap-1.5">
                  <Input
                    v-model="editPw"
                    type="password"
                    :placeholder="t('super.drawer.admin_pw_hint')"
                    class="h-7 text-xs flex-1"
                    @keydown.enter="setAdminPassword(admin)"
                    @keydown.escape="toggleEditPw(admin.id)"
                  />
                  <Button
                    size="sm" class="h-7 text-xs px-2 shrink-0"
                    :disabled="editPwSaving"
                    @click="setAdminPassword(admin)"
                  >{{ editPwSaving ? '…' : t('super.drawer.save_button') }}</Button>
                  <Button
                    variant="ghost" size="sm"
                    class="h-7 text-xs px-2 shrink-0"
                    @click="toggleEditPw(admin.id)"
                  >✕</Button>
                </div>
                <p v-if="editPwError" class="text-xs text-destructive">{{ editPwError }}</p>
              </div>
            </div>

            <!-- Add admin inline form -->
            <form v-if="showAddAdmin" class="rounded border p-3 space-y-2 bg-muted/40 mt-2" @submit.prevent="addAdmin">
              <div class="space-y-1">
                <Label class="text-xs">{{ t('super.drawer.admin_email_label') }}</Label>
                <Input v-model="addForm.email" type="email" :placeholder="'admin@company.fi'" class="h-8 text-sm" />
              </div>
              <div class="space-y-1">
                <Label class="text-xs">{{ t('super.drawer.admin_password_label') }}</Label>
                <Input v-model="addForm.password" type="password" :placeholder="t('super.drawer.admin_pw_hint')" class="h-8 text-sm" />
              </div>
              <p v-if="addError" class="text-xs text-destructive">{{ addError }}</p>
              <div class="flex gap-2">
                <Button type="submit" size="sm" :disabled="addSaving">
                  {{ addSaving ? '…' : t('super.drawer.create_button') }}
                </Button>
                <Button
                  type="button" variant="ghost" size="sm"
                  @click="showAddAdmin = false; addForm.email = ''; addForm.password = ''; addError = null"
                >{{ t('common.cancel') }}</Button>
              </div>
            </form>

            <Button
              v-if="!showAddAdmin"
              variant="ghost" size="sm"
              class="text-xs mt-1"
              @click="showAddAdmin = true; adminsError = null"
            >{{ t('super.drawer.add_admin') }}</Button>
          </template>
        </TabsContent>

        <!-- Danger tab -->
        <TabsContent value="danger" class="flex-1 px-6 py-4 text-sm text-muted-foreground">
          Archive company / Delete company — coming in Phase 2.
        </TabsContent>
      </Tabs>

      <!-- Footer -->
      <SheetFooter class="px-6 py-4 border-t shrink-0 flex items-center gap-2">
        <p v-if="saveError" class="text-xs text-destructive flex-1">{{ saveError }}</p>
        <span v-else class="flex-1" />
        <Button variant="ghost" size="sm" @click="requestClose">{{ t('common.cancel') }}</Button>
        <Button
          v-if="showFooterSave"
          size="sm"
          :disabled="!isSaveable || saving"
          @click="save"
        >{{ saving ? t('common.saving') : t('super.drawer.save_button') }}</Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
