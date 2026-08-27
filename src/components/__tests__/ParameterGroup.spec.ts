import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import ParameterGroup from '@/components/ParameterGroup.vue'
import ParameterControl from '@/components/ParameterControl.vue'
import ToggleControl from '@/components/ToggleControl.vue'
import { useGranularStore } from '@/stores/granular'
import { definitionFor, globalParameterRows, headParameterRows } from '@/models/granular.model'
import type { ParameterDefinition } from '@/models/granular.model'
import type { PatchSync } from '@/composables/usePatchSync'

const patchSync = {
  sendParameter: vi.fn(),
  beginGesture: vi.fn(),
  endGesture: vi.fn(),
  dropSample: vi.fn(),
  clearSample: vi.fn()
} satisfies PatchSync

vi.mock('@/composables/usePatchSync', () => ({
  usePatchSync: () => patchSync
}))

function mountGroup(rows = headParameterRows(0, 'source'), label = 'Source') {
  return mount(ParameterGroup, { props: { rows, label } })
}

/// No band holds a switch since Free Run moved to the footer, so the mixed group a switch has to
/// keep its place in is assembled here rather than named from the parameter set.
function mixedRows() {
  const engine = globalParameterRows('engine')
  const freeRun = definitionFor('freeRunIn') as ParameterDefinition

  return [engine[0], { definition: freeRun }, ...engine.slice(1)]
}

describe('ParameterGroup', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('names the group', () => {
    expect(mountGroup().find('h2').text()).toBe('Source')
  })

  it('draws one control per row', () => {
    const rows = headParameterRows(0, 'source')

    expect(mountGroup(rows).findAllComponents(ParameterControl)).toHaveLength(rows.length)
  })

  /// Drawing the switches first would lift one out of the middle of its group and to the head of
  /// it, which is a different reading order from the one the parameter set names.
  it('keeps the parameter set order rather than grouping the switches', () => {
    const rows = mixedRows()
    const wrapper = mountGroup(rows, 'Engine')

    const labels = wrapper.findAll('.label').map((label) => label.text())

    expect(labels).toEqual(rows.map((row) => row.definition.label))
    expect(wrapper.findComponent(ToggleControl).exists()).toBe(true)
  })

  it('draws a toggle for a toggle and a track for everything else', () => {
    const wrapper = mountGroup(mixedRows(), 'Engine')

    expect(wrapper.findAllComponents(ToggleControl)).toHaveLength(1)
    expect(wrapper.findAllComponents(ParameterControl)).toHaveLength(2)
  })

  /// Free Run is drawn by the footer now, so no band may claim it as one of its rows.
  it('leaves Free Run out of the Engine band', () => {
    const labels = globalParameterRows('engine').map((row) => row.definition.label)

    expect(labels).not.toContain('Free Run')
  })

  it('reads each row from the store', () => {
    const store = useGranularStore()

    store.setParameter('h1MotionIn', 2)

    const motion = mountGroup()
      .findAllComponents(ParameterControl)
      .find((control) => control.props('definition').endpoint === 'h1MotionIn')

    expect(motion?.props('modelValue')).toBe(2)
  })

  it('hands a row its spread value alongside its own', () => {
    const store = useGranularStore()

    store.setParameter('h1SprayIn', 0.75)

    const control = mountGroup()
      .findAllComponents(ParameterControl)
      .find((c) => c.props('definition').endpoint === 'h1PositionIn')

    expect(control?.props('secondary')?.endpoint).toBe('h1SprayIn')
    expect(control?.props('secondaryValue')).toBe(0.75)
  })

  it('sends a change on the endpoint the row belongs to', () => {
    const control = mountGroup()
      .findAllComponents(ParameterControl)
      .find((c) => c.props('definition').endpoint === 'h1MotionIn')

    control?.vm.$emit('update:modelValue', 1.5)

    expect(patchSync.sendParameter).toHaveBeenCalledExactlyOnceWith('h1MotionIn', 1.5)
  })

  it('sends a spread on its own endpoint, not on the value it annotates', () => {
    const control = mountGroup()
      .findAllComponents(ParameterControl)
      .find((c) => c.props('definition').endpoint === 'h1PositionIn')

    control?.vm.$emit('update:secondaryValue', 0.3)
    control?.vm.$emit('secondaryGestureStart')
    control?.vm.$emit('secondaryGestureEnd')

    expect(patchSync.sendParameter).toHaveBeenCalledExactlyOnceWith('h1SprayIn', 0.3)
    expect(patchSync.beginGesture).toHaveBeenCalledExactlyOnceWith('h1SprayIn')
    expect(patchSync.endGesture).toHaveBeenCalledExactlyOnceWith('h1SprayIn')
  })

  it('brackets a row gesture on the row endpoint', () => {
    const control = mountGroup().findAllComponents(ParameterControl)[0]
    const endpoint = control.props('definition').endpoint

    control.vm.$emit('gestureStart')
    control.vm.$emit('gestureEnd')

    expect(patchSync.beginGesture).toHaveBeenCalledExactlyOnceWith(endpoint)
    expect(patchSync.endGesture).toHaveBeenCalledExactlyOnceWith(endpoint)
  })

  it('draws the head it is given rather than head one', () => {
    const endpoints = mountGroup(headParameterRows(6, 'grain'), 'Grain')
      .findAllComponents(ParameterControl)
      .map((control) => control.props('definition').endpoint)

    expect(endpoints.every((endpoint: string) => endpoint.startsWith('h7'))).toBe(true)
  })
})
