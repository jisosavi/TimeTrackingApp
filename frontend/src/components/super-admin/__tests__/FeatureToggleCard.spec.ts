// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import FeatureToggleCard from '../FeatureToggleCard.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      super: {
        filters: { on: 'On', off: 'Off' },
        features: {
          deactivate: {
            title: 'Deactivate {feature} for {company}?',
            confirm: 'Deactivate',
            preserved: 'Existing data is preserved. You can re-enable this at any time.',
          },
        },
      },
      common: { cancel: 'Cancel' },
    },
  },
})

const base = {
  title: 'Time App',
  description: 'Employees can log hours',
  modelValue: true,
  companyName: 'Acme Corp',
  featureKey: 'time_app' as const,
  consequencesCopy: 'Employees will no longer be able to log hours.',
}

afterEach(() => { document.body.innerHTML = '' })

describe('FeatureToggleCard', () => {
  it('on state — aria-checked true, "On" label, green track', () => {
    const w = mount(FeatureToggleCard, {
      props: base,
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    const sw = w.find('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('true')
    expect(sw.classes()).toContain('bg-[#28C764]')
    expect(w.text()).toContain('On')
    expect(w.text()).toContain('Time App')
  })

  it('off state — aria-checked false, "Off" label, red track', () => {
    const w = mount(FeatureToggleCard, {
      props: { ...base, modelValue: false },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    const sw = w.find('[role="switch"]')
    expect(sw.attributes('aria-checked')).toBe('false')
    expect(sw.classes()).toContain('bg-[#E5484D]')
    expect(w.text()).toContain('Off')
  })

  it('click while OFF → emits true immediately, no dialog', async () => {
    const w = mount(FeatureToggleCard, {
      props: { ...base, modelValue: false },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    await w.find('[role="switch"]').trigger('click')
    expect(w.emitted('update:modelValue')?.[0]).toEqual([true])
    // dialog should not be open
    expect(document.body.textContent).not.toContain('Deactivate Time App')
  })

  it('click while ON → opens confirm dialog, no emit yet', async () => {
    const w = mount(FeatureToggleCard, {
      props: base,
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    await w.find('[role="switch"]').trigger('click')
    expect(w.emitted('update:modelValue')).toBeUndefined()
    expect(document.body.textContent).toContain('Deactivate Time App for Acme Corp?')
    expect(document.body.textContent).toContain('Employees will no longer be able to log hours.')
    expect(document.body.textContent).toContain('Existing data is preserved.')
  })

  it('kicker defaults to TITLE.UPPERCASE when not passed', () => {
    const w = mount(FeatureToggleCard, {
      props: base,
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    expect(w.text()).toContain('TIME APP')
  })

  it('explicit kicker prop overrides default', () => {
    const w = mount(FeatureToggleCard, {
      props: { ...base, kicker: 'CUSTOM LABEL' },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    expect(w.text()).toContain('CUSTOM LABEL')
  })
})
