import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  definitionFor,
  enableEndpointFor,
  engine,
  formatParameter,
  globalParameterRows,
  headDefinitions,
  headEndpoint,
  headParameterRows,
  normalisedToValue,
  parameterBands,
  parameterDefinitions,
  parameterEditText,
  parameterReadout,
  parseParameter,
  valueToNormalised,
  type ParameterDefinition
} from '@/models/granular.model'

/// Read off disk rather than imported, because the point is to catch the patch drifting from the
/// editor's copy of its constants - which a build step that reconciled them would hide.
const patchSource = readFileSync(resolve('public/CloudChamber.cmajor'), 'utf8')

function patchConstant(name: string): number {
  const match = patchSource.match(new RegExp(`let\\s+${name}\\s*=\\s*(\\d+)`))

  return Number(match?.[1])
}

/**
 * The invariants CLAUDE.md names as spanning both halves. A chunk struct is a fixed width on the
 * patch side, so a mismatch here does not fail loudly - it silently truncates every transfer.
 */
describe('constants shared with the patch', () => {
  it.each(['maxSampleFrames', 'chunkFrames', 'headCount'] as const)(
    '%s matches CloudChamber.cmajor',
    (name) => {
      expect(patchConstant(name)).toBe(engine[name])
    }
  )

  it('sizes the buffer to the hour it advertises', () => {
    expect(engine.maxSampleFrames / engine.maxSampleSeconds).toBeGreaterThan(engine.minSampleRate)
  })
})

describe('headEndpoint', () => {
  it('is one-based and capitalises the id', () => {
    expect(headEndpoint(0, 'enable')).toBe('h1EnableIn')
    expect(headEndpoint(7, 'loopStart')).toBe('h8LoopStartIn')
  })

  it('names endpoints the patch actually declares', () => {
    for (const definition of headDefinitions.flat()) {
      expect(patchSource).toContain(definition.endpoint)
    }
  })
})

describe('the parameter set', () => {
  it('is twenty per head plus eight globals', () => {
    expect(headDefinitions).toHaveLength(engine.headCount)
    expect(headDefinitions.every((head) => head.length === 20)).toBe(true)
    expect(parameterDefinitions).toHaveLength(engine.headCount * 20 + 8)
  })

  it('gives every parameter a unique endpoint', () => {
    const endpoints = new Set(parameterDefinitions.map((d) => d.endpoint))

    expect(endpoints.size).toBe(parameterDefinitions.length)
  })

  it('starts an initial value inside its own range', () => {
    for (const definition of parameterDefinitions) {
      expect(definition.initial).toBeGreaterThanOrEqual(definition.min)
      expect(definition.initial).toBeLessThanOrEqual(definition.max)
    }
  })

  it('enables head one and nothing else', () => {
    const enabled = headDefinitions.map(
      (head, index) => head.find((d) => d.endpoint === enableEndpointFor(index))?.initial
    )

    expect(enabled).toEqual([1, 0, 0, 0, 0, 0, 0, 0])
  })

  it('resolves a definition by endpoint and nothing by a name that is not one', () => {
    expect(definitionFor('h3PitchIn')?.label).toBe('Pitch')
    expect(definitionFor('h3PitchIn')?.head).toBe(2)
    expect(definitionFor('gainIn')?.head).toBeUndefined()
    expect(definitionFor('nope')).toBeUndefined()
  })
})

describe('rows', () => {
  it('folds a jitter onto the row of the value it scatters', () => {
    const source = headParameterRows(0, 'source')
    const position = source.find((row) => row.definition.endpoint === 'h1PositionIn')

    expect(position?.secondary?.endpoint).toBe('h1SprayIn')
  })

  it('never gives a jitter a row of its own', () => {
    const drawn = parameterBands
      .flat()
      .flatMap((group) => headParameterRows(0, group.id))
      .map((row) => row.definition.endpoint)

    expect(drawn).not.toContain('h1SprayIn')
    expect(drawn).not.toContain('h1SizeJitterIn')
    expect(drawn).not.toContain('h1RateJitterIn')
  })

  it('draws rows for the head asked for, not for head one', () => {
    expect(headParameterRows(4, 'grain').every((row) => row.definition.head === 4)).toBe(true)
  })

  it('never scatters a global', () => {
    const globals = [...globalParameterRows('amp'), ...globalParameterRows('engine')]

    expect(globals).toHaveLength(6)
    expect(globals.every((row) => row.secondary === undefined)).toBe(true)
  })

  it('lays out an even number of groups per band, which the track width depends on', () => {
    for (const band of parameterBands) {
      expect(band.length).toBe(2)
    }
  })
})

describe('the taper', () => {
  const density = definitionFor('h1DensityIn') as ParameterDefinition
  const pan = definitionFor('h1PanIn') as ParameterDefinition

  it('puts a named centre at half travel', () => {
    expect(normalisedToValue(density, 0.5)).toBeCloseTo(density.centre as number, 4)
    expect(valueToNormalised(density, density.centre as number)).toBeCloseTo(0.5, 4)
  })

  it('leaves an untapered parameter linear', () => {
    expect(normalisedToValue(pan, 0.5)).toBeCloseTo(0, 6)
    expect(normalisedToValue(pan, 0.75)).toBeCloseTo(0.5, 6)
  })

  it('round trips every parameter across its range', () => {
    for (const definition of parameterDefinitions) {
      for (const normalised of [0, 0.25, 0.5, 0.75, 1]) {
        const value = normalisedToValue(definition, normalised)

        expect(valueToNormalised(definition, value)).toBeCloseTo(normalised, 5)
      }
    }
  })

  it('clamps rather than running off either end', () => {
    expect(normalisedToValue(pan, -3)).toBe(pan.min)
    expect(normalisedToValue(pan, 3)).toBe(pan.max)
    expect(valueToNormalised(pan, -99)).toBe(0)
    expect(valueToNormalised(pan, 99)).toBe(1)
  })
})

describe('readouts', () => {
  const enable = definitionFor('h1EnableIn') as ParameterDefinition
  const spray = definitionFor('h1SprayIn') as ParameterDefinition
  const pitch = definitionFor('h1PitchIn') as ParameterDefinition
  const size = definitionFor('h1SizeIn') as ParameterDefinition

  it('reads a toggle as a word and keeps no unit for it', () => {
    expect(parameterReadout(enable, 1)).toEqual({ value: 'On', unit: '' })
    expect(parameterReadout(enable, 0)).toEqual({ value: 'Off', unit: '' })
    expect(parameterReadout(enable, 0.5)).toEqual({ value: 'On', unit: '' })
  })

  it('scales a percentage to 0..100 without moving the stored value', () => {
    expect(parameterReadout(spray, 0.25)).toEqual({ value: '25.0', unit: '%' })
  })

  it('signs a bipolar parameter only when it is above zero', () => {
    expect(parameterReadout(pitch, 7).value).toBe('+7')
    expect(parameterReadout(pitch, -7).value).toBe('-7')
    expect(parameterReadout(pitch, 0).value).toBe('0')
  })

  it('parts the number from its unit, and rejoins them where only one string fits', () => {
    expect(formatParameter(size, 120)).toBe('120 ms')
    expect(formatParameter(enable, 1)).toBe('On')
  })

  it('opens a text field on the bare number the readout is showing', () => {
    expect(parameterEditText(spray, 0.25)).toBe('25.0')
    expect(parameterEditText(size, 120)).toBe('120')
  })
})

describe('parseParameter', () => {
  const spray = definitionFor('h1SprayIn') as ParameterDefinition
  const pitch = definitionFor('h1PitchIn') as ParameterDefinition

  it('takes back what the readout wrote', () => {
    expect(parseParameter(spray, parameterEditText(spray, 0.25))).toBeCloseTo(0.25, 6)
  })

  it('accepts a decimal comma and surrounding space', () => {
    expect(parseParameter(pitch, ' 7,5 ')).toBeCloseTo(7.5, 6)
  })

  it('clamps out of range rather than refusing it', () => {
    expect(parseParameter(pitch, '999')).toBe(pitch.max)
    expect(parseParameter(pitch, '-999')).toBe(pitch.min)
  })

  it('returns nothing for text that holds no number', () => {
    expect(parseParameter(pitch, '')).toBeUndefined()
    expect(parseParameter(pitch, 'loud')).toBeUndefined()
  })
})
