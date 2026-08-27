<template>
  <span class="vendor-logo" aria-label="Loowps">L<span class="slashes">//</span>WPS</span>
</template>

<style scoped lang="scss">
/**
 * Only scale is left to whatever places the logo: its proportions belong to the mark itself.
 * Tracking follows the last letter too, so the negative margin gives back the step of space it
 * leaves to the right of the ink - which is what lets the mark sit flush against a right edge.
 */
.vendor-logo {
  --mark-tracking: 0.16em;

  font-family: var(--font-display);
  font-weight: 600;
  letter-spacing: var(--mark-tracking);
  margin-right: calc(-1 * var(--mark-tracking));
  white-space: nowrap;
}

/**
 * The slash glyph overshoots the cap height and dips below the baseline, so it is trimmed and
 * lifted to sit between them. The margins are lopsided on purpose: tracking follows every letter,
 * so the L already trails a gap into the slashes while only their own narrow spacing separates
 * them from the W - an even margin would leave the pair sitting well left of centre.
 */
.slashes {
  position: relative;
  top: -0.03em;
  margin: 0 0.1em 0 0.02em;
  color: var(--accent);
  font-size: 0.92em;
  letter-spacing: 0;
}
</style>
