import type { PatchConnection } from '@/models/patch-connection.model'
import type { StoredSample } from '@/models/sample.model'

/**
 * Where the sample lives in the patch's stored state. Stored state belongs to the plugin instance
 * rather than to the window, so this is what survives both the window being closed and the
 * project being saved and reopened - the two things a dropped file has never survived before.
 */
const storedSampleKey = 'sample'

/**
 * How much of a file is worth carrying inside somebody's project. Past this the audio is left
 * out rather than quietly adding a hundred megabytes to every save of every session that used it,
 * and the waveform's caption says so instead of pretending the sample was kept.
 */
export const maxStoredBytes = 32 * 1024 * 1024

/**
 * Divisible by three, so a chunk encodes to whole base64 quantums and the chunks can simply be
 * concatenated - only the last one is ever padded. That is what allows the conversion to be cut
 * into pieces at all, and cut into pieces is the only way it can yield.
 */
const chunkBytes = 32760

const chunkChars = (chunkBytes / 3) * 4

/**
 * Converting the whole of a 32MB file in one go costs about 700ms, and it would be spent on the
 * thread drawing the window - the same freeze `useSampleTransfer` is paced to avoid. Yielding this
 * often keeps the editor answering the pointer while it works.
 */
const chunksPerYield = 8

const yieldToWindow = () => new Promise<void>((resolve) => setTimeout(resolve))

/**
 * The newest write wins. A conversion yields, so a second file dropped over the top of a first can
 * otherwise finish before it and be overwritten by audio the user has already replaced.
 */
let writeGeneration = 0

/// The stored value has to survive JSON, so the bytes travel as base64.
async function toBase64(bytes: Uint8Array): Promise<string> {
  const chunks: string[] = []

  for (let start = 0; start < bytes.length; start += chunkBytes) {
    chunks.push(btoa(String.fromCharCode(...bytes.subarray(start, start + chunkBytes))))

    if (chunks.length % chunksPerYield === 0) {
      await yieldToWindow()
    }
  }

  return chunks.join('')
}

async function fromBase64(text: string): Promise<ArrayBuffer> {
  const bytes = new Uint8Array(Math.ceil((text.length / 4) * 3))
  let written = 0

  for (let start = 0; start < text.length; start += chunkChars) {
    const decoded = atob(text.slice(start, start + chunkChars))

    for (let i = 0; i < decoded.length; ++i) {
      bytes[written + i] = decoded.charCodeAt(i)
    }

    written += decoded.length

    if ((start / chunkChars) % chunksPerYield === chunksPerYield - 1) {
      await yieldToWindow()
    }
  }

  return bytes.buffer.slice(0, written)
}

/// A patch that never answers must not leave the editor waiting on a sample that is not coming.
const readTimeoutMs = 2000

/**
 * Whether a file of this size is one the project will be asked to carry. Answered before the
 * conversion rather than after it, because the drop zone has to say so while the sample loads.
 */
export function canSaveWithProject(byteLength: number): boolean {
  return byteLength <= maxStoredBytes
}

/**
 * What a file of this size actually costs the project, which is not the size of the file: it is
 * stored as base64, so every three bytes leave as four. The limit above is checked against the
 * file, but this is the number the session grows by, and it is the one worth printing.
 */
export function storedByteLength(byteLength: number): number {
  return Math.ceil(byteLength / 3) * 4
}

export async function rememberSample(
  patchConnection: PatchConnection | undefined,
  name: string,
  data: ArrayBuffer
) {
  const generation = ++writeGeneration

  if (!canSaveWithProject(data.byteLength)) {
    forgetSample(patchConnection)
    return
  }

  const audio = await toBase64(new Uint8Array(data))

  if (generation === writeGeneration) {
    patchConnection?.sendStoredStateValue(storedSampleKey, { name, audio })
  }
}

/// An empty value is how the host is told to drop the key rather than to store nothing under it.
export function forgetSample(patchConnection: PatchConnection | undefined) {
  ++writeGeneration
  patchConnection?.sendStoredStateValue(storedSampleKey, undefined)
}

export function readStoredSample(
  patchConnection: PatchConnection | undefined
): Promise<StoredSample | undefined> {
  if (!patchConnection) {
    return Promise.resolve(undefined)
  }

  const connection = patchConnection

  return new Promise((resolve) => {
    function onStoredValue({
      key,
      value
    }: {
      key: string
      value?: { name?: string; audio?: string }
    }) {
      if (key !== storedSampleKey) {
        return
      }

      // The timeout is only waiting on the answer. Converting what came back takes as long as it
      // takes, and it must not be abandoned halfway for having outlasted a wait that is over.
      connection.removeStoredStateValueListener(onStoredValue)
      clearTimeout(timeout)

      if (!value?.audio) {
        resolve(undefined)
        return
      }

      const name = value.name ?? 'Restored sample'

      void fromBase64(value.audio).then((data) => resolve({ name, data }))
    }

    const timeout = setTimeout(() => {
      connection.removeStoredStateValueListener(onStoredValue)
      resolve(undefined)
    }, readTimeoutMs)

    connection.addStoredStateValueListener(onStoredValue)
    connection.requestStoredStateValue(storedSampleKey)
  })
}
