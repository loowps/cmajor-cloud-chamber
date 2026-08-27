import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WaveformDisplay from '@/components/WaveformDisplay.vue'
import WaveformOverlay from '@/components/WaveformOverlay.vue'
import { useGranularStore } from '@/stores/granular'
import { headEndpoint } from '@/models/granular.model'
import type { LoadedSample } from '@/models/sample.model'
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

const trackWidth = 1000

/**
 * The canvas is only ever written to, so a recorder is enough to answer the one question worth
 * asking of the draw pass: that it runs at all. A frame that throws takes the render loop with
 * it and the plugin's window stops repainting, which is the failure this guards.
 */
function recordingContext() {
  const calls: string[] = []
  const record = (name: string) => vi.fn(() => calls.push(name))

  return {
    calls,
    context: {
      clearRect: record('clearRect'),
      fillRect: record('fillRect'),
      beginPath: record('beginPath'),
      moveTo: record('moveTo'),
      lineTo: record('lineTo'),
      stroke: record('stroke'),
      fill: record('fill'),
      closePath: record('closePath'),
      save: record('save'),
      restore: record('restore'),
      globalAlpha: 1,
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1
    } as unknown as CanvasRenderingContext2D
  }
}

function sampleOf(): LoadedSample {
  return {
    name: 'take.wav',
    frames: Float32Array.from({ length: 4800 }, (_, index) => Math.sin(index / 20)),
    sampleRate: 48000,
    durationSeconds: 0.1,
    fileBytes: 4096,
    sourceChannels: 1,
    wasDownsampled: false
  }
}

function mountWaveform(withSample = true) {
  if (withSample) {
    useGranularStore().setSample(sampleOf())
  }

  const wrapper = mount(WaveformDisplay, { attachTo: document.body })
  const frame = wrapper.find('.waveform').element

  /// jsdom lays nothing out, and every fraction along the waveform is read off this rectangle.
  frame.getBoundingClientRect = () =>
    ({ left: 0, width: trackWidth, top: 0, height: 100 }) as DOMRect

  return { wrapper, frame }
}

/// `button` is read only on a MouseEvent, so test-utils cannot build one that starts a drag.
function pointer(element: Element, type: string, init: PointerEventInit) {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, ...init }))
}

function at(fraction: number) {
  return { clientX: fraction * trackWidth, clientY: 50 }
}

const loopStart = headEndpoint(0, 'loopStart')
const loopLength = headEndpoint(0, 'loopLength')
const position = headEndpoint(0, 'position')

/// The head is drawn where the patch says it is, so a test that wants one somewhere has to say so.
function headAt(fraction: number, head = 0) {
  useGranularStore().applyEngineState({
    headPositions: Array.from({ length: 8 }, (_, index) => (index === head ? fraction : 0)),
    levelLeft: 0,
    levelRight: 0,
    activeGrains: 0,
    loadedFrames: 4800,
    bufferRate: 48000
  })
}

function sentTo(endpoint: string) {
  return patchSync.sendParameter.mock.calls.filter(([sent]) => sent === endpoint).map(([, v]) => v)
}

describe('WaveformDisplay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('draws the sample chrome inside its own frame rather than in a band above it', () => {
    const { wrapper } = mountWaveform()

    expect(wrapper.findComponent(WaveformOverlay).exists()).toBe(true)
    expect(wrapper.find('canvas').exists()).toBe(true)

    wrapper.unmount()
  })

  it('says when it is empty and when a file is over the window', async () => {
    const store = useGranularStore()
    const { wrapper } = mountWaveform(false)

    expect(wrapper.find('.waveform').classes()).toContain('empty')

    store.setDraggingFile(true)
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.waveform').classes()).toContain('receiving')

    wrapper.unmount()
  })

  it('tells the overlay when the pointer is over it, so the two buttons can be revealed', async () => {
    const { wrapper } = mountWaveform()

    expect(wrapper.findComponent(WaveformOverlay).props('hovered')).toBe(false)

    await wrapper.find('.waveform').trigger('mouseenter')

    expect(wrapper.findComponent(WaveformOverlay).props('hovered')).toBe(true)

    await wrapper.find('.waveform').trigger('mouseleave')

    expect(wrapper.findComponent(WaveformOverlay).props('hovered')).toBe(false)

    wrapper.unmount()
  })

  describe('the loop region', () => {
    it('is not dragged when there is no sample to set one on', () => {
      const { wrapper, frame } = mountWaveform(false)

      pointer(frame, 'pointerdown', { button: 0, ...at(0.5) })
      pointer(frame, 'pointermove', at(0.7))

      expect(patchSync.sendParameter).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('ignores anything but the primary button', () => {
      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 2, ...at(0.5) })
      pointer(frame, 'pointermove', at(0.7))

      expect(patchSync.sendParameter).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('moves the whole region when the press lands inside it', () => {
      const store = useGranularStore()

      store.setParameter(loopLength, 0.4)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.2) })

      expect(patchSync.sendParameter).not.toHaveBeenCalled()

      pointer(frame, 'pointermove', at(0.3))

      expect(sentTo(loopStart).at(-1)).toBeCloseTo(0.1, 6)
      expect(sentTo(loopLength)).toHaveLength(0)

      wrapper.unmount()
    })

    /// A region already covering the whole buffer has nowhere to go, so the drag is a no-op
    /// rather than a start that walks off the end.
    it('cannot move a region that fills the buffer', () => {
      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.5) })
      pointer(frame, 'pointermove', at(0.7))

      expect(sentTo(loopStart)).toEqual([0])

      wrapper.unmount()
    })

    it('never pushes the region off the end of the sample', () => {
      const store = useGranularStore()

      store.setParameter(loopLength, 0.4)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.2) })
      pointer(frame, 'pointermove', at(0.99))

      expect(sentTo(loopStart).at(-1)).toBeCloseTo(0.6, 6)

      wrapper.unmount()
    })

    it('never drags the region off the front', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.4)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.3) })
      pointer(frame, 'pointermove', at(0.01))

      expect(sentTo(loopStart).at(-1)).toBe(0)

      wrapper.unmount()
    })

    /// Moving the left edge holds the right one still, which takes both parameters - so a host
    /// recording the gesture has to be told about both.
    it('takes both parameters when the start edge is grabbed', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.5)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.2) })

      expect(patchSync.beginGesture.mock.calls.flat()).toEqual([loopStart, loopLength])

      pointer(frame, 'pointermove', at(0.4))

      expect(sentTo(loopStart).at(-1)).toBeCloseTo(0.4, 6)
      expect(sentTo(loopLength).at(-1)).toBeCloseTo(0.3, 6)

      wrapper.unmount()
    })

    it('holds the end still when the start is dragged past it', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.5)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.2) })
      pointer(frame, 'pointermove', at(0.95))

      expect(sentTo(loopStart).at(-1)).toBeLessThan(0.7)
      expect(sentTo(loopLength).at(-1)).toBeGreaterThan(0)

      wrapper.unmount()
    })

    it('takes only the length when the end edge is grabbed', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.5)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.7) })

      expect(patchSync.beginGesture.mock.calls.flat()).toEqual([loopLength])

      pointer(frame, 'pointermove', at(0.9))

      expect(sentTo(loopLength).at(-1)).toBeCloseTo(0.7, 6)
      expect(sentTo(loopStart)).toHaveLength(0)

      wrapper.unmount()
    })

    it('never lets the region collapse to nothing', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.5)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.7) })
      pointer(frame, 'pointermove', at(0))

      expect(sentTo(loopLength).at(-1)).toBeGreaterThan(0)

      wrapper.unmount()
    })

    it('closes the gesture on pointer up, and stops following the pointer', () => {
      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.5) })
      pointer(frame, 'pointerup', at(0.5))

      expect(patchSync.endGesture.mock.calls.flat()).toEqual([loopStart])

      patchSync.sendParameter.mockClear()
      pointer(frame, 'pointermove', at(0.9))

      expect(patchSync.sendParameter).not.toHaveBeenCalled()

      wrapper.unmount()
    })

    it('closes the gesture when the pointer is taken away mid-drag', () => {
      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.5) })
      pointer(frame, 'pointercancel', at(0.5))

      expect(patchSync.endGesture).toHaveBeenCalled()

      wrapper.unmount()
    })

    it('sets the region on the head that is up', () => {
      const store = useGranularStore()

      store.selectHead(3)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.5) })
      pointer(frame, 'pointermove', at(0.7))

      expect(sentTo(headEndpoint(3, 'loopStart'))).toHaveLength(1)
      expect(sentTo(loopStart)).toHaveLength(0)

      wrapper.unmount()
    })
  })

  describe('the read head', () => {
    it('is dragged to where the pointer is, as a fraction of the region', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.4)
      headAt(0.4)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.4) })

      expect(patchSync.beginGesture.mock.calls.flat()).toEqual([position])

      pointer(frame, 'pointermove', at(0.5))

      expect(sentTo(position).at(-1)).toBeCloseTo(0.75, 6)
      expect(sentTo(loopStart)).toHaveLength(0)
      expect(sentTo(loopLength)).toHaveLength(0)

      pointer(frame, 'pointerup', at(0.5))

      expect(patchSync.endGesture.mock.calls.flat()).toEqual([position])

      wrapper.unmount()
    })

    it('stays inside its region however far the pointer runs', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.4)
      headAt(0.4)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.4) })
      pointer(frame, 'pointermove', at(0.95))

      expect(sentTo(position).at(-1)).toBe(1)

      pointer(frame, 'pointermove', at(0))

      expect(sentTo(position).at(-1)).toBe(0)

      wrapper.unmount()
    })

    /// Position 0 rests the head on the loop start, so the two lines sharing a pixel is the state
    /// the window opens in rather than a corner of one.
    it('takes a press that lands on it from inside the region, and leaves the edge the rest', () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.3)
      store.setParameter(loopLength, 0.4)
      headAt(0.3)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.302) })

      expect(patchSync.beginGesture.mock.calls.flat()).toEqual([position])

      patchSync.beginGesture.mockClear()
      pointer(frame, 'pointerup', at(0.302))
      pointer(frame, 'pointerdown', { button: 0, ...at(0.295) })

      expect(patchSync.beginGesture.mock.calls.flat()).toEqual([loopStart, loopLength])

      wrapper.unmount()
    })

    it('is not grabbed on a head that has nothing drawn for it', () => {
      const store = useGranularStore()

      store.setParameter(loopLength, 0.4)
      store.setParameter(headEndpoint(0, 'enable'), 0)
      headAt(0.2)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.2) })

      expect(patchSync.beginGesture.mock.calls.flat()).toEqual([loopStart])

      wrapper.unmount()
    })

    it('moves the head that is up, not the one that was', () => {
      const store = useGranularStore()

      store.selectHead(3)
      store.setParameter(headEndpoint(3, 'enable'), 1)
      headAt(0.5, 3)

      const { wrapper, frame } = mountWaveform()

      pointer(frame, 'pointerdown', { button: 0, ...at(0.5) })
      pointer(frame, 'pointermove', at(0.6))

      expect(sentTo(headEndpoint(3, 'position')).at(-1)).toBeCloseTo(0.6, 6)
      expect(sentTo(position)).toHaveLength(0)

      wrapper.unmount()
    })
  })

  describe('the cursor', () => {
    /// Three of the four things a press can take are hairlines on one canvas, so the cursor is the
    /// only thing that says which of them is in reach before the press is made.
    it('says which of the lines the pointer is over, and grabs the region', async () => {
      const store = useGranularStore()

      store.setParameter(loopStart, 0.2)
      store.setParameter(loopLength, 0.4)
      headAt(0.4)

      const { wrapper, frame } = mountWaveform()
      const classes = () => wrapper.find('.waveform').classes()

      pointer(frame, 'pointermove', at(0.4))
      await wrapper.vm.$nextTick()

      expect(classes()).toContain('over-head')

      pointer(frame, 'pointermove', at(0.6))
      await wrapper.vm.$nextTick()

      expect(classes()).toContain('over-edge')

      pointer(frame, 'pointermove', at(0.3))
      await wrapper.vm.$nextTick()

      expect(classes()).toContain('over-region')

      pointer(frame, 'pointerdown', { button: 0, ...at(0.3) })
      await wrapper.vm.$nextTick()

      expect(classes()).toContain('moving-region')

      pointer(frame, 'pointerup', at(0.3))
      await wrapper.vm.$nextTick()

      expect(classes()).toContain('over-region')

      wrapper.unmount()
    })

    it('says nothing when there is no sample to aim at, or the pointer has left', async () => {
      const { wrapper, frame } = mountWaveform(false)
      const classes = () => wrapper.find('.waveform').classes()

      pointer(frame, 'pointermove', at(0.5))
      await wrapper.vm.$nextTick()

      expect(classes()).not.toContain('over-region')

      wrapper.unmount()

      const loaded = mountWaveform()

      pointer(loaded.frame, 'pointermove', at(0.5))
      await loaded.wrapper.vm.$nextTick()

      expect(loaded.wrapper.find('.waveform').classes()).toContain('over-region')

      await loaded.wrapper.find('.waveform').trigger('mouseleave')

      expect(loaded.wrapper.find('.waveform').classes()).not.toContain('over-region')

      loaded.wrapper.unmount()
    })
  })

  describe('the draw pass', () => {
    /// Mounted, the component schedules a frame; the callback is held rather than run, because
    /// render re-arms itself and a mock that called straight through would never return.
    function frameRunner() {
      let scheduled: FrameRequestCallback | undefined

      vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((callback) => {
        scheduled = callback

        return 1
      })

      return () => {
        const callback = scheduled

        scheduled = undefined
        callback?.(performance.now())
      }
    }

    function mountDrawable(withSample = true) {
      const recorder = recordingContext()

      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(recorder.context as never)

      const runFrame = frameRunner()

      if (withSample) {
        useGranularStore().setSample(sampleOf())
      }

      const wrapper = mount(WaveformDisplay, { attachTo: document.body })
      const frame = wrapper.find('.waveform').element

      Object.defineProperty(frame, 'clientWidth', { value: trackWidth, configurable: true })
      Object.defineProperty(frame, 'clientHeight', { value: 120, configurable: true })

      const canvas = wrapper.find('canvas').element as HTMLCanvasElement

      canvas.width = trackWidth
      canvas.height = 120

      return { wrapper, recorder, runFrame }
    }

    it('clears the canvas and draws nothing else when there is no sample', () => {
      const { wrapper, recorder, runFrame } = mountDrawable(false)

      runFrame()

      expect(recorder.calls).toEqual(['clearRect'])

      wrapper.unmount()
    })

    it('draws the outline, the region and the heads for a loaded sample', () => {
      const { wrapper, recorder, runFrame } = mountDrawable()

      runFrame()

      expect(recorder.calls[0]).toBe('clearRect')
      expect(recorder.calls).toContain('fillRect')
      expect(recorder.calls).toContain('stroke')
      expect(recorder.calls.length).toBeGreaterThan(5)

      wrapper.unmount()
    })

    it('draws a cloud of grains without throwing', () => {
      const store = useGranularStore()
      const { wrapper, recorder, runFrame } = mountDrawable()

      const now = performance.now()

      for (let index = 0; index < 60; ++index) {
        store.addGrain({
          position: index / 60,
          lengthSeconds: 0.05,
          level: index / 60,
          /// Both sides of the panel, and a reversed grain, which is drawn the other way.
          pan: index % 2 === 0 ? -0.9 : 0.9,
          rate: index % 3 === 0 ? -1 : 1,
          voice: 0,
          head: index % 2,
          bornAt: now - index,
          seed: index / 60
        })
      }

      expect(() => runFrame()).not.toThrow()
      expect(recorder.calls.filter((call) => call === 'fillRect').length).toBeGreaterThan(60)

      wrapper.unmount()
    })

    it('draws only the heads that are sounding', () => {
      const store = useGranularStore()
      const { wrapper, recorder, runFrame } = mountDrawable()

      store.applyEngineState({
        headPositions: Array.from({ length: 8 }, (_, head) => head / 8),
        levelLeft: 0.5,
        levelRight: 0.5,
        activeGrains: 0,
        loadedFrames: 4800,
        bufferRate: 48000
      })

      runFrame()

      const withOneHead = recorder.calls.length

      recorder.calls.length = 0
      for (let head = 1; head < 8; ++head) {
        store.setParameter(headEndpoint(head, 'enable'), 1)
      }

      runFrame()

      expect(recorder.calls.length).toBeGreaterThan(withOneHead)

      wrapper.unmount()
    })

    it('re-arms itself, so the cloud keeps moving', () => {
      const { wrapper, runFrame } = mountDrawable()

      runFrame()

      expect(requestAnimationFrame).toHaveBeenCalledTimes(2)

      wrapper.unmount()
    })

    it('ages the cloud on its own clock, so grains thin out when the patch goes quiet', () => {
      const store = useGranularStore()
      const { wrapper, runFrame } = mountDrawable()

      store.addGrain({
        position: 0.5,
        lengthSeconds: 0.05,
        level: 1,
        pan: 0,
        rate: 1,
        voice: 0,
        head: 0,
        bornAt: performance.now() - store.grainLifetimeMs - 1,
        seed: 0.5
      })

      runFrame()

      expect(store.grains).toHaveLength(0)

      wrapper.unmount()
    })
  })
})
