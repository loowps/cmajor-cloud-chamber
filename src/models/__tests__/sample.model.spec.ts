import { describe, expect, it } from 'vitest'
import { formatBytes, formatClock } from '@/models/sample.model'

describe('formatClock', () => {
  it('pads the seconds so two readings of one length cannot disagree by a digit', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(9)).toBe('0:09')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(298)).toBe('4:58')
  })

  it('floors rather than rounds, so the caption never claims a frame the sample has not got', () => {
    expect(formatClock(59.9)).toBe('0:59')
  })

  it('carries past an hour rather than wrapping, which is the length the buffer allows', () => {
    expect(formatClock(3600)).toBe('60:00')
  })
})

describe('formatBytes', () => {
  it('reads under a megabyte in kilobytes', () => {
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(512 * 1024)).toBe('512 KB')
  })

  it('never rounds a non-empty file away to nothing', () => {
    expect(formatBytes(1)).toBe('1 KB')
  })

  it('keeps a decimal below a hundred megabytes and drops it above', () => {
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB')
    expect(formatBytes(150 * 1024 * 1024)).toBe('150 MB')
  })
})
