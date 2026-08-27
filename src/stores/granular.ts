import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { engine, parameterDefinitions } from '@/models/granular.model'
import type { EngineState, GrainEvent, LoadedSample, TransferStatus } from '@/models/sample.model'

/// Long enough for a grain to be seen crossing the waveform, short enough that the cloud thins
/// out the moment density drops rather than lagging behind it.
const grainLifetimeMs = 900

/// The cloud is a picture, not a log. Past this the oldest are dropped whatever their age.
const maxDrawnGrains = 240

function initialValues(): Record<string, number> {
  return Object.fromEntries(parameterDefinitions.map((d) => [d.endpoint, d.initial]))
}

export const useGranularStore = defineStore('granular', () => {
  const parameters = ref<Record<string, number>>(initialValues())

  /// Frames never need to be reactive - only the identity of the sample does, and a Float32Array
  /// of tens of millions of entries must never be handed to a deep proxy.
  const sample = shallowRef<LoadedSample | undefined>()

  const transfer = ref<TransferStatus>({ phase: 'idle', progress: 0, message: '' })

  /// The whole window accepts a drop, so more than one band has to know a file is over it.
  const isDraggingFile = ref(false)

  const headPositions = ref<number[]>(Array.from({ length: engine.headCount }, () => 0))

  /// A view choice rather than engine state: which head the bands below the waveform are editing.
  const selectedHead = ref(0)
  const outputLevelLeft = ref(0)
  const outputLevelRight = ref(0)
  const activeGrains = ref(0)
  const loadedFrames = ref(0)
  const bufferRate = ref(0)

  const grains = shallowRef<GrainEvent[]>([])

  const hasSample = computed(() => (sample.value?.frames.length ?? 0) > 1)

  /**
   * The patch holds its buffer for as long as the plugin lives, while the editor holds its copy
   * only for as long as the window does. So between a window reopening and the stored sample
   * being decoded again there is audio playing that this editor cannot draw - and saying there is
   * no sample then would be the window contradicting what can be heard.
   */
  const engineHasSample = computed(() => loadedFrames.value > 0)

  const canClear = computed(() => hasSample.value || engineHasSample.value)

  /// Measured by the patch's own rate rather than the loaded sample's, which may not be here yet.
  const engineSeconds = computed(() =>
    bufferRate.value > 0 ? loadedFrames.value / bufferRate.value : 0
  )

  const isLoading = computed(
    () => transfer.value.phase === 'decoding' || transfer.value.phase === 'sending'
  )

  function parameterValue(endpoint: string): number {
    return parameters.value[endpoint] ?? 0
  }

  function setParameter(endpoint: string, value: number) {
    parameters.value[endpoint] = value
  }

  function setSample(loaded: LoadedSample | undefined) {
    sample.value = loaded
    grains.value = []
  }

  function setTransfer(status: TransferStatus) {
    transfer.value = status
  }

  function setDraggingFile(isDragging: boolean) {
    isDraggingFile.value = isDragging
  }

  function selectHead(head: number) {
    selectedHead.value = Math.min(Math.max(head, 0), engine.headCount - 1)
  }

  function applyEngineState(state: EngineState) {
    headPositions.value = state.headPositions
    outputLevelLeft.value = state.levelLeft
    outputLevelRight.value = state.levelRight
    activeGrains.value = state.activeGrains
    loadedFrames.value = state.loadedFrames
    bufferRate.value = state.bufferRate
  }

  /**
   * Replaced rather than pushed into: the canvas watches the array's identity, and a shallowRef
   * holding a mutated array would never tell it anything had changed.
   */
  function addGrain(grain: GrainEvent) {
    const cutoff = grain.bornAt - grainLifetimeMs
    const alive = grains.value.filter((existing) => existing.bornAt > cutoff)

    alive.push(grain)
    grains.value = alive.length > maxDrawnGrains ? alive.slice(-maxDrawnGrains) : alive
  }

  function expireGrains(now: number) {
    const cutoff = now - grainLifetimeMs

    if (grains.value.some((grain) => grain.bornAt <= cutoff)) {
      grains.value = grains.value.filter((grain) => grain.bornAt > cutoff)
    }
  }

  return {
    parameters,
    sample,
    transfer,
    isDraggingFile,
    headPositions,
    selectedHead,
    outputLevelLeft,
    outputLevelRight,
    activeGrains,
    loadedFrames,
    bufferRate,
    grains,
    hasSample,
    engineHasSample,
    canClear,
    engineSeconds,
    isLoading,
    grainLifetimeMs,
    parameterValue,
    setParameter,
    setSample,
    setTransfer,
    setDraggingFile,
    selectHead,
    applyEngineState,
    addGrain,
    expireGrains
  }
})
