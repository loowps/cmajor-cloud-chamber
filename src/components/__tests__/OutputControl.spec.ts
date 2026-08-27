import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import OutputControl from '@/components/OutputControl.vue'
import { useGranularStore } from '@/stores/granular'
import { definitionFor, valueToNormalised, type ParameterDefinition } from '@/models/granular.model'
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

const gain = definitionFor('gainIn') as ParameterDefinition

const unityPercent = valueToNormalised(gain, 0) * 100

function percent(wrapper: ReturnType<typeof mount>, selector: string, property: string) {
  const declaration = (wrapper.find(selector).attributes('style') ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${property}:`))

  return declaration ? Number.parseFloat(declaration.slice(property.length + 1)) : Number.NaN
}

function laneFills(wrapper: ReturnType<typeof mount>) {
  return wrapper.findAll('.lane').map((lane) => {
    const declaration = (lane.find('.fill').attributes('style') ?? '').trim()

    return Number.parseFloat(declaration.replace('width:', ''))
  })
}

async function withLevels(levelLeft: number, levelRight = levelLeft) {
  const wrapper = mount(OutputControl)

  useGranularStore().applyEngineState({
    headPositions: [],
    levelLeft,
    levelRight,
    activeGrains: 0,
    loadedFrames: 0,
    bufferRate: 0
  })
  await wrapper.vm.$nextTick()

  return wrapper
}

describe('OutputControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('is the slider for the output parameter', () => {
    const track = mount(OutputControl).find('.track')

    expect(track.attributes('role')).toBe('slider')
    expect(track.attributes('aria-label')).toBe('Output')
    expect(track.attributes('aria-valuemin')).toBe(String(gain.min))
    expect(track.attributes('aria-valuemax')).toBe(String(gain.max))
  })

  it('stands the cap where the fader is', async () => {
    const store = useGranularStore()
    const wrapper = mount(OutputControl)

    store.setParameter('gainIn', 0)
    await wrapper.vm.$nextTick()

    expect(percent(wrapper, '.cap', 'left')).toBeCloseTo(unityPercent, 4)
  })

  /**
   * The point of merging the two: the meter is drawn on the fader's ruler, so a level and a gain
   * setting of the same decibels land on the same pixel and the gap to the end of the track is
   * headroom rather than an unrelated proportion. The ramp and the mark are both hung off it, so
   * the track carries the fraction once rather than each part working it out again.
   */
  it('hangs the scale off one fraction, which is where the fader reads 0dB', () => {
    const track = mount(OutputControl).find('.track')

    expect(track.attributes('style')).toContain(`--unity: ${unityPercent}%`)
  })

  describe('the meter', () => {
    /// A head can be panned outright and Pan Spread scatters the cloud across the image, so one
    /// bar would report the louder side and say nothing about the other one falling silent.
    it('draws a lane per channel, each on its own level', async () => {
      const wrapper = await withLevels(1, 10 ** (-36 / 20))

      expect(laneFills(wrapper)).toEqual([
        valueToNormalised(gain, 0) * 100,
        valueToNormalised(gain, -36) * 100
      ])
    })

    /// A linear meter spends most of its length on the top 6dB, so the scale is the one the ear
    /// uses - and the fader's own range is already in decibels.
    it('is decibels, so 0dBFS lands where the fader reads 0dB', async () => {
      expect(laneFills(await withLevels(1))[0]).toBeCloseTo(unityPercent, 4)
    })

    it('is empty at silence rather than at the floor of the scale', async () => {
      expect(laneFills(await withLevels(0))).toEqual([0, 0])
    })

    it('bottoms out below the floor rather than running off the track', async () => {
      expect(laneFills(await withLevels(10 ** (-90 / 20)))).toEqual([0, 0])
    })

    it('never overruns the track above the fader ceiling', async () => {
      expect(laneFills(await withLevels(10 ** (24 / 20)))).toEqual([100, 100])
    })
  })

  /**
   * The overshoot itself is what is painted, not the whole reading: how far past unity it went is
   * the thing worth seeing, and repainting from the floor up would throw that away to say
   * something the mark already says.
   */
  describe('the clip', () => {
    it('stays out until a channel clears 0dBFS', async () => {
      expect((await withLevels(0.9)).findAll('.clip')).toHaveLength(0)
    })

    it('appears only on the channel that clipped', async () => {
      const lanes = (await withLevels(1.2, 0.9)).findAll('.lane')

      expect(lanes[0].find('.clip').exists()).toBe(true)
      expect(lanes[1].find('.clip').exists()).toBe(false)
    })

    it('measures the overshoot alone, not the reading under it', async () => {
      const wrapper = await withLevels(10 ** (6 / 20))

      expect(percent(wrapper, '.clip', 'width')).toBeCloseTo(
        valueToNormalised(gain, 6) * 100 - unityPercent,
        4
      )
    })
  })

  describe('the gesture', () => {
    it('resets to the parameter initial on a double click of the track', async () => {
      const store = useGranularStore()
      const wrapper = mount(OutputControl)

      store.setParameter('gainIn', 0)
      await wrapper.vm.$nextTick()
      await wrapper.find('.track').trigger('dblclick')

      expect(patchSync.sendParameter).toHaveBeenCalledWith('gainIn', gain.initial)
      expect(patchSync.beginGesture).toHaveBeenCalledWith('gainIn')
      expect(patchSync.endGesture).toHaveBeenCalledWith('gainIn')
    })

    /// A nudged value is as much one gesture as a drag is, so the host records it as an edit
    /// rather than as a value that arrived on its own.
    it('brackets an arrow key in a gesture', async () => {
      await mount(OutputControl).find('.track').trigger('keydown', { key: 'ArrowRight' })

      expect(patchSync.beginGesture).toHaveBeenCalledWith('gainIn')
      expect(patchSync.endGesture).toHaveBeenCalledWith('gainIn')
    })
  })
})
