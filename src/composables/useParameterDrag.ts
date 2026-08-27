import { ref } from 'vue'
import {
  normalisedToValue,
  valueToNormalised,
  type ParameterDefinition
} from '@/models/granular.model'

/// Shift divides the travel, so a fine adjustment is the same gesture made slower rather than a
/// second gesture to learn.
const fineDragDivisor = 5

export interface ParameterDragHandlers {
  begin: () => void
  change: (next: number) => void
  end: () => void
}

/**
 * The one pointer gesture every control in a parameter row is worked by. Three surfaces use it -
 * the track, the value and the spread beside it - and they differ only in which way the pointer
 * is read and how far it has to travel for a full sweep, so those are arguments rather than three
 * copies of the same plumbing.
 *
 * Relative rather than jump-to-click in all three cases: a press landing a few pixels off would
 * move the value before the drag had begun, and a parameter a host is automating should not lurch
 * because the pointer came to rest on it.
 */
export function useParameterDrag(handlers: ParameterDragHandlers) {
  const isDragging = ref(false)

  function start(
    event: PointerEvent,
    definition: ParameterDefinition,
    value: number,
    axis: 'x' | 'y',
    travelInPixels: number
  ) {
    if (event.button !== 0) {
      return
    }

    const target = event.currentTarget as HTMLElement
    const startX = event.clientX
    const startY = event.clientY
    const startNormalised = valueToNormalised(definition, value)

    isDragging.value = true
    target.setPointerCapture(event.pointerId)
    handlers.begin()

    /// Up is an increase for the same reason right is: it is the direction the value is drawn in.
    const onMove = (move: PointerEvent) => {
      const moved = axis === 'x' ? move.clientX - startX : startY - move.clientY
      const travel = move.shiftKey ? travelInPixels * fineDragDivisor : travelInPixels

      handlers.change(normalisedToValue(definition, startNormalised + moved / travel))
    }

    const onUp = () => {
      isDragging.value = false
      target.releasePointerCapture(event.pointerId)
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', onUp)
      handlers.end()
    }

    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', onUp)
  }

  return { isDragging, start }
}
