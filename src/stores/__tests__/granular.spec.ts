import { beforeEach, describe, expect, it } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { engine } from '@/models/granular.model'
import type { GrainEvent, LoadedSample } from '@/models/sample.model'

function grainAt(bornAt: number, position = 0.5): GrainEvent {
  return {
    position,
    lengthSeconds: 0.12,
    level: 1,
    pan: 0,
    rate: 1,
    voice: 0,
    head: 0,
    bornAt,
    seed: 0.5
  }
}

function sampleOf(frames: number, sampleRate = 48000): LoadedSample {
  return {
    name: 'take.wav',
    frames: new Float32Array(frames),
    sampleRate,
    durationSeconds: frames / sampleRate,
    fileBytes: frames * 4,
    sourceChannels: 1,
    wasDownsampled: false
  }
}

describe('the granular store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  describe('parameters', () => {
    it('starts every parameter on its own initial', () => {
      const store = useGranularStore()

      expect(store.parameterValue('h1EnableIn')).toBe(1)
      expect(store.parameterValue('h2EnableIn')).toBe(0)
      expect(store.parameterValue('gainIn')).toBe(-6)
    })

    it('reads an endpoint it does not hold as zero rather than undefined', () => {
      expect(useGranularStore().parameterValue('nope')).toBe(0)
    })

    it('takes a write from either side without reconciling', () => {
      const store = useGranularStore()

      store.setParameter('h1DensityIn', 96)

      expect(store.parameterValue('h1DensityIn')).toBe(96)
    })
  })

  describe('the selected head', () => {
    it('clamps to the heads that exist', () => {
      const store = useGranularStore()

      store.selectHead(-1)
      expect(store.selectedHead).toBe(0)

      store.selectHead(99)
      expect(store.selectedHead).toBe(engine.headCount - 1)
    })
  })

  describe('what the window says there is', () => {
    it('holds no sample and offers nothing to clear when nothing has been dropped', () => {
      const store = useGranularStore()

      expect(store.hasSample).toBe(false)
      expect(store.engineHasSample).toBe(false)
      expect(store.canClear).toBe(false)
    })

    it('never claims there is no sample while the engine is holding one', () => {
      const store = useGranularStore()

      store.applyEngineState({
        headPositions: Array.from({ length: engine.headCount }, () => 0),
        levelLeft: 0,
        levelRight: 0,
        activeGrains: 0,
        loadedFrames: 96000,
        bufferRate: 48000
      })

      expect(store.hasSample).toBe(false)
      expect(store.engineHasSample).toBe(true)
      expect(store.canClear).toBe(true)
      expect(store.engineSeconds).toBe(2)
    })

    it('measures the engine length by the rate the patch reports, not by the loaded sample', () => {
      const store = useGranularStore()

      store.setSample(sampleOf(48000))
      store.applyEngineState({
        headPositions: [],
        levelLeft: 0,
        levelRight: 0,
        activeGrains: 0,
        loadedFrames: 93000,
        bufferRate: 9300
      })

      expect(store.engineSeconds).toBe(10)
    })

    it('reads no length at all before a rate has arrived', () => {
      expect(useGranularStore().engineSeconds).toBe(0)
    })

    it('treats a one frame buffer as no sample', () => {
      const store = useGranularStore()

      store.setSample(sampleOf(1))

      expect(store.hasSample).toBe(false)
    })

    it('is loading only while decoding or sending', () => {
      const store = useGranularStore()

      expect(store.isLoading).toBe(false)

      store.setTransfer({ phase: 'decoding', progress: 0, message: '' })
      expect(store.isLoading).toBe(true)

      store.setTransfer({ phase: 'sending', progress: 0.5, message: '' })
      expect(store.isLoading).toBe(true)

      store.setTransfer({ phase: 'ready', progress: 1, message: '' })
      expect(store.isLoading).toBe(false)
    })
  })

  describe('the grain cloud', () => {
    it('drops every live grain when the sample is replaced', () => {
      const store = useGranularStore()

      store.addGrain(grainAt(performance.now()))
      store.setSample(sampleOf(48000))

      expect(store.grains).toHaveLength(0)
    })

    it('replaces the array rather than mutating it, or the canvas would never redraw', () => {
      const store = useGranularStore()
      const before = store.grains

      store.addGrain(grainAt(performance.now()))

      expect(store.grains).not.toBe(before)
    })

    it('sheds a grain older than its lifetime as the next one lands', () => {
      const store = useGranularStore()
      const now = 10_000

      store.addGrain(grainAt(now - store.grainLifetimeMs - 1, 0.1))
      store.addGrain(grainAt(now, 0.9))

      expect(store.grains.map((grain) => grain.position)).toEqual([0.9])
    })

    it('caps the drawn cloud, keeping the newest', () => {
      const store = useGranularStore()

      for (let index = 0; index < 400; ++index) {
        store.addGrain(grainAt(10_000, index / 400))
      }

      expect(store.grains.length).toBeLessThanOrEqual(240)
      expect(store.grains.at(-1)?.position).toBeCloseTo(399 / 400, 6)
    })

    it('expires on its own clock so the cloud thins out when the patch goes quiet', () => {
      const store = useGranularStore()

      store.addGrain(grainAt(1000))
      store.expireGrains(1000 + store.grainLifetimeMs + 1)

      expect(store.grains).toHaveLength(0)
    })

    it('leaves the array alone when nothing has aged out', () => {
      const store = useGranularStore()

      store.addGrain(grainAt(1000))

      const before = store.grains

      store.expireGrains(1100)

      expect(store.grains).toBe(before)
    })
  })

  describe('engine state', () => {
    it('adopts every head position the patch reports', () => {
      const store = useGranularStore()
      const headPositions = Array.from({ length: engine.headCount }, (_, head) => head / 10)

      store.applyEngineState({
        headPositions,
        levelLeft: 0.8,
        levelRight: 0.5,
        activeGrains: 42,
        loadedFrames: 1024,
        bufferRate: 48000
      })

      expect(store.headPositions).toEqual(headPositions)
      expect(store.outputLevelLeft).toBe(0.8)
      expect(store.outputLevelRight).toBe(0.5)
      expect(store.activeGrains).toBe(42)
    })

    it('starts with one position per head, so the editor can draw all eight before any arrive', () => {
      expect(useGranularStore().headPositions).toHaveLength(engine.headCount)
    })
  })

  describe('the drag flag', () => {
    it('is shared, because the whole window is the drop target', () => {
      const store = useGranularStore()

      store.setDraggingFile(true)
      expect(store.isDraggingFile).toBe(true)

      store.setDraggingFile(false)
      expect(store.isDraggingFile).toBe(false)
    })
  })
})
