/** Byte compare for GL readback. Mean is the sum of absolute channel deltas over every byte. */

export type ChannelCompare = {
    mismatches: number;
    maxChannelError: number;
    meanChannelError: number;
    length: number;
    sum: number;
};

export function compareBytes(left: ArrayLike<number> | null, right: ArrayLike<number> | null): ChannelCompare {
    const leftLength = left?.length ?? 0;
    const rightLength = right?.length ?? 0;
    if (left == null || right == null || leftLength !== rightLength) {
        const length = Math.max(leftLength, rightLength, 1);
        return { mismatches: length + 1, maxChannelError: 255, meanChannelError: 255, length, sum: 255 * length };
    }
    let mismatches = 0;
    let maxChannelError = 0;
    let sum = 0;
    for (let i = 0; i < leftLength; i++) {
        const delta = Math.abs((left[i] ?? 0) - (right[i] ?? 0));
        if (delta !== 0) mismatches += 1;
        if (delta > maxChannelError) maxChannelError = delta;
        sum += delta;
    }
    return {
        mismatches,
        maxChannelError,
        meanChannelError: leftLength === 0 ? 0 : sum / leftLength,
        length: leftLength,
        sum,
    };
}

/** More than one RGBA tuple, and at least one non-zero byte. A solid colour is blank. */
export function rgbaVaried(bytes: ArrayLike<number> | null): boolean {
    if (bytes == null || bytes.length < 8 || bytes.length % 4 !== 0) return false;
    let nonzero = false;
    let varied = false;
    const r0 = bytes[0] ?? 0;
    const g0 = bytes[1] ?? 0;
    const b0 = bytes[2] ?? 0;
    const a0 = bytes[3] ?? 0;
    if (r0 !== 0 || g0 !== 0 || b0 !== 0 || a0 !== 0) nonzero = true;
    for (let i = 4; i < bytes.length; i += 4) {
        const r = bytes[i] ?? 0;
        const g = bytes[i + 1] ?? 0;
        const b = bytes[i + 2] ?? 0;
        const a = bytes[i + 3] ?? 0;
        if (r !== r0 || g !== g0 || b !== b0 || a !== a0) varied = true;
        if (r !== 0 || g !== 0 || b !== 0 || a !== 0) nonzero = true;
        if (varied && nonzero) return true;
    }
    return false;
}

export function anyByte(bytes: ArrayLike<number> | null): boolean {
    if (bytes == null) return false;
    for (let i = 0; i < bytes.length; i++) if ((bytes[i] ?? 0) !== 0) return true;
    return false;
}

export function uniformZero(bytes: ArrayLike<number> | null): boolean {
    if (bytes == null || bytes.length === 0) return false;
    for (let i = 0; i < bytes.length; i++) if ((bytes[i] ?? 0) !== 0) return false;
    return true;
}

export function hasAlpha(bytes: ArrayLike<number> | null): boolean {
    if (bytes == null) return false;
    for (let i = 3; i < bytes.length; i += 4) if ((bytes[i] ?? 0) > 0) return true;
    return false;
}

/** A label for the UNMASKED_RENDERER / RENDERER string. Unknown strings stay 'unlisted'. */
export function backendOf(renderer: string): string {
    const text = renderer.toLowerCase();
    if (text.includes('swiftshader')) return 'swiftshader';
    if (text.includes('llvmpipe')) return 'llvmpipe';
    if (text.includes('d3d12') || text.includes('direct3d12')) return 'd3d12';
    if (text.includes('d3d11') || text.includes('direct3d11')) return 'd3d11';
    if (text.includes('vulkan')) return 'vulkan';
    if (text.includes('metal')) return 'metal';
    if (text.includes('opengl')) return 'opengl';
    return 'unlisted';
}

export function copyBytes(source: ArrayLike<number> | null): Uint8Array | null {
    if (source == null) return null;
    const out = new Uint8Array(source.length);
    for (let i = 0; i < source.length; i++) out[i] = source[i] ?? 0;
    return out;
}
