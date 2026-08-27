<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef } from 'vue'
import {
  formatParameter,
  normalisedToValue,
  parameterEditText,
  parameterReadout,
  parseParameter,
  valueToNormalised,
  type ParameterDefinition
} from '@/models/granular.model'
import { fineAdjustmentDivisor, useParameterDrag } from '@/composables/useParameterDrag'

const {
  definition,
  modelValue,
  spread = false,
  soleControl = false,
  worked = false
} = defineProps<{
  definition: ParameterDefinition
  modelValue: number
  /**
   * The spread of the value beside it rather than a value of its own: prefixed with a `±`, and
   * set on the band instead of in a well, because two wells side by side on one row would read as
   * two parameters when there is only one.
   */
  spread?: boolean
  /**
   * Nothing else in the window works this parameter, so the box is its slider and its tab stop.
   * A spread is always one of these; a value is only where it has no track beside it.
   */
  soleControl?: boolean
  /// Its parameter is being dragged by something else - the track - so it rings with the gesture.
  worked?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [number]
  gestureStart: []
  gestureEnd: []
}>()

/**
 * The box has no length of its own to sweep, so its drag is vertical and this is the travel it is
 * given: a full range in one comfortable pull, which is what the dial it replaced asked for.
 */
const dragTravel = 190

/// One percent of the range, which is what a wheel notch and an arrow key are both worth.
const nudgeStep = 0.01

const isEditing = ref(false)
const draft = ref('')
const box = useTemplateRef<HTMLButtonElement>('box')
const editor = useTemplateRef<HTMLInputElement>('editor')

const { isDragging, start } = useParameterDrag({
  begin: () => emit('gestureStart'),
  change: (next) => emit('update:modelValue', next),
  end: () => emit('gestureEnd')
})

const readout = computed(() => parameterReadout(definition, modelValue))

const valueText = computed(() => formatParameter(definition, modelValue))

/**
 * A box that is the only control for its parameter is the slider and the tab stop for it. A value
 * with a track beside it is neither: the track is already both, and a second slider on the row
 * saying the same numbers would be one more for a reader to wade through rather than one to use.
 *
 * Either way it carries a name, because a spread folded onto another parameter's row has given up
 * its label and `± 40.0 %` beside Pan could as easily be read as something Pan itself is doing.
 */
const boxAttributes = computed(() =>
  spread || soleControl
    ? {
        role: 'slider',
        tabindex: 0,
        'aria-label': definition.label,
        'aria-valuemin': definition.min,
        'aria-valuemax': definition.max,
        'aria-valuenow': modelValue,
        'aria-valuetext': valueText.value
      }
    : { tabindex: -1, 'aria-label': `Set ${definition.label}` }
)

function onPointerDown(event: PointerEvent) {
  start(event, definition, modelValue, 'y', dragTravel)
}

/// A typed value is as much one gesture as a drag is, so the host records it as an edit rather
/// than as a value that arrived on its own.
function commitAsGesture(next: number) {
  emit('gestureStart')
  emit('update:modelValue', next)
  emit('gestureEnd')
}

/// Shift shortens the step exactly as it slows the drag, so the key means one thing whichever
/// way the parameter is being worked.
function nudge(steps: number, fine = false) {
  const step = fine ? nudgeStep / fineAdjustmentDivisor : nudgeStep

  commitAsGesture(
    normalisedToValue(definition, valueToNormalised(definition, modelValue) + steps * step)
  )
}

/// Opens on the bare number rather than on the reading, so no unit has to be typed around.
async function beginEditing() {
  draft.value = parameterEditText(definition, modelValue)
  isEditing.value = true

  await nextTick()
  editor.value?.select()
}

/**
 * Enter and Escape end the edit while the field still holds focus, so the box takes it back
 * rather than dropping a keyboard user out of the parameter. A blur has already moved focus on to
 * whatever was clicked, which is what tells the two apart.
 */
async function closeEditor() {
  const hadFocus = editor.value === document.activeElement

  isEditing.value = false

  if (hadFocus) {
    await nextTick()
    box.value?.focus()
  }
}

/// The blur that follows Enter and Escape has to find the edit already settled rather than commit
/// the draft a second time.
function commitEdit() {
  if (!isEditing.value) {
    return
  }

  const typed = parseParameter(definition, draft.value)

  closeEditor()

  if (typed !== undefined) {
    commitAsGesture(typed)
  }
}

defineExpose({ beginEditing })
</script>

<template>
  <!--
    size="1" because a text field's default width is twenty characters, and the column is sized by
    what its children ask for: left at the default, opening the field would widen every row in the
    group and shove its track along.
  -->
  <input
    v-if="isEditing"
    ref="editor"
    v-model="draft"
    class="readout field"
    :class="{ spread }"
    type="text"
    inputmode="decimal"
    size="1"
    :aria-label="definition.label"
    @keydown.enter.prevent="commitEdit"
    @keydown.esc.prevent="closeEditor"
    @blur="commitEdit"
  />

  <!--
    Double click rather than single, because the box is dragged as well: on a single one, a press
    that happened not to move would open a text field under the pointer mid-gesture.
  -->
  <button
    v-else
    ref="box"
    v-bind="boxAttributes"
    type="button"
    class="readout"
    :class="{ spread, ringed: isDragging || worked }"
    :title="`${definition.label} — drag to change, double click to type`"
    @pointerdown="onPointerDown"
    @dblclick="beginEditing"
    @keydown.up.prevent="nudge(1, $event.shiftKey)"
    @keydown.right.prevent="nudge(1, $event.shiftKey)"
    @keydown.down.prevent="nudge(-1, $event.shiftKey)"
    @keydown.left.prevent="nudge(-1, $event.shiftKey)"
    @keydown.enter.prevent="beginEditing"
  >
    <span v-if="spread" class="sign">±</span>
    <span>{{ readout.value }}</span>
    <span v-if="readout.unit" class="unit">{{ readout.unit }}</span>
  </button>
</template>

<style lang="scss" scoped>
/**
 * One line box as tall as the well, rather than a flex row: laid out inline, the number and its
 * smaller unit sit on a shared baseline for free, and a line box given the well's own height is
 * centred in it by construction.
 */
/// Sized from the same tokens the group's grid columns are sized from, rather than filling
/// whatever holds it: the header stands its fields in a flex row, and a box that took its width
/// from its container would be a different size there than in a band.
.readout {
  display: block;
  flex: none;
  width: var(--readout-width);
  height: var(--control-height);
  padding: 0 var(--space-2);
  border: none;
  border-radius: var(--radius);
  background: var(--bg-control);
  overflow: hidden;
  font-size: var(--text-label);
  line-height: var(--control-height);
  font-variant-numeric: tabular-nums;
  text-align: center;
  color: var(--text);
  white-space: nowrap;
  cursor: ns-resize;
  touch-action: none;
  transition:
    background var(--dur-control),
    color var(--dur-control);
}

button.readout:hover {
  background: var(--bg-control-hover);
}

/// Brass on the ring alone, so it is free to mean "this is the one being worked" - and an inset
/// ring costs the row no width, so nothing moves when a gesture starts.
.readout.ringed,
.field {
  box-shadow: inset 0 0 0 1px var(--accent);
}

/**
 * No well and no fill: it is an annotation on the value to its left, set on the band the way a
 * caption is. With no background to light, the pointer is answered in the ink instead - and the
 * ring has nothing to sit on, so being worked is said the same way.
 */
.readout.spread {
  width: var(--spread-width);
  background: none;
  box-shadow: none;
  text-align: left;
  color: var(--text-dim);
}

button.readout.spread:hover,
.readout.spread.ringed {
  background: none;
  color: var(--accent);
}

/// Says what the number is without spending a word on it, and stays behind the number it qualifies.
.sign {
  margin-right: var(--space-2);
  color: var(--text-faint);
}

/// A caption on the value rather than part of it, so the eye lands on the number.
.unit {
  margin-left: var(--space-1);
  font-size: var(--text-small);
  color: var(--text-faint);
}

.field {
  outline: none;
  cursor: text;
  user-select: text;
}

/// Opened in place, so the field stands exactly where the annotation it replaces stood.
.field.spread {
  background: none;
  box-shadow: none;
  text-align: left;
  color: var(--accent);
}
</style>
