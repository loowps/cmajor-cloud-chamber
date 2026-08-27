import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FooterComponent from '@/components/FooterComponent.vue'
import FreeRunToggle from '@/components/FreeRunToggle.vue'
import HeadSelector from '@/components/HeadSelector.vue'
import GrainCount from '@/components/GrainCount.vue'
import OutputControl from '@/components/OutputControl.vue'
import VendorLogo from '@/components/VendorLogo.vue'
import BandDivider from '@/components/BandDivider.vue'
import type { PatchSync } from '@/composables/usePatchSync'

vi.mock('@/composables/usePatchSync', () => ({
  usePatchSync: () =>
    ({
      sendParameter: vi.fn(),
      beginGesture: vi.fn(),
      endGesture: vi.fn(),
      dropSample: vi.fn(),
      clearSample: vi.fn()
    }) satisfies PatchSync
}))

describe('FooterComponent', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /// The head strip governs every band in the window, so it belongs to the frame rather than to a
  /// band inside it - and the plugin has no title bar for the wordmark to live in.
  it('carries Free Run, the head strip, the engine readings and the wordmark', () => {
    const wrapper = mount(FooterComponent)

    expect(wrapper.findComponent(FreeRunToggle).exists()).toBe(true)
    expect(wrapper.findComponent(HeadSelector).exists()).toBe(true)
    expect(wrapper.findComponent(GrainCount).exists()).toBe(true)
    expect(wrapper.findComponent(OutputControl).exists()).toBe(true)
    expect(wrapper.findComponent(VendorLogo).exists()).toBe(true)
    expect(wrapper.findComponent(BandDivider).exists()).toBe(true)
  })

  /// Free Run sounds the whole instrument, so it stands at the window's left edge ahead of the
  /// strip rather than among the head's own switches.
  it('stands Free Run at the left edge, before the head strip', () => {
    const wrapper = mount(FooterComponent)
    const controls = wrapper.findAll('footer button')

    expect(controls[0].classes()).toContain('free-run')
  })

  it('names the plugin beside the vendor mark', () => {
    expect(mount(FooterComponent).find('.name').text()).toBe('Cloud Chamber')
  })

  it('is a footer, so it is a landmark rather than one more div', () => {
    expect(mount(FooterComponent).find('footer').exists()).toBe(true)
  })

  /// A signature rather than a control: nothing here is clickable.
  it('puts no control in the brand', () => {
    expect(mount(FooterComponent).find('.brand').findAll('button')).toHaveLength(0)
  })
})
