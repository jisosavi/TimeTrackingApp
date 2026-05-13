import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SegTabs from '../SegTabs.vue'
import type { SegTab } from '../SegTabs.vue'

const TABS: SegTab[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
]

describe('SegTabs', () => {
  it('renders all tab labels', () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'all' } })
    expect(w.text()).toContain('All')
    expect(w.text()).toContain('Pending')
    expect(w.text()).toContain('Approved')
  })

  it('container has tablist role', () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'all' } })
    expect(w.find('[role="tablist"]').exists()).toBe(true)
  })

  it('active tab has aria-selected=true and data-active attribute', () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'pending' } })
    const active = w.find('[aria-selected="true"]')
    expect(active.exists()).toBe(true)
    expect(active.text()).toBe('Pending')
    expect(active.attributes('data-active')).toBe('')
  })

  it('inactive tabs have aria-selected=false', () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'all' } })
    const inactive = w.findAll('[aria-selected="false"]')
    expect(inactive).toHaveLength(2)
  })

  it('active tab has bg-background and shadow-sm classes', () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'approved' } })
    const active = w.find('[data-active]')
    expect(active.classes()).toContain('bg-background')
    expect(active.classes()).toContain('shadow-sm')
  })

  it('inactive tabs do not have bg-background', () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'all' } })
    const inactiveButtons = w.findAll('[aria-selected="false"]')
    for (const btn of inactiveButtons) {
      expect(btn.classes()).not.toContain('bg-background')
    }
  })

  it('emits change with tab id on click', async () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'all' } })
    const buttons = w.findAll('button')
    await buttons[1]!.trigger('click')
    expect(w.emitted('change')?.[0]).toEqual(['pending'])
  })

  it('emits change when already-active tab is clicked', async () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'all' } })
    await w.findAll('button')[0]!.trigger('click')
    expect(w.emitted('change')?.[0]).toEqual(['all'])
  })

  it('renders correctly with a single tab', () => {
    const w = mount(SegTabs, { props: { tabs: [{ id: 'only', label: 'Only' }], active: 'only' } })
    expect(w.findAll('button')).toHaveLength(1)
    expect(w.find('[data-active]').exists()).toBe(true)
  })

  it('no tab has data-active when active id matches none', () => {
    const w = mount(SegTabs, { props: { tabs: TABS, active: 'nonexistent' } })
    expect(w.find('[data-active]').exists()).toBe(false)
  })
})
