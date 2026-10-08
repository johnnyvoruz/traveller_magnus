/**
 * The one hookup (directives/character_mvp.md, "D, Part 2"): the browser's Characters
 * store (apps/web/src/characters/, Agent A's) registered behind the seam the person's page
 * asks (person_character.ts). The page and the sheet know nothing of the store; this file
 * knows both and holds no logic of its own. Presence colours are the store's (its
 * `toneFor`), so a person is the same colour here as in the Characters pane.
 */
import { characters, createCharacter, loadCharacters, openCharacter, toneFor } from '../characters/index.ts';
import { setCharacterSource } from './person_character.ts';

setCharacterSource({
    list: () => characters.items,
    load: async () => { await loadCharacters(); },
    create: async (name) => {
        const made = await createCharacter(name);
        return made ? made.id : null;
    },
    open: (id) => openCharacter(id),
    tone: toneFor,
});
