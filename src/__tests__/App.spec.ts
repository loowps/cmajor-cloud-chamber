import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import App from '@/App.vue'
import HomeView from '@/views/HomeView.vue'
import FooterComponent from '@/components/FooterComponent.vue'
import { useGranularStore } from '@/stores/granular'
import type { PatchSync } from '@/composables/usePatchSync'

const patchSync = {
  sendParameter: vi.fn(),
  beginGesture: vi.fn(),
  endGesture: vi.fn(),
  dropSample: vi.fn(),
  clearSample: vi.fn()
} satisfies PatchSync

const providePatchSync = vi.fn(() => patchSync)

vi.mock('@/composables/usePatchSync', () => ({
  providePatchSync: () => providePatchSync(),
  usePatchSync: () => patchSync
}))

function dragEventWith(type: string, files: File[] = []) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent

  Object.defineProperty(event, 'dataTransfer', {
    value: { types: ['Files'], files, dropEffect: 'none' }
  })

  return event
}

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('puts the editor above the footer', () => {
    const wrapper = mount(App)

    expect(wrapper.findComponent(HomeView).exists()).toBe(true)
    expect(wrapper.findComponent(FooterComponent).exists()).toBe(true)

    wrapper.unmount()
  })

  /// Owned by the app rather than a view, so nothing below it can disconnect the patch by
  /// unmounting.
  it('provides the patch sync once, from the top', () => {
    const wrapper = mount(App)

    expect(providePatchSync).toHaveBeenCalledOnce()

    wrapper.unmount()
  })

  describe('the window as the drop target', () => {
    it('loads a file dropped anywhere, not only on the waveform', () => {
      const wrapper = mount(App)
      const file = new File(['audio'], 'take.wav')

      window.dispatchEvent(dragEventWith('drop', [file]))

      expect(patchSync.dropSample).toHaveBeenCalledExactlyOnceWith(file)

      wrapper.unmount()
    })

    it('tells the whole window a file is over it', () => {
      const wrapper = mount(App)
      const store = useGranularStore()

      window.dispatchEvent(dragEventWith('dragenter'))

      expect(store.isDraggingFile).toBe(true)

      window.dispatchEvent(dragEventWith('dragleave'))

      expect(store.isDraggingFile).toBe(false)

      wrapper.unmount()
    })

    /// A plugin window has nowhere it could legitimately navigate to, and a drop the page has not
    /// claimed replaces the editor with the browser's own audio player.
    it('refuses the default so a drop can never navigate the editor away', () => {
      const wrapper = mount(App)
      const event = dragEventWith('drop', [new File(['audio'], 'take.wav')])

      window.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)

      wrapper.unmount()
    })
  })
})
