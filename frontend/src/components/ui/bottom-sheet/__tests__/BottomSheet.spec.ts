// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import BottomSheet from '../BottomSheet.vue'

afterEach(() => { document.body.innerHTML = '' })

describe('BottomSheet', () => {
  it('renders content in DOM when open=true', async () => {
    const w = mount(BottomSheet, {
      props: { open: true },
      slots: { default: '<p data-testid="body">Sheet body</p>' },
      attachTo: document.body,
    })
    expect(document.body.textContent).toContain('Sheet body')
    w.unmount()
  })

  it('does not show content when open=false', () => {
    const w = mount(BottomSheet, {
      props: { open: false },
      slots: { default: '<p data-testid="body">Hidden body</p>' },
      attachTo: document.body,
    })
    expect(document.querySelector('[data-slot="bottom-sheet"]')).toBeNull()
    w.unmount()
  })

  it('shows title when title prop is provided', async () => {
    const w = mount(BottomSheet, {
      props: { open: true, title: 'Request holiday' },
      attachTo: document.body,
    })
    expect(document.body.textContent).toContain('Request holiday')
    w.unmount()
  })

  it('does not render title section when title prop is absent', async () => {
    const w = mount(BottomSheet, {
      props: { open: true },
      attachTo: document.body,
    })
    // no close button SVG path in title bar
    const panel = document.querySelector('[data-slot="bottom-sheet"]')
    expect(panel).not.toBeNull()
    // title wrapper only renders when title prop given — check no "flex items-center justify-between" title row
    expect(panel!.querySelector('.text-base.font-semibold')).toBeNull()
    w.unmount()
  })

  it('renders default slot content', async () => {
    const w = mount(BottomSheet, {
      props: { open: true },
      slots: { default: '<span class="slot-content">My content</span>' },
      attachTo: document.body,
    })
    expect(document.body.querySelector('.slot-content')).not.toBeNull()
    w.unmount()
  })

  it('renders footer slot when provided', async () => {
    const w = mount(BottomSheet, {
      props: { open: true },
      slots: {
        default: 'body',
        footer: '<button class="confirm-btn">Confirm</button>',
      },
      attachTo: document.body,
    })
    expect(document.body.querySelector('.confirm-btn')).not.toBeNull()
    w.unmount()
  })

  it('does not render footer area when footer slot is absent', async () => {
    const w = mount(BottomSheet, {
      props: { open: true },
      slots: { default: 'body' },
      attachTo: document.body,
    })
    const panel = document.querySelector('[data-slot="bottom-sheet"]')
    // the footer div has border-t class; should not be present without the slot
    const footer = panel?.querySelector('.border-t')
    expect(footer).toBeNull()
    w.unmount()
  })

  it('drag handle is present when open', async () => {
    const w = mount(BottomSheet, {
      props: { open: true },
      attachTo: document.body,
    })
    const panel = document.querySelector('[data-slot="bottom-sheet"]')
    // drag handle: rounded-full w-10 h-[5px]
    const handle = panel?.querySelector('.rounded-full.bg-muted-foreground\\/25')
    expect(handle).not.toBeNull()
    w.unmount()
  })

  it('emits update:open=false when close button is clicked', async () => {
    const w = mount(BottomSheet, {
      props: { open: true, title: 'Test' },
      attachTo: document.body,
    })
    const closeBtn = document.querySelector('[aria-label="Close"]') as HTMLElement | null
    expect(closeBtn).not.toBeNull()
    closeBtn!.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(w.emitted('update:open')).toBeTruthy()
    expect(w.emitted('update:open')![0]).toEqual([false])
    w.unmount()
  })
})
