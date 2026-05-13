// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import BottomTabs from '../BottomTabs.vue'
import type { BottomTabItem } from '../BottomTabs.vue'

// Minimal icon stub — just renders a span so we can verify it's mounted
const IconStub = defineComponent({ render: () => h('span', { 'data-testid': 'icon' }) })

const RouterLinkStub = defineComponent({
  props: ['to'],
  template: '<a :href="String(to)"><slot /></a>',
})

const global = { stubs: { RouterLink: RouterLinkStub } }

function makeItems(overrides: Partial<BottomTabItem>[] = []): BottomTabItem[] {
  return [
    { id: 'home', label: 'Home', icon: IconStub },
    { id: 'log', label: 'Log', icon: IconStub },
    { id: 'team', label: 'Team', icon: IconStub },
  ].map((item, i) => ({ ...item, ...overrides[i] }))
}

describe('BottomTabs', () => {
  it('renders a nav element with all item labels', () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    expect(w.find('nav').exists()).toBe(true)
    expect(w.text()).toContain('Home')
    expect(w.text()).toContain('Log')
    expect(w.text()).toContain('Team')
  })

  it('active item gets aria-current="page" and data-active attribute', () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'log' }, global })
    const buttons = w.findAll('[aria-current="page"]')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.text()).toContain('Log')
    expect(buttons[0]!.attributes('data-active')).toBe('')
  })

  it('inactive items have no aria-current or data-active', () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    const inactive = w.findAll('[aria-current="page"]')
    // only one active
    expect(inactive).toHaveLength(1)
    // the Log and Team buttons should not have data-active
    const all = w.findAll('button, a')
    const noActive = all.filter((el) => el.attributes('data-active') === undefined)
    expect(noActive.length).toBe(2)
  })

  it('active icon gets text-indigo-600 class', () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    // First item is active — its component wrapper should contain the indigo class
    const activeBtn = w.find('[data-active]')
    expect(activeBtn.html()).toContain('text-indigo-600')
  })

  it('active icon has bg-indigo-50 pill', () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    const activeBtn = w.find('[data-active]')
    expect(activeBtn.html()).toContain('bg-indigo-50')
  })

  it('no badge rendered when badge is undefined', () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    // no amber-500 span
    expect(w.find('.bg-amber-500').exists()).toBe(false)
  })

  it('no badge rendered when badge is 0', () => {
    const items = makeItems([{ badge: 0 }])
    const w = mount(BottomTabs, { props: { items, active: 'home' }, global })
    expect(w.find('.bg-amber-500').exists()).toBe(false)
  })

  it('badge shows count when badge > 0', () => {
    const items = makeItems([{ badge: 3 }])
    const w = mount(BottomTabs, { props: { items, active: 'log' }, global })
    const badge = w.find('.bg-amber-500')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('3')
  })

  it('badge shows "99+" for counts over 99', () => {
    const items = makeItems([{ badge: 150 }])
    const w = mount(BottomTabs, { props: { items, active: 'log' }, global })
    expect(w.find('.bg-amber-500').text()).toBe('99+')
  })

  it('badge shows exact count at 99', () => {
    const items = makeItems([{ badge: 99 }])
    const w = mount(BottomTabs, { props: { items, active: 'log' }, global })
    expect(w.find('.bg-amber-500').text()).toBe('99')
  })

  it('emits change with item id on click', async () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    const buttons = w.findAll('button')
    await buttons[1]!.trigger('click') // Log
    expect(w.emitted('change')?.[0]).toEqual(['log'])
  })

  it('emits change for every click including already-active item', async () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    await w.findAll('button')[0]!.trigger('click')
    expect(w.emitted('change')?.[0]).toEqual(['home'])
  })

  it('renders a router-link anchor when to prop is set', () => {
    const items = makeItems([{ to: '/home' }])
    const w = mount(BottomTabs, { props: { items, active: 'log' }, global })
    expect(w.find('a[href="/home"]').exists()).toBe(true)
  })

  it('renders a button when to prop is absent', () => {
    const w = mount(BottomTabs, { props: { items: makeItems(), active: 'home' }, global })
    expect(w.findAll('button')).toHaveLength(3)
  })
})
