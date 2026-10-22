const INSERT_CHARGE = `INSERT INTO object_byte_charges (job_id, universe_id, bytes) VALUES (?, ?, ?)`;
const ADD_BYTES = `UPDATE universes SET object_bytes = object_bytes + ? WHERE id = ?`;
const TABLE_PROBE = `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'object_byte_charges'`;

/** A yes stays for this binding. A no is not stored, so the table can arrive while the Worker is up. */
const tableReady = new WeakMap<object, true>();
let logged = false;

function alreadyCharged(err: unknown): boolean {
    const message = err instanceof Error ? err.message : String(err);
    return message.includes('UNIQUE') && message.includes('object_byte_charges');
}

function missingChargesTable(err: unknown): boolean {
    const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
    return message.includes('no such table') && message.includes('object_byte_charges');
}

/**
 * True when migration 0014 is on this database.
 * A yes stays for this binding. A no is asked again, so the table can arrive while the Worker is up.
 * A missing table takes the plain update and never starts the batch.
 */
async function chargesReady(db: D1Database): Promise<boolean> {
    if (tableReady.get(db) === true) return true;
    const row = await db.prepare(TABLE_PROBE).first<{ name: string }>();
    const ready = row?.name === 'object_byte_charges';
    if (ready) tableReady.set(db, true);
    if (!ready && !logged) {
        logged = true;
        console.log(JSON.stringify({
            event: 'object_byte_charges_missing',
            message: 'Migration 0014 is not applied. Object bytes use the plain add.',
        }));
    }
    return ready;
}

async function addBytes(db: D1Database, universeId: string, bytes: number): Promise<void> {
    await db.prepare(ADD_BYTES).bind(bytes, universeId).run();
}

/**
 * Add `bytes` to the universe once for this job.
 * When the charge table exists, the insert and the add are one D1 batch, so a crash rolls both back.
 * A retry that finds the job row adds nothing.
 * When it does not, this is the plain `object_bytes` update and nothing else.
 */
export async function chargeObjectBytes(db: D1Database, universeId: string, jobId: string, bytes: number): Promise<void> {
    if (bytes <= 0) return;
    if (!(await chargesReady(db))) {
        await addBytes(db, universeId, bytes);
        return;
    }
    try {
        await db.batch([
            db.prepare(INSERT_CHARGE).bind(jobId, universeId, bytes),
            db.prepare(ADD_BYTES).bind(bytes, universeId),
        ]);
    } catch (err) {
        if (alreadyCharged(err)) return;
        // The batch rolls back. One plain add. The next call asks again.
        if (missingChargesTable(err)) {
            tableReady.delete(db);
            await addBytes(db, universeId, bytes);
            return;
        }
        throw err;
    }
}

/**
 * Add the job's bytes, then run the settled mark.
 * The add is idempotent by job id once the charge table exists, so a crash after the add
 * and before the mark retries the mark and does not add the bytes again.
 */
export async function accountSettledBytes(
    db: D1Database,
    universeId: string,
    jobId: string,
    bytes: number,
    mark: () => Promise<void>,
): Promise<void> {
    await chargeObjectBytes(db, universeId, jobId, bytes);
    await mark();
}
