<script setup lang="ts">
defineProps<{
  open: boolean
  title?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()
</script>

<template>
  <Teleport to="body">
    <template v-if="open">
      <div
        class="fixed inset-0 z-50 bg-black/40"
        @click="emit('update:open', false)"
      />
      <div
        data-slot="bottom-sheet"
        data-state="open"
        class="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-[22px] bg-background max-h-[85vh] shadow-2xl focus:outline-none"
        style="padding-bottom: env(safe-area-inset-bottom, 0px)"
      >
        <!-- Drag handle -->
        <div class="flex justify-center pt-3 pb-2 shrink-0" aria-hidden="true">
          <div class="w-10 h-[5px] rounded-full bg-muted-foreground/25" />
        </div>

        <!-- Optional title + close button row -->
        <div v-if="title" class="flex items-center justify-between px-5 pb-3 shrink-0">
          <p class="text-base font-semibold text-foreground">{{ title }}</p>
          <button
            type="button"
            class="flex items-center justify-center w-7 h-7 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close"
            @click="emit('update:open', false)"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto overscroll-contain px-5">
          <slot />
        </div>

        <!-- Optional footer -->
        <div v-if="$slots.footer" class="px-5 pt-3 pb-4 shrink-0 border-t">
          <slot name="footer" />
        </div>
      </div>
    </template>
  </Teleport>
</template>
