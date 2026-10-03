// ============================================================================
// DISCLOSURE.JS - Player Fog of War: per-hex disclosure tags (Release 2, WP4)
// Parallel architecture to regions.js — bulk-assigned from the action bar and
// the right-click menu over the existing selectedHexes set.
//
// state.disclosure is either:
//   • absent — never set; players see everything (same as a full tag set)
//   • ['0']  — Unknown: the system is absent from player maps and exports
//   • ['a','c',…] — independent checkmarks for which information players see
//
// Legacy saves stored a single ladder letter ('0'..'g'). Those still load:
// a letter 'e' is read as tags a–e, which is what that referee already exported.
// New writes are always a tag array.
//
// This module is the DATA MODEL ONLY. It deliberately knows nothing about
// exporting or drawing:
//   WP5 (players' export) consumes it via DisclosureModel.atLeast()
//   WP6 (fogged map)      consumes it the same way
//
// The tag ids below are Sean's, agreed 2026-08-03 and recorded in
// directives/fog_of_war_field_tags.md. That file is the authority for which
// FIELD sits at which tag; this file only stores and edits the per-hex set.
// ============================================================================

const DISCLOSURE_LEVELS = [
    { id: '0', name: 'Unknown',          hint: 'Hex is blank — no dot, no page, no index row', color: '#4a4a4a' },
    { id: 'a', name: 'Star Present',     hint: 'Star(s) present, travel zone, allegiance, region',  color: '#6c584c' },
    { id: 'b', name: 'Stellar Details',  hint: 'Spectral type, luminosity, mass, star orbits',      color: '#8d6b94' },
    { id: 'c', name: 'Gas Giants',       hint: 'Gas giant presence',                                color: '#5c7aea' },
    { id: 'd', name: 'System Layout',    hint: 'World count, belts, orbits, body types, name',      color: '#4cc9f0' },
    { id: 'e', name: 'Physical Data',    hint: 'Size, hydrographics, atmosphere, temperature',      color: '#2a9d8f' },
    { id: 'f', name: 'Population & TL',  hint: 'Population, tech level, biosphere, economy',        color: '#8ab17d' },
    { id: 'g', name: 'Full UWP',         hint: 'UWP, starport, government, socio',                  color: '#06d6a0' },
];

// Absent field means FULL disclosure, not hidden. Chosen so that every sector
// saved before this feature existed keeps behaving exactly as it did, and so a
// player export can never silently omit data the GM never chose to hide.
const DISCLOSURE_DEFAULT = 'g';

const DISCLOSURE_ORDER = DISCLOSURE_LEVELS.map(l => l.id);
const DISCLOSURE_INFO_TAGS = DISCLOSURE_ORDER.filter(id => id !== '0');

// ── Core accessors ───────────────────────────────────────────────────────────

function getDisclosureDef(levelId) {
    return DISCLOSURE_LEVELS.find(l => l.id === levelId) || null;
}

function _stateOf(hexIdOrState) {
    return (typeof hexIdOrState === 'string') ? hexStates.get(hexIdOrState) : hexIdOrState;
}

function _ensureState(hexId) {
    let state = hexStates.get(hexId);
    if (!state) { state = { type: 'BLANK' }; hexStates.set(hexId, state); }
    return state;
}

// Canonical tag array, or null when the hex has never been set.
// A legacy single letter is expanded to the old ladder prefix so existing
// maps keep showing players what they already did.
function parseDisclosureTags(val) {
    if (Array.isArray(val)) {
        const tags = DISCLOSURE_ORDER.filter(id => val.includes(id));
        return tags;
    }
    if (val === '0') return ['0'];
    const idx = DISCLOSURE_ORDER.indexOf(val);
    if (idx <= 0) return null;
    return DISCLOSURE_ORDER.slice(1, idx + 1);
}

function getRawDisclosure(hexIdOrState) {
    const state = _stateOf(hexIdOrState);
    if (!state) return null;
    return parseDisclosureTags(state.disclosure);
}

function isDisclosureSet(hexIdOrState) {
    return getRawDisclosure(hexIdOrState) != null;
}

function writeDisclosureTags(hexId, tags) {
    const state = _ensureState(hexId);
    const clean = DISCLOSURE_ORDER.filter(id => tags.includes(id));
    if (clean.includes('0')) state.disclosure = ['0'];
    else if (clean.length === 0) delete state.disclosure;
    else state.disclosure = clean;
    return true;
}

// What get() returns to exporters: 'g' (full / unset), '0' (hidden), or a
// tag array. Callers that compared === '0' keep working.
function getDisclosure(hexIdOrState) {
    const tags = getRawDisclosure(hexIdOrState);
    if (tags == null) return DISCLOSURE_DEFAULT;
    if (tags.includes('0') || tags.length === 0) return '0';
    if (DISCLOSURE_INFO_TAGS.every(id => tags.includes(id))) return DISCLOSURE_DEFAULT;
    return tags;
}

function setDisclosure(hexId, levelId) {
    if (levelId == null || levelId === '') return clearDisclosure(hexId);
    if (Array.isArray(levelId)) return writeDisclosureTags(hexId, levelId);
    if (!DISCLOSURE_ORDER.includes(levelId)) return false;
    return writeDisclosureTags(hexId, levelId === '0' ? ['0'] : [levelId]);
}

function clearDisclosure(hexId) {
    const state = hexStates.get(hexId);
    if (!state) return false;
    delete state.disclosure;
    return true;
}

function enabledTagsFrom(current) {
    if (current == null || current === DISCLOSURE_DEFAULT) return DISCLOSURE_INFO_TAGS.slice();
    if (Array.isArray(current)) {
        if (current.includes('0') || current.length === 0) return [];
        return DISCLOSURE_ORDER.filter(id => id !== '0' && current.includes(id));
    }
    if (current === '0') return [];
    const idx = DISCLOSURE_ORDER.indexOf(current);
    if (idx <= 0) return DISCLOSURE_INFO_TAGS.slice();
    return DISCLOSURE_ORDER.slice(1, idx + 1);
}

// Is a field tagged `required` visible given `current` (get() result or tags)?
// Independent checkmarks: only the checked tags show. A legacy letter still
// means that tag and every tag below it.
function atLeast(current, required) {
    if (!required || !DISCLOSURE_ORDER.includes(required) || required === '0') return false;
    return enabledTagsFrom(current).includes(required);
}

function isHexDisclosed(hexId) {
    return getDisclosure(hexId) !== '0';
}

// Checkbox UI: only tags the referee has actually chosen. Default (unset) has
// nothing selected; ticking a box under OR starts an additive custom set.
function hasDisclosureTag(hexIdOrState, tag) {
    if (!DISCLOSURE_ORDER.includes(tag)) return false;
    const tags = getRawDisclosure(hexIdOrState);
    if (tags == null) return false;
    if (tag === '0') return tags.includes('0') || tags.length === 0;
    if (tags.includes('0') || tags.length === 0) return false;
    return tags.includes(tag);
}

function setDisclosureTag(hexId, tag, on) {
    if (!DISCLOSURE_ORDER.includes(tag)) return false;
    if (hasDisclosureTag(hexId, tag) === !!on) return true;
    if (tag === '0') {
        if (on) return writeDisclosureTags(hexId, ['0']);
        return clearDisclosure(hexId);
    }
    const tags = getRawDisclosure(hexId);
    let current = (!tags || tags.includes('0') || tags.length === 0)
        ? []
        : tags.filter(id => id !== '0');
    if (on && !current.includes(tag)) current.push(tag);
    if (!on) current = current.filter(id => id !== tag);
    if (current.length === 0) return clearDisclosure(hexId);
    return writeDisclosureTags(hexId, current);
}

function pressedDisclosureState(matchCount, total) {
    if (!total) return 'false';
    if (matchCount === total) return 'true';
    if (matchCount > 0) return 'mixed';
    return 'false';
}

window.applyPlayerKnowledge = function (tagId, hexList, opts = {}) {
    if (!hexList.length) {
        showToast(opts.emptyMessage || 'Select hexes, or click a system.', 2000);
        return false;
    }
    if (tagId == null || tagId === '') {
        if (hexList.every(id => !isDisclosureSet(id))) return false;
        saveHistoryState('Clear Disclosure', { hexIds: hexList });
        hexList.forEach(id => clearDisclosure(id));
        showToast(`${hexList.length} hex(es) set to Default.`, 2500);
    } else {
        const allOn = hexList.every(id => hasDisclosureTag(id, tagId));
        saveHistoryState('Assign Disclosure', { hexIds: hexList });
        hexList.forEach(id => setDisclosureTag(id, tagId, !allOn));
        const def = getDisclosureDef(tagId);
        showToast(`${hexList.length} hex(es): ${def ? def.name : tagId} ${allOn ? 'off' : 'on'}.`, 2500);
    }
    requestAnimationFrame(draw);
    window.syncMapActionBar?.();
    window.DisclosureGrid?.refresh?.();
    return true;
};

window.renderPlayerKnowledgePanel = function (container, hexes, opts = {}) {
    if (!container) return;
    const list = hexes || [];
    const unsetCount = list.filter(id => !isDisclosureSet(id)).length;
    const isSet = list.length > 0 && unsetCount < list.length;
    container.classList.add('player-knowledge');
    container.classList.toggle('is-set', isSet);
    container.replaceChildren();
    const hexesOf = () => (typeof opts.hexes === 'function' ? opts.hexes() : list);
    const addToggle = (label, hint, pressed, onClick, extraClass, withCheck, count) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('aria-pressed', pressed);
        if (extraClass) btn.className = extraClass;
        if (hint) btn.title = hint;
        if (withCheck) {
            const box = document.createElement('span');
            box.className = 'map-action-check';
            box.setAttribute('aria-hidden', 'true');
            const icon = document.createElement('i');
            icon.className = pressed === 'mixed' ? 'fas fa-minus' : 'fas fa-check';
            box.append(icon);
            btn.append(box);
        }
        const copy = document.createElement('span');
        copy.className = 'map-action-copy';
        const name = document.createElement('span');
        name.textContent = label;
        copy.append(name);
        if (hint) {
            const hintEl = document.createElement('span');
            hintEl.className = 'map-action-hint';
            hintEl.textContent = hint;
            copy.append(hintEl);
        }
        btn.append(copy);
        if (list.length > 1 && count != null) {
            const badge = document.createElement('span');
            badge.className = 'player-knowledge-count';
            badge.textContent = String(count);
            btn.append(badge);
        }
        btn.addEventListener('click', onClick);
        return btn;
    };
    const apply = (id) => {
        window.applyPlayerKnowledge(id, hexesOf(), opts);
    };
    container.append(addToggle(
        'Default',
        'Players see everything — no custom knowledge set',
        pressedDisclosureState(unsetCount, list.length),
        () => apply(null),
        'map-action-default',
        false,
        unsetCount
    ));
    const split = document.createElement('div');
    split.className = 'map-action-players-split';
    const or = document.createElement('span');
    or.textContent = 'or';
    split.append(or);
    container.append(split);
    const group = document.createElement('div');
    group.className = 'map-action-players-checks';
    DISCLOSURE_LEVELS.forEach(def => {
        const onCount = list.filter(id => hasDisclosureTag(id, def.id)).length;
        group.append(addToggle(
            def.name,
            def.hint,
            pressedDisclosureState(onCount, list.length),
            () => apply(def.id),
            '',
            true,
            onCount
        ));
    });
    container.append(group);
};

// ── Bulk-assign modal ────────────────────────────────────────────────────────
// Mirrors openAssignRegionModal in regions.js, including its "no hexes
// selected" guard and its saveHistoryState/showToast bookends.

function _fillAssignDisclosureGrid(hexList) {
    const summaryEl = document.getElementById('disclosure-assign-current');
    const unset = hexList.filter(id => !isDisclosureSet(id)).length;
    if (summaryEl) {
        if (unset === hexList.length) summaryEl.textContent = 'Currently: not set (players see everything)';
        else if (unset) summaryEl.textContent = `Currently: mixed (${unset} of ${hexList.length} not set)`;
        else {
            const on = DISCLOSURE_LEVELS.filter(def => hexList.every(id => hasDisclosureTag(id, def.id)));
            summaryEl.textContent = on.length
                ? `Currently: ${on.map(d => d.name).join(', ')}`
                : 'Currently: mixed tags';
        }
    }
    const grid = document.getElementById('disclosure-assign-grid');
    grid.innerHTML = '';
    DISCLOSURE_LEVELS.forEach(def => {
        const onCount = hexList.filter(id => hasDisclosureTag(id, def.id)).length;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'border-assign-btn';
        btn.setAttribute('aria-pressed', onCount === hexList.length ? 'true' : onCount > 0 ? 'mixed' : 'false');
        btn.style.color = def.color;
        btn.style.borderColor = def.color;
        btn.title = def.hint;
        btn.innerHTML = `<span class="border-assign-num">${def.id.toUpperCase()}</span>`
                      + `<span class="border-assign-name">${def.name}</span>`;
        btn.addEventListener('click', () => window.confirmToggleDisclosure(def.id, hexList));
        grid.appendChild(btn);
    });
}

window.openAssignDisclosureModal = function () {
    document.getElementById('context-menu').classList.remove('visible');
    const hexList = currentActionHexes();
    const count = hexList.length;
    if (count === 0) { showToast('No hexes selected.', 2000); return; }

    document.getElementById('disclosure-assign-modal-count').textContent = count;
    _fillAssignDisclosureGrid(hexList);
    document.getElementById('disclosure-assign-modal').style.display = 'flex';
};

window.confirmToggleDisclosure = function (tagId, hexList = currentActionHexes()) {
    window.applyPlayerKnowledge(tagId, hexList, { emptyMessage: 'No hexes selected.' });
    if (document.getElementById('disclosure-assign-modal').style.display === 'flex') {
        _fillAssignDisclosureGrid(hexList);
    }
};

window.confirmAssignDisclosure = function (levelId, hexList = currentActionHexes()) {
    if (levelId == null || levelId === '') {
        window.applyPlayerKnowledge(null, hexList, { emptyMessage: 'No hexes selected.' });
        if (hexList.length) document.getElementById('disclosure-assign-modal').style.display = 'none';
        return;
    }
    window.confirmToggleDisclosure(levelId, hexList);
};

// ── Wire up event listeners ──────────────────────────────────────────────────

function setupDisclosureUI() {
    const ctxBtn = document.getElementById('ctx-assign-disclosure');
    if (ctxBtn) ctxBtn.addEventListener('click', window.openAssignDisclosureModal);

    const cancelBtn = document.getElementById('btn-disclosure-assign-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
        document.getElementById('disclosure-assign-modal').style.display = 'none';
    });
}

// ── Public surface ───────────────────────────────────────────────────────────

window.DisclosureModel = {
    LEVELS:  DISCLOSURE_LEVELS,
    ORDER:   DISCLOSURE_ORDER,
    INFO:    DISCLOSURE_INFO_TAGS,
    DEFAULT: DISCLOSURE_DEFAULT,
    get:     getDisclosure,
    set:     setDisclosure,
    def:     getDisclosureDef,
    atLeast,
    isHexDisclosed,
    isSet:   isDisclosureSet,
    getRaw:  getRawDisclosure,
    clear:   clearDisclosure,
    has:     hasDisclosureTag,
    setTag:  setDisclosureTag,
};

window.setupDisclosureUI = setupDisclosureUI;
