/** UTC calendar day, `YYYY-MM-DD`. */
export function utcDay(now: Date): string {
    return now.toISOString().slice(0, 10);
}

/** The next 00:00 UTC after `now`. A time already on that instant is the following midnight. */
export function resetsAt(now: Date): string {
    const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return new Date(next).toISOString();
}

export function allowanceSentence(remaining: number): string {
    const noun = remaining === 1 ? 'system' : 'systems';
    return `You can generate ${remaining} more ${noun} today. The allowance resets at 00:00 UTC.`;
}
