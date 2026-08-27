<script setup lang="ts">
import { computed } from 'vue'
import type { ParameterDefinition } from '@/models/granular.model'

const { definition, modelValue } = defineProps<{
  definition: ParameterDefinition
  modelValue: number
}>()

const emit = defineEmits<{
  'update:modelValue': [number]
  gestureStart: []
  gestureEnd: []
}>()

/// A switch is never scattered, so the spread bindings the group hands every row reach it as
/// attributes with nowhere to go. Its root is a `display: contents` wrapper, and hanging dead
/// attributes on that is how a grid cell acquires a listener for an event nothing emits.
defineOptions({ inheritAttrs: false })

const isOn = computed(() => modelValue >= 0.5)

function toggle() {
  emit('gestureStart')
  emit('update:modelValue', isOn.value ? 0 : 1)
  emit('gestureEnd')
}
</script>

<template>
  <div class="parameter">
    <span class="label">{{ definition.label }}</span>

    <button
      type="button"
      role="switch"
      class="readout"
      :class="{ on: isOn }"
      :aria-checked="isOn"
      :aria-label="definition.label"
      @click="toggle"
    >
      {{ isOn ? 'On' : 'Off' }}
    </button>

    <!--
      A switch has nothing to say in the track's column or in the spread's, but the grid has to be
      told so: without them the next row's name would flow into the space and the whole group
      would step sideways.
    -->
    <span class="empty" aria-hidden="true" />
    <span class="empty" aria-hidden="true" />
  </div>
</template>

<style lang="scss" scoped>
/// Four cells of the group's grid, like every other row, so a switch lines up with the readings
/// above and below it rather than sitting in a shape of its own.
.parameter {
  display: contents;
}

.label {
  font-size: var(--text-label);
  color: var(--text-dim);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/**
 * The same box a reading sits in, because On and Off are this parameter's whole range: a switch
 * dressed as a different kind of control would say the row was a different kind of row.
 */
.readout {
  width: 100%;
  height: var(--control-height);
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--radius);
  background: var(--bg-control);
  overflow: hidden;
  font-size: var(--text-label);
  line-height: var(--control-height);
  text-align: center;
  color: var(--text-faint);
  white-space: nowrap;
  user-select: none;
  cursor: pointer;
  transition:
    background var(--dur-control),
    color var(--dur-control);
}

.readout:hover {
  background: var(--bg-control-hover);
}

/// Off is a reading held back rather than a different colour of reading, so a switch sits in the
/// column at the same weight as the numbers above and below it.
.readout.on {
  color: var(--text);
}
</style>
