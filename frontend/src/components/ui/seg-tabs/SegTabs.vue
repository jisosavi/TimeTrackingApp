<script setup lang="ts">
export interface SegTab {
  id: string
  label: string
}

defineProps<{
  tabs: SegTab[]
  active: string
}>()

const emit = defineEmits<{
  change: [id: string]
}>()
</script>

<template>
  <div
    role="tablist"
    class="inline-flex items-center rounded-[9px] bg-muted p-[3px] gap-[2px]"
  >
    <button
      v-for="tab in tabs"
      :key="tab.id"
      role="tab"
      type="button"
      :aria-selected="tab.id === active"
      :data-active="tab.id === active ? '' : undefined"
      :class="[
        'rounded-[6px] px-4 py-2.5 text-sm font-medium leading-5 whitespace-nowrap transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        tab.id === active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground/80',
      ]"
      @click="emit('change', tab.id)"
    >
      {{ tab.label }}
    </button>
  </div>
</template>
