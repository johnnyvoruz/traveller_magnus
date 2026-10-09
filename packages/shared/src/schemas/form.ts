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
}).strict();
export type FormField = z.infer<typeof FormField>;

export const FormSection = z.object({
    id: z.string().min(1),
    label: z.string(),
    fields: z.array(FormField),
}).strict();
export type FormSection = z.infer<typeof FormSection>;

/** One engine's edit form. The seven rule places are fields in the `rules` section. */
export const EditForm = z.object({
    edition: z.enum(['MgT2E', 'AoW']),
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
 * Blank system. The legacy create dialog's primary star.
 * Omitted star fields are G, 2, and V (`js/system_editor.js` `openCreate`).
 */
export const FormBlank = z.object({
    edition: z.enum(['MgT2E', 'AoW']),
    baseRev: z.number().int().nonnegative(),
    starType: z.string().optional(),
    starSubtype: z.number().int().min(0).max(9).optional(),
    starClass: z.string().optional(),
}).strict();
export type FormBlank = z.infer<typeof FormBlank>;
