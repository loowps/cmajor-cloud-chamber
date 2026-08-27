import { shallowRef, watchEffect, type Ref } from 'vue'
import type { LoadedSample } from '@/models/sample.model'

export interface WaveformPeaks {
  /// Interleaved min, max per column, so one array covers the whole outline.
  bounds: Float32Array
  columns: number
}

/**
 * Scanning tens of millions of frames is affordable once and ruinous every animation frame, so
 * the outline is reduced to one min/max pair per column and only rebuilt when the sample or the
 * width it is drawn at actually changes.
 */
function computePeaks(frames: Float32Array, columns: number): WaveformPeaks {
  const bounds = new Float32Array(columns * 2)
  const framesPerColumn = frames.length / columns

  for (let column = 0; column < columns; ++column) {
    const start = Math.floor(column * framesPerColumn)
    const end = Math.min(
      frames.length,
      Math.max(start + 1, Math.floor((column + 1) * framesPerColumn))
    )

    let low = frames[start]
    let high = frames[start]

    for (let frame = start + 1; frame < end; ++frame) {
      const value = frames[frame]

      if (value < low) {
        low = value
      } else if (value > high) {
        high = value
      }
    }

    bounds[column * 2] = low
    bounds[column * 2 + 1] = high
  }

  return { bounds, columns }
}

export function useWaveformPeaks(
  sample: Ref<LoadedSample | undefined>,
  columns: Ref<number>
): Ref<WaveformPeaks | undefined> {
  const peaks = shallowRef<WaveformPeaks | undefined>()

  watchEffect(() => {
    const frames = sample.value?.frames
    const width = Math.max(1, Math.floor(columns.value))

    peaks.value = frames && frames.length > 1 ? computePeaks(frames, width) : undefined
  })

  return peaks
}
