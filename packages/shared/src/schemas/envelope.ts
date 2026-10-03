import { z } from 'zod';

/** api.md error table. */
export const ErrorCode = z.enum([
    'validation',
    'unauthenticated',
    'forbidden',
    'not_found',
    'conflict',
    'hash_mismatch',
    'too_large',
    'provider_unconfigured',
    'job_failed',
    'rate_limited',
    'internal',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const Fail = z.object({
    ok: z.literal(false),
    error: z.object({
        code: ErrorCode,
        message: z.string(),
        details: z.unknown().optional(),
    }),
});
export type Fail = z.infer<typeof Fail>;

export function Ok<T extends z.ZodTypeAny>(data: T) {
    return z.object({ ok: z.literal(true), data });
}
export type Ok<T> = { ok: true; data: T };
