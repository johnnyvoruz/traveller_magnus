/** Whether migration 0012 is on this database. One probe per isolate, then the answer is reused. */

let ready: boolean | null = null;
let logged = false;

/** True only after a probe has seen `session.must_add_passkey`. A probe that has not run yet is false. */
export function passkeyColumnsReady(): boolean {
    return ready === true;
}

/**
 * Missing 0012 is not a recovery session. The probe is `pragma_table_info`,
 * which succeeds when the column is absent. The miss is logged once.
 */
export async function detectPasskeyColumns(db: D1Database): Promise<boolean> {
    if (ready !== null) return ready;
    const row = await db.prepare(
        `SELECT name FROM pragma_table_info('session') WHERE name = 'must_add_passkey'`,
    ).first<{ name: string }>();
    ready = row?.name === 'must_add_passkey';
    if (!ready && !logged) {
        logged = true;
        console.log(JSON.stringify({
            event: 'passkey_schema_missing',
            message: 'Migration 0012 is not applied. A session is not treated as a recovery session.',
        }));
    }
    return ready;
}
