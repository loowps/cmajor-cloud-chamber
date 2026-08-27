<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { usePatchSync } from '@/composables/usePatchSync'
import { useWaveformPeaks } from '@/composables/useWaveformPeaks'
import { headEndpoint } from '@/models/granular.model'
import WaveformOverlay from '@/components/WaveformOverlay.vue'

const store = useGranularStore()
const { sample, grains, headPositions, selectedHead, hasSample, isDraggingFile } =
  storeToRefs(store)
const patchSync = usePatchSync()

const canvasElement = useTemplateRef<HTMLCanvasElement>('canvas')
const frameElement = useTemplateRef<HTMLDivElement>('frame')

const width = ref(1)
const height = ref(1)
const devicePixels = ref(1)

/// Hover rather than a CSS rule, because the controls it reveals live in a component of their own
/// and a scoped selector reaching into one is a rule that breaks the next time either moves.
const isHovered = ref(false)

/**
 * One column per device pixel, quantised: rebuilding the outline walks the whole sample, so a
 * resize drag must not order a fresh scan of thirty million frames for every pixel it passes.
 */
const peakColumnQuantum = 8

const peaks = useWaveformPeaks(
  sample,
  computed(
    () => Math.ceil((width.value * devicePixels.value) / peakColumnQuantum) * peakColumnQuantum
  )
)

/// Which line a drag is holding, so a grab does not switch bars mid-gesture.
type DragTarget = 'start' | 'end' | 'region' | 'position'

const dragTarget = ref<DragTarget>()

/// What a press would take if it landed where the pointer is, read only by the cursor: three of
/// the four are lines a pixel or two wide, and nothing else on the canvas says which is in reach.
const hoveredTarget = ref<DragTarget>()

let dragAnchor = 0
let dragStartValue = 0

let animationHandle = 0
let observer: ResizeObserver | undefined

/// Everything drawn as a region belongs to the head being edited - the other seven have regions
/// of their own, and drawing eight sets of markers would be unreadable.
const loopStartEndpoint = computed(() => headEndpoint(selectedHead.value, 'loopStart'))
const loopLengthEndpoint = computed(() => headEndpoint(selectedHead.value, 'loopLength'))
const positionEndpoint = computed(() => headEndpoint(selectedHead.value, 'position'))

const loopStart = computed(() => store.parameterValue(loopStartEndpoint.value))
const loopLength = computed(() => store.parameterValue(loopLengthEndpoint.value))
const loopEnd = computed(() => Math.min(1, loopStart.value + loopLength.value))
const spray = computed(() => store.parameterValue(headEndpoint(selectedHead.value, 'spray')))

/// Where the patch says the drawn head is, rather than where Position last put it - Motion has
/// carried it on since, and the line the pointer is aiming at is the reported one.
const headFraction = computed(() => headPositions.value[selectedHead.value] ?? 0)
const headIsDrawn = computed(() => isHeadAudible(selectedHead.value))

const cursorClass = computed(() => {
  const target = dragTarget.value ?? hoveredTarget.value

  if (!hasSample.value || !target) {
    return undefined
  }

  if (target === 'position') {
    return 'over-head'
  }

  if (target === 'region') {
    return dragTarget.value ? 'moving-region' : 'over-region'
  }

  return 'over-edge'
})

function cssVariable(name: string, fallback: string) {
  const element = frameElement.value

  if (!element) {
    return fallback
  }

  return getComputedStyle(element).getPropertyValue(name).trim() || fallback
}

function drawWaveform(context: CanvasRenderingContext2D, pixelWidth: number, pixelHeight: number) {
  const outline = peaks.value

  if (!outline) {
    return
  }

  const middle = pixelHeight / 2
  const scale = pixelHeight / 2 - 2
  const columnWidth = pixelWidth / outline.columns

  context.fillStyle = cssVariable('--wave-body', '#59616b')

  for (let column = 0; column < outline.columns; ++column) {
    const low = outline.bounds[column * 2]
    const high = outline.bounds[column * 2 + 1]
    const top = middle - high * scale
    const bottom = middle - low * scale

    context.fillRect(column * columnWidth, top, Math.max(1, columnWidth), Math.max(1, bottom - top))
  }

  context.fillStyle = cssVariable('--seam', '#15171b')
  context.fillRect(0, middle, pixelWidth, 1)
}

/// Everything outside the loop region is still drawn, just pushed back, so the region reads as a
/// window onto the sample rather than as the whole of it.
function shadeOutsideRegion(
  context: CanvasRenderingContext2D,
  pixelWidth: number,
  pixelHeight: number
) {
  const left = loopStart.value * pixelWidth
  const right = loopEnd.value * pixelWidth

  context.fillStyle = cssVariable('--wave-mask', 'rgba(23, 26, 30, 0.72)')
  context.fillRect(0, 0, left, pixelHeight)
  context.fillRect(right, 0, pixelWidth - right, pixelHeight)

  context.strokeStyle = cssVariable('--marker', '#6cb0ee')
  context.lineWidth = devicePixels.value

  for (const edge of [left, right]) {
    context.beginPath()
    context.moveTo(edge, 0)
    context.lineTo(edge, pixelHeight)
    context.stroke()
  }
}

/**
 * The head is the one thing on the waveform that has to be findable at a glance, so it is drawn
 * as a filled bar rather than a stroked hairline - a 1px line at the left edge of the canvas is
 * half clipped away, which leaves nothing to see at Position 0 but the grains sitting on it.
 *
 * All eight are drawn. The one being edited carries full brass and its spray band; the rest are
 * held back far enough to read as context rather than as seven competing playheads.
 */
const headWidthPixels = 2
const idleHeadAlpha = 0.3

function drawHeads(context: CanvasRenderingContext2D, pixelWidth: number, pixelHeight: number) {
  const width = headWidthPixels * devicePixels.value
  const brass = cssVariable('--accent-bright', '#ecbc62')

  headPositions.value.forEach((position, head) => {
    if (!isHeadAudible(head)) {
      return
    }

    const isSelected = head === selectedHead.value
    const x = position * pixelWidth

    if (isSelected) {
      const sprayWidth = spray.value * loopLength.value * pixelWidth

      if (sprayWidth > 1) {
        context.fillStyle = cssVariable('--accent-wash', 'rgba(217, 164, 65, 0.12)')
        context.fillRect(x - sprayWidth / 2, 0, sprayWidth, pixelHeight)
      }
    }

    context.globalAlpha = isSelected ? 1 : idleHeadAlpha
    context.fillStyle = brass
    context.fillRect(
      Math.min(Math.max(x - width / 2, 0), pixelWidth - width),
      0,
      width,
      pixelHeight
    )
  })

  context.globalAlpha = 1
}

function isHeadAudible(head: number) {
  return store.parameterValue(headEndpoint(head, 'enable')) >= 0.5
}

/**
 * A grain is a mark before it is a reading, so it is given a height that can be seen at any level
 * and the level itself is left to the alpha already carrying it. Scaled from nothing, a grain drew
 * as a hairline and read as part of the waveform's own centre seam.
 */
const grainThicknessPixels = 4
const grainLevelThicknessPixels = 5

/**
 * How much of the panel the cloud is scattered over on top of its pan, as a fraction of the height.
 *
 * Pan alone draws a mono cloud as one line - with no Pan Spread every grain carries the same pan,
 * so fifty of them land at the same height and stack into a bar. The scatter is the editor's
 * doing rather than anything the patch reported, so it is kept to a fraction of pan's own travel:
 * enough that a cloud reads as a cloud however narrow it is, never enough to be read as pan.
 */
const grainScatterHeight = 0.07

/**
 * A grain is drawn where it was taken from and how long it is, laid out down the panel by its
 * pan so a wide cloud looks wide. It fades over its own lifetime rather than the grain's, which
 * is the only honest thing the editor can do: the patch reports a spawn, never an ending.
 */
function drawGrains(context: CanvasRenderingContext2D, pixelWidth: number, pixelHeight: number) {
  const now = performance.now()
  const loaded = sample.value

  if (!loaded) {
    return
  }

  const secondsPerPixel = loaded.durationSeconds / pixelWidth
  const grainColour = cssVariable('--grain', '#ecbc62')

  for (const grain of grains.value) {
    const age = (now - grain.bornAt) / store.grainLifetimeMs

    if (age >= 1) {
      continue
    }

    const x = grain.position * pixelWidth
    const spanPixels = Math.max(devicePixels.value, grain.lengthSeconds / secondsPerPixel)
    const scatter = (grain.seed - 0.5) * grainScatterHeight
    const y = pixelHeight * (0.5 + grain.pan * 0.42 + scatter)
    const thickness =
      devicePixels.value * (grainThicknessPixels + grain.level * grainLevelThicknessPixels)
    const fromSelected = grain.head === selectedHead.value

    context.globalAlpha =
      (1 - age) * (0.25 + grain.level * 0.6) * (fromSelected ? 1 : idleHeadAlpha)
    context.fillStyle = grainColour
    context.fillRect(grain.rate < 0 ? x - spanPixels : x, y - thickness / 2, spanPixels, thickness)
  }

  context.globalAlpha = 1
}

function render() {
  animationHandle = requestAnimationFrame(render)

  const canvas = canvasElement.value
  const context = canvas?.getContext('2d')

  if (!canvas || !context) {
    return
  }

  const pixelWidth = canvas.width
  const pixelHeight = canvas.height

  store.expireGrains(performance.now())

  context.clearRect(0, 0, pixelWidth, pixelHeight)

  if (!hasSample.value) {
    return
  }

  drawWaveform(context, pixelWidth, pixelHeight)
  shadeOutsideRegion(context, pixelWidth, pixelHeight)
  drawGrains(context, pixelWidth, pixelHeight)
  drawHeads(context, pixelWidth, pixelHeight)
}

function resizeCanvas() {
  const frame = frameElement.value
  const canvas = canvasElement.value

  if (!frame || !canvas) {
    return
  }

  devicePixels.value = window.devicePixelRatio || 1
  width.value = frame.clientWidth
  height.value = frame.clientHeight

  canvas.width = Math.max(1, Math.floor(width.value * devicePixels.value))
  canvas.height = Math.max(1, Math.floor(height.value * devicePixels.value))
}

function fractionAt(event: PointerEvent) {
  const frame = frameElement.value

  if (!frame) {
    return 0
  }

  const bounds = frame.getBoundingClientRect()

  return Math.min(Math.max((event.clientX - bounds.left) / bounds.width, 0), 1)
}

/// Within this much of an edge, a press takes the edge rather than the region it belongs to.
const edgeGrabFraction = 0.012

function targetAt(fraction: number): DragTarget {
  if (isHeadGrabbable(fraction)) {
    return 'position'
  }

  if (Math.abs(fraction - loopStart.value) < edgeGrabFraction) {
    return 'start'
  }

  if (Math.abs(fraction - loopEnd.value) < edgeGrabFraction) {
    return 'end'
  }

  return 'region'
}

/**
 * The head rests on the loop start whenever Position is 0, so sharing a pixel with an edge is the
 * head's resting state rather than a corner of it. Inside the region the head takes the press and
 * outside it the edge does, which leaves both in reach without either having to be moved first.
 *
 * A head that is not drawn is not grabbed: a silenced head has no line on the canvas, and a press
 * that quietly moved one would be a gesture with nothing to show for it.
 */
function isHeadGrabbable(fraction: number) {
  return (
    headIsDrawn.value &&
    fraction >= loopStart.value &&
    fraction <= loopEnd.value &&
    Math.abs(fraction - headFraction.value) < edgeGrabFraction
  )
}

/// Moving the left edge holds the right one still, which takes both parameters, so the gesture a
/// host records has to cover both of them.
function endpointsFor(target: DragTarget): string[] {
  if (target === 'start') {
    return [loopStartEndpoint.value, loopLengthEndpoint.value]
  }

  if (target === 'end') {
    return [loopLengthEndpoint.value]
  }

  return [target === 'position' ? positionEndpoint.value : loopStartEndpoint.value]
}

function applyDrag(fraction: number) {
  /// Position is a fraction of the region, so the line follows the pointer wherever the region has
  /// been put - and re-anchors Motion's drift, which is what lands it under the pointer rather
  /// than a drift's worth past it.
  if (dragTarget.value === 'position') {
    const withinRegion = loopLength.value > 0 ? (fraction - loopStart.value) / loopLength.value : 0

    patchSync.sendParameter(positionEndpoint.value, Math.min(Math.max(withinRegion, 0), 1))
    return
  }

  if (dragTarget.value === 'start') {
    // Read before writing: loopEnd is derived from the very value about to change.
    const heldEnd = loopEnd.value
    const next = Math.min(Math.max(fraction, 0), heldEnd - edgeGrabFraction)

    patchSync.sendParameter(loopStartEndpoint.value, next)
    patchSync.sendParameter(loopLengthEndpoint.value, heldEnd - next)
    return
  }

  if (dragTarget.value === 'end') {
    patchSync.sendParameter(
      loopLengthEndpoint.value,
      Math.max(edgeGrabFraction, fraction - loopStart.value)
    )
    return
  }

  const shifted = dragStartValue + (fraction - dragAnchor)

  patchSync.sendParameter(
    loopStartEndpoint.value,
    Math.min(Math.max(shifted, 0), 1 - loopLength.value)
  )
}

function onPointerDown(event: PointerEvent) {
  if (!hasSample.value || event.button !== 0) {
    return
  }

  const fraction = fractionAt(event)

  dragTarget.value = targetAt(fraction)
  dragAnchor = fraction
  dragStartValue = loopStart.value

  const element = event.currentTarget as HTMLElement
  element.setPointerCapture(event.pointerId)

  for (const endpoint of endpointsFor(dragTarget.value)) {
    patchSync.beginGesture(endpoint)
  }

  if (dragTarget.value !== 'region') {
    applyDrag(fraction)
  }
}

function onPointerMove(event: PointerEvent) {
  if (!dragTarget.value) {
    hoveredTarget.value = hasSample.value ? targetAt(fractionAt(event)) : undefined
    return
  }

  applyDrag(fractionAt(event))
}

function onPointerUp(event: PointerEvent) {
  if (!dragTarget.value) {
    return
  }

  ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)

  for (const endpoint of endpointsFor(dragTarget.value)) {
    patchSync.endGesture(endpoint)
  }

  dragTarget.value = undefined
  hoveredTarget.value = targetAt(fractionAt(event))
}

function onPointerLeave() {
  isHovered.value = false
  hoveredTarget.value = undefined
}

onMounted(() => {
  resizeCanvas()

  observer = new ResizeObserver(resizeCanvas)

  if (frameElement.value) {
    observer.observe(frameElement.value)
  }

  animationHandle = requestAnimationFrame(render)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animationHandle)
  observer?.disconnect()
})
</script>

<template>
  <div
    ref="frame"
    class="waveform"
    :class="[cursorClass, { empty: !hasSample, receiving: isDraggingFile }]"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @mouseenter="isHovered = true"
    @mouseleave="onPointerLeave"
  >
    <canvas ref="canvas" />

    <WaveformOverlay :hovered="isHovered" />
  </div>
</template>

<style lang="scss" scoped>
/// A band like any other: the well it reads as comes from being darker than what surrounds it,
/// not from a rule drawn round it.
.waveform {
  position: relative;
  flex: 1;
  min-height: 0;
  background: var(--bg-sunken);
  overflow: hidden;
  touch-action: none;
  cursor: default;

  --wave-body: var(--cap-idle);
  --wave-mask: color-mix(in srgb, var(--bg-sunken) 74%, transparent);
  --grain: var(--accent-bright);
}

/// A hand carries the region; arrows slide a line. The edges and the head are all hairlines on the
/// same canvas, so the cursor is the only thing that says which of them a press would take.
.waveform.over-region {
  cursor: grab;
}

.waveform.moving-region {
  cursor: grabbing;
}

.waveform.over-edge {
  cursor: ew-resize;
}

.waveform.over-head {
  cursor: col-resize;
}

/// The band people actually aim at, so it answers a drag as plainly as the strip above it does.
.waveform.receiving {
  box-shadow: inset 0 0 0 1px var(--accent);
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
