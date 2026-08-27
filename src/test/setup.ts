import { beforeEach, vi } from 'vitest'

/**
 * jsdom implements neither pointer capture nor ResizeObserver, and its canvas has no 2d context
 * without a native backend. All three are load-bearing here - every parameter row is worked by a
 * captured pointer, and both the waveform and the ruler measure themselves - so a test that
 * mounts a control would fail on the environment rather than on the code.
 */
if (!Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function setPointerCapture() {}
  Element.prototype.releasePointerCapture = function releasePointerCapture() {}
  Element.prototype.hasPointerCapture = function hasPointerCapture() {
    return false
  }
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

/// A drop carries its file list on the event, and jsdom has no DragEvent to hang one on.
if (!globalThis.DragEvent) {
  globalThis.DragEvent = class DragEvent extends Event {
    dataTransfer: DataTransfer | null

    constructor(type: string, init: EventInit & { dataTransfer?: DataTransfer } = {}) {
      super(type, init)
      this.dataTransfer = init.dataTransfer ?? null
    }
  } as unknown as typeof globalThis.DragEvent
}

const canvasContextStub = () =>
  new Proxy(
    {
      canvas: undefined,
      measureText: () => ({ width: 0 }),
      createLinearGradient: () => ({ addColorStop() {} })
    },
    {
      get: (target: Record<string, unknown>, key: string) =>
        key in target ? target[key] : () => undefined
    }
  )

HTMLCanvasElement.prototype.getContext = vi.fn(canvasContextStub) as never

beforeEach(() => {
  vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 0)
  vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
})
