import { ref } from 'vue'

const tick = ref(0)

export function useRefresh() {
  function triggerRefresh() {
    tick.value++
  }
  return { refreshTick: tick, triggerRefresh }
}
