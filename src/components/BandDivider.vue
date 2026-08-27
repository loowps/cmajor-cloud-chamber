<template>
  <span class="band-divider" />
</template>

<style scoped lang="scss">
/**
 * The groove that parts one band from the next, stood on end: a bar of controls reads as groups
 * rather than one long row. Full-bleed, so it meets the rules above and below it instead of
 * floating inside the band's own padding - the bands cancel their inset from it themselves,
 * because only they know what they set.
 */
.band-divider {
  flex: none;
  align-self: stretch;
  width: 1px;
  background: var(--seam);
}
</style>
