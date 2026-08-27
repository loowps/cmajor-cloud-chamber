import { describe, expect, it, vi } from 'vitest'
import { useParameterDrag } from '@/composables/useParameterDrag'
import { definitionFor, valueToNormalised, type ParameterDefinition } from '@/models/granular.model'

const pan = definitionFor('h1PanIn') as ParameterDefinition
const density = definitionFor('h1DensityIn') as ParameterDefinition

function pointer(type: string, position: { x?: number; y?: number; shift?: boolean } = {}) {
  const { x = 0, y = 0, shift = false } = position

  return new PointerEvent(type, {
    button: 0,
    pointerId: 1,
    clientX: x,
    clientY: y,
    shiftKey: shift
  })
}

function draggableTarget() {
  const target = document.createElement('div')
  const changes: number[] = []
  const gestures: string[] = []

  const drag = useParameterDrag({
    begin: () => gestures.push('begin'),
    change: (next) => changes.push(next),
    end: () => gestures.push('end')
  })

  function press(event: PointerEvent, ...args: [ParameterDefinition, number, 'x' | 'y', number]) {
    Object.defineProperty(event, 'currentTarget', { value: target })
    drag.start(event, ...args)
  }

  return { target, changes, gestures, drag, press }
}

describe('useParameterDrag', () => {
  it('brackets the gesture, so the host records it as an edit', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown'), pan, 0, 'x', 240)

    expect(surface.drag.isDragging.value).toBe(true)
    expect(surface.gestures).toEqual(['begin'])

    surface.target.dispatchEvent(pointer('pointerup'))

    expect(surface.drag.isDragging.value).toBe(false)
    expect(surface.gestures).toEqual(['begin', 'end'])
  })

  it('ignores a press that is not the primary button', () => {
    const surface = draggableTarget()
    const event = new PointerEvent('pointerdown', { button: 2, pointerId: 1 })

    Object.defineProperty(event, 'currentTarget', { value: surface.target })
    surface.drag.start(event, pan, 0, 'x', 240)

    expect(surface.drag.isDragging.value).toBe(false)
    expect(surface.gestures).toEqual([])
  })

  it('is relative, so a press alone never moves the value', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown', { x: 137 }), pan, 0.5, 'x', 240)

    expect(surface.changes).toEqual([])
  })

  it('sweeps a full range across its own width', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown', { x: 0 }), pan, pan.min, 'x', 240)
    surface.target.dispatchEvent(pointer('pointermove', { x: 240 }))

    expect(surface.changes.at(-1)).toBeCloseTo(pan.max, 6)
  })

  it('reads up as an increase on a vertical drag', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown', { y: 190 }), pan, 0, 'y', 190)
    surface.target.dispatchEvent(pointer('pointermove', { y: 0 }))

    expect(surface.changes.at(-1)).toBeGreaterThan(0)

    surface.target.dispatchEvent(pointer('pointermove', { y: 380 }))

    expect(surface.changes.at(-1)).toBeLessThan(0)
  })

  it('divides the travel by five while shift is held', () => {
    const coarse = draggableTarget()
    const fine = draggableTarget()

    coarse.press(pointer('pointerdown', { x: 0 }), pan, 0, 'x', 60)
    coarse.target.dispatchEvent(pointer('pointermove', { x: 30 }))

    fine.press(pointer('pointerdown', { x: 0 }), pan, 0, 'x', 60)
    fine.target.dispatchEvent(pointer('pointermove', { x: 30, shift: true }))

    expect(fine.changes.at(-1)).toBeCloseTo((coarse.changes.at(-1) as number) / 5, 6)
  })

  it('weighs each move on its own, so shift taken up mid-drag never snaps the value', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown', { x: 0 }), pan, 0, 'x', 240)
    surface.target.dispatchEvent(pointer('pointermove', { x: 60, shift: true }))
    surface.target.dispatchEvent(pointer('pointermove', { x: 60 }))

    expect(surface.changes[1]).toBeCloseTo(surface.changes[0], 6)

    surface.target.dispatchEvent(pointer('pointermove', { x: 120 }))

    expect(surface.changes[2] - surface.changes[1]).toBeCloseTo((pan.max - pan.min) / 4, 6)
  })

  it('clamps as it goes, so a pull past the end comes straight back off it', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown', { x: 0 }), pan, 0, 'x', 240)
    surface.target.dispatchEvent(pointer('pointermove', { x: 9999 }))
    surface.target.dispatchEvent(pointer('pointermove', { x: 9999 - 120 }))

    expect(surface.changes.at(-1)).toBeCloseTo(pan.min + (pan.max - pan.min) / 2, 6)
  })

  it('moves along the taper rather than along the value', () => {
    const surface = draggableTarget()
    const start = density.centre as number

    surface.press(pointer('pointerdown', { x: 0 }), density, start, 'x', 240)
    surface.target.dispatchEvent(pointer('pointermove', { x: 24 }))

    expect(valueToNormalised(density, surface.changes[0])).toBeCloseTo(0.6, 4)
  })

  it('clamps at either end of the range', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown', { x: 0 }), pan, 0, 'x', 240)
    surface.target.dispatchEvent(pointer('pointermove', { x: 9999 }))

    expect(surface.changes.at(-1)).toBe(pan.max)

    surface.target.dispatchEvent(pointer('pointermove', { x: -9999 }))

    expect(surface.changes.at(-1)).toBe(pan.min)
  })

  it('captures the pointer, so a drag off the control is still the control being dragged', () => {
    const surface = draggableTarget()
    const capture = vi.spyOn(surface.target, 'setPointerCapture')
    const release = vi.spyOn(surface.target, 'releasePointerCapture')

    surface.press(pointer('pointerdown'), pan, 0, 'x', 240)

    expect(capture).toHaveBeenCalledWith(1)

    surface.target.dispatchEvent(pointer('pointerup'))

    expect(release).toHaveBeenCalledWith(1)
  })

  it('stops listening once the gesture is over', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown', { x: 0 }), pan, 0, 'x', 240)
    surface.target.dispatchEvent(pointer('pointerup'))
    surface.target.dispatchEvent(pointer('pointermove', { x: 100 }))

    expect(surface.changes).toEqual([])
  })

  /**
   * Whether a scripted focus draws the ring is Chromium's guess at what the last gesture was, so
   * without the mark the same drag rings a control or does not depending on what preceded it.
   */
  it('marks the focus a drag takes, so the ring is not drawn on it', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown'), pan, 0, 'x', 240)

    expect(surface.target.hasAttribute('data-pointer-focus')).toBe(true)

    surface.target.dispatchEvent(pointer('pointerup'))

    expect(surface.target.hasAttribute('data-pointer-focus')).toBe(true)
  })

  it('hands the ring back to the keyboard on the first key, and on losing the focus', () => {
    const surface = draggableTarget()

    surface.press(pointer('pointerdown'), pan, 0, 'x', 240)
    surface.target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))

    expect(surface.target.hasAttribute('data-pointer-focus')).toBe(false)

    surface.press(pointer('pointerdown'), pan, 0, 'x', 240)
    surface.target.dispatchEvent(new FocusEvent('blur'))

    expect(surface.target.hasAttribute('data-pointer-focus')).toBe(false)
  })
})
