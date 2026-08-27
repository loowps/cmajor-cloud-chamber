import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HeadPowerButton from '@/components/HeadPowerButton.vue'
import { useGranularStore } from '@/stores/granular'
import { enableEndpointFor } from '@/models/granular.model'
import type { PatchSync } from '@/composables/usePatchSync'

const patchSync = {
  sendParameter: vi.fn(),
  beginGesture: vi.fn(),
  endGesture: vi.fn(),
  dropSample: vi.fn(),
  clearSample: vi.fn()
} satisfies PatchSync

vi.mock('@/composables/usePatchSync', () => ({
  usePatchSync: () => patchSync
}))

function mountPower() {
  return mount(HeadPowerButton)
}

describe('HeadPowerButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('is a switch that says which way it is thrown', () => {
    const button = mountPower().find('button')

    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-checked')).toBe('true')
  })

  /// It sits at the window's left edge rather than beside the strip, so nothing else in the band
  /// would say which of the eight it is about.
  it('names the head it is about and whether that head sounds', async () => {
    const store = useGranularStore()
    const wrapper = mountPower()

    expect(wrapper.find('button').attributes('aria-label')).toBe('Head 1: sounding')

    store.selectHead(2)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button').attributes('aria-label')).toBe('Head 3: silent')
  })

  it('switches the head that is up, not head one', async () => {
    const store = useGranularStore()
    const wrapper = mountPower()

    store.selectHead(4)
    await wrapper.vm.$nextTick()
    await wrapper.find('button').trigger('click')

    expect(patchSync.sendParameter).toHaveBeenCalledWith(enableEndpointFor(4), 1)
  })

  it('silences a head that is sounding', async () => {
    const wrapper = mountPower()

    await wrapper.find('button').trigger('click')

    expect(patchSync.sendParameter).toHaveBeenCalledWith('h1EnableIn', 0)
  })

  it('is one gesture, so the host records it as an edit', async () => {
    const wrapper = mountPower()

    await wrapper.find('button').trigger('click')

    expect(patchSync.beginGesture).toHaveBeenCalledExactlyOnceWith('h1EnableIn')
    expect(patchSync.endGesture).toHaveBeenCalledExactlyOnceWith('h1EnableIn')
  })

  it('follows the host writing the parameter back', async () => {
    const store = useGranularStore()
    const wrapper = mountPower()

    store.setParameter('h1EnableIn', 0)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button').attributes('aria-checked')).toBe('false')
  })
})
