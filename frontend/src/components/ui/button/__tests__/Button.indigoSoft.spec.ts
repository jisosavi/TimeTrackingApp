import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import { Button } from '@/components/ui/button'

const CLS = {
  bg:     'bg-[rgba(60,30,235,0.08)]',
  border: 'border-[rgba(60,30,235,0.22)]',
  text:   'text-[#3C1EEB]',
  hover:  'hover:bg-[rgba(60,30,235,0.12)]',
  active: 'active:bg-[rgba(60,30,235,0.16)]',
} as const

// Story equivalent for Button variant="indigoSoft" — default + sm, plain + icons.

describe('Button variant="indigoSoft"', () => {
  it('default — applies all indigo-soft classes', () => {
    const w = mount(Button, {
      props: { variant: 'indigoSoft' },
      slots: { default: 'Settings' },
    })
    const cls = w.classes()
    expect(cls).toContain(CLS.bg)
    expect(cls).toContain(CLS.border)
    expect(cls).toContain(CLS.text)
    expect(cls).toContain('font-semibold')
    expect(cls).toContain(CLS.hover)
    expect(cls).toContain(CLS.active)
  })

  it('sm — carries indigo-soft classes and sm size', () => {
    const w = mount(Button, {
      props: { variant: 'indigoSoft', size: 'sm' },
      slots: { default: 'Settings' },
    })
    expect(w.classes()).toContain(CLS.bg)
    expect(w.classes()).toContain('h-7')
  })

  it('lead icon — plus icon before label text', () => {
    const w = mount(Button, {
      props: { variant: 'indigoSoft' },
      slots: {
        default: () => [
          h('span', { 'data-testid': 'icon-lead', 'aria-hidden': 'true' }, '+'),
          ' New Company',
        ],
      },
    })
    expect(w.find('[data-testid="icon-lead"]').exists()).toBe(true)
    expect(w.text()).toContain('New Company')
    expect(w.classes()).toContain(CLS.bg)
  })

  it('trail icon — chevron icon after label text', () => {
    const w = mount(Button, {
      props: { variant: 'indigoSoft', size: 'sm' },
      slots: {
        default: () => [
          'Settings',
          h('span', { 'data-testid': 'icon-trail', 'aria-hidden': 'true' }, '›'),
        ],
      },
    })
    expect(w.text()).toContain('Settings')
    expect(w.find('[data-testid="icon-trail"]').exists()).toBe(true)
    expect(w.classes()).toContain('h-7')
  })
})
