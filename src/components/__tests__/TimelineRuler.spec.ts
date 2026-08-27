import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import TimelineRuler from '@/components/TimelineRuler.vue'
import { useGranularStore } from '@/stores/granular'
import type { LoadedSample } from '@/models/sample.model'

/// The ruler measures itself, and jsdom gives every element a width of zero - so the observer is
/// driven by hand and the track answers with whatever the case under test needs it to be.
let observed: (() => void)[] = []

class MeasuringResizeObserver {
  constructor(private readonly callback: () => void) {}

  observe() {
    observed.push(this.callback)
  }

  unobserve() {}

  disconnect() {
    observed = observed.filter((callback) => callback !== this.callback)
  }
}

function sampleOf(durationSeconds: number): LoadedSample {
  return {
    name: 'take.wav',
    frames: new Float32Array(48000),
    sampleRate: 48000,
    durationSeconds,
    fileBytes: 1024,
    sourceChannels: 1,
    wasDownsampled: false
  }
}

async function mountRuler(trackWidth: number) {
  const wrapper = mount(TimelineRuler)
  const track = wrapper.find('.track').element

  Object.defineProperty(track, 'clientWidth', { value: trackWidth, configurable: true })

  for (const measure of observed) {
    measure()
  }

  await wrapper.vm.$nextTick()

  return wrapper
}

function labelsOf(wrapper: { findAll: (selector: string) => { text(): string }[] }) {
  return wrapper.findAll('.tick span').map((label) => label.text())
}

describe('TimelineRuler', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    observed = []
    vi.stubGlobal('ResizeObserver', MeasuringResizeObserver)

    return () => vi.unstubAllGlobals()
  })

  it('marks nothing when there is no sample, but keeps its height', async () => {
    const wrapper = await mountRuler(800)

    expect(wrapper.findAll('.tick')).toHaveLength(0)
    expect(wrapper.find('.track').exists()).toBe(true)
  })

  it('marks nothing before it has been measured', async () => {
    useGranularStore().setSample(sampleOf(298))

    expect((await mountRuler(0)).findAll('.tick')).toHaveLength(0)
  })

  /// Eight divisions of a 4:58 file tick at 0:37 and 1:51, which are not times anyone counts in.
  it('ticks on round times rather than dividing the sample into equal parts', async () => {
    useGranularStore().setSample(sampleOf(298))

    expect(labelsOf(await mountRuler(800))).toEqual([
      '0:00',
      '0:30',
      '1:00',
      '1:30',
      '2:00',
      '2:30',
      '3:00',
      '3:30',
      '4:00',
      '4:30'
    ])
  })

  it('takes a coarser step as the window narrows, so labels never run into each other', async () => {
    useGranularStore().setSample(sampleOf(298))

    const wide = labelsOf(await mountRuler(1600))
    const narrow = labelsOf(await mountRuler(300))

    expect(wide.length).toBeGreaterThan(narrow.length)
    expect(narrow).toEqual(['0:00', '2:00', '4:00'])
  })

  it('reaches the finest step it has for a short sample', async () => {
    useGranularStore().setSample(sampleOf(8))

    const wrapper = await mountRuler(800)

    expect(wrapper.findAll('.tick')).toHaveLength(9)
    expect(labelsOf(wrapper)).toEqual([
      '0:00',
      '0:01',
      '0:02',
      '0:03',
      '0:04',
      '0:05',
      '0:06',
      '0:07'
    ])
  })

  it('takes the coarsest step it has rather than running off the end of the ladder', async () => {
    useGranularStore().setSample(sampleOf(3600))

    const wrapper = await mountRuler(200)

    expect(wrapper.findAll('.tick').length).toBeGreaterThan(1)
    expect(labelsOf(wrapper)[1]).toBe('30:00')
  })

  it('keeps the last tick inside the frame it is measuring', async () => {
    useGranularStore().setSample(sampleOf(300))

    const wrapper = await mountRuler(800)
    const offsets = wrapper
      .findAll('.tick')
      .map((tick) => Number.parseFloat(tick.attributes('style')?.replace(/[^\d.]/g, '') ?? '0'))

    expect(Math.max(...offsets)).toBeLessThanOrEqual(799)
  })

  it('drops a label the right edge would cut in half rather than clipping it', async () => {
    useGranularStore().setSample(sampleOf(300))

    const wrapper = await mountRuler(800)

    expect(wrapper.findAll('.tick').length).toBeGreaterThan(labelsOf(wrapper).length)
  })

  /// Between a window opening and its decode finishing, the patch is holding a sample the editor
  /// cannot draw - and a ruler measuring nothing under a waveform that is playing would be a lie.
  it('measures what the engine holds when this window has decoded nothing', async () => {
    useGranularStore().applyEngineState({
      headPositions: [],
      levelLeft: 0,
      levelRight: 0,
      activeGrains: 0,
      loadedFrames: 480000,
      bufferRate: 48000
    })

    const labels = labelsOf(await mountRuler(800))

    expect(labels[0]).toBe('0:00')
    expect(labels.at(-1)).toBe('0:09')
  })

  it('prefers the sample it has decoded over what the engine reports', async () => {
    const store = useGranularStore()

    store.setSample(sampleOf(298))
    store.applyEngineState({
      headPositions: [],
      levelLeft: 0,
      levelRight: 0,
      activeGrains: 0,
      loadedFrames: 480000,
      bufferRate: 48000
    })

    expect(labelsOf(await mountRuler(800))).toContain('4:30')
  })

  it('lets go of the observer when it is torn down', async () => {
    const wrapper = await mountRuler(800)

    expect(observed).toHaveLength(1)

    wrapper.unmount()

    expect(observed).toHaveLength(0)
  })
})
