<script setup lang="ts">
import { useGranularStore } from '@/stores/granular'
import { usePatchSync } from '@/composables/usePatchSync'
import type { ParameterRow } from '@/models/granular.model'
import ParameterControl from '@/components/ParameterControl.vue'
import ToggleControl from '@/components/ToggleControl.vue'

const { rows, label } = defineProps<{
  rows: ParameterRow[]
  label: string
}>()

const store = useGranularStore()
const patchSync = usePatchSync()
</script>

<template>
  <section class="group">
    <h2>{{ label }}</h2>

    <!--
      One loop rather than one per kind, so the rows stand in the order the parameter set names
      them: Free Run is a switch between two values in Engine, and drawing the switches first
      would move it to the head of its own group.
    -->
    <div class="controls">
      <component
        :is="row.definition.toggle ? ToggleControl : ParameterControl"
        v-for="row in rows"
        :key="row.definition.endpoint"
        :definition="row.definition"
        :model-value="store.parameterValue(row.definition.endpoint)"
        :secondary="row.secondary"
        :secondary-value="row.secondary && store.parameterValue(row.secondary.endpoint)"
        @update:model-value="patchSync.sendParameter(row.definition.endpoint, $event)"
        @gesture-start="patchSync.beginGesture(row.definition.endpoint)"
        @gesture-end="patchSync.endGesture(row.definition.endpoint)"
        @update:secondary-value="patchSync.sendParameter(row.secondary!.endpoint, $event)"
        @secondary-gesture-start="patchSync.beginGesture(row.secondary!.endpoint)"
        @secondary-gesture-end="patchSync.endGesture(row.secondary!.endpoint)"
      />
    </div>
  </section>
</template>

<style lang="scss" scoped>
/**
 * No surface of its own: the band it sits in carries one, and the rules beside it say where it
 * ends. A box here would be a third way of saying the same thing.
 *
 * An equal share of the band whatever it holds, because a stack of rows spends what it holds on
 * height: sized by count, a group of two would be given a track a third the length of a group of
 * six, and the same gesture would mean a different amount in each.
 */
.group {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/// Names the group rather than being a value in it, so it stays the quietest thing in the band.
h2 {
  font-size: var(--text-micro);
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-faint);
}

/**
 * One grid for the whole group rather than a row each: the name column is as wide as the longest
 * name in this group and no wider, and every reading in the group sits in a well of one width.
 * Rows are `display: contents` so their four cells land in it.
 */
.controls {
  display: grid;
  grid-template-columns:
    max-content var(--readout-width) minmax(0, var(--track-width))
    var(--spread-width);
  align-items: center;
  column-gap: var(--space-5);
  row-gap: var(--space-3);
}
</style>
