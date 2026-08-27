import { ref } from 'vue'
import {
  normalisedToValue,
  valueToNormalised,
  type ParameterDefinition
} from '@/models/granular.model'

/**
 * Shift divides the step, so a fine adjustment is the same gesture made slower rather than a
 * second gesture to learn. Every way a parameter moves answers it - the drag, the wheel and the
 * arrow keys - or the key would mean something on one control and nothing on the next.
 */
export const fineAdjustmentDivisor = 5

/**
 * Whether a scripted focus draws the focus ring is decided by whatever held the focus before it,
 * so the same drag rings a control after a typed value and leaves it bare after a click - the ring
 * ends up saying which gesture preceded this one rather than which one is being made. A pointer
 * gesture knows it is not a keyboard one, so it marks the control it focuses and the ring is left
 * to the keys, which is the only thing it was there to answer.
 */
const pointerFocusAttribute = 'data-pointer-focus'

function takeFocusWithoutRing(target: HTMLElement) {
  if (!target.hasAttribute(pointerFocusAttribute)) {
    const release = () => {
      target.removeAttribute(pointerFocusAttribute)
      target.removeEventListener('blur', release)
      target.removeEventListener('keydown', release)
    }

    target.addEventListener('blur', release)
    target.addEventListener('keydown', release)
    target.setAttribute(pointerFocusAttribute, '')
  }

  target.focus()
}

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

    /**
     * A press on a control has one default action and it is harmful here: it begins a text
     * selection, which the drag then sweeps across whatever the row is made of, and the next
     * press landing inside that selection starts a native drag of it instead of the gesture - a
     * ghost following the pointer that no target will take. Focus is the only part of the default
     * that was wanted, so it is taken outright.
     */
    event.preventDefault()
    takeFocusWithoutRing(target)

    let lastX = event.clientX
    let lastY = event.clientY
    let normalised = valueToNormalised(definition, value)

    isDragging.value = true
    target.setPointerCapture(event.pointerId)
    handlers.begin()

    /**
     * Each move is weighed on its own and added to what the drag has already travelled, rather
     * than the whole displacement being measured from the press: shift taken up half way through
     * would otherwise rescale the distance already covered and the value would snap backwards at
     * the moment the fine adjustment was asked for. Accumulating also means the drag is clamped
     * where the value is, so a pull past the end comes straight back off it instead of spending
     * the overshoot again.
     *
     * Up is an increase for the same reason right is: it is the direction the value is drawn in.
     */
    const onMove = (move: PointerEvent) => {
      const moved = axis === 'x' ? move.clientX - lastX : lastY - move.clientY
      const travel = move.shiftKey ? travelInPixels * fineAdjustmentDivisor : travelInPixels

      lastX = move.clientX
      lastY = move.clientY
      normalised = Math.min(Math.max(normalised + moved / travel, 0), 1)

      handlers.change(normalisedToValue(definition, normalised))
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
