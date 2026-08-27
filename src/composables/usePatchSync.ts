import { inject, onBeforeUnmount, onMounted, provide, type InjectionKey } from 'vue'
import { useGranularStore } from '@/stores/granular'
import { parameterDefinitions } from '@/models/granular.model'
import { PatchConnectionEndpoint } from '@/models/patch-connection-endpoints.enum'
import type { PatchConnection } from '@/models/patch-connection.model'
import type { EngineState, GrainEvent, LoadedSample } from '@/models/sample.model'
import { loadSampleData, SampleTooLongError } from '@/composables/useSampleLoader'
import { transferSample, type TransferHandle } from '@/composables/useSampleTransfer'
import { forgetSample, readStoredSample, rememberSample } from '@/composables/useStoredSample'
import { engine } from '@/models/granular.model'

export interface PatchSync {
  sendParameter(endpoint: string, value: number): void
  beginGesture(endpoint: string): void
  endGesture(endpoint: string): void
  dropSample(file: File): Promise<void>
  clearSample(): void
}

const patchSyncKey: InjectionKey<PatchSync> = Symbol('patchSync')

/**
 * Every knob is a host parameter, so values flow one way in each direction: the editor writes on
 * a gesture, the host writes back on automation, and neither has to reconcile with the other.
 * The sample is the exception - it is the editor's to own and to push.
 *
 * Called once, from App.vue, so that nothing below it can disconnect the patch by unmounting.
 */
export function providePatchSync(): PatchSync {
  const patchConnection = inject<PatchConnection>('patchConnection')
  const store = useGranularStore()

  let activeTransfer: TransferHandle | undefined

  /**
   * A restore has to know what the patch is holding before it can decide whether to send anything
   * at all, and that only arrives with the first stateOut. Resolved rather than awaited forever,
   * so a patch that is not being processed still finishes the restore by sending.
   */
  let engineHasReported: () => void = () => {}

  const firstEngineState = new Promise<void>((resolve) => {
    engineHasReported = resolve
  })

  function onParameterChanged({ endpointID, value }: { endpointID: string; value: number }) {
    store.setParameter(endpointID, value)
  }

  function onGrain(grain: Omit<GrainEvent, 'bornAt' | 'seed'>) {
    store.addGrain({ ...grain, bornAt: performance.now(), seed: Math.random() })
  }

  function onEngineState(state: EngineState) {
    store.applyEngineState(state)
    engineHasReported()
  }

  /// Releases the transfer window - see useSampleTransfer for why the editor waits on this.
  function onSampleProgress(frames: number) {
    activeTransfer?.acknowledge(frames)
  }

  function startTransfer(sample: LoadedSample) {
    activeTransfer?.cancel()

    store.setSample(sample)
    store.setTransfer({ phase: 'sending', progress: 0, message: 'Sending to engine' })

    activeTransfer = transferSample(patchConnection, sample, {
      onProgress: (sent, total) =>
        store.setTransfer({
          phase: 'sending',
          progress: total > 0 ? sent / total : 0,
          message: 'Sending to engine'
        }),
      // No message: the overlay is only drawn while the transfer is running or has failed, and
      // what a finished one would have said - the name, the length, what it costs the project -
      // is on the waveform's own caption, where it stays rather than being read once.
      onComplete: () => store.setTransfer({ phase: 'ready', progress: 1, message: '' }),
      onCancelled: () => store.setTransfer({ phase: 'idle', progress: 0, message: '' })
    })
  }

  /**
   * Whether the buffer the patch is already holding is the one these frames would send it. The
   * patch outlives its window, so on a reopened window this is the common case, and sending
   * again would mean a transfer the user waits through to arrive at what is already loaded.
   */
  async function engineAlreadyHolds(sample: LoadedSample): Promise<boolean> {
    await Promise.race([firstEngineState, new Promise((resolve) => setTimeout(resolve, 250))])

    return store.loadedFrames === Math.min(sample.frames.length, engine.maxSampleFrames)
  }

  function adoptEngineSample(sample: LoadedSample) {
    store.setSample(sample)
    store.setTransfer({ phase: 'ready', progress: 1, message: '' })
  }

  /**
   * The audio the editor lost when its window closed, decoded back out of the patch's stored
   * state. It is the file's own bytes that were kept, so this lands on the same rate and the same
   * frame count as the original drop did - which is what lets the engine's buffer be recognised
   * rather than replaced.
   */
  async function restoreStoredSample() {
    const stored = await readStoredSample(patchConnection)

    /// A file dropped while this was in flight is the newer intent, and outranks it.
    if (!stored || store.sample) {
      return
    }

    store.setTransfer({ phase: 'decoding', progress: 0, message: `Restoring ${stored.name}` })

    try {
      const sample = await loadSampleData(stored.name, stored.data)

      if (store.sample) {
        return
      }

      if (await engineAlreadyHolds(sample)) {
        adoptEngineSample(sample)
      } else {
        startTransfer(sample)
      }
    } catch {
      store.setTransfer({
        phase: 'failed',
        progress: 0,
        message: `Could not restore ${stored.name}`
      })
    }
  }

  const api: PatchSync = {
    sendParameter(endpoint, value) {
      store.setParameter(endpoint, value)
      patchConnection?.sendEventOrValue(endpoint, value)
    },

    beginGesture(endpoint) {
      patchConnection?.sendParameterGestureStart(endpoint)
    },

    endGesture(endpoint) {
      patchConnection?.sendParameterGestureEnd(endpoint)
    },

    async dropSample(file) {
      store.setTransfer({ phase: 'decoding', progress: 0, message: `Decoding ${file.name}` })

      try {
        const data = await file.arrayBuffer()
        // Decoding takes the buffer it is given, so the copy that is kept has to be made first.
        const sample = await loadSampleData(file.name, data.slice(0))

        startTransfer(sample)

        // Behind the transfer rather than in front of it: what the user is waiting to hear is the
        // sample reaching the engine, not the copy that will still be here tomorrow.
        void rememberSample(patchConnection, file.name, data)
      } catch (error) {
        const message =
          error instanceof SampleTooLongError ? error.message : `Could not decode ${file.name}`

        store.setSample(undefined)
        store.setTransfer({ phase: 'failed', progress: 0, message })
      }
    },

    clearSample() {
      activeTransfer?.cancel()
      activeTransfer = undefined

      store.setSample(undefined)
      store.setTransfer({ phase: 'idle', progress: 0, message: '' })
      forgetSample(patchConnection)

      patchConnection?.sendEventOrValue(PatchConnectionEndpoint.SampleBegin, {
        frameCount: 0,
        sampleRate: 48000
      })
    }
  }

  provide(patchSyncKey, api)

  onMounted(() => {
    patchConnection?.addAllParameterListener(onParameterChanged)
    patchConnection?.addEndpointListener(PatchConnectionEndpoint.GrainOut, onGrain)
    patchConnection?.addEndpointListener(PatchConnectionEndpoint.StateOut, onEngineState)
    patchConnection?.addEndpointListener(PatchConnectionEndpoint.SampleProgress, onSampleProgress)

    for (const definition of parameterDefinitions) {
      patchConnection?.requestParameterValue(definition.endpoint)
    }

    void restoreStoredSample()
  })

  onBeforeUnmount(() => {
    activeTransfer?.cancel()

    patchConnection?.removeAllParameterListener(onParameterChanged)
    patchConnection?.removeEndpointListener(PatchConnectionEndpoint.GrainOut, onGrain)
    patchConnection?.removeEndpointListener(PatchConnectionEndpoint.StateOut, onEngineState)
    patchConnection?.removeEndpointListener(
      PatchConnectionEndpoint.SampleProgress,
      onSampleProgress
    )
  })

  return api
}

export function usePatchSync(): PatchSync {
  const api = inject(patchSyncKey)

  if (!api) {
    throw new Error('usePatchSync requires providePatchSync to have run further up the tree')
  }

  return api
}
