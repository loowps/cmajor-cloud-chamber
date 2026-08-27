# Cloud Chamber Granular Synth

![The Cloud Chamber editor: a head's bands of controls under the waveform, with the loop region and
the eight scan heads drawn on it](screenshot.png)

A granular synthesiser, built as a [cmajor] patch with a [vuejs] UI.

Drop an audio file on it and eight independent heads read clouds of grains out of the one buffer.
Each head owns its loop region, its position and motion through it, and its own grain character, so
they layer rather than take turns. Played from MIDI, or left free-running as a drone.

#### 🔊 [Bandcamp] / [Soundcloud] / [Apple Music] / [Spotify]

---

## Building

```
pnpm install
pnpm build
```

`dist/` is then the patch bundle — `CloudChamber.cmajorpatch`, `CloudChamber.cmajor` and the
compiled `main.js` view — ready to load in a host.

#### Building a CLAP plugin

The [CLAP] headers are not part of cmajor, so clone them once next to this project:

```
git clone --depth 1 https://github.com/free-audio/clap.git ../clap
```

`pnpm run build-clap` then builds the ui and generates a self-contained CLAP plugin project into `dist-clap`,
with the include path to the CLAP headers already baked into its CMakeLists (the Vue gui is embedded into
the generated C++). Open that folder in your IDE, or build it from the command line:

```
cmake -S dist-clap -B dist-clap/build
cmake --build dist-clap/build --config Release
```

[CLAP]: https://github.com/free-audio/clap
[cmajor]: https://github.com/cmajor-lang/cmajor
[vuejs]: https://vuejs.org/
[Bandcamp]: https://loowps.bandcamp.com
[Soundcloud]: https://soundcloud.com/loowps
[Apple Music]: https://music.apple.com/us/artist/loowps/1326334750
[Spotify]: https://open.spotify.com/artist/2jOQrKX3rRoZORPfFcXaYU
