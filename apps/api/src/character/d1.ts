import type { CatalogueDb } from './service.ts';

export function catalogueDb(d1: D1Database): CatalogueDb {
    function bind(query: string, params: Array<string | number | null>) {
        const statement = d1.prepare(query);
        return params.length ? statement.bind(...params) : statement;
    }
    return {
        async all(query, ...params) {
            const { results } = await bind(query, params).all();
            return results as Array<Record<string, unknown>>;
        },
        async get(query, ...params) {
            const row = await bind(query, params).first<Record<string, unknown>>();
            return row ?? null;
        },
        async run(query, ...params) {
            const result = await bind(query, params).run();
            return result.meta.changes ?? 0;
        },
        async batch(statements) {
            if (!statements.length) return;
            await d1.batch(statements.map((statement) => bind(statement.query, statement.params)));
        },
    };
}
