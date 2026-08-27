<script setup lang="ts">
import { useTemplateRef } from 'vue'
import AboutDialog from '@/components/AboutDialog.vue'
import BandDivider from '@/components/BandDivider.vue'
import GrainCount from '@/components/GrainCount.vue'
import FreeRunToggle from '@/components/FreeRunToggle.vue'
import HeadSelector from '@/components/HeadSelector.vue'
import OutputControl from '@/components/OutputControl.vue'
import VendorLogo from '@/components/VendorLogo.vue'

const about = useTemplateRef<InstanceType<typeof AboutDialog>>('about')
</script>

<template>
  <footer>
    <!--
      Free Run is what sounds the instrument with no note held, which is a thing the whole plugin
      does rather than a setting of the head being edited - so it stands at the window's left edge
      with the head strip instead of inside the Engine band, where it was a switch among numbers.
    -->
    <FreeRunToggle />

    <HeadSelector />

    <BandDivider />

    <GrainCount />

    <OutputControl />

    <button
      class="brand"
      aria-label="About Loowps Cloud Chamber"
      title="About"
      @click="about?.open()"
    >
      <VendorLogo class="mark" />
      <span class="name">Cloud Chamber</span>
    </button>

    <AboutDialog ref="about" />
  </footer>
</template>

<style scoped lang="scss">
footer {
  display: flex;
  align-items: center;
  gap: var(--space-7);
  /* Even on all four sides, less the rule along the top - the eye measures the gap from the rule,
     so counting it would leave everything in the bar sitting a pixel low. */
  padding: calc(var(--band-inset) - 1px) var(--band-inset) var(--band-inset);
  background: var(--bg-panel);
  /// The same groove that parts the panels, so no band in the window is fenced off by a bright rule.
  border-top: 1px solid var(--seam);
}

/// The band pays back its own inset, so the rule reaches the groove above it and the foot below.
.band-divider {
  margin-block: calc(-1 * (var(--band-inset) - 1px)) calc(-1 * var(--band-inset));
}

/**
 * A signature rather than a control, so only a hover says it opens anything. It takes the bar's
 * slack, so the head strip and the readings stay together on the left edge rather than being
 * spread across the foot of the window.
 */
.brand {
  margin-left: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  padding: var(--space-2);
  background: transparent;
  border: none;
  border-radius: var(--radius);
  color: var(--text);
  font-size: var(--text-mark);
  line-height: 1;
  cursor: pointer;
  transition: background-color var(--dur-control);

  &:hover {
    background: var(--bg-control-hover);
  }

  &:focus-visible {
    outline: 1px solid var(--accent);
    outline-offset: 1px;
  }
}

/**
 * The negative margins on the mark and the name trim the line box back to the ink: both lines are
 * all capitals, so the room kept for ascenders, descenders and the trailing letter-space is space
 * they never use. Given back, the padding around the pair reads as even on all four sides.
 */
/// The vendor signs the plugin, the plugin is what is being used - so the name carries the ink
/// and the house above it stands back a step, with only the slashes holding their brass.
.mark {
  margin-top: -0.06em;
  color: var(--text-dim);
}

.name {
  --name-tracking: 0.05em;
  /* Measured: where Khand's capitals stand above the foot of the line box. */
  --name-descent: 0.2em;
  /* Trimmed rather than closed up, which would reach into the tails of the mark's slashes. */
  --name-lead: 0.05em;

  font-family: var(--font-display);
  font-size: var(--text-wordmark);
  font-weight: 500;
  letter-spacing: var(--name-tracking);
  margin-top: calc(-1 * var(--name-lead));
  margin-right: calc(-1 * var(--name-tracking));
  margin-bottom: calc(-1 * var(--name-descent));
  text-transform: uppercase;
  user-select: none;
}
</style>
