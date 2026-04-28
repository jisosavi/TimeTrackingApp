<script setup lang="ts">
defineProps<{
  value: boolean
  color: 'indigo' | 'green'
  onLabel?: string
  offLabel?: string
}>()
</script>

<template>
  <span class="inline-flex items-center gap-1.5">
    <span
      :class="[
        'inline-block size-2 rounded-full shrink-0',
        value
          ? (color === 'indigo' ? 'bg-indigo-500' : 'bg-green-500')
          : 'bg-muted-foreground/25',
      ]"
    />
    <span class="text-xs" :class="value ? 'text-foreground' : 'text-muted-foreground'">
      {{ value ? (onLabel ?? 'On') : (offLabel ?? 'Off') }}
    </span>
  </span>
</template>
