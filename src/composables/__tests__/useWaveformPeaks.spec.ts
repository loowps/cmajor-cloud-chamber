import { describe, expect, it } from 'vitest'
import { nextTick, ref, shallowRef } from 'vue'
import { useWaveformPeaks } from '@/composables/useWaveformPeaks'
import type { LoadedSample } from '@/models/sample.model'

function sampleOf(frames: Float32Array): LoadedSample {
  return {
    name: 'take.wav',
    frames,
    sampleRate: 48000,
    durationSeconds: frames.length / 48000,
    fileBytes: frames.length * 4,
    sourceChannels: 1,
    wasDownsampled: false
  }
}

function rampOf(length: number): Float32Array {
  return Float32Array.from({ length }, (_, index) => (index / (length - 1)) * 2 - 1)
}

describe('useWaveformPeaks', () => {
  it('has no outline before a sample lands', () => {
    const peaks = useWaveformPeaks(shallowRef<LoadedSample | undefined>(), ref(100))

    expect(peaks.value).toBeUndefined()
  })

  it('reduces a sample to one min and max per column', () => {
    const sample = shallowRef(sampleOf(rampOf(1000)))
    const peaks = useWaveformPeaks(sample, ref(10))

    expect(peaks.value?.columns).toBe(10)
    expect(peaks.value?.bounds).toHaveLength(20)
  })

  it('spans the whole sample, first column to last', () => {
    const sample = shallowRef(sampleOf(rampOf(1000)))
    const peaks = useWaveformPeaks(sample, ref(10))
    const bounds = peaks.value?.bounds as Float32Array

    expect(bounds[0]).toBeCloseTo(-1, 4)
    expect(bounds.at(-1)).toBeCloseTo(1, 4)
  })

  it('keeps a spike that a column would otherwise average away', () => {
    const frames = new Float32Array(1000)

    frames[517] = 0.9
    frames[518] = -0.8

    const peaks = useWaveformPeaks(shallowRef(sampleOf(frames)), ref(10))
    const bounds = peaks.value?.bounds as Float32Array

    expect(bounds[10]).toBeCloseTo(-0.8, 4)
    expect(bounds[11]).toBeCloseTo(0.9, 4)
  })

  it('never leaves a column empty when there are fewer frames than columns', () => {
    const peaks = useWaveformPeaks(shallowRef(sampleOf(rampOf(4))), ref(16))
    const bounds = peaks.value?.bounds as Float32Array

    expect(bounds).toHaveLength(32)
    expect([...bounds].every(Number.isFinite)).toBe(true)
  })

  it('rebuilds when the width it is drawn at changes', async () => {
    const sample = shallowRef(sampleOf(rampOf(1000)))
    const columns = ref(10)
    const peaks = useWaveformPeaks(sample, columns)
    const before = peaks.value

    columns.value = 20
    await nextTick()

    expect(peaks.value).not.toBe(before)
    expect(peaks.value?.columns).toBe(20)
  })

  it('rebuilds when the sample is replaced, and clears when it is taken away', async () => {
    const sample = shallowRef<LoadedSample | undefined>(sampleOf(rampOf(1000)))
    const peaks = useWaveformPeaks(sample, ref(10))

    sample.value = sampleOf(new Float32Array(1000).fill(0.5))
    await nextTick()

    expect(peaks.value?.bounds[0]).toBeCloseTo(0.5, 4)

    sample.value = undefined
    await nextTick()

    expect(peaks.value).toBeUndefined()
  })

  it('draws no outline for a buffer of one frame', () => {
    const peaks = useWaveformPeaks(shallowRef(sampleOf(new Float32Array(1))), ref(10))

    expect(peaks.value).toBeUndefined()
  })

  it('never asks for fewer than one column, whatever width it is handed', () => {
    const peaks = useWaveformPeaks(shallowRef(sampleOf(rampOf(100))), ref(0))

    expect(peaks.value?.columns).toBe(1)
  })
})
