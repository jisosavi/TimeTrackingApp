<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useApi } from '@/composables/useApi'
interface HolidayYear {
  id: string
  year: number
  startDate: string
  endDate: string
  accruedDays: number
  plannedDays: number
  paidDays: number
  accrualRule: string
  monthlyAccrual: number
}

defineOptions({ name: 'HolidayRulesPanel' })

const props = defineProps<{ employeeId: number | null }>()

const { t } = useI18n({ useScope: 'global' })
const { apiFetch } = useApi()

const summary = ref<HolidayYear | null>(null)
const salaxyUrl = ref<string | null>(null)
const loading = ref(false)

async function fetchSummary(id: number) {
  loading.value = true
  summary.value = null
  salaxyUrl.value = null
  try {
    const data = await apiFetch<{ summary: HolidayYear | null; salaxy_url: string | null }>(
      `/api/admin/holiday_year_summary.php?employeeId=${id}`,
    )
    summary.value = data.summary
    salaxyUrl.value = data.salaxy_url
  } catch { /* silently ignore */ } finally {
    loading.value = false
  }
}

watch(() => props.employeeId, (id) => { if (id) fetchSummary(id) }, { immediate: true })
</script>

<template>
  <div class="mt-3 pt-3 border-t space-y-2">
    <p class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {{ t('admin.holiday_rules.title') }}
    </p>

    <div v-if="loading" class="text-xs text-muted-foreground">{{ t('common.loading') }}</div>

    <div v-else-if="!summary" class="text-xs text-muted-foreground italic">
      {{ t('admin.holiday_rules.no_salaxy_id') }}
    </div>

    <div v-else class="text-xs space-y-1 text-foreground">
      <div class="flex justify-between gap-2">
        <span class="text-muted-foreground">{{ t('admin.holiday_rules.accrual_rule') }}</span>
        <span class="font-medium">{{ summary.accrualRule }}</span>
      </div>
      <div class="flex justify-between gap-2">
        <span class="text-muted-foreground">{{ t('admin.holiday_rules.monthly_accrual') }}</span>
        <span class="font-medium">{{ summary.monthlyAccrual }} {{ t('admin.holiday_rules.days_per_month') }}</span>
      </div>
      <div class="flex justify-between gap-2">
        <span class="text-muted-foreground">{{ t('admin.holiday_rules.accrued_total') }}</span>
        <span class="font-medium">{{ summary.accruedDays }} {{ t('admin.holiday_rules.days_unit') }}</span>
      </div>
      <div class="flex justify-between gap-2">
        <span class="text-muted-foreground">{{ t('admin.holiday_rules.year_period') }}</span>
        <span class="font-medium">{{ summary.startDate }} – {{ summary.endDate }}</span>
      </div>
    </div>

    <a
      v-if="salaxyUrl"
      :href="salaxyUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 hover:underline"
    >
      {{ t('admin.holiday_rules.view_in_salaxy') }} ↗
    </a>
  </div>
</template>
