/**
 * One open character, shared by every caller of the same id (a person's page and
 * the Characters screen). openCharacter counts; close releases one. The last close
 * drops the socket.
 */
import { reactive } from 'vue';
import { attachLive, type LiveController } from './live.ts';
import { characters, noteCharacterText, registerDeleted, registerReset, registerRole, registerText } from './store.ts';
import type { CharacterHandle, CharacterState } from './types.ts';

type Room = {
    state: CharacterState;
    handle: CharacterHandle;
    live: LiveController;
    refs: number;
};

const rooms = new Map<string, Room>();

registerReset(() => {
    for (const room of rooms.values()) room.live.stop();
    rooms.clear();
});

registerDeleted((id) => {
    rooms.get(id)?.live.localGone('This character was deleted.');
});

registerRole((id, role) => {
    const state = rooms.get(id)?.state;
    if (state) state.role = role;
});

registerText((id, text) => {
    const state = rooms.get(id)?.state;
    if (!state?.character) return;
    state.character = {
        ...state.character,
        ...(text.name !== undefined ? { name: text.name } : {}),
        ...(text.summary !== undefined ? { summary: text.summary } : {}),
    };
});

function makeHandle(state: CharacterState, live: LiveController, release: () => void): CharacterHandle {
    return {
        get id() { return state.id; },
        get character() { return state.character; },
        get role() { return state.role; },
        get ownerName() { return state.ownerName; },
        get fields() { return state.fields; },
        get who() { return state.who; },
        get you() { return state.you; },
        get status() { return state.status; },
        get notice() { return state.notice; },
        setField(name, value) { live.setField(name, value); },
        focusField(name) { live.focusField(name); },
        close: release,
    };
}

/** The open sheet for id. The same handle comes back until the last close. */
export function openCharacter(id: string): CharacterHandle {
    const existing = rooms.get(id);
    if (existing) {
        existing.refs += 1;
        return existing.handle;
    }
    const listed = characters.items.find((item) => item.character.id === id);
    const state = reactive<CharacterState>({
        id,
        character: listed ? { ...listed.character } : null,
        role: listed ? listed.role : null,
        ownerName: listed ? listed.ownerName : '',
        fields: {},
        who: [],
        you: null,
        status: 'connecting',
        notice: '',
    });
    const live = attachLive(state, (name, summary) => {
        noteCharacterText(id, { name, summary });
    });
    const room: Room = { state, handle: null as unknown as CharacterHandle, live, refs: 1 };
    room.handle = makeHandle(state, live, () => {
        room.refs -= 1;
        if (room.refs > 0) return;
        room.live.stop();
        rooms.delete(id);
    });
    rooms.set(id, room);
    live.start();
    return room.handle;
}
