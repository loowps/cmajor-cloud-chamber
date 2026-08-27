<script setup lang="ts">
import { useTemplateRef } from 'vue'
import VendorLogo from '@/components/VendorLogo.vue'
import pkg from '../../package.json'

interface MusicLink {
  label: string
  url: string
}

const musicLinks: MusicLink[] = [
  { label: 'Bandcamp', url: 'https://loowps.bandcamp.com' },
  { label: 'Soundcloud', url: 'https://soundcloud.com/loowps' },
  { label: 'Apple Music', url: 'https://music.apple.com/us/artist/loowps/1326334750' },
  { label: 'Spotify', url: 'https://open.spotify.com/artist/2jOQrKX3rRoZORPfFcXaYU' }
]

const dialog = useTemplateRef<HTMLDialogElement>('dialog')

function open() {
  dialog.value?.showModal()
}

function close() {
  dialog.value?.close()
}

/// A click on the backdrop reports the dialog itself as its target, never the sheet inside it.
function closeWhenBackdropClicked(event: MouseEvent) {
  if (event.target === dialog.value) {
    close()
  }
}

defineExpose({ open })
</script>

<template>
  <dialog ref="dialog" class="about" @click="closeWhenBackdropClicked">
    <div class="sheet">
      <button class="close" aria-label="Close" title="Close" @click="close">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M4.8 4.8 11.2 11.2M11.2 4.8 4.8 11.2"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>

      <VendorLogo class="vendor" />

      <div class="identity">
        <span class="name">Cloud Chamber</span>
        <span class="version">v{{ pkg.version }}</span>
      </div>

      <ul class="links">
        <li v-for="link in musicLinks" :key="link.url">
          <a :href="link.url" target="_blank" rel="noreferrer">{{ link.label }}</a>
        </li>
      </ul>
    </div>
  </dialog>
</template>

<style scoped lang="scss">
.about {
  /* The global `* { margin: 0 }` reset outranks the user agent rule that centres a modal
     dialog through its auto margins, so it has to be asked for again here. */
  margin: auto;
  padding: 0;
  border: none;
  background: transparent;

  &::backdrop {
    background: rgb(10 12 15 / 62%);
  }
}

.sheet {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-6);
  min-width: 268px;
  padding: var(--space-8);
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  color: var(--text);
}

.vendor {
  color: var(--text);
  font-size: var(--text-display);
}

.identity {
  display: flex;
  align-items: baseline;
  gap: var(--space-4);
}

.name {
  --name-tracking: 0.18em;

  color: var(--text-dim);
  font-family: var(--font-display);
  font-size: var(--text-body);
  letter-spacing: var(--name-tracking);
  margin-right: calc(-1 * var(--name-tracking));
  text-transform: uppercase;
  white-space: nowrap;
}

.version {
  color: var(--text-faint);
  font-family: var(--font-mono);
  font-size: var(--text-small);
}

.links {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;

  a {
    display: block;
    padding: var(--space-3) var(--space-5);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text-dim);
    font-size: var(--text-label);
    text-align: center;
    text-decoration: none;
    transition:
      background-color var(--dur-control),
      border-color var(--dur-control),
      color var(--dur-control);

    &:hover {
      background: var(--bg-control-hover);
      border-color: var(--accent-dim);
      color: var(--text);
    }
  }
}

.close {
  position: absolute;
  top: var(--space-4);
  right: var(--space-4);
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: var(--radius);
  color: var(--text-faint);
  cursor: pointer;
  transition:
    background-color var(--dur-control),
    color var(--dur-control);

  svg {
    width: 11px;
    height: 11px;
  }

  &:hover {
    background: var(--bg-control-hover);
    color: var(--text);
  }
}
</style>
