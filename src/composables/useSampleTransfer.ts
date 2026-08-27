import { engine } from '@/models/granular.model'
import { PatchConnectionEndpoint } from '@/models/patch-connection-endpoints.enum'
import type { PatchConnection } from '@/models/patch-connection.model'
import type { LoadedSample } from '@/models/sample.model'

/**
 * Frames allowed to be in flight - sent, but not yet reported back as taken off the queue.
 *
 * The engine's input queue is 64KB and drains once per audio block, so a sender paced by a timer
 * either crawls or, as this one used to, runs at roughly twice what the engine can swallow. The
 * excess does not disappear: the host's message thread sits retrying against a full queue, and in
 * a plugin that is the thread drawing the window. Pacing against what actually landed makes the
 * transfer run at exactly the rate the engine can take it, on any machine.
 *
 * Sized well above one chunk so the round trip never empties the pipeline, and well under the
 * queue so the host is never left retrying.
 */
const inFlightFrameLimit = 16 * engine.chunkFrames

/**
 * How long to wait for any progress at all before giving up on pacing and falling back to a
 * timer. A patch that cannot answer - an older one without the endpoint, or an engine that is not
 * being processed - must still finish the load rather than hanging on an acknowledgement that is
 * never coming.
 */
const acknowledgeTimeoutMs = 1000

/// The runtime retries a full queue for this long before dropping the chunk on the floor. With
/// pacing in place it should never be reached; it is what catches a burst the window let through.
const sendTimeoutMs = 2000

/// Progress is a store write and so a re-render, which is worth far less often than every chunk.
const chunksPerReport = 8

export interface TransferHandle {
  cancel(): void
  /// Called with the frame count the patch says it has taken, which is what releases the window.
  acknowledge(frames: number): void
}

export interface TransferCallbacks {
  onProgress(sentFrames: number, totalFrames: number): void
  onComplete(): void
  onCancelled(): void
}

/**
 * The buffer is only armed by the closing event, so a transfer that is cancelled - or that the
 * editor is torn down in the middle of - leaves the patch silent rather than playing whatever
 * fraction of the sample had arrived.
 */
export function transferSample(
  patchConnection: PatchConnection | undefined,
  sample: LoadedSample,
  callbacks: TransferCallbacks
): TransferHandle {
  let cancelled = false
  let acknowledgedFrames = 0
  let isEnginePacing = true
  let releaseWindow: (() => void) | undefined

  const totalFrames = Math.min(sample.frames.length, engine.maxSampleFrames)

  function hasRoomFor(sentFrames: number) {
    return sentFrames - acknowledgedFrames <= inFlightFrameLimit
  }

  async function waitForRoom(sentFrames: number) {
    while (!cancelled && isEnginePacing && !hasRoomFor(sentFrames)) {
      const before = acknowledgedFrames

      await new Promise<void>((resolve) => {
        releaseWindow = () => {
          if (hasRoomFor(sentFrames)) {
            resolve()
          }
        }

        setTimeout(resolve, acknowledgeTimeoutMs)
      })

      releaseWindow = undefined

      if (acknowledgedFrames === before) {
        isEnginePacing = false
      }
    }
  }

  const run = async () => {
    patchConnection?.sendEventOrValue(PatchConnectionEndpoint.SampleBegin, {
      frameCount: totalFrames,
      sampleRate: sample.sampleRate
    })

    const chunk = new Array<number>(engine.chunkFrames)

    for (let start = 0; start < totalFrames; start += engine.chunkFrames) {
      await waitForRoom(start)

      if (cancelled) {
        callbacks.onCancelled()
        return
      }

      const count = Math.min(engine.chunkFrames, totalFrames - start)

      for (let i = 0; i < count; ++i) {
        chunk[i] = sample.frames[start + i]
      }

      // The struct is a fixed width on the patch side, so a short final chunk still has to fill
      // the array - frameCount is what says how much of it to read.
      for (let i = count; i < engine.chunkFrames; ++i) {
        chunk[i] = 0
      }

      patchConnection?.sendEventOrValue(
        PatchConnectionEndpoint.SampleChunk,
        { startFrame: start, frameCount: count, frames: chunk },
        -1,
        sendTimeoutMs
      )

      const chunkIndex = start / engine.chunkFrames

      if (chunkIndex % chunksPerReport === chunksPerReport - 1) {
        callbacks.onProgress(start + count, totalFrames)

        // Unconditional: waiting on the window is the only other thing in this loop that yields,
        // and an engine quick enough never to fill the window would never yield at all - which is
        // the whole failure this is here to prevent. The floor it puts on the transfer is well
        // above what any engine drains at, so it costs nothing.
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }

    if (cancelled) {
      callbacks.onCancelled()
      return
    }

    patchConnection?.sendEventOrValue(PatchConnectionEndpoint.SampleEnd, totalFrames)
    callbacks.onProgress(totalFrames, totalFrames)
    callbacks.onComplete()
  }

  void run()

  return {
    cancel() {
      cancelled = true
      releaseWindow?.()
    },

    acknowledge(frames: number) {
      if (frames > acknowledgedFrames) {
        acknowledgedFrames = frames
      }

      releaseWindow?.()
    }
  }
}
