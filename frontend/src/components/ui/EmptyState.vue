<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'

defineProps<{
  title: string
  body?: string
  actionLabel?: string
  actionTo?: RouteLocationRaw
  onAction?: () => void
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center gap-2">
    <div v-if="$slots.default" class="text-muted-foreground mb-1">
      <slot />
    </div>
    <p class="text-sm font-medium">{{ title }}</p>
    <p v-if="body" class="text-sm text-muted-foreground max-w-xs">{{ body }}</p>
    <template v-if="actionLabel">
      <RouterLink v-if="actionTo" :to="actionTo">
        <Button variant="outline" size="sm" class="mt-2">{{ actionLabel }}</Button>
      </RouterLink>
      <Button v-else-if="onAction" variant="outline" size="sm" class="mt-2" @click="onAction">
        {{ actionLabel }}
      </Button>
    </template>
  </div>
</template>
