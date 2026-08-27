import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { engine } from '@/models/granular.model'

const deviceRate = 48000

interface DecodeCall {
  contextRate: number
  byteLength: number
}

const decodeCalls: DecodeCall[] = []

/// What the file is pretending to be, which the stubbed decoder answers every request with.
let sourceSeconds = 4
let sourceChannels = 1

/**
 * jsdom has no Web Audio at all, and the loader's whole subject is which rate it decodes at - so
 * the stub records the context's rate and answers at it, which is exactly what the real
 * decodeAudioData does.
 */
function installAudioStubs() {
  class StubOfflineAudioContext {
    constructor(
      _channels: number,
      _length: number,
      readonly sampleRate: number
    ) {}

    decodeAudioData(data: ArrayBuffer) {
      decodeCalls.push({ contextRate: this.sampleRate, byteLength: data.byteLength })

      const length = Math.round(sourceSeconds * this.sampleRate)

      return Promise.resolve({
        length,
        duration: sourceSeconds,
        sampleRate: this.sampleRate,
        numberOfChannels: sourceChannels,
        getChannelData: (channel: number) =>
          Float32Array.from({ length }, () => (channel === 0 ? 0.5 : -0.1))
      } as unknown as AudioBuffer)
    }
  }

  vi.stubGlobal('OfflineAudioContext', StubOfflineAudioContext)
  vi.stubGlobal(
    'AudioContext',
    class {
      sampleRate = deviceRate
      close() {
        return Promise.resolve()
      }
    }
  )
}

/// The loader caches the device rate in module scope, so each case needs its own module instance.
async function freshLoader() {
  vi.resetModules()
  installAudioStubs()
  decodeCalls.length = 0

  return import('@/composables/useSampleLoader')
}

describe('useSampleLoader', () => {
  beforeEach(() => {
    sourceSeconds = 4
    sourceChannels = 1
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('choosing the rate', () => {
    it('keeps the device rate for a file short enough to fit at it', async () => {
      const { loadSampleData } = await freshLoader()

      const sample = await loadSampleData('take.wav', new ArrayBuffer(64))

      expect(sample.sampleRate).toBe(deviceRate)
      expect(sample.wasDownsampled).toBe(false)
    })

    it('decodes twice for a short file, because the length is not known until the first pass', async () => {
      const { loadSampleData } = await freshLoader()

      await loadSampleData('take.wav', new ArrayBuffer(64))

      expect(decodeCalls).toHaveLength(2)
      expect(decodeCalls[1].contextRate).toBe(deviceRate)
    })

    it('brings a long file down to whatever rate makes it fit the buffer', async () => {
      const { loadSampleData } = await freshLoader()

      sourceSeconds = 1800

      const sample = await loadSampleData('long.wav', new ArrayBuffer(64))

      expect(sample.sampleRate).toBeLessThan(deviceRate)
      expect(sample.sampleRate * sourceSeconds).toBeLessThanOrEqual(engine.maxSampleFrames)
      expect(sample.wasDownsampled).toBe(true)
    })

    it('never lands below the floor OfflineAudioContext will take', async () => {
      const { loadSampleData } = await freshLoader()

      sourceSeconds = engine.maxSampleSeconds

      const sample = await loadSampleData('hour.wav', new ArrayBuffer(64))

      expect(sample.sampleRate).toBeGreaterThanOrEqual(engine.minSampleRate)
    })

    it('pays for one decode on the case that costs the most, not two', async () => {
      const { loadSampleData } = await freshLoader()

      sourceSeconds = engine.maxSampleSeconds

      await loadSampleData('hour.wav', new ArrayBuffer(64))

      expect(decodeCalls).toHaveLength(1)
    })

    it('refuses a file longer than the buffer can hold at any rate', async () => {
      const { loadSampleData, SampleTooLongError } = await freshLoader()

      sourceSeconds = engine.maxSampleSeconds + 1

      await expect(loadSampleData('epic.wav', new ArrayBuffer(64))).rejects.toBeInstanceOf(
        SampleTooLongError
      )
    })

    it('says how long the file was in the error, so the message can name it', async () => {
      const { loadSampleData, SampleTooLongError } = await freshLoader()

      sourceSeconds = 4000

      const error = await loadSampleData('epic.wav', new ArrayBuffer(64)).catch((e) => e)

      expect(error).toBeInstanceOf(SampleTooLongError)
      expect(error.durationSeconds).toBe(4000)
      expect(error.message).toContain('66.7 minutes')
    })
  })

  describe('what it hands back', () => {
    it('reads the file size before decoding, which detaches the buffer', async () => {
      const { loadSampleData } = await freshLoader()

      const sample = await loadSampleData('take.wav', new ArrayBuffer(4096))

      expect(sample.fileBytes).toBe(4096)
    })

    it('keeps the source length rather than the resampled one', async () => {
      const { loadSampleData } = await freshLoader()

      sourceSeconds = 1800

      const sample = await loadSampleData('long.wav', new ArrayBuffer(64))

      expect(sample.durationSeconds).toBe(1800)
    })

    it('downmixes to the one mono buffer the patch reads', async () => {
      const { loadSampleData } = await freshLoader()

      sourceChannels = 2

      const sample = await loadSampleData('stereo.wav', new ArrayBuffer(64))

      expect(sample.sourceChannels).toBe(2)
      expect(sample.frames[0]).toBeCloseTo((0.5 - 0.1) / 2, 6)
    })

    it('leaves a mono file at its own level rather than halving it', async () => {
      const { loadSampleData } = await freshLoader()

      const sample = await loadSampleData('mono.wav', new ArrayBuffer(64))

      expect(sample.frames[0]).toBeCloseTo(0.5, 6)
    })

    it('carries the name it was given', async () => {
      const { loadSampleData } = await freshLoader()

      expect((await loadSampleData('restored.ogg', new ArrayBuffer(64))).name).toBe('restored.ogg')
    })

    it('takes the name off a dropped file', async () => {
      const { loadSample } = await freshLoader()

      const file = new File([new ArrayBuffer(64)], 'dropped.wav')

      expect((await loadSample(file)).name).toBe('dropped.wav')
    })
  })

  describe('fullRateSeconds', () => {
    it('is the length a file can reach before it starts losing bandwidth', async () => {
      const { fullRateSeconds } = await freshLoader()

      expect(fullRateSeconds()).toBeCloseTo(engine.maxSampleFrames / deviceRate, 6)
      expect(fullRateSeconds() / 60).toBeGreaterThan(11)
    })
  })
})
