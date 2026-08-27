/**
 * A sample as the editor holds it: mono, because that is what the patch reads, at whatever rate
 * it had to be brought down to in order to fit the patch's buffer.
 */
export interface LoadedSample {
  name: string
  frames: Float32Array
  sampleRate: number
  /// The file's own length, kept because `frames.length / sampleRate` is the resampled one.
  durationSeconds: number
  /**
   * The size of the file the frames were decoded from. Kept because it is the file rather than the
   * frames that goes into the patch's stored state - see How the sample persists - so this is the
   * only number that says what the sample will cost the project it is saved into.
   */
  fileBytes: number
  sourceChannels: number
  /// True when the file was too long to keep its own rate. Worth saying out loud in the UI.
  wasDownsampled: boolean
}

export type TransferPhase = 'idle' | 'decoding' | 'sending' | 'ready' | 'failed'

export interface TransferStatus {
  phase: TransferPhase
  /// 0..1 through whichever phase is running, so one bar can show the whole load.
  progress: number
  message: string
}

/**
 * A grain the patch reported spawning. Only a sample of them arrives - the patch caps the rate -
 * so this is a view of the cloud rather than a record of it.
 */
export interface GrainEvent {
  position: number
  lengthSeconds: number
  level: number
  pan: number
  rate: number
  voice: number
  head: number
  /// performance.now() when it landed, so the canvas can fade it out on its own clock.
  bornAt: number
  /**
   * A unit random stamped on arrival, which is all that tells two grains of one cloud apart when
   * nothing is jittered: with no Pan Spread every grain carries the same pan, and drawn on pan
   * alone the whole cloud would land on one line. What the canvas makes of it is the canvas's
   * own - it is stamped here so a grain keeps its place while it fades rather than swimming.
   */
  seed: number
}

export interface EngineState {
  /// One per head, so the editor draws all eight without asking which is selected.
  headPositions: number[]
  /**
   * Both sides rather than one number for the pair: Pan Spread scatters a cloud across the image
   * and a head can be panned outright, so a single peak would report the louder side while saying
   * nothing about the quieter one going missing.
   */
  levelLeft: number
  levelRight: number
  activeGrains: number
  loadedFrames: number
  /// The rate the patch holds those frames at, which is the only way the editor can put a length
  /// on a sample it did not load itself - see useStoredSample.
  bufferRate: number
}

/**
 * A sample as it survives in the patch's stored state, which the host writes into the project.
 * The file's own bytes rather than the decoded frames: base64 of a few MB of ogg crosses the
 * wire as one string, where millions of decoded floats would cost what the transfer costs.
 */
export interface StoredSample {
  name: string
  data: ArrayBuffer
}

/**
 * A length in minutes and seconds. Shared rather than kept where it was first needed, because the
 * header names the sample's length and the ruler measures the same span underneath it - two
 * readings of one number, and they must not disagree by a rounding.
 */
export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * A size as a project owner would read it. Rounded coarsely on purpose: the number is there to
 * answer "is this going to bloat my session", and a byte count would answer a question nobody
 * asked while hiding the one they did.
 */
export function formatBytes(byteCount: number): string {
  const megabytes = byteCount / (1024 * 1024)

  if (megabytes >= 1) {
    return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`
  }

  return `${Math.max(1, Math.round(byteCount / 1024))} KB`
}
