import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import GrainCount from '@/components/GrainCount.vue'
import { useGranularStore } from '@/stores/granular'

function applyGrains(activeGrains: number) {
  useGranularStore().applyEngineState({
    headPositions: [],
    levelLeft: 0,
    levelRight: 0,
    activeGrains,
    loadedFrames: 0,
    bufferRate: 0
  })
}

describe('GrainCount', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  /// The pool is the one thing in the window the editor cannot work out for itself: it is shared
  /// across every voice and every head, so only the patch knows how much of it is alive.
  it('reads the live grain count off the patch', async () => {
    const wrapper = mount(GrainCount)

    applyGrains(37)
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('37')
  })

  it('reads nothing before the patch has reported', () => {
    expect(mount(GrainCount).find('.value').text()).toBe('0')
  })
})
