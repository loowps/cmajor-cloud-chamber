import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import HeadSelector from '@/components/HeadSelector.vue'
import { useGranularStore } from '@/stores/granular'
import { engine, enableEndpointFor } from '@/models/granular.model'

describe('HeadSelector', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('offers every head the engine has', () => {
    const wrapper = mount(HeadSelector)

    expect(wrapper.findAll('button.head')).toHaveLength(engine.headCount)
    expect(wrapper.findAll('button.head').map((head) => head.text())).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8'
    ])
  })

  it('marks the one being edited and no other', () => {
    const store = useGranularStore()

    store.selectHead(3)

    const heads = mount(HeadSelector).findAll('button.head')

    expect(heads.filter((head) => head.attributes('aria-pressed') === 'true')).toHaveLength(1)
    expect(heads[3].attributes('aria-pressed')).toBe('true')
  })

  it('changes which head the window is editing on a click', async () => {
    const store = useGranularStore()
    const wrapper = mount(HeadSelector)

    await wrapper.findAll('button.head')[5].trigger('click')

    expect(store.selectedHead).toBe(5)
  })

  /// The pip is whether the head sounds and the border is whether it is up. Either can be true
  /// without the other, so a click on the strip must never mean two things.
  it('reads whether a head is sounding without ever writing it', async () => {
    const store = useGranularStore()
    const wrapper = mount(HeadSelector)

    expect(wrapper.findAll('button.head')[0].classes()).toContain('on')
    expect(wrapper.findAll('button.head')[1].classes()).not.toContain('on')

    await wrapper.findAll('button.head')[1].trigger('click')

    expect(store.parameterValue(enableEndpointFor(1))).toBe(0)
    expect(wrapper.findAll('button.head')[1].classes()).not.toContain('on')
  })

  it('lights the pip when the head is switched on elsewhere', async () => {
    const store = useGranularStore()
    const wrapper = mount(HeadSelector)

    store.setParameter(enableEndpointFor(4), 1)
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('button.head')[4].classes()).toContain('on')
  })

  it('says in its title when a head is silent, which the pip alone cannot', () => {
    const heads = mount(HeadSelector).findAll('button.head')

    expect(heads[0].attributes('title')).toBe('Head 1')
    expect(heads[1].attributes('title')).toBe('Head 2 (off)')
  })

  it('can select a head that is silent, and a silent head can be up', async () => {
    const store = useGranularStore()
    const wrapper = mount(HeadSelector)

    await wrapper.findAll('button.head')[6].trigger('click')

    expect(store.selectedHead).toBe(6)
    expect(wrapper.findAll('button.head')[6].classes()).toContain('selected')
    expect(wrapper.findAll('button.head')[6].classes()).not.toContain('on')
  })
})
