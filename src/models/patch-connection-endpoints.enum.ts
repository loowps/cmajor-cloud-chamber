/**
 * The endpoints whose names are fixed. Every parameter is one too, but the 160 per-head ones are
 * generated - see headEndpoint in granular.model.ts, which is where that convention lives.
 */
export enum PatchConnectionEndpoint {
  SampleBegin = 'sampleBeginIn',
  SampleChunk = 'sampleChunkIn',
  SampleEnd = 'sampleEndIn',
  SampleProgress = 'sampleProgressOut',

  MidiIn = 'midiIn',

  GrainOut = 'grainOut',
  StateOut = 'stateOut'
}
