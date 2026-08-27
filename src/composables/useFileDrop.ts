import { onBeforeUnmount, onMounted } from 'vue'

/**
 * The whole window is the drop target, not a rectangle inside it.
 *
 * A file dropped anywhere the page has not explicitly claimed is *navigated to* - the editor is
 * replaced by the browser's own audio player, which is what happens the moment a drop lands on
 * the waveform rather than on the strip above it. So every drag event on the window is answered
 * whether or not it landed on something that wanted it, and the default is refused in all cases:
 * a plugin window has nowhere it could legitimately navigate to.
 */
export function useFileDrop(handlers: {
  onFile(file: File): void
  onDragChange(isDragging: boolean): void
}) {
  /// dragleave fires again on every child boundary the pointer crosses, so nesting is counted
  /// rather than trusted - otherwise the highlight flickers off over every knob in the window.
  let enterDepth = 0

  function carriesFile(event: DragEvent) {
    return Array.from(event.dataTransfer?.types ?? []).includes('Files')
  }

  function setDragging(isDragging: boolean) {
    handlers.onDragChange(isDragging)
  }

  function onDragEnter(event: DragEvent) {
    event.preventDefault()

    if (!carriesFile(event)) {
      return
    }

    enterDepth += 1
    setDragging(true)
  }

  function onDragOver(event: DragEvent) {
    event.preventDefault()

    if (event.dataTransfer && carriesFile(event)) {
      event.dataTransfer.dropEffect = 'copy'
    }
  }

  function onDragLeave(event: DragEvent) {
    event.preventDefault()

    if (!carriesFile(event)) {
      return
    }

    enterDepth = Math.max(0, enterDepth - 1)

    if (enterDepth === 0) {
      setDragging(false)
    }
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()

    enterDepth = 0
    setDragging(false)

    const file = event.dataTransfer?.files?.[0]

    if (file) {
      handlers.onFile(file)
    }
  }

  onMounted(() => {
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('dragenter', onDragEnter)
    window.removeEventListener('dragover', onDragOver)
    window.removeEventListener('dragleave', onDragLeave)
    window.removeEventListener('drop', onDrop)
  })
}
