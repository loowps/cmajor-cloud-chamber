import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import FreeRunToggle from '@/components/FreeRunToggle.vue'
import { useGranularStore } from '@/stores/granular'
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

function mountToggle() {
  return mount(FreeRunToggle)
}

describe('FreeRunToggle', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('is a switch that says which way it is thrown', () => {
    const button = mountToggle().find('button')

    expect(button.attributes('role')).toBe('switch')
    expect(button.attributes('aria-checked')).toBe('false')
  })

  /// The footer names it Free Run; the label is where what that means is said, because nothing
  /// else in the bar tells a reader the instrument sounds with no note held.
  it('says what the switch does rather than repeating its name', async () => {
    const store = useGranularStore()
    const wrapper = mountToggle()

    expect(wrapper.find('button').attributes('aria-label')).toBe(
      'Free Run: silent until a note is played'
    )

    store.setParameter('freeRunIn', 1)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button').attributes('aria-label')).toBe(
      'Free Run: sounding at the root note'
    )
  })

  it('sounds the drone and silences it again', async () => {
    const store = useGranularStore()
    const wrapper = mountToggle()

    await wrapper.find('button').trigger('click')

    expect(patchSync.sendParameter).toHaveBeenCalledWith('freeRunIn', 1)

    store.setParameter('freeRunIn', 1)
    await wrapper.vm.$nextTick()
    await wrapper.find('button').trigger('click')

    expect(patchSync.sendParameter).toHaveBeenCalledWith('freeRunIn', 0)
  })

  it('is one gesture, so the host records it as an edit', async () => {
    const wrapper = mountToggle()

    await wrapper.find('button').trigger('click')

    expect(patchSync.beginGesture).toHaveBeenCalledExactlyOnceWith('freeRunIn')
    expect(patchSync.endGesture).toHaveBeenCalledExactlyOnceWith('freeRunIn')
  })

  it('follows the host writing the parameter back', async () => {
    const store = useGranularStore()
    const wrapper = mountToggle()

    store.setParameter('freeRunIn', 1)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('button').attributes('aria-checked')).toBe('true')
  })
})
