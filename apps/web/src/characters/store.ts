/**
 * The account's characters: mine and those shared with me.
 * Deleting is soft on the server and nothing brings one back, so it asks in the
 * screen's own confirm (confirm / answerConfirm) and then says so in a toast.
 * There is no Undo. Signed out, the list is empty and nothing is said.
 */
import { reactive } from 'vue';
import { session } from '../account/session.ts';
import { clearToasts, showToast } from '../shell/toast.ts';
import { parseCharacter, parseHeld, parseListItem, type Character, type CharacterListItem } from './types.ts';
import { request, resetTransport } from './transport.ts';

export { transport } from './transport.ts';

export const characters = reactive({
    status: 'signed-out' as 'signed-out' | 'loading' | 'ready' | 'error',
    items: [] as CharacterListItem[],
    error: '',
});

/** The yes/no a screen draws. One at a time. Never a native dialog. */
export const confirm = reactive({
    open: false,
    title: 'Delete this character?',
    message: '',
    yes: 'Delete',
    no: 'Keep',
});

let confirmWait: ((yes: boolean) => void) | null = null;
let onReset: () => void = () => {};
let onDeleted: (id: string) => void = () => {};
let onText: (id: string, text: { name?: string; summary?: string }) => void = () => {};
let onRole: (id: string, role: CharacterListItem['role']) => void = () => {};

export function registerReset(fn: () => void): void {
    onReset = fn;
}

export function registerDeleted(fn: (id: string) => void): void {
    onDeleted = fn;
}

export function registerText(fn: (id: string, text: { name?: string; summary?: string }) => void): void {
    onText = fn;
}

export function registerRole(fn: (id: string, role: CharacterListItem['role']) => void): void {
    onRole = fn;
}

/** The server said which role this account now has. */
export function noteRole(id: string, role: CharacterListItem['role']): void {
    const item = characters.items.find((row) => row.character.id === id);
    if (item) item.role = role;
    onRole(id, role);
}

function signedOut(): void {
    characters.items = [];
    characters.status = 'signed-out';
    characters.error = '';
}

function selfName(): string {
    const profile = session.user?.profile;
    if (!profile) return '';
    if (typeof profile.displayName === 'string' && profile.displayName) return profile.displayName;
    if (typeof profile.handle === 'string' && profile.handle) return profile.handle;
    return '';
}

/** Puts a name or summary onto the list row and tells an open sheet. */
export function noteCharacterText(id: string, text: { name?: string; summary?: string }): void {
    const item = characters.items.find((row) => row.character.id === id);
    if (item) {
        if (text.name !== undefined) item.character.name = text.name;
        if (text.summary !== undefined) item.character.summary = text.summary;
    }
    onText(id, text);
}

export function answerConfirm(yes: boolean): void {
    const wait = confirmWait;
    confirmWait = null;
    confirm.open = false;
    confirm.message = '';
    if (wait) wait(yes);
}

function askConfirm(message: string): Promise<boolean> {
    if (confirmWait) return Promise.resolve(false);
    confirm.title = 'Delete this character?';
    confirm.message = message;
    confirm.yes = 'Delete';
    confirm.no = 'Keep';
    confirm.open = true;
    return new Promise((resolve) => {
        confirmWait = resolve;
    });
}

/** Mine and those shared with me. A 401 leaves the list empty and says nothing. */
export async function loadCharacters(): Promise<CharacterListItem[] | null> {
    characters.status = 'loading';
    characters.error = '';
    const res = await request('/api/characters');
    if (res.status === 401) {
        signedOut();
        return null;
    }
    if (!res.ok || !Array.isArray(res.data)) {
        characters.status = 'error';
        characters.error = res.message || 'Characters could not be loaded.';
        return null;
    }
    const items: CharacterListItem[] = [];
    for (const row of res.data) {
        const item = parseListItem(row);
        if (item) items.push(item);
    }
    characters.items = items;
    characters.status = 'ready';
    return items;
}

/**
 * Creates one, or a duplicate when `from` is a character the account can read.
 * The server copies that sheet and suffixes the name; the row it returns is the new one.
 */
export async function createCharacter(name: string, from?: string): Promise<Character | null> {
    characters.error = '';
    const body: { name: string; from?: string } = { name };
    if (from) body.from = from;
    const res = await request('/api/characters', { method: 'POST', body: JSON.stringify(body) });
    if (res.status === 401) {
        signedOut();
        return null;
    }
    if (!res.ok) {
        characters.error = res.message || 'The character could not be created.';
        return null;
    }
    const listed = parseListItem(res.data);
    const held = listed ? null : parseHeld(res.data);
    const bare = listed || held ? null : parseCharacter(res.data);
    const item = listed ?? (held
        ? { character: held.character, role: held.role, ownerName: selfName() }
        : (bare
            ? { character: bare, role: 'owner' as const, ownerName: selfName() }
            : null));
    if (!item) {
        characters.error = 'The character could not be created.';
        return null;
    }
    if (!item.ownerName) item.ownerName = selfName();
    const index = characters.items.findIndex((row) => row.character.id === item.character.id);
    if (index >= 0) characters.items[index] = item;
    else characters.items.push(item);
    if (characters.status === 'signed-out') characters.status = 'ready';
    return item.character;
}

/** The owner renames, and may set the summary in the same call. */
export async function renameCharacter(id: string, name: string, summary?: string): Promise<boolean> {
    characters.error = '';
    const body: { name: string; summary?: string } = { name };
    if (summary !== undefined) body.summary = summary;
    const res = await request('/api/characters/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify(body),
    });
    if (res.status === 401) {
        signedOut();
        return false;
    }
    if (!res.ok) {
        characters.error = res.message || 'The character could not be renamed.';
        return false;
    }
    const updated = parseHeld(res.data)?.character ?? parseCharacter(res.data) ?? parseListItem(res.data)?.character ?? null;
    const text: { name: string; summary?: string } = { name: updated ? updated.name : name };
    if (updated) text.summary = updated.summary;
    else if (summary !== undefined) text.summary = summary;
    noteCharacterText(id, text);
    return true;
}

/**
 * Asks, then soft-deletes. The server has no restore, so the toast has no Undo.
 * Cancel, or a second ask while one is open, does nothing.
 */
export async function deleteCharacter(id: string): Promise<boolean> {
    characters.error = '';
    const item = characters.items.find((row) => row.character.id === id);
    const name = item ? item.character.name : 'this character';
    const yes = await askConfirm('Delete ' + name + '? It leaves your list for good.');
    if (!yes) return false;
    const res = await request('/api/characters/' + encodeURIComponent(id), { method: 'DELETE' });
    if (res.status === 401) {
        signedOut();
        return false;
    }
    if (!res.ok) {
        characters.error = res.message || 'The character could not be deleted.';
        return false;
    }
    characters.items = characters.items.filter((row) => row.character.id !== id);
    showToast('Deleted ' + name + '.');
    onDeleted(id);
    return true;
}

/** Tests and sign-out. Closes open sheets and puts the transport back. */
export function resetCharacters(): void {
    onReset();
    answerConfirm(false);
    characters.items = [];
    characters.status = 'signed-out';
    characters.error = '';
    clearToasts();
    resetTransport();
}
