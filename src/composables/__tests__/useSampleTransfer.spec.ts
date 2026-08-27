import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transferSample, type TransferCallbacks } from '@/composables/useSampleTransfer'
import { engine } from '@/models/granular.model'
import { PatchConnectionEndpoint } from '@/models/patch-connection-endpoints.enum'
import type { PatchConnection } from '@/models/patch-connection.model'
import type { LoadedSample } from '@/models/sample.model'

interface SentEvent {
  endpoint: string
  value: any
  timeout?: number
}

/**
 * Stands in for the engine's input queue. Nothing is acknowledged unless a test says so, which is
 * what lets the sliding window and its fallback be told apart.
 */
function recordingConnection() {
  const sent: SentEvent[] = []

  const connection = {
    sendEventOrValue(endpoint: string, value: any, _ramp?: number, timeout?: number) {
      // The transfer fills one array over and over, which is safe only because the runtime
      // serialises on the way out. Kept by reference here, every chunk would read as the last.
      const frames = value?.frames

      sent.push({ endpoint, value: frames ? { ...value, frames: [...frames] } : value, timeout })
    }
  } as unknown as PatchConnection

  return {
    connection,
    sent,
    of: (endpoint: PatchConnectionEndpoint) => sent.filter((event) => event.endpoint === endpoint)
  }
}

function sampleOf(frames: number, sampleRate = 48000): LoadedSample {
  const data = new Float32Array(frames)

  for (let frame = 0; frame < frames; ++frame) {
    data[frame] = frame / frames
  }

  return {
    name: 'take.wav',
    frames: data,
    sampleRate,
    durationSeconds: frames / sampleRate,
    fileBytes: frames * 4,
    sourceChannels: 1,
    wasDownsampled: false
  }
}

function spyCallbacks(): TransferCallbacks & {
  progress: [number, number][]
  completed: number
  cancelled: number
} {
  const state = { progress: [] as [number, number][], completed: 0, cancelled: 0 }

  return {
    ...state,
    onProgress(sent, total) {
      this.progress.push([sent, total])
    },
    onComplete() {
      this.completed += 1
    },
    onCancelled() {
      this.cancelled += 1
    }
  }
}

/**
 * Runs the loop's own yields - a zero delay, which the fake clock will not fire without being
 * moved at all - while staying far short of acknowledgeTimeoutMs. So anything that finishes under
 * a tick finished on the acknowledgements rather than on the timeout waiting behind them.
 */
async function tick(passes = 40) {
  for (let pass = 0; pass < passes; ++pass) {
    await vi.advanceTimersByTimeAsync(1)
  }
}

/// Long enough to carry the transfer past acknowledgeTimeoutMs, which is what the fallback waits.
async function settle() {
  for (let pass = 0; pass < 80; ++pass) {
    await vi.advanceTimersByTimeAsync(100)
  }
}

describe('transferSample', () => {
  beforeEach(() => {
    vi.useFakeTimers()

    return () => vi.useRealTimers()
  })

  it('brackets the chunks with a begin that disarms and an end that arms', async () => {
    const patch = recordingConnection()
    const frames = engine.chunkFrames * 3
    const handle = transferSample(patch.connection, sampleOf(frames), spyCallbacks())

    handle.acknowledge(frames)
    await settle()

    expect(patch.sent[0]).toMatchObject({
      endpoint: PatchConnectionEndpoint.SampleBegin,
      value: { frameCount: frames, sampleRate: 48000 }
    })
    expect(patch.sent.at(-1)).toMatchObject({
      endpoint: PatchConnectionEndpoint.SampleEnd,
      value: frames
    })
  })

  it('sends the frames in chunks the patch struct can hold', async () => {
    const patch = recordingConnection()
    const frames = engine.chunkFrames * 3
    const handle = transferSample(patch.connection, sampleOf(frames), spyCallbacks())

    handle.acknowledge(frames)
    await settle()

    const chunks = patch.of(PatchConnectionEndpoint.SampleChunk)

    expect(chunks).toHaveLength(3)
    expect(chunks.map((chunk) => chunk.value.startFrame)).toEqual([
      0,
      engine.chunkFrames,
      engine.chunkFrames * 2
    ])
    expect(chunks.every((chunk) => chunk.value.frames.length === engine.chunkFrames)).toBe(true)
  })

  it('pads a short final chunk to the struct width and says how much of it to read', async () => {
    const patch = recordingConnection()
    const frames = engine.chunkFrames + 10
    const handle = transferSample(patch.connection, sampleOf(frames), spyCallbacks())

    handle.acknowledge(frames)
    await settle()

    const last = patch.of(PatchConnectionEndpoint.SampleChunk).at(-1)

    expect(last?.value.frameCount).toBe(10)
    expect(last?.value.frames).toHaveLength(engine.chunkFrames)
    expect(last?.value.frames[10]).toBe(0)
    expect(last?.value.frames.at(-1)).toBe(0)
  })

  it('carries the frames across intact', async () => {
    const patch = recordingConnection()
    const sample = sampleOf(engine.chunkFrames * 2)
    const handle = transferSample(patch.connection, sample, spyCallbacks())

    handle.acknowledge(sample.frames.length)
    await settle()

    const chunks = patch.of(PatchConnectionEndpoint.SampleChunk)
    const flattened = chunks.flatMap((chunk) => chunk.value.frames.slice(0, chunk.value.frameCount))

    expect(flattened).toHaveLength(sample.frames.length)
    expect(flattened[0]).toBe(sample.frames[0])
    expect(flattened.at(-1)).toBe(sample.frames.at(-1))
  })

  it('gives a chunk a retry timeout, because the queue is what it can outrun', async () => {
    const patch = recordingConnection()
    const handle = transferSample(patch.connection, sampleOf(engine.chunkFrames), spyCallbacks())

    handle.acknowledge(engine.chunkFrames)
    await settle()

    expect(patch.of(PatchConnectionEndpoint.SampleChunk)[0].timeout).toBeGreaterThan(0)
    expect(patch.of(PatchConnectionEndpoint.SampleBegin)[0].timeout).toBeUndefined()
  })

  it('reports a full transfer as complete', async () => {
    const patch = recordingConnection()
    const callbacks = spyCallbacks()
    const frames = engine.chunkFrames * 4
    const handle = transferSample(patch.connection, sampleOf(frames), callbacks)

    handle.acknowledge(frames)
    await settle()

    expect(callbacks.completed).toBe(1)
    expect(callbacks.cancelled).toBe(0)
    expect(callbacks.progress.at(-1)).toEqual([frames, frames])
  })

  it('never sends more frames than the buffer holds', async () => {
    const patch = recordingConnection()
    const callbacks = spyCallbacks()
    const oversized = {
      ...sampleOf(1),
      frames: { length: engine.maxSampleFrames + engine.chunkFrames } as unknown as Float32Array
    }

    const handle = transferSample(patch.connection, oversized, callbacks)

    handle.cancel()
    await settle()

    expect(patch.sent[0].value.frameCount).toBe(engine.maxSampleFrames)
  })

  describe('the sliding window', () => {
    it('stops sending once the unacknowledged frames reach the limit', async () => {
      const patch = recordingConnection()
      const frames = engine.chunkFrames * 64

      transferSample(patch.connection, sampleOf(frames), spyCallbacks())
      await tick()

      const stalled = patch.of(PatchConnectionEndpoint.SampleChunk).length

      expect(stalled).toBeGreaterThan(0)
      expect(stalled).toBeLessThan(64)
      expect(patch.of(PatchConnectionEndpoint.SampleEnd)).toHaveLength(0)
    })

    it('is released by the patch reporting what it took, without waiting on the timeout', async () => {
      const patch = recordingConnection()
      const callbacks = spyCallbacks()
      const frames = engine.chunkFrames * 64
      const handle = transferSample(patch.connection, sampleOf(frames), callbacks)
      const startedAt = Date.now()

      await tick()

      const stalled = patch.of(PatchConnectionEndpoint.SampleChunk).length

      expect(stalled).toBeLessThan(64)

      handle.acknowledge(frames)
      await tick()

      expect(patch.of(PatchConnectionEndpoint.SampleChunk)).toHaveLength(64)
      expect(callbacks.completed).toBe(1)
      expect(Date.now() - startedAt).toBeLessThan(1000)
    })

    it('never runs backwards on a progress report that arrives out of order', async () => {
      const patch = recordingConnection()
      const frames = engine.chunkFrames * 64
      const handle = transferSample(patch.connection, sampleOf(frames), spyCallbacks())

      handle.acknowledge(frames)
      handle.acknowledge(0)
      await settle()

      expect(patch.of(PatchConnectionEndpoint.SampleEnd)).toHaveLength(1)
    })

    it('falls back to timer pacing rather than hanging on a patch that never answers', async () => {
      const patch = recordingConnection()
      const callbacks = spyCallbacks()
      const frames = engine.chunkFrames * 64

      transferSample(patch.connection, sampleOf(frames), callbacks)
      await settle()

      expect(callbacks.completed).toBe(1)
      expect(patch.of(PatchConnectionEndpoint.SampleChunk)).toHaveLength(64)
    })
  })

  describe('cancelling', () => {
    it('leaves the patch silent rather than armed on a fraction of the sample', async () => {
      const patch = recordingConnection()
      const callbacks = spyCallbacks()
      const handle = transferSample(patch.connection, sampleOf(engine.chunkFrames * 64), callbacks)

      handle.cancel()
      await settle()

      expect(patch.of(PatchConnectionEndpoint.SampleEnd)).toHaveLength(0)
      expect(callbacks.completed).toBe(0)
      expect(callbacks.cancelled).toBe(1)
    })

    /**
     * A transfer cancelled while it is waiting on the window is released by the fallback timeout
     * rather than by the cancel: `releaseWindow` only resolves once there is room, and cancelling
     * does not make room. It stops - and sends no closing event - but not instantly.
     */
    it('gives up a transfer that was waiting on the window, and arms nothing on the way out', async () => {
      const patch = recordingConnection()
      const callbacks = spyCallbacks()
      const handle = transferSample(patch.connection, sampleOf(engine.chunkFrames * 64), callbacks)

      await tick()
      handle.cancel()
      await settle()

      expect(callbacks.cancelled).toBe(1)
      expect(callbacks.completed).toBe(0)
      expect(patch.of(PatchConnectionEndpoint.SampleEnd)).toHaveLength(0)
    })
  })

  it('runs without a connection, so the editor works in a plain browser tab', async () => {
    const callbacks = spyCallbacks()
    const handle = transferSample(undefined, sampleOf(engine.chunkFrames * 2), callbacks)

    handle.acknowledge(engine.chunkFrames * 2)
    await settle()

    expect(callbacks.completed).toBe(1)
  })
})
