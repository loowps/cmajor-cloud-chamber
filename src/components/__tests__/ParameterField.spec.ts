import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ParameterField from '@/components/ParameterField.vue'
import ParameterReadout from '@/components/ParameterReadout.vue'
import { definitionFor, type ParameterDefinition } from '@/models/granular.model'

const level = definitionFor('h1LevelIn') as ParameterDefinition
const levelJitter = definitionFor('h1LevelJitterIn') as ParameterDefinition
const fine = definitionFor('h1FineIn') as ParameterDefinition

function mountField(props: Record<string, unknown> = {}) {
  return mount(ParameterField, { props: { definition: level, modelValue: -6, ...props } })
}

describe('ParameterField', () => {
  it('names the parameter and shows its reading', () => {
    const wrapper = mountField()

    expect(wrapper.find('.label').text()).toBe('Level')
    expect(wrapper.text()).toContain('-6.0')
  })

  /// A bar read left to right has no column for a name to line up in, so nothing is gained by
  /// holding a cell open where a parameter has no spread.
  it('has no track and no cell held open for a spread it has not got', () => {
    const wrapper = mountField({ definition: fine, modelValue: 0 })

    expect(wrapper.find('.track').exists()).toBe(false)
    expect(wrapper.find('.spread-cell').exists()).toBe(false)
    expect(wrapper.findAllComponents(ParameterReadout)).toHaveLength(1)
  })

  it('makes the box the slider, because nothing else works the parameter', () => {
    const box = mountField().find('button')

    expect(box.attributes('role')).toBe('slider')
    expect(box.attributes('tabindex')).toBe('0')
  })

  it('sets the spread beside the value where the parameter set names one', () => {
    const readouts = mountField({ secondary: levelJitter, secondaryValue: 0.4 }).findAllComponents(
      ParameterReadout
    )

    expect(readouts).toHaveLength(2)
    expect(readouts[1].props('spread')).toBe(true)
    expect(readouts[1].props('modelValue')).toBe(0.4)
  })

  it('reads a missing spread value as zero rather than as nothing', () => {
    const readouts = mountField({ secondary: levelJitter }).findAllComponents(ParameterReadout)

    expect(readouts[1].props('modelValue')).toBe(0)
  })

  it('forwards the value and its gesture', () => {
    const wrapper = mountField()
    const box = wrapper.findComponent(ParameterReadout)

    box.vm.$emit('update:modelValue', -12)
    box.vm.$emit('gestureStart')
    box.vm.$emit('gestureEnd')

    expect(wrapper.emitted('update:modelValue')).toEqual([[-12]])
    expect(wrapper.emitted('gestureStart')).toHaveLength(1)
    expect(wrapper.emitted('gestureEnd')).toHaveLength(1)
  })

  it('keeps the spread apart from the value it annotates', () => {
    const wrapper = mountField({ secondary: levelJitter, secondaryValue: 0.4 })
    const spread = wrapper.findAllComponents(ParameterReadout)[1]

    spread.vm.$emit('update:modelValue', 0.9)
    spread.vm.$emit('gestureStart')
    spread.vm.$emit('gestureEnd')

    expect(wrapper.emitted('update:secondaryValue')).toEqual([[0.9]])
    expect(wrapper.emitted('secondaryGestureStart')).toHaveLength(1)
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })
})
