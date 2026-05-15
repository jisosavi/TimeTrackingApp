// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { createApp, nextTick, type App } from 'vue'
import { useMobileShell } from '../useMobileShell'

// Helper: mounts a composable in a real Vue app so reactive effects work correctly.
function withSetup<T>(composable: () => T): [T, App] {
  let result!: T
  const app = createApp({
    setup() {
      result = composable()
      return () => null
    },
  })
  app.mount(document.createElement('div'))
  return [result, app]
}

let savedInnerWidth: number

beforeEach(() => {
  savedInnerWidth = window.innerWidth
})

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: savedInnerWidth,
  })
})

function setWidth(w: number) {
  Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w })
  window.dispatchEvent(new Event('resize'))
}

describe('useMobileShell', () => {
  it('returns isMobile and bottomInset', () => {
    const [result, app] = withSetup(() => useMobileShell())
    expect(result).toHaveProperty('isMobile')
    expect(result).toHaveProperty('bottomInset')
    app.unmount()
  })

  it('isMobile.value is false at jsdom default width (1024px)', () => {
    setWidth(1024)
    const [{ isMobile }, app] = withSetup(() => useMobileShell())
    expect(isMobile.value).toBe(false)
    app.unmount()
  })

  it('isMobile.value is false exactly at breakpoint (640px)', () => {
    setWidth(640)
    const [{ isMobile }, app] = withSetup(() => useMobileShell())
    expect(isMobile.value).toBe(false)
    app.unmount()
  })

  it('isMobile.value is true at 639px (one below breakpoint)', async () => {
    setWidth(639)
    const [{ isMobile }, app] = withSetup(() => useMobileShell())
    await nextTick()
    expect(isMobile.value).toBe(true)
    app.unmount()
  })

  it('isMobile.value is true at 390px (iPhone 14 width)', async () => {
    setWidth(390)
    const [{ isMobile }, app] = withSetup(() => useMobileShell())
    await nextTick()
    expect(isMobile.value).toBe(true)
    app.unmount()
  })

  it('isMobile.value updates reactively when window resizes from mobile to desktop', async () => {
    setWidth(375)
    const [{ isMobile }, app] = withSetup(() => useMobileShell())
    await nextTick()
    expect(isMobile.value).toBe(true)

    setWidth(1024)
    await nextTick()
    expect(isMobile.value).toBe(false)

    app.unmount()
  })

  it('bottomInset.value is a non-negative number', () => {
    const [{ bottomInset }, app] = withSetup(() => useMobileShell())
    expect(typeof bottomInset.value).toBe('number')
    expect(bottomInset.value).toBeGreaterThanOrEqual(0)
    app.unmount()
  })

  it('bottomInset.value is 0 in jsdom (env() not supported)', () => {
    const [{ bottomInset }, app] = withSetup(() => useMobileShell())
    // jsdom does not implement CSS env() — probe returns 0
    expect(bottomInset.value).toBe(0)
    app.unmount()
  })
})
