<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const { t } = useI18n()

const props = defineProps<{
  kicker?: string
  title: string
  description: string
  modelValue: boolean
  companyName: string
  featureKey: 'time_app' | 'supervisor_ui'
  consequencesCopy: string
  disabled?: boolean
}>()

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

const showConfirm = ref(false)

const displayKicker = computed(() => props.kicker ?? props.title.toUpperCase())

function onSwitchClick() {
  if (props.modelValue) {
    showConfirm.value = true
  } else {
    emit('update:modelValue', true)
  }
}

function onConfirm() {
  showConfirm.value = false
  emit('update:modelValue', false)
}
</script>

<template>
  <div
    :class="[
      'rounded-xl border p-[18px_20px] transition-[background-color,border-color] duration-150',
      modelValue ? 'bg-card' : 'bg-[#F5F5F2]',
    ]"
  >
    <!-- Kicker -->
    <p class="text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase mb-[10px]">
      {{ displayKicker }}
    </p>

    <!-- Header row: title + switch -->
    <div class="flex items-center justify-between mb-1.5">
      <span class="text-base font-bold text-foreground">{{ title }}</span>

      <!-- Custom switch (44×24) -->
      <button
        type="button"
        role="switch"
        :aria-checked="modelValue"
        :disabled="disabled"
        :class="[
          'relative inline-flex shrink-0 h-6 w-11 rounded-full',
          'transition-colors duration-150',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          modelValue
            ? 'bg-[#28C764] focus-visible:outline-[#28C764]'
            : 'bg-[#E5484D] focus-visible:outline-[#E5484D]',
        ]"
        @click="onSwitchClick"
        @keydown.space.prevent="onSwitchClick"
      >
        <span
          :class="[
            'pointer-events-none absolute top-[2px] size-5 rounded-full bg-white',
            'shadow-[0_1px_3px_rgba(0,0,0,0.18)] transition-transform duration-150',
            modelValue ? 'translate-x-[22px]' : 'translate-x-[2px]',
          ]"
        />
      </button>
    </div>

    <!-- Status row: dot + label -->
    <div class="flex items-center gap-[7px]">
      <span
        :class="[
          'size-[9px] rounded-full shrink-0',
          modelValue ? 'bg-[#28C764]' : 'bg-muted-foreground/25',
        ]"
      />
      <span
        class="text-[15px] font-semibold leading-none"
        :class="modelValue ? 'text-foreground' : 'text-muted-foreground'"
      >
        {{ modelValue ? t('super.filters.on') : t('super.filters.off') }}
      </span>
    </div>

    <!-- Description -->
    <p class="mt-[10px] text-[13px] text-muted-foreground leading-[1.5]">
      {{ description }}
    </p>

    <!-- Deactivation confirm dialog -->
    <AlertDialog :open="showConfirm" @update:open="showConfirm = $event">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ t('super.features.deactivate.title', { feature: title, company: companyName }) }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {{ consequencesCopy }} {{ t('super.features.deactivate.preserved') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('common.cancel') }}</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-white hover:bg-destructive/90"
            @click="onConfirm"
          >
            {{ t('super.features.deactivate.confirm') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
