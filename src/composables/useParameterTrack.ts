import { computed } from 'vue'
import {
  formatParameter,
  normalisedToValue,
  valueToNormalised,
  type ParameterDefinition
} from '@/models/granular.model'
import { fineAdjustmentDivisor, useParameterDrag } from '@/composables/useParameterDrag'

/// One percent of the range, which is what a wheel notch and an arrow key are both worth.
const nudgeStep = 0.01

export interface ParameterTrackHandlers {
  begin: () => void
  change: (next: number) => void
  end: () => void
}

/**
 * Everything a horizontal track answers, which is more than the drag: a sweep across its own
 * width, a double click back to the initial, and the wheel and arrow steps a pointer cannot make.
 * Two tracks in the window are worked this way - the row in a band and the output fader in the
 * footer - and they differ only in what is drawn inside the groove, so keeping the gesture in one
 * place is what stops the same pull meaning two things in two bars.
 *
 * Taken as getters rather than values because both call sites read a prop, and a prop read once
 * at setup would leave the track working yesterday's number.
 */
export function useParameterTrack(
  definition: () => ParameterDefinition,
  value: () => number,
  handlers: ParameterTrackHandlers
) {
  const { isDragging, start } = useParameterDrag(handlers)

  const normalised = computed(() => valueToNormalised(definition(), value()))

  const valueText = computed(() => formatParameter(definition(), value()))

  /// A full sweep is the track's own width, so the distance the pointer travels is the distance
  /// the fill travels and a gesture can never run off the end of what it is aimed at.
  function onPointerDown(event: PointerEvent) {
    start(event, definition(), value(), 'x', (event.currentTarget as HTMLElement).clientWidth || 1)
  }

  function commitAsGesture(next: number) {
    handlers.begin()
    handlers.change(next)
    handlers.end()
  }

  /// Shift shortens the step exactly as it slows the drag, so the key means one thing whichever
  /// way the parameter is being worked.
  function nudge(steps: number, fine = false) {
    const step = fine ? nudgeStep / fineAdjustmentDivisor : nudgeStep

    commitAsGesture(normalisedToValue(definition(), normalised.value + steps * step))
  }

  /// Reset belongs to the control that shows the range, typing to the one that shows the number,
  /// which is why the two double clicks on a row mean different things on purpose.
  function onDoubleClick() {
    commitAsGesture(definition().initial)
  }

  function onWheel(event: WheelEvent) {
    event.preventDefault()
    nudge(event.deltaY < 0 ? 1 : -1, event.shiftKey)
  }

  const trackAttributes = computed(() => ({
    role: 'slider',
    tabindex: 0,
    'aria-label': definition().label,
    'aria-valuemin': definition().min,
    'aria-valuemax': definition().max,
    'aria-valuenow': value(),
    'aria-valuetext': valueText.value
  }))

  return { isDragging, normalised, trackAttributes, onPointerDown, onDoubleClick, onWheel, nudge }
}
