import createPatchView from '@/main'
import { createMockPatchConnection } from '@/dev/mock-patch-connection'

document.querySelector('#app')?.appendChild(createPatchView(createMockPatchConnection()))
