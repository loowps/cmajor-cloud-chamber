<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'

const { activeGrains } = storeToRefs(useGranularStore())
</script>

<template>
  <div class="reading">
    <span class="label">Grains</span>
    <span class="value">{{ activeGrains }}</span>
  </div>
</template>

<style lang="scss" scoped>
/**
 * How much of the one pool is alive, which is the only thing in the window that says the cloud has
 * stopped thickening: past the ceiling a grain can only start by stealing one, so Density carries
 * on turning and nothing more is heard. Nothing else here reports it - the waveform draws a sample
 * of the cloud, not a count of it.
 */
.reading {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
}

.label {
  font-size: var(--text-micro);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.value {
  min-width: 2rem;
  font-size: var(--text-label);
  font-variant-numeric: tabular-nums;
  color: var(--text-soft);
}
</style>
