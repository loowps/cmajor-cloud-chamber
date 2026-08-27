<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { engine, enableEndpointFor } from '@/models/granular.model'

const store = useGranularStore()
const { selectedHead } = storeToRefs(store)

const heads = Array.from({ length: engine.headCount }, (_, index) => index)

/// Read rather than written here: the switch itself is the power button in the header, so the
/// strip has one job and a click on it can never mean two things.
function isEnabled(head: number) {
  return store.parameterValue(enableEndpointFor(head)) >= 0.5
}
</script>

<template>
  <div class="heads">
    <span class="caption">Head</span>

    <button
      v-for="head in heads"
      :key="head"
      type="button"
      class="head"
      :class="{ selected: head === selectedHead, on: isEnabled(head) }"
      :aria-pressed="head === selectedHead"
      :title="`Head ${head + 1}${isEnabled(head) ? '' : ' (off)'}`"
      @click="store.selectHead(head)"
    >
      <span class="pip" />
      {{ head + 1 }}
    </button>
  </div>
</template>

<style lang="scss" scoped>
/**
 * A group inside the footer rather than a band of its own: it carries no inset and no surface,
 * because the bar it sits in supplies both. Which head is up governs almost everything above it,
 * so the strip stays in view at the foot of the window whatever the bands are showing.
 */
.heads {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.caption {
  margin-right: var(--space-2);
  font-size: var(--text-micro);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.head {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--control-inset);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text-soft);
  font-size: var(--text-label);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  cursor: pointer;
  transition:
    background var(--dur-control),
    color var(--dur-control),
    border-color var(--dur-control);
}

.head:hover {
  background: var(--bg-control-hover);
}

/**
 * Two things are being said at once and they must not be confused: the pip is whether the head
 * is sounding, the border is whether it is the one being edited. A head can be either without
 * the other.
 *
 * The number holds one weight through both, because it is the head's name and a name does not
 * change with what is being said about it. Held back for a silent head it read as a button that
 * could not be pressed - and every one of the eight can be, whether it sounds or not.
 */
.pip {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cap-idle);
  transition: background var(--dur-control);
}

.head.on .pip {
  background: var(--accent);
}

.head.selected {
  border-color: var(--accent);
  color: var(--text);
}
</style>
