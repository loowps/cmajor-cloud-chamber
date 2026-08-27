import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ToggleControl from '@/components/ToggleControl.vue'
import { definitionFor, type ParameterDefinition } from '@/models/granular.model'

const freeRun = definitionFor('freeRunIn') as ParameterDefinition

function mountToggle(modelValue: number) {
  return mount(ToggleControl, { props: { definition: freeRun, modelValue } })
}

describe('ToggleControl', () => {
  it('is a switch, and says which way it is thrown', () => {
    const off = mountToggle(0).find('button')

    expect(off.attributes('role')).toBe('switch')
    expect(off.attributes('aria-checked')).toBe('false')
    expect(off.text()).toBe('Off')

    const on = mountToggle(1).find('button')

    expect(on.attributes('aria-checked')).toBe('true')
    expect(on.text()).toBe('On')
  })

  it('names itself, because the row it sits in is a grid rather than a label and a control', () => {
    expect(mountToggle(0).find('button').attributes('aria-label')).toBe('Free Run')
  })

  it('throws to the other side as one gesture', async () => {
    const wrapper = mountToggle(0)

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[1]])
    expect(wrapper.emitted('gestureStart')).toHaveLength(1)
    expect(wrapper.emitted('gestureEnd')).toHaveLength(1)
  })

  it('throws back again from on', async () => {
    const wrapper = mountToggle(1)

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('update:modelValue')).toEqual([[0]])
  })

  it('reads anything at or above half as on, which is what a host may send', () => {
    expect(mountToggle(0.5).find('button').text()).toBe('On')
    expect(mountToggle(0.49).find('button').text()).toBe('Off')
  })

  it('fills all four cells, or the next row would flow into the gap', () => {
    const wrapper = mountToggle(0)

    expect(wrapper.find('.label').exists()).toBe(true)
    expect(wrapper.find('button.readout').exists()).toBe(true)
    expect(wrapper.findAll('.empty')).toHaveLength(2)
  })

  it('hides the cells it has nothing to put in from a screen reader', () => {
    for (const cell of mountToggle(0).findAll('.empty')) {
      expect(cell.attributes('aria-hidden')).toBe('true')
    }
  })
})
