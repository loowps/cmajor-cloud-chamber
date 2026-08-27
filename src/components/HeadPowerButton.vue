<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useGranularStore } from '@/stores/granular'
import { usePatchSync } from '@/composables/usePatchSync'
import { enableEndpointFor } from '@/models/granular.model'
import IconButton from '@/components/IconButton.vue'

const store = useGranularStore()
const { selectedHead } = storeToRefs(store)
const patchSync = usePatchSync()

const endpoint = computed(() => enableEndpointFor(selectedHead.value))

const isOn = computed(() => store.parameterValue(endpoint.value) >= 0.5)

/// Names the head it is about, because the button sits at the window's left edge rather than
/// beside the head strip and nothing else in the band says which of the eight it would switch.
const description = computed(
  () => `Head ${selectedHead.value + 1}: ${isOn.value ? 'sounding' : 'silent'}`
)

/// A switch is one gesture, so the host records it as an edit rather than as a value that arrived
/// on its own - the same bargain every drag in the window makes.
function toggle() {
  patchSync.beginGesture(endpoint.value)
  patchSync.sendParameter(endpoint.value, isOn.value ? 0 : 1)
  patchSync.endGesture(endpoint.value)
}
</script>

<template>
  <IconButton
    name="power"
    role="switch"
    :active="isOn"
    :aria-checked="isOn"
    :aria-label="description"
    :title="description"
    @click="toggle"
  />
</template>
