import { PASSKEY_REQUIRED } from './passkey_words';

/**
 * A recovery session is the session row's `must_add_passkey` flag.
 * The flag is a column on the session lookup the request already makes.
 * There is no second read. A database without migration 0012 has no column,
 * so that lookup uses the pre-0012 tables and this flag is never set.
 */
export function isRecoverySession(session: { session?: { mustAddPasskey?: boolean | number } } | null): boolean {
    const flag = session?.session?.mustAddPasskey;
    return flag === true || flag === 1;
}

export const RECOVERY_CODE = 'passkey_required';
export const RECOVERY_MESSAGE = PASSKEY_REQUIRED;
