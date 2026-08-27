<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { formatClock } from '@/models/sample.model'

const { sample, hasSample, engineHasSample, engineSeconds } = storeToRefs(useGranularStore())

const trackElement = useTemplateRef<HTMLDivElement>('track')
const trackWidth = ref(0)

let observer: ResizeObserver | undefined

onMounted(() => {
  observer = new ResizeObserver(() => {
    trackWidth.value = trackElement.value?.clientWidth ?? 0
  })

  if (trackElement.value) {
    observer.observe(trackElement.value)
  }
})

onBeforeUnmount(() => observer?.disconnect())

/**
 * The same span the waveform above is drawing, taken from the same two places for the same reason
 * - between a window opening and its decode finishing, the patch is holding a sample the editor
 * cannot draw, and a ruler measuring nothing under a waveform that is playing would be a lie.
 */
const durationSeconds = computed(() => {
  if (hasSample.value) {
    return sample.value?.durationSeconds ?? 0
  }

  return engineHasSample.value ? engineSeconds.value : 0
})

/**
 * Round intervals rather than an equal division of whatever the sample happens to be: eight
 * divisions of a 4:58 file marks it every 37 seconds, and a tick at 1:51 is a number nobody can
 * count in. The ladder is what a clock divides into, so whichever step is taken the labels are
 * still times a listener already thinks in.
 */
const tickLadder = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800]

/// Room for `10:00` and the space beside it, so a step is only taken if its labels can be read.
const minimumTickSpacing = 76

const stepSeconds = computed(() => {
  const wanted = (minimumTickSpacing / Math.max(trackWidth.value, 1)) * durationSeconds.value

  return tickLadder.find((step) => step >= wanted) ?? tickLadder[tickLadder.length - 1]
})

/// Dropped rather than clipped, and measured in pixels because that is what a label runs out of:
/// the last tick of a long sample almost never lands on the end, and a time cut in half by the
/// right edge is worse than a tick that goes unlabelled.
const labelWidth = 34

const ticks = computed(() => {
  const span = durationSeconds.value

  if (span <= 0 || trackWidth.value < 1) {
    return []
  }

  const step = stepSeconds.value
  const marks = []

  for (let seconds = 0; seconds <= span; seconds += step) {
    /**
     * A sample whose length is a whole number of steps puts its last tick on the span's end,
     * which is one pixel past the last pixel the track has - drawn there it falls outside the
     * frame it is measuring. Held back to the final column instead, where it is still the mark
     * for the end.
     */
    const left = Math.min((seconds / span) * trackWidth.value, trackWidth.value - 1)

    marks.push({
      seconds,
      left,
      label: left + labelWidth <= trackWidth.value ? formatClock(seconds) : ''
    })
  }

  return marks
})
</script>

<template>
  <div class="ruler">
    <div ref="track" class="track">
      <div
        v-for="tick in ticks"
        :key="tick.seconds"
        class="tick"
        :style="{ left: `${tick.left}px` }"
      >
        <span v-if="tick.label">{{ tick.label }}</span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
/**
 * A band the width of the waveform above it and nothing else, so a tick stands under the frame it
 * measures. It keeps its height whether or not there is a sample: the strip appearing on load
 * would shift every control below it down by its own height at the moment the eye is on the
 * waveform.
 */
.ruler {
  padding: var(--space-2) 0 var(--space-3);
  background: var(--bg-app);
}

.track {
  position: relative;
  height: 13px;
}

/**
 * The tick is the mark and the time is set beside it rather than under it, so the label belongs
 * to the edge on its left and cannot be read as belonging to the space it happens to sit over.
 */
.tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}

span {
  position: absolute;
  left: var(--space-2);
  top: -1px;
  font-size: var(--text-micro);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  color: var(--text-faint);
  white-space: nowrap;
}
</style>
