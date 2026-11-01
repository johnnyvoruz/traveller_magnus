/**
 * The campaign's trade tables for a screen (DT6, DF30): the account's own set when the campaign chose one
 * that is not the official file, read once per choice, and the choice's label and words
 * (`campaign/trade.ts` `tradeChoice`). Trade here and Find passengers and freight both read through here:
 * the tables for the trade procedure, the set itself for the traffic rolls.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { validateTableSet, type TableSetData } from '@voyage/shared';
import { campaign, transport } from '../campaign/store.ts';
import { tradeChoice } from '../campaign/trade.ts';
import { apiFetch } from '../platform/http.ts';

export type TradeSetUse = {
    /** The chosen set once read; null while the official file stands. */
    ownSet: Ref<TableSetData | null>;
    /** The label and words Trade here shows for the choice. */
    rolled: ComputedRef<ReturnType<typeof tradeChoice>>;
};

/** Watches the campaign's trade choice and reads the set it names. Call once in a component's setup. */
export function useTradeSet(): TradeSetUse {
    const ownSet = ref<TableSetData | null>(null);
    const rolled = computed(() => {
        void campaign.seq;
        return tradeChoice(campaign.settings, ownSet.value ? [ownSet.value] : []);
    });
    let setLoad = 0;
    watch(() => campaign.settings?.tableSets?.trade ?? '', (id) => {
        const ticket = ++setLoad;
        ownSet.value = null;
        if (!id || id === 'official:trade') return;
        void apiFetch(transport.fetch, '/api/table-sets/' + encodeURIComponent(id)).then(async (res) => {
            if (ticket !== setLoad || !res.ok) return;
            const body = await res.json() as { data?: unknown };
            const checked = validateTableSet(body.data);
            if (ticket === setLoad && checked.ok && checked.set) ownSet.value = checked.set;
        }).catch(() => { /* the official file stays, and tradeChoice says so */ });
    }, { immediate: true });
    return { ownSet, rolled };
}
