<script setup lang="ts">
import { computed } from 'vue'
import { useGranularStore } from '@/stores/granular'
import { usePatchSync } from '@/composables/usePatchSync'

const endpoint = 'freeRunIn'

const store = useGranularStore()
const patchSync = usePatchSync()

const isOn = computed(() => store.parameterValue(endpoint) >= 0.5)

/// Says what the switch does rather than what it is called: nothing else in the bar would tell a
/// reader that the instrument sounds with no note held.
const description = computed(() =>
  isOn.value ? 'Free Run: sounding at the root note' : 'Free Run: silent until a note is played'
)

/// A switch is one gesture, so the host records it as an edit rather than as a value that arrived
/// on its own - the same bargain every drag in the window makes.
function toggle() {
  patchSync.beginGesture(endpoint)
  patchSync.sendParameter(endpoint, isOn.value ? 0 : 1)
  patchSync.endGesture(endpoint)
}
</script>

<template>
  <button
    type="button"
    class="free-run"
    role="switch"
    :class="{ on: isOn }"
    :aria-checked="isOn"
    :aria-label="description"
    :title="description"
    @click="toggle"
  >
    <span class="pip" />
    Free Run
  </button>
</template>

<style lang="scss" scoped>
/**
 * The head strip's own button, because it stands beside it: the pip carries whether something is
 * sounding, exactly as it does for a head, and the shape says the two belong to the same strip of
 * switches rather than to two kinds of control that happen to share an edge.
 *
 * It has no selected state - there is one Free Run and it is never the thing being edited - so
 * the border stays transparent and the pip is all it says.
 *
 * The name holds one weight whichever way the switch is thrown. A head reads back at its own
 * weight because the strip is eight of them at once and the dim ones are the ones not sounding;
 * this is one switch standing on its own, and a name held back with nothing beside it to be held
 * back from reads as a control that cannot be pressed.
 */
.free-run {
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--control-inset);
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text-soft);
  font-size: var(--text-label);
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background var(--dur-control),
    color var(--dur-control);
}

.free-run:hover {
  background: var(--bg-control-hover);
}

.free-run.on {
  color: var(--text);
}

.free-run.on .pip {
  background: var(--accent);
}

.pip {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--cap-idle);
  transition: background var(--dur-control);
}
</style>
