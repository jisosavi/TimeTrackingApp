<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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

// ── Form state ────────────────────────────────────────────────────────────────
const form     = reactive({ name: '', slug: '' })
const initial  = ref({ name: '', slug: '' })
const saving   = ref(false)
const saveError = ref<string | null>(null)

watch(
  () => props.company,
  (c) => {
    if (c) {
      form.name  = c.name
      form.slug  = c.slug
      initial.value = { name: c.name, slug: c.slug }
      saveError.value = null
    }
  },
  { immediate: true },
)

// ── Validation ────────────────────────────────────────────────────────────────
function slugError(s: string): string | null {
  if (s.length < 2)  return t('super.drawer.slug_min')
  if (s.length > 40) return t('super.drawer.slug_max')
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]{1,2}$/.test(s)) return t('super.drawer.slug_chars')
  return null
}

const slugErr  = computed(() => slugError(form.slug))
const nameErr  = computed(() => form.name.trim() === '' ? t('super.drawer.name_required') : null)
const isValid  = computed(() => !nameErr.value && !slugErr.value)
const isDirty  = computed(() => form.name !== initial.value.name || form.slug !== initial.value.slug)

// ── Close with dirty guard ────────────────────────────────────────────────────
function requestClose() {
  if (isDirty.value && !confirm(t('super.drawer.discard_confirm'))) return
  emit('close')
}

function handleSheetOpenChange(val: boolean) {
  if (!val) requestClose()
}

// ── Save ──────────────────────────────────────────────────────────────────────
async function save() {
  if (!props.company || !isDirty.value || !isValid.value) return
  saving.value = true
  saveError.value = null
  try {
    const res = await apiFetch<{ success: boolean; company: Company }>(
      '/api/super_admin/update_company.php',
      {
        method: 'PATCH',
        body: JSON.stringify({ id: props.company.id, name: form.name.trim(), slug: form.slug.trim() }),
      },
    )
    initial.value = { name: form.name.trim(), slug: form.slug.trim() }
    emit('saved', res.company)
  } catch (e) {
    saveError.value = e instanceof Error ? e.message : t('common.save_failed')
  } finally {
    saving.value = false
  }
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
      <Tabs default-value="general" class="flex-1 flex flex-col overflow-hidden">
        <TabsList class="mx-6 mt-3 mb-0 shrink-0 w-auto justify-start">
          <TabsTrigger value="general" class="text-xs">{{ t('super.drawer.tab_general') }}</TabsTrigger>
          <TabsTrigger value="salaxy"  class="text-xs" disabled>{{ t('super.drawer.tab_salaxy') }}</TabsTrigger>
          <TabsTrigger value="admins"  class="text-xs" disabled>{{ t('super.drawer.tab_admins') }}</TabsTrigger>
          <TabsTrigger value="features" class="text-xs" disabled>{{ t('super.drawer.tab_features') }}</TabsTrigger>
          <TabsTrigger value="danger"  class="text-xs" disabled>{{ t('super.drawer.tab_danger') }}</TabsTrigger>
        </TabsList>

        <!-- General tab -->
        <TabsContent value="general" class="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.name_label') }}</Label>
            <Input v-model="form.name" :class="nameErr && form.name !== '' ? 'border-destructive' : ''" />
            <p v-if="nameErr && form.name !== ''" class="text-xs text-destructive">{{ nameErr }}</p>
          </div>

          <div class="space-y-1.5">
            <Label class="text-xs">{{ t('super.drawer.slug_label') }}</Label>
            <Input
              v-model="form.slug"
              class="font-mono"
              :class="slugErr ? 'border-destructive' : ''"
              @input="form.slug = (form.slug as string).toLowerCase().replace(/[^a-z0-9-]/g, '')"
            />
            <p v-if="slugErr" class="text-xs text-destructive">{{ slugErr }}</p>
            <p v-else class="text-xs text-muted-foreground font-mono">/{{ form.slug || '…' }}</p>
          </div>
        </TabsContent>

        <!-- Other tabs — not yet implemented -->
        <TabsContent value="salaxy"   class="flex-1 px-6 py-4 text-sm text-muted-foreground">Coming soon</TabsContent>
        <TabsContent value="admins"   class="flex-1 px-6 py-4 text-sm text-muted-foreground">Coming soon</TabsContent>
        <TabsContent value="features" class="flex-1 px-6 py-4 text-sm text-muted-foreground">Coming soon</TabsContent>
        <TabsContent value="danger"   class="flex-1 px-6 py-4 text-sm text-muted-foreground">Coming soon</TabsContent>
      </Tabs>

      <!-- Footer -->
      <SheetFooter class="px-6 py-4 border-t shrink-0 flex items-center gap-2">
        <p v-if="saveError" class="text-xs text-destructive flex-1">{{ saveError }}</p>
        <span v-else class="flex-1" />
        <Button variant="ghost" size="sm" @click="requestClose">{{ t('common.cancel') }}</Button>
        <Button
          size="sm"
          :disabled="!isDirty || !isValid || saving"
          @click="save"
        >
          {{ saving ? t('common.saving') : t('super.drawer.save_button') }}
        </Button>
      </SheetFooter>
    </SheetContent>
  </Sheet>
</template>
