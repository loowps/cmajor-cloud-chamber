<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { usePatchSync } from '@/composables/usePatchSync'
import { definitionFor, valueToNormalised, type ParameterDefinition } from '@/models/granular.model'
import { useParameterTrack } from '@/composables/useParameterTrack'
import ParameterReadout from '@/components/ParameterReadout.vue'

const endpoint = 'gainIn'
const definition = definitionFor(endpoint) as ParameterDefinition

const store = useGranularStore()
const patchSync = usePatchSync()
const { outputLevelLeft, outputLevelRight } = storeToRefs(store)

const gain = computed(() => store.parameterValue(endpoint))

function send(next: number) {
  patchSync.sendParameter(endpoint, next)
}

const { isDragging, normalised, trackAttributes, onPointerDown, onDoubleClick, onWheel, nudge } =
  useParameterTrack(
    () => definition,
    () => gain.value,
    {
      begin: () => patchSync.beginGesture(endpoint),
      change: send,
      end: () => patchSync.endGesture(endpoint)
    }
  )

/**
 * The meter is laid on the fader's own ruler rather than on a scale of its own. Both are decibels,
 * so on one axis the cap and the tip of the meter are the same kind of number: what is left of the
 * track past the signal is headroom, and it can be read off instead of guessed at.
 *
 * The taper does the clamping, so anything under the fader's floor rests at nothing and anything
 * over its ceiling stops at the end of the well rather than running out of it.
 */
function meterFraction(level: number): number {
  return level > 0 ? valueToNormalised(definition, 20 * Math.log10(level)) : 0
}

/**
 * 0dBFS is the one fixed point on the scale and it is not the end of the track - the fader runs
 * another 12dB past it - so without the mark a full-looking meter would say nothing about whether
 * the signal had cleared unity.
 */
const unityFraction = valueToNormalised(definition, 0)
const unityOffset = `${unityFraction * 100}%`

const capOffset = computed(() => `${normalised.value * 100}%`)

/**
 * Only the part standing above the mark is painted, so the white is the overshoot itself rather
 * than a colour the whole reading takes on: how far past unity it went is the thing worth seeing,
 * and repainting the lane from the floor up would throw that away to say something the mark
 * already says.
 */
function laneFor(level: number) {
  const fraction = meterFraction(level)

  return {
    fill: `${fraction * 100}%`,
    clip: `${Math.max(0, fraction - unityFraction) * 100}%`,
    isOver: level > 1
  }
}

/// Two lanes rather than one, because a head can be panned outright and Pan Spread scatters the
/// cloud across the image: a single bar would report the louder side and say nothing about the
/// other one falling silent.
const lanes = computed(() => [
  { name: 'Left', ...laneFor(outputLevelLeft.value) },
  { name: 'Right', ...laneFor(outputLevelRight.value) }
])
</script>

<template>
  <div class="output">
    <span class="label">Output</span>

    <ParameterReadout
      :definition="definition"
      :model-value="gain"
      :worked="isDragging"
      @update:model-value="send"
      @gesture-start="patchSync.beginGesture(endpoint)"
      @gesture-end="patchSync.endGesture(endpoint)"
    />

    <div
      v-bind="trackAttributes"
      class="track"
      :class="{ dragging: isDragging }"
      :style="{ '--unity': unityOffset }"
      @pointerdown="onPointerDown"
      @dblclick="onDoubleClick"
      @wheel="onWheel"
      @keydown.up.prevent="nudge(1)"
      @keydown.right.prevent="nudge(1)"
      @keydown.down.prevent="nudge(-1)"
      @keydown.left.prevent="nudge(-1)"
    >
      <div class="meter">
        <div v-for="lane in lanes" :key="lane.name" class="lane">
          <div class="fill" :style="{ width: lane.fill }" />
          <div v-if="lane.isOver" class="clip" :style="{ width: lane.clip }" />
        </div>
      </div>

      <div class="unity" />
      <div class="cap" :class="{ dragging: isDragging }" :style="{ left: capOffset }" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
/**
 * One control rather than a fader beside a meter: the gain and the level it produces are the same
 * quantity read at two moments, and standing them apart made the bar ask twice about one thing.
 */
.output {
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

/**
 * The band's own track width, not a share of the bar: a sweep here has to be worth what a sweep
 * in a band is worth, or the one parameter that lives in the frame would answer the same gesture
 * differently from every parameter that does not.
 */
.track {
  position: relative;
  flex: none;
  width: var(--track-width);
  height: var(--control-height);
  cursor: grab;
  touch-action: none;
}

.track.dragging {
  cursor: grabbing;
}

/**
 * The well the two lanes are sunk in. Deeper than a parameter row's groove because it holds a
 * reading rather than a setting, and sunk rather than tracked because the tone every other track
 * in the window rides in is a shade of the panel this one stands on - there it would be a groove
 * with no groove in it.
 *
 * The gap between the lanes is left open rather than drawn, so the hairline parting them is the
 * well showing through and no second colour is spent on saying there are two.
 */
.meter {
  position: absolute;
  inset-inline: 0;
  top: calc(50% - var(--meter-height) / 2);
  height: var(--meter-height);
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-radius: var(--radius-sm);
  background: var(--bg-sunken);
  overflow: hidden;
}

.lane {
  position: relative;
  flex: 1;
}

/**
 * Not brass. Every other track in the window fills in brass because there the fill is the value,
 * so brass here would be read as the fader's own - and it is not, it is what came out. It runs
 * from the loop region's blue up to a light grey at 0dBFS, so the reading brightens as it climbs
 * and the white above the mark is where that climb was already heading rather than a colour
 * arriving from nowhere. Blue under the brass cap is the pairing the palette was chosen for, so
 * the cap can stand anywhere along the ramp and still be picked out.
 *
 * The ramp reaches its top at 0dBFS rather than at the end of the track, so the colour is a
 * reading and not a decoration - and it is sized to the track rather than to the fill, or the
 * shade at a given decibel would slide about as the level moved and the scale would mean nothing.
 */
.fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  background-color: var(--text-dim);
  background-image: linear-gradient(
    90deg,
    var(--marker) 0%,
    var(--text-dim) var(--unity),
    var(--text-dim) 100%
  );
  background-size: var(--track-width) 100%;
  background-repeat: no-repeat;
  transition: width var(--dur-signal);
}

/**
 * Only what stands above the mark. Brass on this track is the cap, and a bar that took it would
 * swallow the cap at exactly the level worth looking at; the ink is the brightest thing the window
 * has and it is nowhere else a fill, so it can only mean this.
 */
.clip {
  position: absolute;
  left: var(--unity);
  top: 0;
  height: 100%;
  background: var(--text);
  transition: width var(--dur-signal);
}

/// Drawn over the lanes rather than under them, so the reference does not disappear at exactly the
/// level it is there to be read at - and across both, because there is one scale and not two.
.unity {
  position: absolute;
  left: var(--unity);
  top: calc(50% - var(--meter-height) / 2);
  width: 1px;
  height: var(--meter-height);
  background: var(--bg-sunken);
}

/**
 * Brass, and for the same reason every thumb in the window is: it is the value being set. A cap
 * across the well rather than a bead sitting on it, because it has a reading to stand over rather
 * than an empty track - which is also what tells it apart from the level underneath without
 * spending a second colour on the difference.
 */
.cap {
  position: absolute;
  top: calc(50% - (var(--meter-height) + var(--space-3)) / 2);
  width: 3px;
  height: calc(var(--meter-height) + var(--space-3));
  margin-left: -1.5px;
  border-radius: var(--radius-sm);
  background: var(--accent);
  transition:
    background var(--dur-control),
    box-shadow var(--dur-control);
}

.track:hover .cap {
  box-shadow: 0 0 0 4px var(--accent-glow);
}

.cap.dragging {
  background: var(--accent-bright);
  box-shadow: 0 0 0 6px var(--accent-glow);
}
</style>
