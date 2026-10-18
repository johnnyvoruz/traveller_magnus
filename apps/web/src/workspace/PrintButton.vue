<script setup lang="ts">
/**
 * Print (UX backlog U31; streams/D.md DU31): prints the page this button sits in, through the browser's
 * print dialog, where "Save as PDF" is the PDF. `target` finds the page: the nearest ancestor that
 * matches it. The print stylesheet below shows that page alone, in ink on white.
 */
import { ref } from 'vue';
import Icon from '../design/Icon.vue';
import { printCopy } from './print.ts';

const props = defineProps<{
    /** The page to print: the nearest ancestor matching this selector. */
    target: string;
    /** The printout's name: the PDF's file name. */
    title: string;
}>();

const btn = ref<HTMLElement | null>(null);

function print(): void {
    const page = btn.value ? btn.value.closest<HTMLElement>(props.target) : null;
    if (page) printCopy(page, props.title);
}
</script>

<template>
  <button ref="btn" type="button" class="ui-btn" title="Print this page, or save it as a PDF" data-print @click="print">
    <Icon name="file-export" :size="13" />Print
  </button>
</template>

<style>
.print-root {
  display: none;
}

@page {
  margin: 14mm;
}

/*
 * On paper: the copy alone, ink on white, at the page's width. Every colour of the app's theme gives
 * way to the print tokens; controls that do nothing on paper are left off; a field shows as its value
 * on a rule.
 */
@media print {
  html[data-printing],
  html[data-printing] body {
    /* The app's dark scheme would paint the page's margins: paper is light. */
    color-scheme: light !important;
    height: auto !important;
    min-height: 0 !important;
    overflow: visible !important;
    background: var(--print-paper) !important;
  }

  html[data-printing] body > :not(.print-root) {
    display: none !important;
  }

  html[data-printing] .print-root {
    display: block;
    color: var(--print-ink);
    font: 400 10.5pt/1.45 var(--font-text);
  }

  .print-root *,
  .print-root *::before,
  .print-root *::after {
    color: var(--print-ink) !important;
    background: transparent !important;
    border-color: var(--print-line) !important;
    box-shadow: none !important;
    text-shadow: none !important;
    overflow: visible !important;
    max-height: none !important;
  }

  /* What only edits: buttons, the add tiles and hints, an empty field's prompt, a chip's remove. */
  .print-root .ui-btn,
  .print-root .rec-save,
  .print-root .rec-foot,
  .print-root .rec-avatar-acts,
  .print-root .rec-avatar-label,
  .print-root .img-add,
  .print-root .img-hint,
  .print-root .rec-tag-add,
  .print-root .rec-tag-input,
  .print-root .rec-notes-why,
  .print-root .edit-view.is-empty,
  .print-root .lnk-x,
  .print-root button[aria-label^='Remove'],
  .print-root [role='status']:empty,
  .print-root [data-print-hide] {
    display: none !important;
  }

  .print-root input,
  .print-root textarea,
  .print-root select {
    border: 0 !important;
    border-bottom: 1px solid var(--print-line) !important;
    border-radius: 0 !important;
    appearance: none;
  }

  .print-root img {
    max-width: 100%;
    break-inside: avoid;
  }

  .print-root canvas {
    max-width: 100%;
    height: auto;
  }

  .print-root section,
  .print-root fieldset,
  .print-root tr {
    break-inside: avoid;
  }

  .print-root h1,
  .print-root h2,
  .print-root h3 {
    break-after: avoid;
  }
}
</style>
