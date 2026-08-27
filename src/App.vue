<script setup lang="ts">
import HomeView from '@/views/HomeView.vue'
import FooterComponent from '@/components/FooterComponent.vue'
import { providePatchSync } from '@/composables/usePatchSync'
import { useFileDrop } from '@/composables/useFileDrop'
import { useGranularStore } from '@/stores/granular'

/// Owned by the app rather than a view: the patch traffic must outlive anything below it.
const patchSync = providePatchSync()
const store = useGranularStore()

/// Likewise owned here, because the target is the window rather than any band inside it.
useFileDrop({
  onFile: (file) => patchSync.dropSample(file),
  onDragChange: (isDragging) => store.setDraggingFile(isDragging)
})
</script>

<template>
  <div class="layout">
    <div class="main">
      <HomeView />
    </div>

    <FooterComponent />
  </div>
</template>

<style lang="scss" scoped>
/**
 * Scrolls sideways as one piece, so the footer keeps its edges lined up with the bands above it.
 * Vertical overflow is clipped here because the view runs its own vertical scroller, and the
 * document itself is never allowed to scroll - that is what would fetch the browser's own bars.
 */
.layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: auto hidden;
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
  background: var(--bg-app);
}

.layout > * {
  min-width: var(--view-min-width);
}

.main {
  flex: 1;
  min-height: 0;
  display: flex;
}

.main > * {
  flex: 1;
  min-height: 0;
}
</style>
