import { ref, computed, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'

const MOBILE_BREAKPOINT = 640

// Reads the CSS env(safe-area-inset-bottom) value via a temporary DOM probe.
// Returns 0 in environments where env() is unsupported (most non-iOS browsers, jsdom).
function readSafeAreaInset(): number {
  if (typeof document === 'undefined') return 0
  const el = document.createElement('div')
  el.style.cssText =
    'position:fixed;bottom:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none'
  document.body.appendChild(el)
  const val = parseFloat(getComputedStyle(el).paddingBottom) || 0
  document.body.removeChild(el)
  return val
}

export function useMobileShell() {
  const { width } = useWindowSize()

  // true when viewport is below the mobile breakpoint (640 px)
  const isMobile = computed(() => width.value < MOBILE_BREAKPOINT)

  // Safe-area bottom inset in pixels (e.g. 34 on iPhone with home indicator).
  // Re-probed on every width change so orientation transitions are caught.
  const bottomInset = ref(readSafeAreaInset())
  watch(width, () => {
    bottomInset.value = readSafeAreaInset()
  })

  return { isMobile, bottomInset }
}
