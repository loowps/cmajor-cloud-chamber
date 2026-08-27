import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import IconButton from '@/components/IconButton.vue'
import type { IconName } from '@/components/IconButton.vue'

function mountIcon(name: IconName, active = false) {
  return mount(IconButton, { props: { name, active } })
}

describe('IconButton', () => {
  it('never submits a form it happens to sit in', () => {
    expect(mountIcon('power').find('button').attributes('type')).toBe('button')
  })

  it('draws a different mark for each name', () => {
    const marks = (['power', 'folder', 'trash'] as const).map((name) => mountIcon(name).html())

    expect(new Set(marks).size).toBe(3)
  })

  it('hides the mark from a screen reader, which is told by the label instead', () => {
    expect(mountIcon('power').find('svg').attributes('aria-hidden')).toBe('true')
  })

  /// Enable is the one control in the window that fills rather than lights, because a silenced
  /// head is the only state the rest of the window cannot tell you.
  it('fills when it is on', () => {
    expect(mountIcon('power', true).find('button').classes()).toContain('active')
    expect(mountIcon('power', false).find('button').classes()).not.toContain('active')
  })

  it('is inert by default, so it says nothing the thing placing it has not said', () => {
    expect(mountIcon('folder').find('button').classes()).not.toContain('active')
  })

  it('passes an attribute the placer sets through to the button', () => {
    const wrapper = mount(IconButton, {
      props: { name: 'trash' },
      attrs: { disabled: true, title: 'Clear the sample', 'aria-label': 'Clear' }
    })

    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button').attributes('title')).toBe('Clear the sample')
    expect(wrapper.find('button').attributes('aria-label')).toBe('Clear')
  })

  it('reports a click', async () => {
    const wrapper = mountIcon('trash')

    await wrapper.find('button').trigger('click')

    expect(wrapper.emitted('click')).toHaveLength(1)
  })
})
