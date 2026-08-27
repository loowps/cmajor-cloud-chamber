import { engine, headEndpoint, parameterDefinitions } from '@/models/granular.model'
import { PatchConnectionEndpoint } from '@/models/patch-connection-endpoints.enum'
import type { PatchConnection } from '@/models/patch-connection.model'

/// Roughly what a 64KB queue drained once per audio block gets through in one 33ms tick.
const chunksDrainedPerTick = 24

const tickMs = 33

/**
 * Where the mock keeps stored state. localStorage rather than a variable, because the whole point
 * of stored state is that it outlives the window - and in dev, reloading the page is the only
 * thing that stands in for a project being closed and opened again. It refuses anything much over
 * a few megabytes, so a large file falls back to memory and simply does not survive the reload.
 */
const storedStateStorageKey = 'cloud-chamber-mock-stored-state'

let memoryStoredState: Record<string, unknown> = {}

function readStoredState(): Record<string, unknown> {
  try {
    const stored = localStorage.getItem(storedStateStorageKey)

    return stored ? { ...memoryStoredState, ...JSON.parse(stored) } : { ...memoryStoredState }
  } catch {
    return { ...memoryStoredState }
  }
}

function writeStoredState(state: Record<string, unknown>) {
  memoryStoredState = state

  try {
    localStorage.setItem(storedStateStorageKey, JSON.stringify(state))
  } catch {
    localStorage.removeItem(storedStateStorageKey)
  }
}

/**
 * Stands in for the connection the Cmajor host injects, so the GUI can be developed in a plain
 * browser with hot reloading.
 *
 * It is not inert. The waveform is the hardest part of this editor to judge without a running
 * engine, so the mock keeps the parameter values, drifts all eight heads from their own Motion
 * and throws grains at their own Density - enough of the patch's behaviour to draw against. The
 * sample transfer is accepted, paced and counted, but the audio goes nowhere: there is nothing
 * in a browser tab to play it.
 */
export function createMockPatchConnection(): PatchConnection {
  const values = new Map<string, number>(
    parameterDefinitions.map((definition) => [definition.endpoint, definition.initial])
  )

  const parameterListeners = new Set<(args: { endpointID: string; value: number }) => void>()
  const endpointListeners = new Map<string, Set<(value: unknown) => void>>()
  const storedStateListeners = new Set<(state: { key: string; value: unknown }) => void>()

  let loadedFrames = 0
  /// Whatever the transfer declared, not an assumed 48k - Motion is a speed through the sample,
  /// so a wrong rate here drifts the heads at the wrong pace for anything that is not 48k.
  let bufferRate = 48000
  let lastTick = performance.now()

  /// Motion's accumulator per head, as a fraction of that head's region - Position anchors it,
  /// exactly as it does in the patch, so the heads the mock reports are the ones it would report.
  const scanDrift = new Array<number>(engine.headCount).fill(0)
  const grainDebt = new Array<number>(engine.headCount).fill(0)

  /**
   * Chunks that have arrived but not yet been reported as consumed. The patch takes them off its
   * queue once per audio block, so the mock drains on its own clock too - otherwise dev would
   * accept the whole transfer instantly and the editor's pacing would never be exercised here.
   */
  const pendingChunks: number[] = []

  /// Which head a position endpoint belongs to, so a re-anchor does not have to parse its name.
  const headForPositionEndpoint = new Map<string, number>(
    Array.from({ length: engine.headCount }, (_, head) => [headEndpoint(head, 'position'), head])
  )

  const valueOf = (endpoint: string) => values.get(endpoint) ?? 0
  const headValue = (head: number, id: string) => valueOf(headEndpoint(head, id))

  const emit = (endpoint: PatchConnectionEndpoint, value: unknown) =>
    endpointListeners.get(endpoint)?.forEach((listener) => listener(value))

  const wrapped = (fraction: number) => ((fraction % 1) + 1) % 1

  /// Clamped to the end of the sample, as loopLengthFrames does in the patch - the two parameters
  /// are independent, so nothing stops them describing a region that runs off it.
  const regionOf = (head: number) => {
    const start = Math.min(headValue(head, 'loopStart'), 1)
    const length = Math.max(0.001, Math.min(headValue(head, 'loopLength'), 1 - start))

    return { start, length }
  }

  const readHeadOf = (head: number) => {
    const { start, length } = regionOf(head)

    return start + wrapped(headValue(head, 'position') + scanDrift[head]) * length
  }

  const tick = () => {
    const now = performance.now()
    const elapsed = Math.min((now - lastTick) / 1000, 0.1)
    lastTick = now

    const isSounding = valueOf('freeRunIn') >= 0.5 && loadedFrames > 0
    const sampleSeconds = loadedFrames / bufferRate

    // Drift belongs to a sounding voice, as it does in the patch: silent, the heads sit at
    // Position, which is where the next note starts them.
    if (!isSounding) {
      scanDrift.fill(0)
    }

    for (let head = 0; head < engine.headCount; ++head) {
      const { length } = regionOf(head)

      if (isSounding && loadedFrames > 0) {
        scanDrift[head] += (headValue(head, 'motion') * elapsed) / (sampleSeconds * length)
      }

      if (!isSounding || headValue(head, 'enable') < 0.5) {
        continue
      }

      grainDebt[head] += headValue(head, 'density') * elapsed

      // The patch caps how many grains it reports, and so does this - the point is a plausible
      // cloud, not a faithful count.
      const toEmit = Math.min(Math.floor(grainDebt[head]), 3)
      grainDebt[head] -= toEmit

      const readHead = readHeadOf(head)
      const spray = headValue(head, 'spray')
      const pan = headValue(head, 'pan')
      const panSpread = headValue(head, 'panSpread')
      const size = headValue(head, 'size')

      for (let i = 0; i < toEmit; ++i) {
        emit(PatchConnectionEndpoint.GrainOut, {
          position: readHead + (Math.random() - 0.5) * spray * length,
          lengthSeconds: (size / 1000) * (1 + (Math.random() - 0.5) * 0.4),
          level: 0.4 + Math.random() * 0.6,
          pan: Math.max(-1, Math.min(1, pan + (Math.random() * 2 - 1) * panSpread)),
          rate: Math.random() < headValue(head, 'reverse') ? -1 : 1,
          voice: engine.headCount,
          head
        })
      }
    }

    for (const frames of pendingChunks.splice(0, chunksDrainedPerTick)) {
      emit(PatchConnectionEndpoint.SampleProgress, frames)
    }

    emit(PatchConnectionEndpoint.StateOut, {
      headPositions: Array.from({ length: engine.headCount }, (_, head) => readHeadOf(head)),
      levelLeft: isSounding ? 0.35 : 0,
      /// Not the same number on both sides, or the stereo meter would be one bar drawn twice.
      levelRight: isSounding ? 0.28 : 0,
      activeGrains: Math.round(grainDebt.reduce((total, debt) => total + debt, 0) * 4),
      loadedFrames,
      bufferRate
    })
  }

  setInterval(tick, tickMs)

  return {
    requestStatusUpdate: () => {},
    addStatusListener: () => {},
    removeStatusListener: () => {},
    resetToInitialState: () => {},

    sendEventOrValue: (endpointID, value) => {
      if (endpointID === PatchConnectionEndpoint.SampleBegin) {
        loadedFrames = 0
        bufferRate = Number(value.sampleRate) > 1 ? Number(value.sampleRate) : 48000
        scanDrift.fill(0)
        pendingChunks.length = 0
        return
      }

      if (endpointID === PatchConnectionEndpoint.SampleEnd) {
        loadedFrames = Number(value)
        return
      }

      if (endpointID === PatchConnectionEndpoint.SampleChunk) {
        pendingChunks.push(value.startFrame + value.frameCount)
        return
      }

      // Position re-anchors its head's drift rather than adding to it, exactly as the patch does.
      const anchoredHead = headForPositionEndpoint.get(endpointID)

      if (anchoredHead !== undefined) {
        scanDrift[anchoredHead] = 0
      }

      values.set(endpointID, Number(value))
      parameterListeners.forEach((listener) => listener({ endpointID, value: Number(value) }))
    },

    sendMIDIInputEvent: () => {},
    sendParameterGestureStart: () => {},
    sendParameterGestureEnd: () => {},

    requestStoredStateValue: (key: string) => {
      // Asynchronous like the host's, so the editor's restore is exercised as a round trip here
      // rather than as a value that happens to be there before it is asked for.
      setTimeout(() => {
        const stored = readStoredState()

        storedStateListeners.forEach((listener) => listener({ key, value: stored[key] }))
      }, 0)
    },

    sendStoredStateValue: (key: string, newValue: unknown) => {
      const stored = readStoredState()

      if (newValue === undefined) {
        delete stored[key]
      } else {
        stored[key] = newValue
      }

      writeStoredState(stored)
      storedStateListeners.forEach((listener) => listener({ key, value: newValue }))
    },

    addStoredStateValueListener: (listener) => storedStateListeners.add(listener),
    removeStoredStateValueListener: (listener) => storedStateListeners.delete(listener),
    sendFullStoredState: () => {},
    requestFullStoredState: (callback) => callback({}),

    addEndpointListener: (endpointID, listener) => {
      const listeners = endpointListeners.get(endpointID) ?? new Set()
      listeners.add(listener)
      endpointListeners.set(endpointID, listeners)
    },

    removeEndpointListener: (endpointID, listener) => {
      endpointListeners.get(endpointID)?.delete(listener)
    },

    requestParameterValue: (endpointID) => {
      const value = values.get(endpointID)

      if (value !== undefined) {
        parameterListeners.forEach((listener) => listener({ endpointID, value }))
      }
    },

    addParameterListener: () => {},
    removeParameterListener: () => {},
    addAllParameterListener: (listener) => parameterListeners.add(listener),
    removeAllParameterListener: (listener) => parameterListeners.delete(listener),

    // Root-absolute, so a resource still resolves the same whatever route the dev server is on.
    getResourceAddress: (path: string) => `/${path}`
  } as PatchConnection
}
