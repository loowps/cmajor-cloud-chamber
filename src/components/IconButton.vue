<script setup lang="ts">
export type IconName = 'power' | 'folder' | 'trash'

const { active = false } = defineProps<{
  name: IconName
  /// Filled rather than lit, for the one state that has to be readable from across the room.
  active?: boolean
}>()
</script>

<template>
  <button type="button" class="icon-button" :class="{ active }">
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <template v-if="name === 'power'">
        <path
          d="M8 2.4v5.1"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <path
          d="M4.8 4.9a4.6 4.6 0 1 0 6.4 0"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </template>

      <template v-else-if="name === 'folder'">
        <path
          d="M2.2 4.6a1.2 1.2 0 0 1 1.2-1.2h2.7l1.3 1.7h5a1.2 1.2 0 0 1 1.2 1.2v5.5a1.2 1.2 0 0 1-1.2 1.2H3.4a1.2 1.2 0 0 1-1.2-1.2z"
          fill="currentColor"
        />
      </template>

      <template v-else>
        <path d="M6.3 2.3h3.4v1.3H6.3z" fill="currentColor" />
        <path d="M2.9 4.3h10.2v1.4H2.9z" fill="currentColor" />
        <path
          d="M4.4 6.7h7.2l-.6 6.1a1.1 1.1 0 0 1-1.1 1H6.1a1.1 1.1 0 0 1-1.1-1z"
          fill="currentColor"
        />
      </template>
    </svg>
  </button>
</template>

<style lang="scss" scoped>
/// One size for every square control in the window, so a button never has to be measured against
/// the band it happens to be sitting in.
.icon-button {
  width: var(--control-size);
  height: var(--control-size);
  flex: none;
  display: grid;
  place-items: center;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: var(--bg-control);
  color: var(--text-dim);
  cursor: pointer;
  transition:
    background var(--dur-control),
    color var(--dur-control),
    opacity var(--dur-control);
}

svg {
  width: 13px;
  height: 13px;
}

.icon-button:hover:not(:disabled) {
  background: var(--bg-control-hover);
  color: var(--text);
}

.icon-button:active:not(:disabled) {
  background: var(--accent-dim);
  color: var(--accent-ink);
}

.icon-button.active {
  background: var(--accent);
  color: var(--accent-ink);
}

/// An on button brightens under the pointer rather than dropping back to the inert fill, so the
/// hover answers the pointer without hiding what the button is.
.icon-button.active:hover:not(:disabled) {
  background: var(--accent-bright);
  color: var(--accent-ink);
}

.icon-button.active:active:not(:disabled) {
  background: var(--accent-dim);
  color: var(--accent-ink);
}

.icon-button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
