import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ParameterControl from '@/components/ParameterControl.vue'
import ParameterReadout from '@/components/ParameterReadout.vue'
import { definitionFor, type ParameterDefinition } from '@/models/granular.model'

const pan = definitionFor('h1PanIn') as ParameterDefinition
const spray = definitionFor('h1SprayIn') as ParameterDefinition
const position = definitionFor('h1PositionIn') as ParameterDefinition
const size = definitionFor('h1SizeIn') as ParameterDefinition

function mountControl(props: Record<string, unknown> = {}) {
  return mount(ParameterControl, {
    props: { definition: pan, modelValue: 0, ...props },
    attachTo: document.body
  })
}

/// The track sizes its sweep from its own width, which jsdom always reports as zero.
function widthOf(element: Element, width: number) {
  Object.defineProperty(element, 'clientWidth', { value: width, configurable: true })
}

/// Dispatched rather than triggered: test-utils builds its events by assignment, and `button` is
/// read only on a MouseEvent - which is the one field the drag checks before it starts.
function pointer(element: Element, type: string, init: PointerEventInit) {
  element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, ...init }))
}

describe('ParameterControl', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('lays out four cells, so a row lines up with the rows around it', () => {
    const wrapper = mountControl()

    expect(wrapper.find('.label').text()).toBe('Pan')
    expect(wrapper.find('.track').exists()).toBe(true)
    expect(wrapper.find('.spread-cell').exists()).toBe(true)
  })

  it('holds the spread cell open where the parameter set names no spread', () => {
    const wrapper = mountControl()

    expect(wrapper.find('.spread-cell').exists()).toBe(true)
    expect(wrapper.findAllComponents(ParameterReadout)).toHaveLength(1)
  })

  it('draws the spread beside the value it scatters where there is one', () => {
    const wrapper = mountControl({
      definition: position,
      modelValue: 0.5,
      secondary: spray,
      secondaryValue: 0.4
    })

    const readouts = wrapper.findAllComponents(ParameterReadout)

    expect(readouts).toHaveLength(2)
    expect(readouts[1].props('spread')).toBe(true)
    expect(readouts[1].props('definition').endpoint).toBe(spray.endpoint)
  })

  describe('the track', () => {
    it('is the slider and the tab stop for the row', () => {
      const track = mountControl().find('.track')

      expect(track.attributes('role')).toBe('slider')
      expect(track.attributes('tabindex')).toBe('0')
      expect(track.attributes('aria-label')).toBe('Pan')
      expect(track.attributes('aria-valuenow')).toBe('0')
    })

    it('reads the value out with its unit', () => {
      const track = mountControl({ definition: size, modelValue: 120 }).find('.track')

      expect(track.attributes('aria-valuetext')).toBe('120 ms')
    })

    it('sweeps the full range across its own width', async () => {
      const wrapper = mountControl({ modelValue: pan.min })
      const track = wrapper.find('.track')

      widthOf(track.element, 240)

      pointer(track.element, 'pointerdown', { button: 0, clientX: 0 })
      pointer(track.element, 'pointermove', { clientX: 240, clientY: 0 })

      const emitted = wrapper.emitted('update:modelValue') as [number][]

      expect(emitted.at(-1)?.[0]).toBeCloseTo(pan.max, 6)

      wrapper.unmount()
    })

    it('resets to the parameter initial on a double click', async () => {
      const wrapper = mountControl({ definition: size, modelValue: 900 })

      await wrapper.find('.track').trigger('dblclick')

      expect(wrapper.emitted('update:modelValue')).toEqual([[size.initial]])
      expect(wrapper.emitted('gestureStart')).toHaveLength(1)
      expect(wrapper.emitted('gestureEnd')).toHaveLength(1)
    })

    it('nudges on the arrow keys, up and right one way and down and left the other', async () => {
      const wrapper = mountControl()
      const track = wrapper.find('.track')

      await track.trigger('keydown.up')
      await track.trigger('keydown.right')
      await track.trigger('keydown.down')
      await track.trigger('keydown.left')

      const emitted = (wrapper.emitted('update:modelValue') as [number][]).map(([value]) => value)

      expect(emitted[0]).toBeGreaterThan(0)
      expect(emitted[1]).toBeGreaterThan(0)
      expect(emitted[2]).toBeLessThan(0)
      expect(emitted[3]).toBeLessThan(0)
    })

    it('nudges on the wheel, and refuses the page a scroll while doing it', async () => {
      const wrapper = mountControl()

      await wrapper.find('.track').trigger('wheel', { deltaY: -1 })

      expect((wrapper.emitted('update:modelValue') as [number][])[0][0]).toBeGreaterThan(0)

      await wrapper.find('.track').trigger('wheel', { deltaY: 1 })

      expect((wrapper.emitted('update:modelValue') as [number][])[1][0]).toBeLessThan(0)
    })

    it('opens the readout text field on enter', async () => {
      const wrapper = mountControl()

      await wrapper.find('.track').trigger('keydown.enter')
      await wrapper.vm.$nextTick()

      expect(wrapper.find('input').exists()).toBe(true)
    })

    it('rings the reading while the track is being worked', async () => {
      const wrapper = mountControl()
      const track = wrapper.find('.track')

      widthOf(track.element, 240)
      pointer(track.element, 'pointerdown', { button: 0, clientX: 10 })
      await wrapper.vm.$nextTick()

      expect(wrapper.findComponent(ParameterReadout).props('worked')).toBe(true)

      wrapper.unmount()
    })
  })

  describe('the fill', () => {
    it('runs from the left for a value read as a level from zero', () => {
      const style = mountControl({ definition: spray, modelValue: 0.5 })
        .find('.fill')
        .attributes('style')

      expect(style).toContain('left: 0%')
      expect(style).toContain('width: 50%')
    })

    it('reaches out of the middle for a bipolar value, whichever way it points', () => {
      const right = mountControl({ modelValue: 0.5 }).find('.fill').attributes('style')

      expect(right).toContain('left: 50%')
      expect(right).toContain('width: 25%')

      const left = mountControl({ modelValue: -0.5 }).find('.fill').attributes('style')

      expect(left).toContain('left: 25%')
      expect(left).toContain('width: 25%')
    })

    it('puts the thumb on the value rather than beside it', () => {
      expect(mountControl({ modelValue: pan.max }).find('.thumb').attributes('style')).toContain(
        'left: 100%'
      )
    })
  })

  describe('what it passes up', () => {
    it('forwards a change made in the reading', () => {
      const wrapper = mountControl()

      wrapper.findComponent(ParameterReadout).vm.$emit('update:modelValue', 0.25)

      expect(wrapper.emitted('update:modelValue')).toEqual([[0.25]])
    })

    it('keeps the spread apart from the value, so a host records two parameters', () => {
      const wrapper = mountControl({
        definition: position,
        modelValue: 0.5,
        secondary: spray,
        secondaryValue: 0.4
      })

      const spreadBox = wrapper.findAllComponents(ParameterReadout)[1]

      spreadBox.vm.$emit('update:modelValue', 0.8)
      spreadBox.vm.$emit('gestureStart')
      spreadBox.vm.$emit('gestureEnd')

      expect(wrapper.emitted('update:secondaryValue')).toEqual([[0.8]])
      expect(wrapper.emitted('secondaryGestureStart')).toHaveLength(1)
      expect(wrapper.emitted('secondaryGestureEnd')).toHaveLength(1)
      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })
  })
})
