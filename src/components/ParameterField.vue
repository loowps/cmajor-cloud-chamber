<script setup lang="ts">
import type { ParameterDefinition } from '@/models/granular.model'
import ParameterReadout from '@/components/ParameterReadout.vue'

defineProps<{
  definition: ParameterDefinition
  modelValue: number
  /// The spread of this value, set beside it where the parameter set names one.
  secondary?: ParameterDefinition
  secondaryValue?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [number]
  gestureStart: []
  gestureEnd: []
  'update:secondaryValue': [number]
  secondaryGestureStart: []
  secondaryGestureEnd: []
}>()
</script>

<template>
  <div class="field">
    <span class="label">{{ definition.label }}</span>

    <ParameterReadout
      sole-control
      :definition="definition"
      :model-value="modelValue"
      @update:model-value="emit('update:modelValue', $event)"
      @gesture-start="emit('gestureStart')"
      @gesture-end="emit('gestureEnd')"
    />

    <ParameterReadout
      v-if="secondary"
      spread
      :definition="secondary"
      :model-value="secondaryValue ?? 0"
      @update:model-value="emit('update:secondaryValue', $event)"
      @gesture-start="emit('secondaryGestureStart')"
      @gesture-end="emit('secondaryGestureEnd')"
    />
  </div>
</template>

<style lang="scss" scoped>
/**
 * The same parts as a row in a band, laid along the bar instead of down a column, and without the
 * track: a bar read left to right has no column for a name to line up in, so nothing is gained by
 * holding a cell open where a parameter has no spread. The box is dragged and typed into exactly
 * as it is in a band, which is what makes the missing track cost nothing.
 */
.field {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.label {
  font-size: var(--text-label);
  color: var(--text-dim);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
</style>
