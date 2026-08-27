import './assets/main.css'
import { createApp, type App as VueApp } from 'vue'
import { createPinia } from 'pinia'
import App from '@/App.vue'
import type { PatchConnection } from '@/models/patch-connection.model'
import { loadFonts } from '@/fonts'

const cmajViewElementTag = 'cmaj-view'
const styleSheetPath = 'assets/style.css'
const styleSheetId = 'cmaj-view-styles'

const mountWithoutStylesAfterMs = 1000

class CmajApp extends HTMLElement {
  private patchConnection?: PatchConnection
  private app?: VueApp<Element>

  constructor(patchConnection: PatchConnection) {
    super()
    this.patchConnection = patchConnection
  }

  connectedCallback() {
    if (this.app) {
      return
    }

    this.fillHostWindow()

    const stylesReady = this.injectStyleSheet()
    loadFonts(this.patchConnection)

    /// Mounting before the stylesheet arrives paints an unstyled frame.
    Promise.race([stylesReady, delay(mountWithoutStylesAfterMs)]).then(() => this.mountApp())
  }

  /**
   * The host pins the view to the width and height declared in the manifest, which are only meant
   * as the size the plugin window opens at. Overriding them inline, where the host wrote them, lets
   * the layout follow the window as the user resizes it.
   */
  private fillHostWindow() {
    this.style.width = '100%'
    this.style.height = '100%'
  }

  private mountApp() {
    if (this.app || !this.isConnected) {
      return
    }

    this.app = createApp(App).use(createPinia()).provide('patchConnection', this.patchConnection)

    this.app.mount(this)
  }

  disconnectedCallback() {
    this.app?.unmount()
    this.app = undefined
  }

  private injectStyleSheet(): Promise<void> {
    if (document.getElementById(styleSheetId)) {
      return Promise.resolve()
    }

    const href = this.patchConnection?.getResourceAddress(styleSheetPath) ?? styleSheetPath

    return new Promise<void>((resolve) => {
      const link = document.createElement('link')
      link.id = styleSheetId
      link.rel = 'stylesheet'
      link.href = href
      link.onload = () => resolve()
      link.onerror = () => {
        console.warn(`Could not load stylesheet from ${href}`)
        resolve()
      }
      document.head.appendChild(link)
    })
  }
}

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

if (!customElements.get(cmajViewElementTag)) {
  window.customElements.define(cmajViewElementTag, CmajApp)
}

export default function createPatchView(patchConnection: PatchConnection) {
  return new CmajApp(patchConnection)
}
