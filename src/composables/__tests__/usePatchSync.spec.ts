import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { defineComponent, h } from 'vue'
import { providePatchSync, usePatchSync, type PatchSync } from '@/composables/usePatchSync'
import { useGranularStore } from '@/stores/granular'
import { parameterDefinitions } from '@/models/granular.model'
import { PatchConnectionEndpoint } from '@/models/patch-connection-endpoints.enum'

/// Only the decode is stubbed. The error stays real, because what is under test is that its own
/// message reaches the overlay rather than being flattened into "could not decode".
vi.mock('@/composables/useSampleLoader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/composables/useSampleLoader')>()),
  loadSampleData: vi.fn()
}))

vi.mock('@/composables/useSampleTransfer', () => ({
  transferSample: vi.fn(() => ({ cancel: vi.fn(), acknowledge: vi.fn() }))
}))

vi.mock('@/composables/useStoredSample', () => ({
  readStoredSample: vi.fn(async () => undefined),
  rememberSample: vi.fn(async () => {}),
  forgetSample: vi.fn()
}))

const { loadSampleData, SampleTooLongError } = await import('@/composables/useSampleLoader')
const { transferSample } = await import('@/composables/useSampleTransfer')
const { forgetSample, readStoredSample, rememberSample } =
  await import('@/composables/useStoredSample')

function fakeSample(frames: number) {
  return {
    name: 'take.wav',
    frames: new Float32Array(frames),
    sampleRate: 48000,
    durationSeconds: frames / 48000,
    fileBytes: frames * 4,
    sourceChannels: 1,
    wasDownsampled: false
  }
}

function fakeConnection() {
  const endpointListeners = new Map<string, Set<(value: any) => void>>()
  const parameterListeners = new Set<(args: { endpointID: string; value: any }) => void>()

  const connection = {
    sent: [] as { endpoint: string; value: any }[],
    gestures: [] as string[],
    requested: [] as string[],

    sendEventOrValue(endpoint: string, value: any) {
      connection.sent.push({ endpoint, value })
    },
    sendParameterGestureStart: (endpoint: string) => connection.gestures.push(`start:${endpoint}`),
    sendParameterGestureEnd: (endpoint: string) => connection.gestures.push(`end:${endpoint}`),
    requestParameterValue: (endpoint: string) => connection.requested.push(endpoint),

    addEndpointListener(endpoint: string, listener: (value: any) => void) {
      const set = endpointListeners.get(endpoint) ?? new Set()

      set.add(listener)
      endpointListeners.set(endpoint, set)
    },
    removeEndpointListener(endpoint: string, listener: (value: any) => void) {
      endpointListeners.get(endpoint)?.delete(listener)
    },
    addAllParameterListener(listener: (args: { endpointID: string; value: any }) => void) {
      parameterListeners.add(listener)
    },
    removeAllParameterListener(listener: (args: { endpointID: string; value: any }) => void) {
      parameterListeners.delete(listener)
    },

    emit(endpoint: string, value: any) {
      for (const listener of [...(endpointListeners.get(endpoint) ?? [])]) {
        listener(value)
      }
    },
    emitParameter(endpointID: string, value: number) {
      for (const listener of [...parameterListeners]) {
        listener({ endpointID, value })
      }
    },
    listenerCount: () =>
      [...endpointListeners.values()].reduce((total, set) => total + set.size, 0) +
      parameterListeners.size
  }

  return connection
}

function mountSync(connection = fakeConnection()) {
  let api!: PatchSync

  const wrapper = mount(
    defineComponent({
      setup() {
        api = providePatchSync()

        return () => h('div')
      }
    }),
    { global: { provide: { patchConnection: connection } } }
  )

  return { wrapper, connection, api: () => api, store: useGranularStore() }
}

describe('providePatchSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.mocked(readStoredSample).mockResolvedValue(undefined)
  })

  describe('on mount', () => {
    it('asks the host for every parameter it knows about', () => {
      const { wrapper, connection } = mountSync()

      expect(connection.requested).toHaveLength(parameterDefinitions.length)
      expect(connection.requested).toContain('h8SkewIn')
      expect(connection.requested).toContain('gainIn')

      wrapper.unmount()
    })

    it('listens on the three endpoints that come back', () => {
      const { wrapper, connection } = mountSync()

      expect(connection.listenerCount()).toBe(4)

      wrapper.unmount()

      expect(connection.listenerCount()).toBe(0)
    })
  })

  describe('parameters', () => {
    it('writes the store and the patch on a gesture', () => {
      const { wrapper, connection, api, store } = mountSync()

      api().sendParameter('h1DensityIn', 96)

      expect(store.parameterValue('h1DensityIn')).toBe(96)
      expect(connection.sent).toContainEqual({ endpoint: 'h1DensityIn', value: 96 })

      wrapper.unmount()
    })

    it('takes an automation write back without sending it on again', () => {
      const { wrapper, connection, store } = mountSync()

      connection.emitParameter('h1DensityIn', 12)

      expect(store.parameterValue('h1DensityIn')).toBe(12)
      expect(connection.sent).toHaveLength(0)

      wrapper.unmount()
    })

    it('brackets a gesture so the host can record it', () => {
      const { wrapper, connection, api } = mountSync()

      api().beginGesture('h1PanIn')
      api().endGesture('h1PanIn')

      expect(connection.gestures).toEqual(['start:h1PanIn', 'end:h1PanIn'])

      wrapper.unmount()
    })
  })

  describe('what comes back from the patch', () => {
    it('stamps a grain with its own arrival time, because the patch does not send one', () => {
      const { wrapper, connection, store } = mountSync()

      connection.emit(PatchConnectionEndpoint.GrainOut, {
        position: 0.4,
        lengthSeconds: 0.12,
        level: 1,
        pan: 0,
        rate: 1,
        voice: 0,
        head: 0
      })

      expect(store.grains).toHaveLength(1)
      expect(store.grains[0].bornAt).toBeGreaterThan(0)

      wrapper.unmount()
    })

    it('adopts the engine state it is told', () => {
      const { wrapper, connection, store } = mountSync()

      connection.emit(PatchConnectionEndpoint.StateOut, {
        headPositions: [0.1, 0.2],
        levelLeft: 0.7,
        levelRight: 0.4,
        activeGrains: 9,
        loadedFrames: 4800,
        bufferRate: 48000
      })

      expect(store.activeGrains).toBe(9)
      expect(store.engineHasSample).toBe(true)

      wrapper.unmount()
    })
  })

  describe('dropping a file', () => {
    it('decodes, transfers, and keeps the file for the project', async () => {
      const { wrapper, api, store } = mountSync()
      const sample = fakeSample(4800)

      vi.mocked(loadSampleData).mockResolvedValue(sample)

      await api().dropSample(new File([new ArrayBuffer(64)], 'take.wav'))

      expect(store.sample).toBe(sample)
      expect(transferSample).toHaveBeenCalledOnce()
      expect(rememberSample).toHaveBeenCalledWith(expect.anything(), 'take.wav', expect.anything())

      wrapper.unmount()
    })

    it('keeps a copy of the bytes, because decoding takes the buffer it is given', async () => {
      const { wrapper, api } = mountSync()

      vi.mocked(loadSampleData).mockResolvedValue(fakeSample(4800))

      await api().dropSample(new File([new ArrayBuffer(64)], 'take.wav'))

      const decoded = vi.mocked(loadSampleData).mock.calls[0][1]
      const remembered = vi.mocked(rememberSample).mock.calls[0][2]

      expect(decoded).not.toBe(remembered)
      expect(remembered.byteLength).toBe(64)

      wrapper.unmount()
    })

    it('names the file that could not be decoded and holds no sample', async () => {
      const { wrapper, api, store } = mountSync()

      vi.mocked(loadSampleData).mockRejectedValue(new Error('nope'))

      await api().dropSample(new File([new ArrayBuffer(64)], 'broken.wav'))

      expect(store.sample).toBeUndefined()
      expect(store.transfer).toMatchObject({
        phase: 'failed',
        message: 'Could not decode broken.wav'
      })

      wrapper.unmount()
    })

    it('passes on the reason a file was too long rather than calling it undecodable', async () => {
      const { wrapper, api, store } = mountSync()

      const tooLong = new SampleTooLongError(3900)

      vi.mocked(loadSampleData).mockRejectedValue(tooLong)

      await api().dropSample(new File([new ArrayBuffer(64)], 'epic.wav'))

      expect(store.transfer.message).toBe(tooLong.message)
      expect(store.transfer.message).toContain('65.0 minutes')

      wrapper.unmount()
    })
  })

  describe('clearing', () => {
    it('drops the stored file and disarms the patch', () => {
      const { wrapper, connection, api, store } = mountSync()

      api().clearSample()

      expect(store.sample).toBeUndefined()
      expect(store.transfer.phase).toBe('idle')
      expect(forgetSample).toHaveBeenCalledOnce()
      expect(connection.sent).toContainEqual({
        endpoint: PatchConnectionEndpoint.SampleBegin,
        value: { frameCount: 0, sampleRate: 48000 }
      })

      wrapper.unmount()
    })
  })

  describe('restoring what the window lost', () => {
    it('adopts the buffer the patch is already holding rather than sending it again', async () => {
      const connection = fakeConnection()

      vi.mocked(readStoredSample).mockResolvedValue({ name: 'take.wav', data: new ArrayBuffer(64) })
      vi.mocked(loadSampleData).mockResolvedValue(fakeSample(4800))

      const { wrapper, store } = mountSync(connection)

      connection.emit(PatchConnectionEndpoint.StateOut, {
        headPositions: [],
        levelLeft: 0,
        levelRight: 0,
        activeGrains: 0,
        loadedFrames: 4800,
        bufferRate: 48000
      })

      await vi.waitFor(() => expect(store.transfer.phase).toBe('ready'))

      expect(transferSample).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('sends the sample when the patch is holding something else', async () => {
      const connection = fakeConnection()

      vi.mocked(readStoredSample).mockResolvedValue({ name: 'take.wav', data: new ArrayBuffer(64) })
      vi.mocked(loadSampleData).mockResolvedValue(fakeSample(4800))

      const { wrapper } = mountSync(connection)

      connection.emit(PatchConnectionEndpoint.StateOut, {
        headPositions: [],
        levelLeft: 0,
        levelRight: 0,
        activeGrains: 0,
        loadedFrames: 12,
        bufferRate: 48000
      })

      await vi.waitFor(() => expect(transferSample).toHaveBeenCalledOnce())

      wrapper.unmount()
    })

    it('says so rather than silently restoring nothing when the stored file will not decode', async () => {
      vi.mocked(readStoredSample).mockResolvedValue({ name: 'take.wav', data: new ArrayBuffer(64) })
      vi.mocked(loadSampleData).mockRejectedValue(new Error('nope'))

      const { wrapper, store } = mountSync()

      await vi.waitFor(() => expect(store.transfer.phase).toBe('failed'))

      expect(store.transfer.message).toBe('Could not restore take.wav')

      wrapper.unmount()
    })

    it('lets a file dropped meanwhile outrank the restore', async () => {
      let release!: (value: { name: string; data: ArrayBuffer }) => void

      vi.mocked(readStoredSample).mockReturnValue(new Promise((resolve) => (release = resolve)))

      const { wrapper, api, store } = mountSync()
      const dropped = fakeSample(9600)

      vi.mocked(loadSampleData).mockResolvedValue(dropped)
      await api().dropSample(new File([new ArrayBuffer(64)], 'dropped.wav'))

      release({ name: 'stored.wav', data: new ArrayBuffer(64) })
      await vi.waitFor(() => expect(readStoredSample).toHaveBeenCalled())

      expect(store.sample).toBe(dropped)

      wrapper.unmount()
    })
  })
})

describe('usePatchSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('reaches the api the provider put up', () => {
    let reached: PatchSync | undefined

    const child = defineComponent({
      setup() {
        reached = usePatchSync()

        return () => h('span')
      }
    })

    const wrapper = mount(
      defineComponent({
        setup() {
          providePatchSync()

          return () => h(child)
        }
      })
    )

    expect(reached).toBeDefined()

    wrapper.unmount()
  })

  it('says what is missing rather than failing somewhere further down', () => {
    expect(() =>
      mount(
        defineComponent({
          setup() {
            usePatchSync()

            return () => h('span')
          }
        })
      )
    ).toThrow(/providePatchSync/)
  })
})
