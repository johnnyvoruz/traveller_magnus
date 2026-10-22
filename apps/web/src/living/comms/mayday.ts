

/** True when the query carries `mayday`, with a value or without one. */
export function maydayKeyPresent(query: object): boolean {
    return Object.prototype.hasOwnProperty.call(query, 'mayday');
}

export type MaydayGate = {
    /** Returns true only the first time `present` is true for this gate. */
    claim(present: boolean): boolean;
};

export function createMaydayGate(): MaydayGate {
    let spent = false;
    return {
        claim(present: boolean): boolean {
            if (!present || spent) return false;
            spent = true;
            return true;
        },
    };
}

/** The document's gate. The server and the browser each have their own. */
export const pageMayday: MaydayGate = createMaydayGate();
