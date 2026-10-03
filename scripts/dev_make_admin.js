import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wrangler = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const now = Date.now();
const expires = now + 30 * 24 * 60 * 60 * 1000;
const userId = 'dev-admin';
const token = randomBytes(32).toString('hex');
const sessionId = `dev-admin-${randomBytes(8).toString('hex')}`;
const sql = `
INSERT INTO user (id, name, email, email_verified, created_at, updated_at, role, banned)
VALUES ('${userId}', 'Dev Admin', 'dev-admin@localhost', 1, ${now}, ${now}, 'admin', 0)
ON CONFLICT(id) DO UPDATE SET role = 'admin', updated_at = ${now};
INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
VALUES ('${sessionId}', ${expires}, '${token}', ${now}, ${now}, '${userId}');
`;
const dir = mkdtempSync(path.join(tmpdir(), 'voyage-admin-'));
const file = path.join(dir, 'admin.sql');
writeFileSync(file, sql);
const result = spawnSync(process.execPath, [wrangler, 'd1', 'execute', 'voyage', '--local', '--file', file], {
    cwd: path.join(root, 'apps', 'api'),
    env: { ...process.env, CI: '1' },
    encoding: 'utf8',
});
if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status ?? 1);
}
process.stdout.write(`${token}\n`);
