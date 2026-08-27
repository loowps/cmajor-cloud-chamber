import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ParameterReadout from '@/components/ParameterReadout.vue'
import { definitionFor, type ParameterDefinition } from '@/models/granular.model'

const pan = definitionFor('h1PanIn') as ParameterDefinition
const spray = definitionFor('h1SprayIn') as ParameterDefinition
const size = definitionFor('h1SizeIn') as ParameterDefinition

function mountReadout(
  props: Partial<{
    definition: ParameterDefinition
    modelValue: number
    spread: boolean
    soleControl: boolean
    worked: boolean
  }> = {}
) {
  return mount(ParameterReadout, {
    props: { definition: pan, modelValue: 0, ...props }
  })
}

describe('ParameterReadout', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('shows the reading with its unit held back as a caption', () => {
    const wrapper = mountReadout({ definition: size, modelValue: 120 })

    expect(wrapper.text()).toContain('120')
    expect(wrapper.find('.unit').text()).toBe('ms')
  })

  it('prints a spread with a sign that says what it is', () => {
    const wrapper = mountReadout({ definition: spray, modelValue: 0.4, spread: true })

    expect(wrapper.find('.sign').text()).toBe('±')
    expect(wrapper.text()).toContain('40.0')
  })

  describe('who is the slider', () => {
    it('is not, when a track beside it already is', () => {
      const box = mountReadout().find('button')

      expect(box.attributes('role')).toBeUndefined()
      expect(box.attributes('tabindex')).toBe('-1')
      expect(box.attributes('aria-label')).toBe('Set Pan')
    })

    it('is, when nothing else works the parameter', () => {
      const box = mountReadout({ soleControl: true }).find('button')

      expect(box.attributes('role')).toBe('slider')
      expect(box.attributes('tabindex')).toBe('0')
      expect(box.attributes('aria-valuemin')).toBe(String(pan.min))
      expect(box.attributes('aria-valuemax')).toBe(String(pan.max))
    })

    it('is, when it is the spread folded onto another parameter row', () => {
      const box = mountReadout({ definition: spray, modelValue: 0.4, spread: true }).find('button')

      expect(box.attributes('role')).toBe('slider')
      expect(box.attributes('tabindex')).toBe('0')
    })

    it('keeps its own name, because a spread has given up its label', () => {
      const box = mountReadout({ definition: spray, modelValue: 0.4, spread: true }).find('button')

      expect(box.attributes('aria-label')).toBe('Spray')
    })

    it('reads the value out with its unit for anything that cannot see the caption', () => {
      const box = mountReadout({ definition: size, modelValue: 120, soleControl: true }).find(
        'button'
      )

      expect(box.attributes('aria-valuetext')).toBe('120 ms')
    })
  })

  describe('typing a value', () => {
    it('is behind a double click, so a press that did not move cannot open a field', async () => {
      const wrapper = mountReadout({ definition: size, modelValue: 120 })

      await wrapper.find('button').trigger('click')

      expect(wrapper.find('input').exists()).toBe(false)

      await wrapper.find('button').trigger('dblclick')

      expect(wrapper.find('input').exists()).toBe(true)
    })

    it('opens on the bare number, with no unit to type around', async () => {
      const wrapper = mountReadout({ definition: spray, modelValue: 0.4 })

      await wrapper.find('button').trigger('dblclick')

      expect(wrapper.find('input').element.value).toBe('40.0')
    })

    it('commits as a gesture, so the host records it as an edit', async () => {
      const wrapper = mountReadout({ definition: size, modelValue: 120 })

      await wrapper.find('button').trigger('dblclick')
      await wrapper.find('input').setValue('480')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('update:modelValue')).toEqual([[480]])
      expect(wrapper.emitted('gestureStart')).toHaveLength(1)
      expect(wrapper.emitted('gestureEnd')).toHaveLength(1)
    })

    it('reads a percentage back into the 0..1 the parameter is stored in', async () => {
      const wrapper = mountReadout({ definition: spray, modelValue: 0.4 })

      await wrapper.find('button').trigger('dblclick')
      await wrapper.find('input').setValue('25')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('update:modelValue')?.[0][0]).toBeCloseTo(0.25, 6)
    })

    it('clamps rather than refusing a value the control could not be dragged to', async () => {
      const wrapper = mountReadout({ definition: size, modelValue: 120 })

      await wrapper.find('button').trigger('dblclick')
      await wrapper.find('input').setValue('99999')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('update:modelValue')).toEqual([[size.max]])
    })

    it('changes nothing on escape', async () => {
      const wrapper = mountReadout({ definition: size, modelValue: 120 })

      await wrapper.find('button').trigger('dblclick')
      await wrapper.find('input').setValue('480')
      await wrapper.find('input').trigger('keydown.esc')

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
      expect(wrapper.find('input').exists()).toBe(false)
    })

    it('changes nothing for text that holds no number', async () => {
      const wrapper = mountReadout({ definition: size, modelValue: 120 })

      await wrapper.find('button').trigger('dblclick')
      await wrapper.find('input').setValue('loud')
      await wrapper.find('input').trigger('keydown.enter')

      expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    })

    it('does not commit the draft a second time on the blur that follows enter', async () => {
      const wrapper = mountReadout({ definition: size, modelValue: 120 })

      await wrapper.find('button').trigger('dblclick')

      const field = wrapper.find('input')

      await field.setValue('480')
      await field.trigger('keydown.enter')
      await field.trigger('blur')

      expect(wrapper.emitted('update:modelValue')).toHaveLength(1)
    })
  })

  describe('the keyboard', () => {
    it('nudges along the taper in either direction', async () => {
      const wrapper = mountReadout({ soleControl: true })

      await wrapper.find('button').trigger('keydown.up')
      await wrapper.find('button').trigger('keydown.down')

      const [[up], [down]] = wrapper.emitted('update:modelValue') as [number][]

      expect(up).toBeGreaterThan(0)
      expect(down).toBeLessThan(0)
    })

    it('takes a fifth of a step while shift is held', async () => {
      const wrapper = mountReadout({ soleControl: true })

      await wrapper.find('button').trigger('keydown.up')
      await wrapper.find('button').trigger('keydown.up', { shiftKey: true })

      const [[coarse], [fine]] = wrapper.emitted('update:modelValue') as [number][]

      expect(fine).toBeCloseTo(coarse / 5, 6)
    })

    it('brackets a nudge as a gesture', async () => {
      const wrapper = mountReadout({ soleControl: true })

      await wrapper.find('button').trigger('keydown.right')

      expect(wrapper.emitted('gestureStart')).toHaveLength(1)
      expect(wrapper.emitted('gestureEnd')).toHaveLength(1)
    })

    it('opens the field on enter, so a keyboard user is not left with nudges', async () => {
      const wrapper = mountReadout({ soleControl: true })

      await wrapper.find('button').trigger('keydown.enter')

      expect(wrapper.find('input').exists()).toBe(true)
    })
  })

  describe('the ring', () => {
    it('is on when the track beside it is being worked', () => {
      expect(mountReadout({ worked: true }).find('button').classes()).toContain('ringed')
    })

    it('is off at rest', () => {
      expect(mountReadout().find('button').classes()).not.toContain('ringed')
    })
  })
})
