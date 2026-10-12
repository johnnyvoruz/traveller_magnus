import { z } from 'zod';

/**
 * Builder step 2. A stored system as a form.
 * The browser draws this and sends values back by field id.
 * Nothing here describes an engine tree.
 */

const Hash = z.string().regex(/^[0-9a-f]{64}$/);

/** text, number, one of a list, or a switch. */
export const FormKind = z.enum(['text', 'number', 'choice', 'switch']);
export type FormKind = z.infer<typeof FormKind>;

/**
 * `type`: the referee types it.
 * `roll`: the engine's value. It can be typed, which locks it, or rolled again.
 * `read`: shown, and a draft cannot change it.
 */
export const FormPermission = z.enum(['type', 'roll', 'read']);
export type FormPermission = z.infer<typeof FormPermission>;

export const FormOption = z.object({
    value: z.string(),
    label: z.string(),
}).strict();
export type FormOption = z.infer<typeof FormOption>;

export const FormValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type FormValue = z.infer<typeof FormValue>;

export const FormField = z.object({
    id: z.string().min(1),
    label: z.string(),
    kind: FormKind,
    permission: FormPermission,
    value: FormValue,
    options: z.array(FormOption),
    /** Present on a hand star's mass, diameter, temperature, and luminosity. Shown while `value` is null. */
    lookup: FormValue.optional(),
}).strict();
export type FormField = z.infer<typeof FormField>;

export const FormSection = z.object({
    id: z.string().min(1),
    label: z.string(),
    fields: z.array(FormField),
}).strict();
export type FormSection = z.infer<typeof FormSection>;

/**
 * One edit form.
 * `generated` is an engine tree. `hand` is a system designed by hand.
 * A profile roll runs one body. The rest of a hand form does not run the engine.
 * A form that omits `mode` is `generated`.
 */
export const EditForm = z.object({
    /** Set on a generated system, and on a hand system that was switched from one. A blank that names no edition omits it. */
    edition: z.enum(['MgT2E', 'AoW']).optional(),
    mode: z.enum(['generated', 'hand']).optional(),
    sections: z.array(FormSection),
}).strict();
export type EditForm = z.infer<typeof EditForm>;

/** What a read of a stored hex returns. `hash` is the envelope the draft must name. */
export const FormRead = z.object({
    hash: Hash,
    form: EditForm,
}).strict();
export type FormRead = z.infer<typeof FormRead>;

export const FormChange = z.object({
    id: z.string().min(1),
    value: FormValue,
}).strict();
export type FormChange = z.infer<typeof FormChange>;

/** Roll this field or this body again. `id` is a field id or `body.<n>`. */
export const FormRoll = z.object({
    id: z.string().min(1),
}).strict();
export type FormRoll = z.infer<typeof FormRoll>;

/** Stateless draft. `hash` names the stored envelope. Nothing is written. */
export const FormDraft = z.object({
    hash: Hash,
    changes: z.array(FormChange).max(400),
    roll: z.array(FormRoll).max(40).optional(),
}).strict();
export type FormDraft = z.infer<typeof FormDraft>;

/** A field whose value moved because of this draft. `why` is the engine's trace, or empty. */
export const FormChanged = z.object({
    id: z.string(),
    why: z.string(),
}).strict();
export type FormChanged = z.infer<typeof FormChanged>;

/**
 * A message raised while applying the draft.
 * `holds` is true only when the engine could not build the system. Keep is refused then.
 */
export const FormMessage = z.object({
    id: z.string().nullable(),
    text: z.string(),
    holds: z.boolean(),
}).strict();
export type FormMessage = z.infer<typeof FormMessage>;

export const FormAnswer = z.object({
    form: EditForm,
    changed: z.array(FormChanged),
    messages: z.array(FormMessage),
}).strict();
export type FormAnswer = z.infer<typeof FormAnswer>;

/** Keep. Same changes as a draft, plus the row's `baseRev`. One new object, one new rev. */
export const FormKeep = z.object({
    hash: Hash,
    baseRev: z.number().int().nonnegative(),
    changes: z.array(FormChange).max(400),
    roll: z.array(FormRoll).max(40).optional(),
}).strict();
export type FormKeep = z.infer<typeof FormKeep>;

/**
 * Blank system. Edition and star fields are the old create dialog.
 * A client may omit them. When they are sent, they are accepted and not used.
 */
/** A bare 400 that names one field. The sentence stays `error.message`. */
export const FieldRefusalDetails = z.object({
    code: z.literal('field'),
    id: z.string().min(1),
}).strict();
export type FieldRefusalDetails = z.infer<typeof FieldRefusalDetails>;

/** 409 `That slot is in use. Choose another slot.` `current` is the `RefereeSector` already returned. */
export const SlotInUseDetails = z.object({
    code: z.literal('slot_in_use'),
    current: z.unknown(),
}).strict();
export type SlotInUseDetails = z.infer<typeof SlotInUseDetails>;

/** 409 `This hex changed. Reload it, then try again.` `current` is the row already returned. */
export const HexChangedDetails = z.object({
    code: z.literal('hex_changed'),
    current: z.unknown(),
}).strict();
export type HexChangedDetails = z.infer<typeof HexChangedDetails>;

export const FormBlank = z.object({
    baseRev: z.number().int().nonnegative(),
    edition: z.enum(['MgT2E', 'AoW']).optional(),
    starType: z.string().optional(),
    starSubtype: z.number().int().min(0).max(9).optional(),
    starClass: z.string().optional(),
}).strict();
export type FormBlank = z.infer<typeof FormBlank>;

/** Design by hand. `baseRev` is 0 when the hex has no row and the chart holds the tree. */
export const FormDesign = z.object({
    baseRev: z.number().int().nonnegative(),
}).strict();
export type FormDesign = z.infer<typeof FormDesign>;
