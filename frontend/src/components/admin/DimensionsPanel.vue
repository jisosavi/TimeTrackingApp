<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { useDimensionAdmin } from '@/composables/useDimensions'

const { t } = useI18n({ useScope: 'global' })
const { dimensions, busy, load, syncFromSalaxy, setEnabled, optionsFor } = useDimensionAdmin()

const message = ref('')
const error = ref('')

onMounted(() => {
  load().catch(() => { error.value = t('dimensions.load_failed') })
})

const enabledId = computed(() => dimensions.value.find((d) => d.enabled)?.dimension_id ?? '')

async function doSync() {
  message.value = ''
  error.value = ''
  try {
    const { synced, skipped } = await syncFromSalaxy()
    message.value = t('dimensions.sync_result', { synced, skipped })
  } catch {
    error.value = t('dimensions.sync_failed')
  }
}

async function choose(dimensionId: string) {
  message.value = ''
  error.value = ''
  try {
    await setEnabled(dimensionId || null)
  } catch {
    error.value = t('dimensions.save_failed')
  }
}
</script>

<template>
  <div class="space-y-3 rounded-lg border border-border p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-sm font-semibold">{{ t('dimensions.title') }}</h3>
        <p class="text-xs text-muted-foreground">{{ t('dimensions.intro') }}</p>
      </div>
      <Button variant="outline" size="sm" :disabled="busy" @click="doSync">
        {{ busy ? t('admin.syncing') : t('dimensions.sync') }}
      </Button>
    </div>

    <p v-if="message" class="text-sm text-muted-foreground">{{ message }}</p>
    <p v-if="error" class="text-sm text-destructive">{{ error }}</p>

    <p v-if="!dimensions.length" class="text-sm text-muted-foreground">
      {{ t('dimensions.none_synced') }}
    </p>

    <div v-else class="space-y-2">
      <label
        v-for="dim in dimensions"
        :key="dim.dimension_id"
        class="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3"
        :class="dim.enabled ? 'bg-accent/40' : ''"
      >
        <input
          type="radio"
          name="active-dimension"
          class="mt-1"
          :value="dim.dimension_id"
          :checked="dim.enabled"
          :disabled="busy"
          @change="choose(dim.dimension_id)"
        />
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium">{{ dim.label || dim.dimension_id }}</span>
          <span class="block text-xs text-muted-foreground">
            {{ t('dimensions.option_count', { count: optionsFor(dim.dimension_id).length }) }}
          </span>
          <span class="mt-1 block truncate text-xs text-muted-foreground">
            {{ optionsFor(dim.dimension_id).map((o) => `${o.option_text} (${o.value})`).join(' · ') }}
          </span>
        </span>
      </label>

      <label class="flex cursor-pointer items-center gap-3 rounded-md border border-border p-3">
        <input
          type="radio"
          name="active-dimension"
          class="mt-0"
          value=""
          :checked="enabledId === ''"
          :disabled="busy"
          @change="choose('')"
        />
        <span class="text-sm">{{ t('dimensions.use_free_text') }}</span>
      </label>
    </div>
  </div>
</template>
