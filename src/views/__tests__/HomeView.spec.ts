import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HomeView from '@/views/HomeView.vue'
import HeaderBand from '@/components/HeaderBand.vue'
import WaveformDisplay from '@/components/WaveformDisplay.vue'
import TimelineRuler from '@/components/TimelineRuler.vue'
import ParameterGroup from '@/components/ParameterGroup.vue'
import BandDivider from '@/components/BandDivider.vue'
import { useGranularStore } from '@/stores/granular'
import { parameterBands } from '@/models/granular.model'
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

function labelsOf(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAllComponents(ParameterGroup).map((group) => group.props('label'))
}

describe('HomeView', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('stacks the header, the waveform, the ruler and the bands', () => {
    const wrapper = mount(HomeView)

    expect(wrapper.findComponent(HeaderBand).exists()).toBe(true)
    expect(wrapper.findComponent(WaveformDisplay).exists()).toBe(true)
    expect(wrapper.findComponent(TimelineRuler).exists()).toBe(true)
    expect(wrapper.findAll('.band')).toHaveLength(parameterBands.length)
  })

  it('draws every group the parameter set lays out', () => {
    expect(mount(HomeView).findAllComponents(ParameterGroup)).toHaveLength(
      parameterBands.flat().length
    )
  })

  /// A group spends what it holds on height, so a band holds two of them and no more - three
  /// would squeeze that band's tracks while the others kept theirs.
  it('parts the two groups inside a band with a rule, and puts none at its edges', () => {
    const bands = mount(HomeView).findAll('.band')

    expect(bands).toHaveLength(parameterBands.length)

    for (const band of bands) {
      expect(band.findAllComponents(BandDivider)).toHaveLength(1)
      expect(band.findAllComponents(ParameterGroup)).toHaveLength(2)
    }
  })

  /// A band of knobs must never read as belonging to the wrong head when the selection has moved
  /// and the knobs have not visibly changed.
  it('names the head in every per-head heading', async () => {
    const store = useGranularStore()
    const wrapper = mount(HomeView)

    expect(labelsOf(wrapper)).toContain('Source · H1')

    store.selectHead(5)
    await wrapper.vm.$nextTick()

    expect(labelsOf(wrapper)).toContain('Source · H6')
    expect(labelsOf(wrapper)).toContain('Grain · H6')
  })

  it('leaves the instrument groups unnamed by head, because they do not change with it', async () => {
    const store = useGranularStore()
    const wrapper = mount(HomeView)

    store.selectHead(5)
    await wrapper.vm.$nextTick()

    expect(labelsOf(wrapper)).toContain('Amplitude')
    expect(labelsOf(wrapper)).toContain('Engine')
  })

  it('moves the per-head rows onto the head that is up', async () => {
    const store = useGranularStore()
    const wrapper = mount(HomeView)

    store.selectHead(2)
    await wrapper.vm.$nextTick()

    const source = wrapper
      .findAllComponents(ParameterGroup)
      .find((group) => group.props('label') === 'Source · H3')

    expect(source?.props('rows').every((row) => row.definition.endpoint.startsWith('h3'))).toBe(
      true
    )
  })

  it('leaves the instrument rows where they are when the head changes', async () => {
    const store = useGranularStore()
    const wrapper = mount(HomeView)
    const before = wrapper
      .findAllComponents(ParameterGroup)
      .find((group) => group.props('label') === 'Engine')
      ?.props('rows')
      .map((row) => row.definition.endpoint)

    store.selectHead(4)
    await wrapper.vm.$nextTick()

    const after = wrapper
      .findAllComponents(ParameterGroup)
      .find((group) => group.props('label') === 'Engine')
      ?.props('rows')
      .map((row) => row.definition.endpoint)

    expect(after).toEqual(before)
  })
})
