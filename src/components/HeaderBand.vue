<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { usePatchSync } from '@/composables/usePatchSync'
import { headParameterRows } from '@/models/granular.model'
import BandDivider from '@/components/BandDivider.vue'
import HeadPowerButton from '@/components/HeadPowerButton.vue'
import ParameterField from '@/components/ParameterField.vue'

const store = useGranularStore()
const { selectedHead } = storeToRefs(store)
const patchSync = usePatchSync()

const rows = computed(() => headParameterRows(selectedHead.value, 'output'))
</script>

<template>
  <div class="header">
    <div class="scope">
      <HeadPowerButton />
      <span class="name">Head {{ selectedHead + 1 }}</span>
    </div>

    <BandDivider />

    <div class="fields">
      <ParameterField
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
  </div>
</template>

<style lang="scss" scoped>
/**
 * A bar read left to right rather than a band of stacked groups: what it holds belongs to the
 * head as a whole - whether it sounds, which one it is, and what comes out of it - so it stays in
 * view above the bands that say how that head reads the buffer.
 */
.header {
  display: flex;
  align-items: center;
  gap: var(--space-7);
  padding: var(--band-inset);
  background: var(--bg-panel);
}

/// The switch and the head it switches travel as one thing on the left edge, at a control's
/// distance from each other rather than the wide gap that parts the bar into its parts.
.scope {
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--space-5);
}

/// Names what the bar is editing rather than being a value in it, so it stays unaccented - only
/// stronger than the field labels beside it.
.name {
  font-size: var(--text-label);
  letter-spacing: 0.02em;
  color: var(--text);
  white-space: nowrap;
}

.fields {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-4) var(--space-7);
}

/// The band pays back its own inset, so the rule reaches the grooves above and below it.
.band-divider {
  margin-block: calc(-1 * var(--band-inset));
}
</style>
