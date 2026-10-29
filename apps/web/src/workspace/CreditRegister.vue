<script setup lang="ts">
/**
 * The credit register under the Finances section (streams/D.md DT1c; backlog T1b: "a checkbook
 * ledger UI where the player can see deposits and withdrawals"). Simple or Detailed; in Detailed
 * the balance as a readout, the lines newest first with the running balance, a pending line
 * marked and kept out of the balance until the player accepts it, Void as a reversing line (the
 * voided one struck through, never removed), and Add a line. The referee who cannot see the
 * register still adds a line, which waits for the player. It knows nothing of where the
 * register is kept: it is given the handle.
 */
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { formatCredits } from '../campaign/money.ts';
import Icon from '../design/Icon.vue';
import {
    KIND_WORDS, canAccept, canVoid, dayBeyondBound, dayPlaceholder, lineDraft, registerRows, type CharacterRegister,
} from './credit_register.ts';

const props = defineProps<{
    register: CharacterRegister;
    /** This account's id, when the room has said it. Hides Accept on a line this account posted. */
    you: string | null;
    /** This account can read the register (character access). Without it, only Add a line is offered. */
    access: boolean;
    /** This account may post, void and accept. */
    canPost: boolean;
    /** The campaign's day count, for a new line's date. Null with no campaign open. */
    day: number | null;
}>();

const lineOpen = ref(false);
const lineError = ref('');
const amountEl = ref<HTMLInputElement | null>(null);
const line = reactive({ direction: 'withdrawal' as 'deposit' | 'withdrawal', amount: '', kind: 'purchase', memo: '', date: '' });

const KINDS = Object.entries(KIND_WORDS) as [string, string][];

const simple = computed(() => props.register.credits === 'simple');
const rows = computed(() => registerRows(props.register.lines));
const noDate = computed(() => dayBeyondBound(props.day));
const placeholder = computed(() => dayPlaceholder(props.day));
/** The whole block is left out while the sheet is as today: the register not read, not available, or not this account's to see. */
const shown = computed(() => {
    if (!props.access) return props.canPost;
    return props.register.status === 'ready' || props.register.status === 'error';
});

function credits(amount: number): string {
    return formatCredits(amount);
}

function openLine(): void {
    lineOpen.value = true;
    lineError.value = '';
    void nextTick(() => { if (amountEl.value) amountEl.value.focus(); });
}

function closeLine(): void {
    lineOpen.value = false;
    lineError.value = '';
}

async function addLine(): Promise<void> {
    if (!props.canPost || props.register.busy) return;
    const made = lineDraft({ ...line, campaignDay: props.day });
    if (!made.ok) {
        lineError.value = made.message;
        return;
    }
    lineError.value = '';
    const posted = await props.register.post(made.draft);
    if (!posted) {
        lineError.value = props.register.notice;
        return;
    }
    line.amount = '';
    line.memo = '';
    line.date = '';
    lineOpen.value = false;
}

async function mode(credits: 'simple' | 'detailed'): Promise<void> {
    if (!props.canPost || props.register.busy || props.register.credits === credits) return;
    await props.register.setMode(credits);
}

async function voidIt(lineId: string): Promise<void> {
    if (!props.canPost || props.register.busy) return;
    await props.register.voidLine(lineId);
}

async function accept(lineId: string): Promise<void> {
    if (!props.canPost || props.register.busy) return;
    await props.register.acceptLine(lineId);
}

watch(() => props.register.id, closeLine);
</script>

<template>
  <div v-if="shown" class="creg" data-credit-register :data-credit-status="register.status">
    <!-- The referee who cannot see the register: a line that waits for the player. -->
    <template v-if="!access">
      <p class="creg-fine">You can't see this character's register. A line you add waits for the player to accept it.</p>
      <button v-if="!lineOpen" type="button" class="ui-btn" data-credit-add @click="openLine"><Icon name="plus" :size="12" />Add a line</button>
    </template>
    <template v-else-if="register.status === 'ready'">
      <div class="creg-head">
        <span class="ui-seg" role="group" aria-label="How credits are kept" data-credit-mode>
          <button type="button" :aria-pressed="simple ? 'true' : 'false'" :disabled="!canPost || register.busy" @click="mode('simple')">Simple</button>
          <button type="button" :aria-pressed="!simple ? 'true' : 'false'" :disabled="!canPost || register.busy" @click="mode('detailed')">Detailed</button>
        </span>
        <span class="creg-fine">{{ simple ? 'Type Cash on Hand. Each change is kept as a line.' : 'Cash on Hand is the balance of the register.' }}</span>
      </div>
      <p v-if="simple && register.notice" class="creg-err" role="alert">{{ register.notice }}</p>
      <template v-if="!simple">
        <div class="creg-bar">
          <p class="creg-balance" data-credit-balance :class="{ 'is-minus': register.balance < 0 }">
            <span class="creg-balance-label">Balance</span>
            <b>{{ credits(register.balance) }}</b>
          </p>
          <button v-if="canPost && !lineOpen" type="button" class="ui-btn" data-credit-add @click="openLine"><Icon name="plus" :size="12" />Add a line</button>
        </div>
      </template>
    </template>
    <p v-else class="creg-err" role="alert">{{ register.notice }}</p>

    <form v-if="lineOpen && canPost" class="creg-form" data-credit-form @submit.prevent="addLine">
      <span class="ui-seg creg-dir" role="group" aria-label="Deposit or withdrawal">
        <button type="button" :aria-pressed="line.direction === 'deposit' ? 'true' : 'false'" @click="line.direction = 'deposit'">Deposit</button>
        <button type="button" :aria-pressed="line.direction === 'withdrawal' ? 'true' : 'false'" @click="line.direction = 'withdrawal'">Withdrawal</button>
      </span>
      <label class="creg-fld"><span>Amount (Cr)</span><input ref="amountEl" v-model="line.amount" class="creg-box creg-num" inputmode="numeric" placeholder="12,400"></label>
      <label class="creg-fld"><span>Kind</span>
        <select v-model="line.kind" class="creg-box">
          <option v-for="[value, word] in KINDS" :key="value" :value="value">{{ word }}</option>
        </select>
      </label>
      <label class="creg-fld creg-wide"><span>For</span><input v-model="line.memo" class="creg-box" maxlength="80" placeholder="Mustering-out pay"></label>
      <label class="creg-fld"><span>Date</span><input v-model="line.date" class="creg-box creg-num" inputmode="numeric" :placeholder="placeholder" :disabled="noDate"></label>
      <p v-if="noDate" class="creg-fine">The register can't keep this campaign's date yet. The line is kept without one.</p>
      <p v-else-if="!access" class="creg-fine">The line is marked pending until the player accepts it.</p>
      <p v-if="lineError" class="creg-err" role="alert">{{ lineError }}</p>
      <div class="creg-acts">
        <button type="button" class="ui-btn" @click="closeLine">Cancel</button>
        <button type="submit" class="ui-btn is-primary" :disabled="register.busy" data-credit-post>Post the line</button>
      </div>
    </form>

    <template v-if="access && register.status === 'ready' && !simple">
      <p v-if="register.notice && !lineOpen" class="creg-err" role="alert">{{ register.notice }}</p>
      <div v-if="rows.length" class="creg-scroll">
        <table class="creg-table" data-credit-lines>
          <thead>
            <tr>
              <th scope="col" class="creg-date">Date</th>
              <th scope="col" class="creg-memo">Memo</th>
              <th scope="col" class="creg-cell is-num">Withdrawal</th>
              <th scope="col" class="creg-cell is-num">Deposit</th>
              <th scope="col" class="creg-cell is-num">Balance</th>
              <th v-if="canPost" scope="col" class="creg-acts-h"><span class="creg-sr">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in rows"
              :key="row.line.id"
              class="creg-row"
              :class="{ 'is-pending': row.pending, 'is-voided': row.voided, 'is-reversing': row.reversing }"
              :data-credit-line="row.line.id"
            >
              <td class="creg-date"><span v-if="row.date" class="ui-date">{{ row.date }}</span><span v-else class="creg-nodate" aria-label="No date">–</span></td>
              <td class="creg-memo">
                <span class="creg-memo-text">{{ row.line.memo }}</span>
                <small class="creg-kind">{{ row.kind }}</small>
                <small v-if="row.pending" class="creg-pending">Pending</small>
                <small v-else-if="row.voided" class="creg-kind">Voided</small>
                <small v-else-if="row.reversing" class="creg-kind">Reversal</small>
              </td>
              <td class="creg-cell is-num is-out" :data-label="row.withdrawal ? 'Withdrawal' : null">{{ row.withdrawal }}</td>
              <td class="creg-cell is-num is-in" :data-label="row.deposit ? 'Deposit' : null">{{ row.deposit }}</td>
              <td class="creg-cell is-num is-run" :class="{ 'is-minus': row.balance < 0 }" :data-label="row.pending ? null : 'Balance'">{{ row.pending ? '' : credits(row.balance) }}</td>
              <td v-if="canPost" class="creg-acts-cell">
                <button v-if="canAccept(row.line, you)" type="button" class="ui-btn creg-act" data-credit-accept :disabled="register.busy" @click="accept(row.line.id)">Accept</button>
                <button v-else-if="canVoid(row.line, register.lines)" type="button" class="ui-btn creg-act" data-credit-void :disabled="register.busy" :title="'Add a line that reverses this one'" @click="voidIt(row.line.id)">Void</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="!lineOpen" class="creg-fine creg-none">No lines yet. Add a deposit or a withdrawal. Cash on Hand is their sum.</p>
    </template>
  </div>
</template>

<style>
.creg {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--line-soft);
  container-type: inline-size;
}

.creg-head,
.creg-bar,
.creg-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}

.creg-bar {
  justify-content: space-between;
}

.creg-fine,
.creg-err {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.45 var(--font-text);
}

.creg-err {
  color: var(--danger);
  font-weight: 600;
}

/* The balance as an instrument: the display face, tabular, the unit on the number. */
.creg-balance {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 0;
}

.creg-balance-label {
  color: var(--signal-dim);
  font: 700 11px/1.4 var(--font-display);
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.creg-balance b {
  color: var(--signal);
  font: 700 22px/1 var(--font-display);
  letter-spacing: 0.04em;
  font-variant-numeric: var(--tabular);
}

.creg-balance.is-minus b,
.creg-cell.is-run.is-minus {
  color: var(--attention);
}

/* Add a line: the row folds in above the register. */
.creg-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 8px 12px;
  padding: 10px 12px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
}

.creg-dir {
  flex: 1 1 100%;
  width: max-content;
}

.creg-fld {
  display: flex;
  flex: 1 1 120px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-1);
  font: 500 12px/1.3 var(--font-text);
}

.creg-wide {
  flex: 2 1 220px;
}

.creg-box {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  min-height: 32px;
  margin: 0;
  padding: 4px 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  background: var(--bg-1);
  color: var(--text-0);
  font: 500 13px/1.4 var(--font-text);
}

.creg-box:focus-visible {
  outline: none;
  border-color: var(--signal);
  box-shadow: 0 0 0 2px var(--signal-glow);
}

.creg-box:disabled {
  opacity: 0.6;
}

.creg-num {
  font-family: var(--font-data);
  font-variant-numeric: var(--tabular);
}

.creg-form .creg-fine,
.creg-form .creg-err,
.creg-form .creg-acts {
  flex: 1 1 100%;
}

.creg-form .creg-acts {
  justify-content: flex-end;
}

/* The register: hairline rows, numbers in the data face, the first paint a sweep. */
.creg-scroll {
  min-width: 0;
  overflow-x: auto;
}

.creg-table {
  width: 100%;
  border-collapse: collapse;
  font: 400 13px/1.4 var(--font-text);
  animation: creg-sweep var(--t-long) var(--ease-out) both;
}

@keyframes creg-sweep {
  from { clip-path: inset(0 0 100% 0); opacity: 0.4; }
  to { clip-path: inset(0 0 0 0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .creg-table {
    animation: none;
  }
}

.creg-table th {
  padding: 0 8px 6px 0;
  border-bottom: 1px solid var(--line-2);
  color: var(--signal-dim);
  font: 700 10.5px/1.4 var(--font-display);
  letter-spacing: 0.18em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.creg-table td {
  padding: 7px 8px 7px 0;
  border-bottom: 1px solid var(--line-soft);
  vertical-align: top;
}

.creg-table .is-num {
  text-align: right;
  font-family: var(--font-data);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

.creg-cell.is-out {
  color: var(--text-1);
}

.creg-cell.is-in {
  color: var(--signal);
}

.creg-cell.is-run {
  color: var(--text-0);
  font-weight: 600;
}

.creg-date {
  white-space: nowrap;
}

.creg-nodate {
  color: var(--text-muted);
}

.creg-memo {
  width: 100%;
  color: var(--text-0);
  overflow-wrap: anywhere;
}

.creg-memo small {
  margin-left: 6px;
  color: var(--text-muted);
  font-size: 11px;
}

.creg-pending {
  color: var(--attention);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.creg-row.is-pending .creg-memo-text {
  color: var(--attention);
}

.creg-row.is-voided .creg-memo-text,
.creg-row.is-voided .creg-cell.is-out,
.creg-row.is-voided .creg-cell.is-in {
  color: var(--text-muted);
  text-decoration: line-through;
}

.creg-acts-cell {
  text-align: right;
  white-space: nowrap;
}

.creg-act {
  min-height: 28px;
  padding: 2px 10px;
}

.creg-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Narrow (a phone, or the panel at Column): the memo over the amounts, each amount with its word. */
@container (max-width: 560px) {
  .creg-table thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .creg-table,
  .creg-table tbody {
    display: block;
  }

  .creg-table tr.creg-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 2px 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line-soft);
  }

  .creg-table .creg-row td {
    display: block;
    padding: 0;
    border: 0;
  }

  .creg-table td.creg-date {
    grid-row: 1;
    grid-column: 1;
  }

  .creg-table td.creg-date:has(.creg-nodate) {
    display: none;
  }

  .creg-table td.creg-memo {
    grid-row: 1;
    grid-column: 1 / span 2;
    width: auto;
  }

  .creg-table td.creg-date + td.creg-memo {
    grid-column: 2;
  }

  .creg-table td.creg-date:has(.creg-nodate) + td.creg-memo {
    grid-column: 1 / span 2;
  }

  .creg-table td.creg-acts-cell {
    grid-row: 1 / span 3;
    grid-column: 3;
    align-self: center;
  }

  .creg-table td.creg-cell {
    grid-row: 2;
    grid-column: 1 / span 2;
    text-align: left;
  }

  .creg-table td.creg-cell:empty {
    display: none;
  }

  .creg-table td.creg-cell[data-label]::before {
    content: attr(data-label) ' ';
    color: var(--text-muted);
    font: 400 11px/1.4 var(--font-text);
  }

  .creg-table td.creg-cell.is-run {
    grid-row: 3;
  }
}

/* On touch, every control of the register reaches 44 px. */
@media (pointer: coarse) {
  .creg .ui-btn,
  .creg .ui-seg button {
    min-height: 44px;
  }
}
</style>
