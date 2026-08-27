/**
 * Mirrors the constants declared in CloudChamber.cmajor. The patch is the authority on all of them -
 * these copies exist so the editor can size a transfer and label a limit without asking.
 */
export const engine = {
  /// Must equal maxSampleFrames in CloudChamber.cmajor.
  maxSampleFrames: 33554432,
  /// Must equal chunkFrames in CloudChamber.cmajor.
  chunkFrames: 2048,
  /// Must equal headCount in CloudChamber.cmajor.
  headCount: 8,
  maxSampleSeconds: 3600,
  /// OfflineAudioContext refuses rates outside this range, so it is the floor a long file lands on.
  minSampleRate: 8000,
  maxSampleRate: 96000
} as const

/**
 * `header`, `output` and `footer` are the three groups `parameterBands` does not lay out,
 * because the frame draws them itself. The first two are the head as a whole - the switch that
 * sounds it, and the values that come out of it - and `footer` is the instrument's own frame:
 * Free Run, and the output fader the level meter is drawn on. They are groups all the same,
 * because a parameter belonging to none would have to be filtered by name.
 */
export type ParameterGroupId =
  'header' | 'footer' | 'output' | 'source' | 'grain' | 'amp' | 'engine'

export interface ParameterDefinition {
  endpoint: string
  label: string
  group: ParameterGroupId
  min: number
  max: number
  initial: number
  unit: string
  decimals: number
  /**
   * Positions the control's midpoint at this value rather than at the arithmetic middle. Density
   * and grain size are read logarithmically by ear, so an untapered track would spend most of its
   * travel in a range nobody sets.
   */
  centre?: number
  /// Drawn from the middle outwards rather than from the minimum, for anything signed.
  bipolar?: boolean
  toggle?: boolean
  /// Which head owns it. Absent on the globals, which belong to the instrument.
  head?: number
}

/// One head's worth, before it is stamped out for each of the eight.
type HeadParameterSpec = Omit<ParameterDefinition, 'endpoint' | 'head'> & {
  id: string
  /**
   * The id of the parameter this one is the spread of, so it is drawn on that parameter's row as
   * a `±` beside the value rather than in a row of its own. It stays a full parameter either way
   * - the host sees no difference - but a jitter has no meaning apart from the value it scatters,
   * and a row of its own claimed it did.
   *
   * Kept here rather than on `ParameterDefinition` because the pairing is a property of the
   * parameter set, not of a head: all eight pair the same way, by the same two ids.
   */
  annotates?: string
}

const headParameterSpecs: HeadParameterSpec[] = [
  {
    id: 'enable',
    label: 'Enable',
    group: 'header',
    min: 0,
    max: 1,
    initial: 0,
    unit: '',
    decimals: 0,
    toggle: true
  },
  {
    id: 'level',
    label: 'Level',
    group: 'output',
    min: -60,
    max: 6,
    initial: -6,
    unit: 'dB',
    decimals: 1,
    bipolar: true
  },
  {
    id: 'levelJitter',
    label: 'Level Jitter',
    group: 'output',
    annotates: 'level',
    min: 0,
    max: 1,
    initial: 0,
    unit: '%',
    decimals: 1
  },
  {
    id: 'pan',
    label: 'Pan',
    group: 'output',
    min: -1,
    max: 1,
    initial: 0,
    unit: '',
    decimals: 2,
    bipolar: true
  },
  {
    id: 'panSpread',
    label: 'Pan Spread',
    group: 'output',
    annotates: 'pan',
    min: 0,
    max: 1,
    initial: 0.4,
    unit: '%',
    decimals: 1
  },
  {
    id: 'pitch',
    label: 'Pitch',
    group: 'output',
    min: -24,
    max: 24,
    initial: 0,
    unit: 'st',
    decimals: 0,
    bipolar: true
  },
  {
    id: 'pitchJitter',
    label: 'Pitch Jitter',
    group: 'output',
    annotates: 'pitch',
    min: 0,
    max: 1200,
    initial: 0,
    unit: 'ct',
    decimals: 0,
    centre: 100
  },
  {
    id: 'fine',
    label: 'Fine',
    group: 'output',
    min: -100,
    max: 100,
    initial: 0,
    unit: 'ct',
    decimals: 0,
    bipolar: true
  },

  {
    id: 'position',
    label: 'Position',
    group: 'source',
    min: 0,
    max: 1,
    initial: 0,
    unit: '%',
    decimals: 1
  },
  {
    id: 'spray',
    label: 'Spray',
    group: 'source',
    annotates: 'position',
    min: 0,
    max: 1,
    initial: 0.02,
    unit: '%',
    decimals: 1
  },
  {
    id: 'motion',
    label: 'Motion',
    group: 'source',
    min: -4,
    max: 4,
    initial: 0.25,
    unit: 'x',
    decimals: 2,
    bipolar: true
  },
  {
    id: 'loopStart',
    label: 'Loop Start',
    group: 'source',
    min: 0,
    max: 1,
    initial: 0,
    unit: '%',
    decimals: 1
  },
  {
    id: 'loopLength',
    label: 'Loop Length',
    group: 'source',
    min: 0,
    max: 1,
    initial: 1,
    unit: '%',
    decimals: 1
  },

  {
    id: 'size',
    label: 'Size',
    group: 'grain',
    min: 1,
    max: 10000,
    initial: 120,
    unit: 'ms',
    decimals: 0,
    /// The geometric middle of 1 and 10000, so the track is very nearly a true log sweep.
    centre: 100
  },
  {
    id: 'sizeJitter',
    label: 'Size Jitter',
    group: 'grain',
    annotates: 'size',
    min: 0,
    max: 1,
    initial: 0,
    unit: '%',
    decimals: 1
  },
  {
    id: 'density',
    label: 'Density',
    group: 'grain',
    min: 0.1,
    max: 1600,
    initial: 24,
    unit: 'Hz',
    decimals: 1,
    centre: 20
  },
  {
    id: 'rateJitter',
    label: 'Rate Jitter',
    group: 'grain',
    annotates: 'density',
    min: 0,
    max: 1,
    initial: 0,
    unit: '%',
    decimals: 1
  },
  {
    id: 'reverse',
    label: 'Reverse',
    group: 'grain',
    min: 0,
    max: 1,
    initial: 0,
    unit: '%',
    decimals: 1
  },

  {
    id: 'shape',
    label: 'Shape',
    group: 'grain',
    min: 0,
    max: 1,
    initial: 1,
    unit: '%',
    decimals: 1
  },
  {
    id: 'skew',
    label: 'Skew',
    group: 'grain',
    min: 0,
    max: 1,
    initial: 0.5,
    unit: '%',
    decimals: 1,
    bipolar: true
  }
]

const globalParameterDefinitions: ParameterDefinition[] = [
  {
    endpoint: 'attackIn',
    label: 'Attack',
    group: 'amp',
    min: 0,
    max: 8000,
    initial: 20,
    unit: 'ms',
    decimals: 0,
    centre: 300
  },
  {
    endpoint: 'decayIn',
    label: 'Decay',
    group: 'amp',
    min: 0,
    max: 8000,
    initial: 400,
    unit: 'ms',
    decimals: 0,
    centre: 300
  },
  {
    endpoint: 'sustainIn',
    label: 'Sustain',
    group: 'amp',
    min: 0,
    max: 1,
    initial: 1,
    unit: '%',
    decimals: 1
  },
  {
    endpoint: 'releaseIn',
    label: 'Release',
    group: 'amp',
    min: 0,
    max: 8000,
    initial: 600,
    unit: 'ms',
    decimals: 0,
    centre: 300
  },

  {
    endpoint: 'keyTrackIn',
    label: 'Key Track',
    group: 'engine',
    min: 0,
    max: 1,
    initial: 1,
    unit: '%',
    decimals: 1
  },
  {
    endpoint: 'freeRunIn',
    label: 'Free Run',
    group: 'footer',
    min: 0,
    max: 1,
    initial: 0,
    unit: '',
    decimals: 0,
    toggle: true
  },
  {
    endpoint: 'rootNoteIn',
    label: 'Root Note',
    group: 'engine',
    min: 0,
    max: 127,
    initial: 60,
    unit: '',
    decimals: 0
  },
  {
    endpoint: 'gainIn',
    label: 'Output',
    group: 'footer',
    min: -60,
    max: 12,
    initial: -6,
    unit: 'dB',
    decimals: 1,
    bipolar: true
  }
]

/**
 * The endpoint a head's parameter travels on. Named to match CloudChamber.cmajor, where all 160 are
 * declared one at a time because the language has no top-level arrays of inputs - so this is the
 * only place the naming convention is written down on this side.
 */
export function headEndpoint(head: number, id: string): string {
  return `h${head + 1}${id[0].toUpperCase()}${id.slice(1)}In`
}

/// Head one is the only one on to start with: eight heads at once is a wall of sound, not a preset.
function initialFor(spec: HeadParameterSpec, head: number): number {
  return spec.id === 'enable' ? (head === 0 ? 1 : 0) : spec.initial
}

function definitionsForHead(head: number): ParameterDefinition[] {
  return headParameterSpecs.map(({ id, ...rest }) => ({
    ...rest,
    endpoint: headEndpoint(head, id),
    initial: initialFor({ id, ...rest }, head),
    head
  }))
}

export const headDefinitions: ParameterDefinition[][] = Array.from(
  { length: engine.headCount },
  (_, head) => definitionsForHead(head)
)

export const parameterDefinitions: ParameterDefinition[] = [
  ...headDefinitions.flat(),
  ...globalParameterDefinitions
]

const definitionsByEndpoint = new Map(parameterDefinitions.map((d) => [d.endpoint, d]))

export function definitionFor(endpoint: string): ParameterDefinition | undefined {
  return definitionsByEndpoint.get(endpoint)
}

/**
 * One line of a group: the parameter, and the spread of it drawn beside its value where there is
 * one. A row rather than a definition, because whether a parameter is scattered is a fact about
 * the parameter set and not something a control should have to look up for itself.
 */
export interface ParameterRow {
  definition: ParameterDefinition
  secondary?: ParameterDefinition
}

/// Built once from the ids the specs name, keyed by what is annotated rather than by what does
/// the annotating - which is the direction a row is assembled in.
const secondarySpecsByTarget = new Map(
  headParameterSpecs
    .filter((spec) => spec.annotates !== undefined)
    .map((spec) => [spec.annotates as string, spec])
)

export function headParameterRows(head: number, group: ParameterGroupId): ParameterRow[] {
  return headParameterSpecs
    .filter((spec) => spec.group === group && spec.annotates === undefined)
    .map((spec) => {
      const secondary = secondarySpecsByTarget.get(spec.id)

      return {
        definition: headDefinitions[head].find(
          (d) => d.endpoint === headEndpoint(head, spec.id)
        ) as ParameterDefinition,
        secondary: secondary && definitionFor(headEndpoint(head, secondary.id))
      }
    })
}

/// The instrument's own parameters are never scattered, so every one of them is a row on its own.
export function globalParameterRows(group: ParameterGroupId): ParameterRow[] {
  return globalParameterDefinitions
    .filter((d) => d.group === group)
    .map((definition) => ({ definition }))
}

export function enableEndpointFor(head: number): string {
  return headEndpoint(head, 'enable')
}

export interface ParameterGroup {
  id: ParameterGroupId
  label: string
  /// Globals belong to the instrument, so they are drawn from the same set whichever head is up.
  isGlobal?: boolean
}

/**
 * Groups arranged into the bands they are read in, rather than left to wrap. The first two bands
 * are the selected head; the last is the instrument, and does not change when the head does.
 */
export const parameterBands: ParameterGroup[][] = [
  [
    { id: 'source', label: 'Source' },
    { id: 'grain', label: 'Grain' }
  ],
  [
    { id: 'amp', label: 'Amplitude', isGlobal: true },
    { id: 'engine', label: 'Engine', isGlobal: true }
  ]
]

/**
 * A track runs in a straight line; the value under it need not. Where a definition names a
 * centre, the taper is the power that puts that value at half travel, which is what makes the
 * useful half of a range like 0.1..1600Hz occupy half the track rather than a tenth of it.
 */
function taperFor(definition: ParameterDefinition): number {
  if (definition.centre === undefined) {
    return 1
  }

  const normalisedCentre = (definition.centre - definition.min) / (definition.max - definition.min)

  return Math.log(normalisedCentre) / Math.log(0.5)
}

export function valueToNormalised(definition: ParameterDefinition, value: number): number {
  const span = definition.max - definition.min

  if (span === 0) {
    return 0
  }

  const linear = (value - definition.min) / span

  return Math.pow(Math.min(Math.max(linear, 0), 1), 1 / taperFor(definition))
}

export function normalisedToValue(definition: ParameterDefinition, normalised: number): number {
  const clamped = Math.min(Math.max(normalised, 0), 1)
  const tapered = Math.pow(clamped, taperFor(definition))

  return definition.min + tapered * (definition.max - definition.min)
}

export interface ParameterReadout {
  value: string
  unit: string
}

/**
 * The number and the unit part company because they are not read together: the number is what is
 * being watched and the unit only says what it is measured in, so the readout can hold the unit
 * back as the caption it is and leave the eye landing on the value.
 *
 * Percentages are stored 0..1 but read as 0..100, which is the one place display and value part.
 */
export function parameterReadout(definition: ParameterDefinition, value: number): ParameterReadout {
  if (definition.toggle) {
    return { value: value >= 0.5 ? 'On' : 'Off', unit: '' }
  }

  if (definition.unit === '%') {
    return { value: (value * 100).toFixed(definition.decimals), unit: '%' }
  }

  const sign = definition.bipolar && value > 0 ? '+' : ''

  return { value: `${sign}${value.toFixed(definition.decimals)}`, unit: definition.unit }
}

/// The same reading as one string, for the places that can only carry one - a title, or the value
/// a screen reader is given.
export function formatParameter(definition: ParameterDefinition, value: number): string {
  const readout = parameterReadout(definition, value)

  return readout.unit ? `${readout.value} ${readout.unit}` : readout.value
}

/// What a text field opens on: the number the readout is showing, without its unit.
export function parameterEditText(definition: ParameterDefinition, value: number): string {
  const scaled = definition.unit === '%' ? value * 100 : value

  return scaled.toFixed(definition.decimals)
}

/**
 * The inverse of formatParameter, and deliberately looser than it: the readout's own text typed
 * back, a bare number, a decimal comma. Out of range is clamped rather than refused, because a
 * control cannot show a value it could not have been dragged to.
 */
export function parseParameter(definition: ParameterDefinition, text: string): number | undefined {
  const typed = Number.parseFloat(text.trim().replace(',', '.'))

  if (!Number.isFinite(typed)) {
    return undefined
  }

  const value = definition.unit === '%' ? typed / 100 : typed

  return Math.min(Math.max(value, definition.min), definition.max)
}
