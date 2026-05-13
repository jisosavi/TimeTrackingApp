<script setup lang="ts">
import type { Component } from 'vue'
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'

export interface BottomTabItem {
  id: string
  label: string
  icon: Component
  badge?: number
  to?: RouteLocationRaw
}

defineProps<{
  items: BottomTabItem[]
  active: string
}>()

const emit = defineEmits<{
  change: [id: string]
}>()
</script>

<template>
  <nav
    class="fixed bottom-0 inset-x-0 z-40 flex w-full border-t bg-background"
    style="padding-bottom: env(safe-area-inset-bottom, 0px)"
    aria-label="Main navigation"
  >
    <component
      :is="item.to ? RouterLink : 'button'"
      v-for="item in items"
      :key="item.id"
      v-bind="item.to ? { to: item.to } : { type: 'button' }"
      :aria-current="item.id === active ? 'page' : undefined"
      :data-active="item.id === active ? '' : undefined"
      class="flex flex-1 flex-col items-center justify-center min-h-[44px] gap-[3px] py-1 text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      @click="emit('change', item.id)"
    >
      <!-- Icon wrapper: active pill bg + badge overlay -->
      <span class="relative flex items-center justify-center">
        <span
          :class="[
            'flex items-center justify-center rounded-full p-[5px] transition-colors duration-150',
            item.id === active ? 'bg-indigo-50' : '',
          ]"
        >
          <component
            :is="item.icon"
            :size="30"
            :class="[
              'block shrink-0 transition-colors duration-150',
              item.id === active ? 'text-indigo-600' : 'text-muted-foreground',
            ]"
          />
        </span>
        <span
          v-if="item.badge != null && item.badge > 0"
          class="absolute -top-0.5 right-0 min-w-[16px] h-4 px-[3px] rounded-full bg-amber-500 text-white text-[9px] font-bold leading-4 text-center tabular-nums pointer-events-none"
        >
          {{ item.badge > 99 ? '99+' : item.badge }}
        </span>
      </span>

      <!-- Label -->
      <span
        :class="[
          'text-[10px] font-bold leading-none tracking-tight transition-colors duration-150',
          item.id === active ? 'text-indigo-600' : 'text-muted-foreground',
        ]"
      >
        {{ item.label }}
      </span>
    </component>
  </nav>
</template>
