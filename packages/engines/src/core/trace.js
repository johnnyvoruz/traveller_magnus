import { masterSeed, hashString, roll1D, roll2D, rollD3, rollND, rollFlux } from './rng.js';

export const trace = { enabled: false, lines: [], indent: 0 };

export let pendingRoll = null; // Deferred roll for math display

export function logIndentIn() { trace.indent++; }
export function logIndentOut() { trace.indent = Math.max(0, trace.indent - 1); }

export function _writeRawLogLine(text) {
    if (!trace.enabled) return;
    const indent = "    ".repeat(trace.indent);
    trace.lines.push(indent + text);
}

export function flushPendingRoll() {
    if (!pendingRoll) return;
    const p = pendingRoll;
    pendingRoll = null; // Clear to prevent recursion

    if (!trace.enabled) return;

    const totalDM = p.dms.reduce((acc, d) => acc + d.val, 0);
    const final = p.val + totalDM;

    if (totalDM !== 0) {
        const sign = totalDM >= 0 ? '+' : '-';
        _writeRawLogLine(`${p.label}: Rolled ${p.type} for ${p.val} ${sign} ${Math.abs(totalDM)} = ${final}`);
    } else {
        _writeRawLogLine(`${p.label}: Rolled ${p.type} for ${p.val}`);
    }

    p.dms.forEach(d => {
        _writeRawLogLine(`  DM (${d.label}): ${d.val >= 0 ? '+' : ''}${d.val}`);
    });
}

export function writeLogLine(text) {
    flushPendingRoll();
    if (!trace.enabled) return;
    _writeRawLogLine(text);
}

export function startTrace(hexId, ruleset, name = null) {
    if (!trace.enabled) return;
    writeLogLine(`========================================================`);
    writeLogLine(`SYSTEM: ${hexId}${name ? ' - ' + name : ''} (${ruleset})`);
    writeLogLine(`Master Seed: ${masterSeed} | Hex Hash: ${hashString(masterSeed + "-" + hexId)}`);
    writeLogLine(`========================================================`);
}

export function tSection(title) { writeLogLine(`\n--- ${title.toUpperCase()} ---`); }
export function tResult(label, value) { writeLogLine(`${label}: ${value}`); }

export function tDM(label, value) {
    if (pendingRoll) {
        pendingRoll.dms.push({ label, val: value });
    } else {
        if (trace.enabled) _writeRawLogLine(`  DM (${label}): ${value >= 0 ? '+' : ''}${value}`);
    }
}

export function tSkip(reason) { writeLogLine(`  Skipped: ${reason}`); }
export function tTrade(code, reason) { writeLogLine(`  Trade Code [${code}]: ${reason}`); }

export function tRoll1D(label) {
    const roll = roll1D();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '1D' };
    return roll;
}

export function tRoll2D(label) {
    const roll = roll2D();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '2D6' };
    return roll;
}

export function tRoll1D3(label) {
    const roll = rollD3();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '1D3' };
    return roll;
}

export function tRoll2D3(label) {
    const roll = rollD3() + rollD3();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '2D3' };
    return roll;
}

export function tRoll3D(label) {
    const roll = rollND(3);
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '3D6' };
    return roll;
}

export function tRoll4D(label) {
    const roll = rollND(4);
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: '4D6' };
    return roll;
}

export function tRollFlux(label) {
    const roll = rollFlux();
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: 'Flux' };
    return roll;
}

export function tRollND(n, label) {
    const roll = rollND(n);
    flushPendingRoll();
    pendingRoll = { label, val: roll, dms: [], type: `${n}D` };
    return roll;
}

export function tClamp(label, rolled, clamped) {
    if (trace.enabled) writeLogLine(`  ${label} Rolled: ${rolled} -> Clamped to ${clamped}`);
}

export function tOverride(label, original, newValue, reason) {
    if (trace.enabled) writeLogLine(`  ${label} Override: ${original} -> ${newValue} (${reason})`);
}

export function endTrace() {
    if (trace.enabled) {
        flushPendingRoll();
        writeLogLine(`\n`);
    }
}
