<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useAdminData } from '@/composables/useAdminData'
import type { PayrollSettings } from '@/types'

const { fetchPayrollSettings, savePayrollSettings } = useAdminData()

const settings = ref<PayrollSettings>({ payroll_period: 'monthly', payday_1: 15, payday_2: 0 })
const loading = ref(false)
const saved = ref(false)
const error = ref<string | null>(null)

const DAY_OPTIONS = [
  { value: 0, label: 'Last day' },
  ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: String(i + 1) })),
]

onMounted(async () => {
  loading.value = true
  try {
    settings.value = await fetchPayrollSettings()
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Failed to load'
  } finally {
    loading.value = false
  }
})

function formatTs(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('fi-FI', { dateStyle: 'short', timeStyle: 'short' })
}

async function doSave() {
  loading.value = true
  saved.value = false
  error.value = null
  try {
    await savePayrollSettings(settings.value)
    settings.value.payroll_settings_updated_at = new Date().toISOString()
    saved.value = true
    setTimeout(() => { saved.value = false }, 2000)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Save failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-lg font-semibold">Payroll Period Settings</h2>

    <div class="rounded-lg border p-4 space-y-4 bg-card max-w-md">
      <div class="flex gap-6">
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" value="monthly" v-model="settings.payroll_period" />
          Monthly
        </label>
        <label class="flex items-center gap-2 text-sm cursor-pointer">
          <input type="radio" value="biweekly" v-model="settings.payroll_period" />
          Fortnightly (1–15 / 16–end)
        </label>
      </div>

      <div v-if="settings.payroll_period === 'monthly'" class="space-y-1">
        <Label class="text-xs">Payday</Label>
        <select v-model.number="settings.payday_1" class="h-9 rounded-md border border-input bg-background px-3 text-sm">
          <option v-for="opt in DAY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
        </select>
      </div>

      <div v-else class="flex gap-4">
        <div class="space-y-1">
          <Label class="text-xs">Payday (1–15)</Label>
          <select v-model.number="settings.payday_1" class="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option v-for="opt in DAY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="space-y-1">
          <Label class="text-xs">Payday (16–end)</Label>
          <select v-model.number="settings.payday_2" class="h-9 rounded-md border border-input bg-background px-3 text-sm">
            <option v-for="opt in DAY_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
      </div>

      <p v-if="error" class="text-xs text-destructive">{{ error }}</p>
      <div class="flex items-center gap-3">
        <Button size="sm" :disabled="loading" @click="doSave">
          {{ loading ? 'Saving…' : 'Save Settings' }}
        </Button>
        <span v-if="saved" class="text-xs text-green-600">Saved!</span>
      </div>
      <p v-if="settings.payroll_settings_updated_at" class="text-xs text-muted-foreground">
        Last saved {{ formatTs(settings.payroll_settings_updated_at) }}
      </p>
    </div>
  </div>
</template>
