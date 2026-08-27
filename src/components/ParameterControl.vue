<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { valueToNormalised, type ParameterDefinition } from '@/models/granular.model'
import { useParameterTrack } from '@/composables/useParameterTrack'
import ParameterReadout from '@/components/ParameterReadout.vue'

const {
  definition,
  modelValue,
  secondary,
  secondaryValue = 0
} = defineProps<{
  definition: ParameterDefinition
  modelValue: number
  /// The spread of this value, drawn on the same row where the parameter set names one.
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

const readout = useTemplateRef<InstanceType<typeof ParameterReadout>>('readout')

const { isDragging, normalised, trackAttributes, onPointerDown, onDoubleClick, onWheel, nudge } =
  useParameterTrack(
    () => definition,
    () => modelValue,
    {
      begin: () => emit('gestureStart'),
      change: (next) => emit('update:modelValue', next),
      end: () => emit('gestureEnd')
    }
  )

/// A bipolar value reads as a deflection from the middle; everything else as a level from zero.
const origin = computed(() =>
  definition.bipolar ? valueToNormalised(definition, (definition.min + definition.max) / 2) : 0
)

/// A span between the origin and the value rather than a width from the left, so a negative Pan
/// reaches left out of the middle instead of being drawn from the wrong end.
const fill = computed(() => {
  const from = Math.min(origin.value, normalised.value)
  const to = Math.max(origin.value, normalised.value)

  return { left: `${from * 100}%`, width: `${(to - from) * 100}%` }
})

const thumbOffset = computed(() => `${normalised.value * 100}%`)
</script>

<template>
  <div class="parameter">
    <span class="label">{{ definition.label }}</span>

    <ParameterReadout
      ref="readout"
      :definition="definition"
      :model-value="modelValue"
      :worked="isDragging"
      @update:model-value="emit('update:modelValue', $event)"
      @gesture-start="emit('gestureStart')"
      @gesture-end="emit('gestureEnd')"
    />

    <div
      v-bind="trackAttributes"
      class="track"
      :class="{ dragging: isDragging }"
      @pointerdown="onPointerDown"
      @dblclick="onDoubleClick"
      @wheel="onWheel"
      @keydown.up.prevent="nudge(1)"
      @keydown.right.prevent="nudge(1)"
      @keydown.down.prevent="nudge(-1)"
      @keydown.left.prevent="nudge(-1)"
      @keydown.enter.prevent="readout?.beginEditing()"
    >
      <div class="fill" :class="{ dragging: isDragging }" :style="fill" />
      <div class="thumb" :class="{ dragging: isDragging }" :style="{ left: thumbOffset }" />
    </div>

    <!--
      Always occupied, even where the parameter set names no spread: a row that left the cell out
      would let the next row's name flow into it and step the whole group sideways.
    -->
    <span class="spread-cell">
      <ParameterReadout
        v-if="secondary"
        spread
        :definition="secondary"
        :model-value="secondaryValue"
        @update:model-value="emit('update:secondaryValue', $event)"
        @gesture-start="emit('secondaryGestureStart')"
        @gesture-end="emit('secondaryGestureEnd')"
      />
    </span>
  </div>
</template>

<style lang="scss" scoped>
/**
 * No box of its own: the row is four cells of the group's grid, so every name, every reading, every
 * track and every spread in a group stands on the same four edges however long the names beside
 * them run.
 */
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
 * The whole cell takes the gesture rather than the four pixels the value rides in, so a press
 * anywhere along the row is answered; the groove is drawn behind, where it cannot swallow one.
 */
.track {
  position: relative;
  height: var(--control-height);
  cursor: grab;
  touch-action: none;
}

.track.dragging {
  cursor: grabbing;
}

.track::before {
  content: '';
  position: absolute;
  inset-inline: 0;
  top: calc(50% - 2px);
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--range-track);
}

.fill {
  position: absolute;
  top: calc(50% - 2px);
  height: 4px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  transition: background var(--dur-control);
}

/// Sits on the value rather than beside it, so the point the fill reaches and the point the
/// pointer is aimed at are the same point at both ends of the travel.
.thumb {
  position: absolute;
  top: calc(50% - 5px);
  width: 10px;
  height: 10px;
  margin-left: -5px;
  border-radius: 50%;
  background: var(--accent);
  transition: box-shadow var(--dur-control);
}

.track:hover .thumb {
  box-shadow: 0 0 0 4px var(--accent-glow);
}

.fill.dragging,
.thumb.dragging {
  background: var(--accent-bright);
}

.thumb.dragging {
  box-shadow: 0 0 0 6px var(--accent-glow);
}

/// A cell rather than a control: it holds the spread where there is one and holds the column open
/// where there is not.
.spread-cell {
  display: block;
  min-width: 0;
}
</style>
