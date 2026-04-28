<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'
import { Toaster } from '@/components/ui/sonner'

useLocale()
</script>

<template>
  <RouterView />
  <Toaster position="bottom-right" :duration="4000" />
</template>
