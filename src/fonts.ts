import type { PatchConnection } from '@/models/patch-connection.model'

const fontFaces = [
  { family: 'Khand', weight: '500', path: 'fonts/khand/Khand-Medium.ttf' },
  { family: 'Khand', weight: '600', path: 'fonts/khand/Khand-SemiBold.ttf' },
  { family: 'IBMPlexSans', weight: '400', path: 'fonts/ibm-plex/IBMPlexSans-Regular.ttf' },
  { family: 'IBMPlexSans', weight: '500', path: 'fonts/ibm-plex/IBMPlexSans-Medium.ttf' },
  { family: 'IBMPlexSans', weight: '600', path: 'fonts/ibm-plex/IBMPlexSans-SemiBold.ttf' },
  { family: 'IBMPlexSans', weight: '700', path: 'fonts/ibm-plex/IBMPlexSans-Bold.ttf' }
] as const

let requested = false

export function loadFonts(patchConnection?: PatchConnection) {
  if (requested || !('fonts' in document)) {
    return
  }

  requested = true

  for (const { family, weight, path } of fontFaces) {
    const url = patchConnection?.getResourceAddress(path) ?? path
    const face = new FontFace(family, `url("${url}") format("truetype")`, {
      weight,
      style: 'normal',
      display: 'swap'
    })

    face
      .load()
      .then((loaded) => document.fonts.add(loaded))
      .catch(() => console.warn(`Could not load font ${family} ${weight} from ${url}`))
  }
}
