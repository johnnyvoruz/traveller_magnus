import sheet from '../../../../packages/engines/src/generated/rules/mgt2e_character_sheet_fields.js';

export type WidgetKind = 'text' | 'checkbox';

const kinds = new Map<string, WidgetKind>();
for (const field of sheet.fields) {
    if (field.type === 'text' || field.type === 'checkbox') kinds.set(field.name, field.type);
}

/** The generated rules wrapper, one object for all 420 widgets. The worker reads `name` and `type`. */
export const WIDGET_COUNT = kinds.size;

export function widgetKind(name: string): WidgetKind | null {
    return kinds.get(name) ?? null;
}
