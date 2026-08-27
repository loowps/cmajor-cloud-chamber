import { engine } from '@/models/granular.model'
import type { LoadedSample } from '@/models/sample.model'

/**
 * The rate a file lands on if it uses the whole hour. Decoding at this rate first is what makes
 * the two-pass load cheap for the case that costs the most: an hour-long file is already at its
 * target rate after pass one, so the second decode never happens.
 */
const probeSampleRate = Math.max(
  engine.minSampleRate,
  Math.floor(engine.maxSampleFrames / engine.maxSampleSeconds)
)

/// Close enough that re-decoding would only move a handful of frames.
const rateMatchTolerance = 1

let ceilingRate = 0

/**
 * The rate a short file is allowed to keep. Taken from a real AudioContext because that is the
 * rate the host is running at, and resampling once here is better than resampling every grain.
 */
function deviceSampleRate(): number {
  if (!ceilingRate) {
    const context = new AudioContext()
    ceilingRate = context.sampleRate
    void context.close()
  }

  return Math.min(Math.max(ceilingRate, engine.minSampleRate), engine.maxSampleRate)
}

function decodeAt(data: ArrayBuffer, sampleRate: number): Promise<AudioBuffer> {
  // decodeAudioData resamples to the context's rate as it decodes, so choosing the context is
  // how a file is brought down without ever holding it at full rate.
  const context = new OfflineAudioContext(1, 1, sampleRate)

  return context.decodeAudioData(data)
}

function downmix(buffer: AudioBuffer): Float32Array {
  const frames = new Float32Array(buffer.length)

  for (let channel = 0; channel < buffer.numberOfChannels; ++channel) {
    const source = buffer.getChannelData(channel)

    for (let frame = 0; frame < source.length; ++frame) {
      frames[frame] += source[frame]
    }
  }

  if (buffer.numberOfChannels > 1) {
    const scale = 1 / buffer.numberOfChannels

    for (let frame = 0; frame < frames.length; ++frame) {
      frames[frame] *= scale
    }
  }

  return frames
}

function rateThatFits(durationSeconds: number): number {
  const fitting = engine.maxSampleFrames / Math.max(durationSeconds, 0.001)

  return Math.min(deviceSampleRate(), Math.max(fitting, engine.minSampleRate))
}

export class SampleTooLongError extends Error {
  constructor(public readonly durationSeconds: number) {
    super(`Sample is ${(durationSeconds / 60).toFixed(1)} minutes, over the 60 minute limit`)
    this.name = 'SampleTooLongError'
  }
}

/**
 * Decoding twice is deliberate. The length has to be known before the rate can be chosen, and
 * the only way to learn it without decoding is to trust metadata that half of the formats do not
 * carry - so the first pass is done at the cheapest rate that could ever be needed, and it is
 * reused outright when it turns out to have been the right one.
 */
export async function loadSample(file: File): Promise<LoadedSample> {
  return loadSampleData(file.name, await file.arrayBuffer())
}

/**
 * The same load, from bytes that never came from a drop - which is how a sample restored out of
 * the patch's stored state lands on exactly the rate it landed on the first time.
 *
 * decodeAudioData takes ownership of the buffer it is handed, so a caller that still needs the
 * bytes afterwards has to pass a copy.
 */
export async function loadSampleData(name: string, data: ArrayBuffer): Promise<LoadedSample> {
  // Read before anything decodes: decodeAudioData detaches the buffer it is given, and a detached
  // one reports a length of zero.
  const fileBytes = data.byteLength

  // decodeAudioData detaches the buffer it is given, so the second pass needs its own copy.
  const probe = await decodeAt(data.slice(0), probeSampleRate)
  const durationSeconds = probe.duration

  if (durationSeconds > engine.maxSampleSeconds) {
    throw new SampleTooLongError(durationSeconds)
  }

  const targetRate = rateThatFits(durationSeconds)
  const canReuseProbe = Math.abs(targetRate - probeSampleRate) <= rateMatchTolerance

  const decoded = canReuseProbe ? probe : await decodeAt(data, Math.round(targetRate))

  return {
    name,
    frames: downmix(decoded),
    sampleRate: decoded.sampleRate,
    durationSeconds,
    fileBytes,
    sourceChannels: decoded.numberOfChannels,
    wasDownsampled: decoded.sampleRate < deviceSampleRate() - rateMatchTolerance
  }
}

/// The longest a file can be before it starts losing rate, which is worth telling the user.
export function fullRateSeconds(): number {
  return engine.maxSampleFrames / deviceSampleRate()
}
