/**
 * The row a Board or Pay now press is naming (BT2).
 * Passengers have no id. The page sends this digest with the index, and the
 * object refuses the piece when the stored row is no longer that digest.
 * The separator is U+001F, so a label that contains a newline still names one row.
 */

const SEP = '\u001f';

export type PassengerSeen = {
    personId?: string;
    label: string;
    class: string;
    note?: string;
    fareCr?: number;
};

/** The stored passenger the page is boarding: person, label, class, note, fare. */
export function passengerSeen(lot: PassengerSeen): string {
    const fare = typeof lot.fareCr === 'number' ? String(lot.fareCr) : '';
    return [lot.personId ?? '', lot.label, lot.class, lot.note ?? '', fare].join(SEP);
}

export type PaymentSeen = {
    amountCr: number;
    everyDays: number;
    nextDueDay: { year: number; day: number };
    payee?: string;
};

/** The stored payment Pay now is posting. */
export function paymentSeen(payment: PaymentSeen): string {
    return [
        String(payment.amountCr),
        String(payment.everyDays),
        String(payment.nextDueDay.year),
        String(payment.nextDueDay.day),
        payment.payee ?? '',
    ].join(SEP);
}
