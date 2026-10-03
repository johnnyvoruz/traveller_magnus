// The engines share one rng binding. Node runs test files in one process, so every
// case that calls configure / setRandomSeed / reseedForHex must take this lock.
let gate = Promise.resolve();

export function withEngineRng(fn) {
    const prev = gate;
    let release;
    gate = new Promise(resolve => { release = resolve; });
    return prev.then(() => fn()).finally(() => release());
}
