import { ref } from 'vue'
import { useApi } from '@/composables/useApi'
import type { ActiveDimension, DimensionOption, SyncedDimension } from '@/types'

/**
 * Cost accounting dimensions (cost centres / project codes) synced read-only from
 * Salaxy. A company either uses a dimension or the free-text project field, never
 * both, so `dimension` being null is what puts the UI back in free-text mode.
 */
export function useDimensions() {
  const { get } = useApi()

  const dimension = ref<ActiveDimension | null>(null)
  const options = ref<DimensionOption[]>([])
  const loading = ref(false)

  /** The enabled dimension and its selectable options. Any signed-in user may call this. */
  async function loadActive(): Promise<void> {
    loading.value = true
    try {
      const res = await get<{ success: boolean; dimension: ActiveDimension | null; options: DimensionOption[] }>(
        '/api/dimensions/active',
      )
      dimension.value = res.dimension ?? null
      options.value = res.options ?? []
    } finally {
      loading.value = false
    }
  }

  function labelFor(value: string): string {
    return options.value.find((o) => o.value === value)?.option_text ?? value
  }

  /** True when a code is one the employee may actually pick. */
  function isSelectable(value: string): boolean {
    return options.value.some((o) => o.value === value)
  }

  return { dimension, options, loading, loadActive, labelFor, isSelectable }
}

/** Admin-side: sync from Salaxy and choose which dimension employees use. */
export function useDimensionAdmin() {
  const { get, post } = useApi()

  const dimensions = ref<SyncedDimension[]>([])
  const allOptions = ref<(DimensionOption & { dimension_id: string })[]>([])
  const busy = ref(false)

  async function load(): Promise<void> {
    busy.value = true
    try {
      const res = await get<{
        success: boolean
        dimensions: SyncedDimension[]
        options: (DimensionOption & { dimension_id: string })[]
      }>('/api/dimensions')
      dimensions.value = res.dimensions ?? []
      allOptions.value = res.options ?? []
    } finally {
      busy.value = false
    }
  }

  async function syncFromSalaxy(): Promise<{ synced: number; skipped: number }> {
    busy.value = true
    try {
      const res = await post<{ success: boolean; synced: number; skipped: number }>(
        '/api/sync_dimensions_from_salaxy',
        {},
      )
      await load()
      return { synced: res.synced ?? 0, skipped: res.skipped ?? 0 }
    } finally {
      busy.value = false
    }
  }

  /** Enabling is exclusive: an entry carries one dimension value in this iteration. */
  async function setEnabled(dimensionId: string | null): Promise<void> {
    busy.value = true
    try {
      await post('/api/dimensions/enabled', { dimension_id: dimensionId })
      await load()
    } finally {
      busy.value = false
    }
  }

  function optionsFor(dimensionId: string): DimensionOption[] {
    return allOptions.value.filter((o) => o.dimension_id === dimensionId)
  }

  return { dimensions, allOptions, busy, load, syncFromSalaxy, setEnabled, optionsFor }
}
