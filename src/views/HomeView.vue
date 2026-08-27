<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import {
  globalParameterRows,
  headParameterRows,
  parameterBands,
  type ParameterGroup
} from '@/models/granular.model'
import BandDivider from '@/components/BandDivider.vue'
import TimelineRuler from '@/components/TimelineRuler.vue'
import HeaderBand from '@/components/HeaderBand.vue'
import WaveformDisplay from '@/components/WaveformDisplay.vue'
import ParameterGroupComponent from '@/components/ParameterGroup.vue'

const { selectedHead } = storeToRefs(useGranularStore())

function rowsFor(group: ParameterGroup) {
  return group.isGlobal
    ? globalParameterRows(group.id)
    : headParameterRows(selectedHead.value, group.id)
}

/// Names the head in the heading, so a band of knobs can never be read as belonging to the wrong
/// one when the selection has moved and the knobs have not visibly changed.
function labelFor(group: ParameterGroup) {
  return group.isGlobal ? group.label : `${group.label} · H${selectedHead.value + 1}`
}
</script>

<template>
  <div class="view">
    <HeaderBand />

    <WaveformDisplay />

    <TimelineRuler />

    <div v-for="(band, bandIndex) in parameterBands" :key="bandIndex" class="band">
      <template v-for="(group, index) in band" :key="group.id">
        <BandDivider v-if="index > 0" />

        <ParameterGroupComponent :rows="rowsFor(group)" :label="labelFor(group)" />
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/**
 * Bands stacked edge to edge and parted by a hairline groove, with no gap and no radius between
 * them: the only two things in the window that carry a surface of their own are the header and
 * the footer, and the only rounded things are controls. Every band supplies its own inset,
 * because only it knows what it holds - the ruler supplies none across, so its ticks stand on the
 * same edges as the waveform they measure.
 */
.view {
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--bg-app);
}

.view > * + * {
  border-top: 1px solid var(--seam);
}

/// Read left to right, its groups sized by what they hold and parted by rules rather than boxed.
.band {
  display: flex;
  align-items: stretch;
  gap: var(--space-7);
  padding: var(--band-inset);
}

/// The band pays back its own inset, so the rule reaches the grooves above and below it.
.band-divider {
  margin-block: calc(-1 * var(--band-inset));
}
</style>
