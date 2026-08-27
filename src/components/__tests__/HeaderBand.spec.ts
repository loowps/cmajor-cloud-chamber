import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HeaderBand from '@/components/HeaderBand.vue'
import ParameterField from '@/components/ParameterField.vue'
import HeadPowerButton from '@/components/HeadPowerButton.vue'
import { useGranularStore } from '@/stores/granular'
import { headParameterRows } from '@/models/granular.model'
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

describe('HeaderBand', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  /// The header is the head, not a band of controls: whether it sounds, which one it is, and what
  /// comes out of it.
  it('reads left to right as the switch, the name, and the output fields', () => {
    const wrapper = mount(HeaderBand)

    expect(wrapper.findComponent(HeadPowerButton).exists()).toBe(true)
    expect(wrapper.find('.name').text()).toBe('Head 1')
    expect(wrapper.findAllComponents(ParameterField)).toHaveLength(
      headParameterRows(0, 'output').length
    )
  })

  it('names the head the whole window is editing', async () => {
    const store = useGranularStore()
    const wrapper = mount(HeaderBand)

    store.selectHead(7)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.name').text()).toBe('Head 8')
  })

  it('follows the selection onto the head that is up', async () => {
    const store = useGranularStore()
    const wrapper = mount(HeaderBand)

    store.selectHead(4)
    await wrapper.vm.$nextTick()

    const endpoints = wrapper
      .findAllComponents(ParameterField)
      .map((field) => field.props('definition').endpoint)

    expect(endpoints.every((endpoint: string) => endpoint.startsWith('h5'))).toBe(true)
  })

  it('carries the output group as fields rather than as rows with tracks', () => {
    const labels = mount(HeaderBand)
      .findAllComponents(ParameterField)
      .map((field) => field.props('definition').label)

    expect(labels).toEqual(['Level', 'Pan', 'Pitch', 'Fine'])
  })

  it('pairs each jitter with the value it scatters', () => {
    const spreads = mount(HeaderBand)
      .findAllComponents(ParameterField)
      .map((field) => field.props('secondary')?.label)

    expect(spreads).toEqual(['Level Jitter', 'Pan Spread', 'Pitch Jitter', undefined])
  })

  it('reads each field from the store', async () => {
    const store = useGranularStore()

    store.setParameter('h1PanIn', -0.5)

    const wrapper = mount(HeaderBand)
    const pan = wrapper
      .findAllComponents(ParameterField)
      .find((field) => field.props('definition').endpoint === 'h1PanIn')

    expect(pan?.props('modelValue')).toBe(-0.5)
  })

  it('sends a field change on its own endpoint', () => {
    const field = mount(HeaderBand).findAllComponents(ParameterField)[0]

    field.vm.$emit('update:modelValue', -12)
    field.vm.$emit('gestureStart')
    field.vm.$emit('gestureEnd')

    expect(patchSync.sendParameter).toHaveBeenCalledExactlyOnceWith('h1LevelIn', -12)
    expect(patchSync.beginGesture).toHaveBeenCalledExactlyOnceWith('h1LevelIn')
    expect(patchSync.endGesture).toHaveBeenCalledExactlyOnceWith('h1LevelIn')
  })

  it('sends a spread on the jitter endpoint, not on the value beside it', () => {
    const field = mount(HeaderBand).findAllComponents(ParameterField)[0]

    field.vm.$emit('update:secondaryValue', 0.6)
    field.vm.$emit('secondaryGestureStart')
    field.vm.$emit('secondaryGestureEnd')

    expect(patchSync.sendParameter).toHaveBeenCalledExactlyOnceWith('h1LevelJitterIn', 0.6)
    expect(patchSync.beginGesture).toHaveBeenCalledExactlyOnceWith('h1LevelJitterIn')
  })
})
