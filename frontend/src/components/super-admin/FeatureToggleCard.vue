<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { Switch } from '@/components/ui/switch'

const { t } = useI18n()

defineProps<{
  title: string
  description: string
  value: boolean
  disabled?: boolean
}>()

defineEmits<{ toggle: [newValue: boolean] }>()
</script>

<template>
  <div :class="['rounded-lg border p-3 space-y-2 transition-colors', !value && 'bg-muted/40']">
    <p class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{{ title }}</p>
    <div class="flex items-center justify-between">
      <span class="inline-flex items-center gap-1.5">
        <span
          :class="['inline-block size-2 rounded-full shrink-0', value ? 'bg-green-500' : 'bg-muted-foreground/25']"
        />
        <span class="text-xs" :class="value ? 'text-foreground' : 'text-muted-foreground'">
          {{ value ? t('super.filters.on') : t('super.filters.off') }}
        </span>
      </span>
      <Switch
        :checked="value"
        :disabled="disabled"
        class="data-checked:bg-green-500 data-unchecked:bg-red-400"
        @update:checked="$emit('toggle', $event)"
      />
    </div>
    <p class="text-xs text-muted-foreground">{{ description }}</p>
  </div>
</template>
