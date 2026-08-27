import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  canSaveWithProject,
  forgetSample,
  maxStoredBytes,
  readStoredSample,
  rememberSample,
  storedByteLength
} from '@/composables/useStoredSample'
import type { PatchConnection } from '@/models/patch-connection.model'

type StoredListener = (message: { key: string; value?: { name?: string; audio?: string } }) => void

/// Stands in for the host's stored state: the value is only handed back when a test says so, so a
/// patch that answers, one that answers with nothing, and one that never answers are all reachable.
function storedStateConnection(answer?: { name?: string; audio?: string } | null) {
  const listeners = new Set<StoredListener>()
  const writes: { key: string; value: unknown }[] = []

  const connection = {
    sendStoredStateValue(key: string, value: unknown) {
      writes.push({ key, value })
    },
    addStoredStateValueListener(listener: StoredListener) {
      listeners.add(listener)
    },
    removeStoredStateValueListener(listener: StoredListener) {
      listeners.delete(listener)
    },
    requestStoredStateValue(key: string) {
      if (answer === undefined) {
        return
      }

      for (const listener of [...listeners]) {
        listener({ key, value: answer ?? undefined })
      }
    }
  } as unknown as PatchConnection

  function emit(message: { key: string; value?: { name?: string; audio?: string } }) {
    for (const listener of [...listeners]) {
      listener(message)
    }
  }

  return { connection, writes, emit, listenerCount: () => listeners.size }
}

function bytesOf(...values: number[]): ArrayBuffer {
  return new Uint8Array(values).buffer
}

describe('what a file costs the project', () => {
  it('saves a file inside the limit and refuses one over it', () => {
    expect(canSaveWithProject(0)).toBe(true)
    expect(canSaveWithProject(maxStoredBytes)).toBe(true)
    expect(canSaveWithProject(maxStoredBytes + 1)).toBe(false)
  })

  it('prints what base64 costs rather than what the file weighs', () => {
    expect(storedByteLength(3)).toBe(4)
    expect(storedByteLength(300)).toBe(400)
  })

  it('rounds a part quantum up to the whole one it is padded to', () => {
    expect(storedByteLength(1)).toBe(4)
    expect(storedByteLength(4)).toBe(8)
  })

  it('grows a sample just inside the limit by a third, which is worth knowing about', () => {
    expect(storedByteLength(maxStoredBytes)).toBeGreaterThan(42 * 1024 * 1024)
  })
})

describe('rememberSample', () => {
  it('writes the file base64 under the sample key', async () => {
    const patch = storedStateConnection()

    await rememberSample(patch.connection, 'take.wav', bytesOf(1, 2, 3))

    expect(patch.writes).toHaveLength(1)
    expect(patch.writes[0].key).toBe('sample')
    expect(patch.writes[0].value).toEqual({ name: 'take.wav', audio: btoa('\x01\x02\x03') })
  })

  it('drops the key rather than storing audio too large to carry', async () => {
    const patch = storedStateConnection()
    const oversized = { byteLength: maxStoredBytes + 1 } as ArrayBuffer

    await rememberSample(patch.connection, 'epic.wav', oversized)

    expect(patch.writes).toEqual([{ key: 'sample', value: undefined }])
  })

  it('lets the newest write win, so a replaced file is never restored over its replacement', async () => {
    const patch = storedStateConnection()

    const first = rememberSample(patch.connection, 'first.wav', new ArrayBuffer(200_000))
    const second = rememberSample(patch.connection, 'second.wav', bytesOf(9))

    await Promise.all([first, second])

    expect(patch.writes).toHaveLength(1)
    expect(patch.writes[0].value).toMatchObject({ name: 'second.wav' })
  })

  it('does nothing at all without a connection', async () => {
    await expect(rememberSample(undefined, 'take.wav', bytesOf(1))).resolves.toBeUndefined()
  })
})

describe('forgetSample', () => {
  it('writes an empty value, which is how the host is told to drop the key', () => {
    const patch = storedStateConnection()

    forgetSample(patch.connection)

    expect(patch.writes).toEqual([{ key: 'sample', value: undefined }])
  })

  it('outranks a write already in flight', async () => {
    const patch = storedStateConnection()

    const pending = rememberSample(patch.connection, 'take.wav', new ArrayBuffer(200_000))

    forgetSample(patch.connection)
    await pending

    expect(patch.writes).toEqual([{ key: 'sample', value: undefined }])
  })
})

describe('readStoredSample', () => {
  it('decodes the bytes that were kept back out of stored state', async () => {
    const patch = storedStateConnection({ name: 'take.wav', audio: btoa('\x01\x02\x03') })

    const stored = await readStoredSample(patch.connection)

    expect(stored?.name).toBe('take.wav')
    expect([...new Uint8Array(stored?.data as ArrayBuffer)]).toEqual([1, 2, 3])
  })

  it('round trips a file bigger than one conversion chunk', async () => {
    const patch = storedStateConnection()
    const original = new Uint8Array(100_000).map((_, index) => index % 256)

    await rememberSample(patch.connection, 'long.wav', original.buffer)

    const written = patch.writes[0].value as { audio: string }
    const reader = storedStateConnection({ name: 'long.wav', audio: written.audio })
    const stored = await readStoredSample(reader.connection)

    expect([...new Uint8Array(stored?.data as ArrayBuffer)]).toEqual([...original])
  })

  it('names a value that lost its filename rather than restoring it unnamed', async () => {
    const patch = storedStateConnection({ audio: btoa('\x01') })

    expect((await readStoredSample(patch.connection))?.name).toBe('Restored sample')
  })

  it('resolves to nothing when the patch has no sample stored', async () => {
    const patch = storedStateConnection(null)

    expect(await readStoredSample(patch.connection)).toBeUndefined()
  })

  it('resolves to nothing without a connection', async () => {
    expect(await readStoredSample(undefined)).toBeUndefined()
  })

  it('ignores a stored value written under some other key', async () => {
    const patch = storedStateConnection()

    vi.useFakeTimers()

    const pending = readStoredSample(patch.connection)

    patch.emit({ key: 'other', value: { name: 'wrong.wav', audio: btoa('\x07') } })

    expect(patch.listenerCount()).toBe(1)

    patch.emit({ key: 'sample', value: { name: 'right.wav', audio: btoa('\x08') } })

    await vi.advanceTimersByTimeAsync(0)
    vi.useRealTimers()

    expect((await pending)?.name).toBe('right.wav')
  })

  describe('a patch that never answers', () => {
    beforeEach(() => {
      vi.useFakeTimers()

      return () => vi.useRealTimers()
    })

    it('gives up rather than leaving the editor waiting on a sample that is not coming', async () => {
      const patch = storedStateConnection()
      const pending = readStoredSample(patch.connection)

      await vi.advanceTimersByTimeAsync(2001)

      expect(await pending).toBeUndefined()
      expect(patch.listenerCount()).toBe(0)
    })
  })

  it('drops its listener once it has been answered', async () => {
    const patch = storedStateConnection({ name: 'take.wav', audio: btoa('\x01') })

    await readStoredSample(patch.connection)

    expect(patch.listenerCount()).toBe(0)
  })
})
