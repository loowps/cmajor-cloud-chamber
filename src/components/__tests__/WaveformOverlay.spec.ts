import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import WaveformOverlay from '@/components/WaveformOverlay.vue'
import IconButton from '@/components/IconButton.vue'
import { useGranularStore } from '@/stores/granular'
import { maxStoredBytes } from '@/composables/useStoredSample'
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

function sampleOf(overrides: Partial<LoadedSample> = {}): LoadedSample {
  return {
    name: 'take.wav',
    frames: new Float32Array(48000),
    sampleRate: 48000,
    durationSeconds: 298,
    fileBytes: 3 * 1024 * 1024,
    sourceChannels: 1,
    wasDownsampled: false,
    ...overrides
  }
}

function mountOverlay(hovered = false) {
  return mount(WaveformOverlay, { props: { hovered } })
}

function heldByEngine() {
  useGranularStore().applyEngineState({
    headPositions: [],
    levelLeft: 0,
    levelRight: 0,
    activeGrains: 0,
    loadedFrames: 96000,
    bufferRate: 48000
  })
}

describe('WaveformOverlay', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('with nothing loaded', () => {
    it('says a file can be dropped', () => {
      expect(mountOverlay().find('.placeholder').text()).toBe(
        'Drop an audio file to fill the buffer'
      )
    })

    it('shows the actions without a hover, because there is no waveform to hover over', () => {
      expect(mountOverlay().find('.actions').classes()).toContain('shown')
    })

    it('offers nothing to clear', () => {
      const trash = mountOverlay().findAllComponents(IconButton)[1]

      expect(trash.attributes('disabled')).toBeDefined()
    })
  })

  describe('the caption', () => {
    it('names the sample, its length and the rate it landed on', () => {
      const store = useGranularStore()

      store.setSample(sampleOf())

      const wrapper = mountOverlay()

      expect(wrapper.find('.name').text()).toBe('take.wav')
      expect(wrapper.find('.detail').text()).toContain('4:58')
      expect(wrapper.find('.detail').text()).toContain('48.0 kHz')
    })

    it('says out loud when a file lost bandwidth to fit the buffer', () => {
      const store = useGranularStore()

      store.setSample(sampleOf({ sampleRate: 9300, wasDownsampled: true }))

      expect(mountOverlay().find('.detail').text()).toContain('resampled to 9.3 kHz')
    })

    /// The window must never claim there is no sample while one can be heard.
    it('names a sample the engine holds that this window never decoded', () => {
      heldByEngine()

      const wrapper = mountOverlay()

      expect(wrapper.find('.name').text()).toBe('Sample held by engine')
      expect(wrapper.find('.detail').text()).toContain('0:02')
      expect(wrapper.find('.placeholder').exists()).toBe(false)
    })

    it('weighs nothing for a sample it never held as a file', () => {
      heldByEngine()

      expect(mountOverlay().find('.storage').exists()).toBe(false)
    })
  })

  describe('what the sample costs the project', () => {
    it('prints the base64 size, which is four thirds of the file', () => {
      const store = useGranularStore()

      store.setSample(sampleOf({ fileBytes: 3 * 1024 * 1024 }))

      expect(mountOverlay().find('.storage').text()).toBe('4.0 MB in project')
    })

    it('says the audio is being left behind rather than letting the user find out later', () => {
      const store = useGranularStore()

      store.setSample(sampleOf({ fileBytes: maxStoredBytes + 1 }))

      const storage = mountOverlay().find('.storage')

      expect(storage.text()).toBe('not saved, over 32.0 MB')
      expect(storage.classes()).toContain('dropped')
    })
  })

  describe('the two destructive buttons', () => {
    it('stay out of the way until the pointer is over the waveform', () => {
      const store = useGranularStore()

      store.setSample(sampleOf())

      expect(mountOverlay(false).find('.actions').classes()).not.toContain('shown')
      expect(mountOverlay(true).find('.actions').classes()).toContain('shown')
    })

    it('clears the sample', async () => {
      const store = useGranularStore()

      store.setSample(sampleOf())

      await mountOverlay(true).findAllComponents(IconButton)[1].trigger('click')

      expect(patchSync.clearSample).toHaveBeenCalledOnce()
    })

    it('opens the file picker rather than reaching for a file itself', async () => {
      const wrapper = mountOverlay(true)
      const click = vi.spyOn(wrapper.find('input[type=file]').element as HTMLInputElement, 'click')

      await wrapper.findAllComponents(IconButton)[0].trigger('click')

      expect(click).toHaveBeenCalledOnce()
    })

    it('loads a chosen file and lets the same one be chosen again', async () => {
      const wrapper = mountOverlay(true)
      const input = wrapper.find('input[type=file]')
      const file = new File(['audio'], 'chosen.wav')

      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')

      expect(patchSync.dropSample).toHaveBeenCalledExactlyOnceWith(file)
      expect((input.element as HTMLInputElement).value).toBe('')
    })

    it('does nothing when the picker is dismissed', async () => {
      const wrapper = mountOverlay(true)
      const input = wrapper.find('input[type=file]')

      Object.defineProperty(input.element, 'files', { value: [], configurable: true })
      await input.trigger('change')

      expect(patchSync.dropSample).not.toHaveBeenCalled()
    })
  })

  describe('the transfer scrim', () => {
    it('is absent at rest', () => {
      expect(mountOverlay().find('.transfer').exists()).toBe(false)
    })

    it('shows how far a send has got', () => {
      const store = useGranularStore()

      store.setTransfer({ phase: 'sending', progress: 0.4, message: 'Sending to engine' })

      const wrapper = mountOverlay()

      expect(wrapper.find('.message').text()).toBe('Sending to engine')
      expect(wrapper.find('.fill').attributes('style')).toContain('width: 40%')
    })

    it('says why a load failed, and offers no bar to a load that is not running', () => {
      const store = useGranularStore()

      store.setTransfer({ phase: 'failed', progress: 0, message: 'Could not decode broken.wav' })

      const wrapper = mountOverlay()

      expect(wrapper.find('.transfer').classes()).toContain('failed')
      expect(wrapper.find('.message').text()).toBe('Could not decode broken.wav')
      expect(wrapper.find('.bar').exists()).toBe(false)
    })

    it('goes once the sample is ready, because the caption says the rest', () => {
      const store = useGranularStore()

      store.setTransfer({ phase: 'ready', progress: 1, message: '' })

      expect(mountOverlay().find('.transfer').exists()).toBe(false)
    })
  })
})
