import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { useFileDrop } from '@/composables/useFileDrop'

function dragEventWith(type: string, options: { files?: File[]; carriesFile?: boolean } = {}) {
  const { files = [], carriesFile = true } = options
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent

  Object.defineProperty(event, 'dataTransfer', {
    value: { types: carriesFile ? ['Files'] : ['text/plain'], files, dropEffect: 'none' }
  })

  return event
}

function mountDropTarget() {
  const onFile = vi.fn()
  const onDragChange = vi.fn()

  const wrapper = mount(
    defineComponent({
      setup() {
        useFileDrop({ onFile, onDragChange })

        return () => h('div')
      }
    })
  )

  return { wrapper, onFile, onDragChange }
}

describe('useFileDrop', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuses the default on every drag event, so a drop can never navigate the window away', () => {
    const { wrapper } = mountDropTarget()

    for (const type of ['dragenter', 'dragover', 'dragleave', 'drop']) {
      const event = dragEventWith(type, { carriesFile: false })

      window.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    }

    wrapper.unmount()
  })

  it('lights up when a file comes over the window', () => {
    const { wrapper, onDragChange } = mountDropTarget()

    window.dispatchEvent(dragEventWith('dragenter'))

    expect(onDragChange).toHaveBeenCalledWith(true)

    wrapper.unmount()
  })

  it('ignores a drag that carries no file', () => {
    const { wrapper, onDragChange } = mountDropTarget()

    window.dispatchEvent(dragEventWith('dragenter', { carriesFile: false }))

    expect(onDragChange).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('answers a drag over with a copy cursor', () => {
    const { wrapper } = mountDropTarget()
    const event = dragEventWith('dragover')

    window.dispatchEvent(event)

    expect(event.dataTransfer?.dropEffect).toBe('copy')

    wrapper.unmount()
  })

  it('counts nesting, so crossing a knob inside the window does not flicker the highlight', () => {
    const { wrapper, onDragChange } = mountDropTarget()

    window.dispatchEvent(dragEventWith('dragenter'))
    window.dispatchEvent(dragEventWith('dragenter'))
    window.dispatchEvent(dragEventWith('dragleave'))

    expect(onDragChange).toHaveBeenLastCalledWith(true)

    window.dispatchEvent(dragEventWith('dragleave'))

    expect(onDragChange).toHaveBeenLastCalledWith(false)

    wrapper.unmount()
  })

  it('never counts below zero, so a stray leave cannot leave the window stuck lit', () => {
    const { wrapper, onDragChange } = mountDropTarget()

    window.dispatchEvent(dragEventWith('dragleave'))
    window.dispatchEvent(dragEventWith('dragenter'))

    expect(onDragChange).toHaveBeenLastCalledWith(true)

    window.dispatchEvent(dragEventWith('dragleave'))

    expect(onDragChange).toHaveBeenLastCalledWith(false)

    wrapper.unmount()
  })

  it('hands over the first file and clears the highlight', () => {
    const { wrapper, onFile, onDragChange } = mountDropTarget()
    const file = new File(['audio'], 'take.wav')

    window.dispatchEvent(dragEventWith('dragenter'))
    window.dispatchEvent(dragEventWith('drop', { files: [file, new File([''], 'other.wav')] }))

    expect(onFile).toHaveBeenCalledExactlyOnceWith(file)
    expect(onDragChange).toHaveBeenLastCalledWith(false)

    wrapper.unmount()
  })

  it('resets the nesting count on a drop, whatever the browser counted on the way in', () => {
    const { wrapper, onDragChange } = mountDropTarget()

    window.dispatchEvent(dragEventWith('dragenter'))
    window.dispatchEvent(dragEventWith('dragenter'))
    window.dispatchEvent(dragEventWith('drop', { files: [new File([''], 'take.wav')] }))

    expect(onDragChange).toHaveBeenLastCalledWith(false)

    window.dispatchEvent(dragEventWith('dragenter'))

    expect(onDragChange).toHaveBeenLastCalledWith(true)

    wrapper.unmount()
  })

  it('takes no file from an empty drop', () => {
    const { wrapper, onFile } = mountDropTarget()

    window.dispatchEvent(dragEventWith('drop'))

    expect(onFile).not.toHaveBeenCalled()

    wrapper.unmount()
  })

  it('lets go of the window when the editor is torn down', () => {
    const { wrapper, onDragChange } = mountDropTarget()

    wrapper.unmount()
    window.dispatchEvent(dragEventWith('dragenter'))

    expect(onDragChange).not.toHaveBeenCalled()
  })
})
