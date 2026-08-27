<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { usePatchSync } from '@/composables/usePatchSync'
import { formatBytes, formatClock } from '@/models/sample.model'
import { canSaveWithProject, maxStoredBytes, storedByteLength } from '@/composables/useStoredSample'
import IconButton from '@/components/IconButton.vue'

const { hovered = false } = defineProps<{
  /// The waveform is the thing being pointed at, so it is the thing that knows.
  hovered?: boolean
}>()

const store = useGranularStore()
const { transfer, hasSample, engineSeconds, canClear, sample } = storeToRefs(store)
const patchSync = usePatchSync()

const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

/// What the window is showing rather than what the plugin is playing: the two part company for as
/// long as it takes a reopened window to decode the sample back out of the stored state.
const title = computed(() => (hasSample.value ? sample.value?.name : 'Sample held by engine'))

const detail = computed(() => {
  const loaded = sample.value

  if (!loaded) {
    return formatClock(engineSeconds.value)
  }

  const length = formatClock(loaded.durationSeconds)
  const rate = `${(loaded.sampleRate / 1000).toFixed(1)} kHz`

  return loaded.wasDownsampled ? `${length} · resampled to ${rate}` : `${length} · ${rate}`
})

/**
 * What the sample costs the project it is saved into, said while it can still be swapped for a
 * smaller one. It is the encoded size rather than the file's own, because base64 is what the
 * stored state carries and four thirds of a big file is a difference worth knowing about.
 *
 * Only the editor's own sample can be measured: a sample the patch is holding from a project
 * reopened without its window has never been a file here, so there is nothing to weigh.
 */
const storage = computed(() => {
  const loaded = sample.value

  if (!loaded) {
    return undefined
  }

  return canSaveWithProject(loaded.fileBytes)
    ? { text: `${formatBytes(storedByteLength(loaded.fileBytes))} in project`, dropped: false }
    : { text: `not saved, over ${formatBytes(maxStoredBytes)}`, dropped: true }
})

/**
 * Held open while there is nothing loaded as well as while the pointer is over the waveform: with
 * no sample there is no waveform to hover over and nothing on screen would say a file could be
 * chosen rather than dropped.
 */
const showsActions = computed(() => hovered || !canClear.value)

const isFailed = computed(() => transfer.value.phase === 'failed')

function onSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (file) {
    void patchSync.dropSample(file)
  }

  input.value = ''
}
</script>

<template>
  <!--
    Nothing here takes the pointer except the buttons: the waveform underneath is dragged to set
    the loop region, and a chip in the corner that swallowed a press would make the first inch of
    the sample unreachable.
  -->
  <div class="overlay">
    <input ref="fileInput" type="file" accept="audio/*" hidden @change="onSelected" />

    <div v-if="canClear" class="identity">
      <span class="name">{{ title }}</span>
      <span class="detail">
        <span>{{ detail }}</span>
        <span v-if="storage" class="storage" :class="{ dropped: storage.dropped }">
          {{ storage.text }}
        </span>
      </span>
    </div>

    <p v-if="!canClear" class="placeholder">Drop an audio file to fill the buffer</p>

    <!--
      `pointerdown.stop` so a press on a button is not also the start of a loop-region drag on the
      waveform behind it.
    -->
    <div class="actions" :class="{ shown: showsActions }" @pointerdown.stop>
      <IconButton name="folder" title="Choose an audio file" @click="fileInput?.click()" />
      <IconButton
        name="trash"
        title="Clear the sample"
        :disabled="!canClear"
        @click="patchSync.clearSample()"
      />
    </div>

    <div v-if="store.isLoading || isFailed" class="transfer" :class="{ failed: isFailed }">
      <span class="message">{{ transfer.message }}</span>
      <div v-if="store.isLoading" class="bar">
        <div class="fill" :style="{ width: `${transfer.progress * 100}%` }" />
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/**
 * Sunk into the corner of the waveform on a wash of the panel rather than in a well of its own:
 * the sample's name is a caption on what is being drawn, and a solid box would read as a control
 * sitting on top of it. The wash is what keeps it legible over a loud passage.
 */
.identity {
  position: absolute;
  top: var(--space-3);
  left: var(--space-3);
  max-width: 40%;
  display: flex;
  flex-direction: column;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--bg-panel) 78%, transparent);
}

.name {
  font-size: var(--text-label);
  color: var(--text-soft);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--text-micro);
  font-variant-numeric: tabular-nums;
  color: var(--text-faint);
}

/// The same separator the properties use between themselves, so what the sample costs reads as
/// one more of its properties rather than as a remark appended to them.
.storage::before {
  content: '·';
  margin-right: var(--space-2);
}

/// Brass only when the audio is being left behind, which is the one case the user has to act on.
.storage.dropped {
  color: var(--accent);
}

.placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: var(--text-label);
  color: var(--text-faint);
}

/**
 * Out of the way until the pointer is on the waveform, because they are the only two things in
 * the window that throw a sample away or replace one and they should not be sitting under the
 * cursor the rest of the time. Focus brings them back for anyone arriving by keyboard, who has
 * no hover to offer.
 */
.actions {
  position: absolute;
  top: var(--space-3);
  right: var(--space-3);
  display: flex;
  gap: var(--space-3);
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--dur-control);
}

.actions.shown,
.actions:focus-within {
  opacity: 1;
  pointer-events: auto;
}

/**
 * Across the whole waveform rather than in a corner: the transfer is the one time the window is
 * showing something it cannot yet draw, and the scrim is what says so.
 */
.transfer {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  background: color-mix(in srgb, var(--bg-sunken) 72%, transparent);
}

.message {
  font-size: var(--text-label);
  color: var(--text-soft);
}

.transfer.failed .message {
  color: var(--accent);
}

.bar {
  width: 40%;
  max-width: 320px;
  height: 3px;
  border-radius: var(--radius-sm);
  background: var(--range-track);
  overflow: hidden;
}

.fill {
  height: 100%;
  background: var(--accent);
  transition: width var(--dur-signal);
}
</style>
