/**
 * Enhanced cube C. A separate bake after B. The vanilla MRT is not touched.
 * RGB is pre-gain emission. A is core strength times density. No clouds,
 * night mask, atmosphere or time. Gas and population zero never allocate it.
 */
import { cubeBytes, type BakeProfile, type GpuCube, type LinkedProgram } from '../vanilla/gl_bake.ts';
import { CITY_LOOK_B, cityLook, setCityLook } from './city_look.ts';

/** One RGBA8 cube with the same 4/3 mip estimate the A/B ledger already uses. */
export function cityCubeBytes(size: number): number {
    return cubeBytes(size) / 2;
}

type CityProfile = {
    gas?: unknown;
    kind?: string;
    lights?: { pop?: number; color?: number[]; neon?: number };
    offsets?: number[];
};

/** False for a gas giant and for population zero. Those worlds skip the texture. */
export function cityWanted(profile: CityProfile): boolean {
    if (profile.gas != null) return false;
    if (profile.kind === 'gas') return false;
    return (profile.lights?.pop ?? 0) > 0;
}

const norm3 = (c: number[]): [number, number, number] => [(c[0] ?? 0) / 255, (c[1] ?? 0) / 255, (c[2] ?? 0) / 255];

/**
 * The network functions are copied from the vanilla draw shader so a night
 * centre and its day core are the same cells. faceDir matches the bake of B.
 */
export const CITY_BAKE_FRAG = `#version 300 es
precision highp float;
uniform samplerCube uB;
uniform int uFace;
uniform float uSize;
uniform vec3 uOffset;
uniform vec3 uCityColor;
uniform float uNeon;
uniform float uGas;
uniform float uLook;
uniform float uPop;
out vec4 outC;

vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
}
vec3 worleyF(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0, id = 0.0;
    for (int z = -1; z <= 1; z++) for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec3 o = vec3(float(x), float(y), float(z));
        vec3 h = hash33(i + o);
        vec3 r = o + h - f;
        float dd = dot(r, r);
        if (dd < d1) { d2 = d1; d1 = dd; id = h.x; }
        else if (dd < d2) d2 = dd;
    }
    return vec3(sqrt(d1), sqrt(d2), id);
}
float roads(vec3 w, float width, float fw) {
    fw = max(fw, 1e-4);
    float ew = max(width, fw * 0.85);
    float line = (1.0 - smoothstep(ew * 0.5, ew * 0.5 + fw, (w.y - w.x) * 0.5)) * sqrt(width / ew);
    return mix(line, min(1.0, width * 2.5), smoothstep(0.18, 0.45, fw));
}
vec3 districtTint(float id) {
    if (uNeon <= 0.0) return uCityColor;
    float hue = fract(id * 7.13);
    vec3 neon = hue < 0.28 ? vec3(1.0, 0.16, 0.72)
        : hue < 0.52 ? vec3(0.12, 0.92, 1.0)
        : hue < 0.7 ? vec3(0.38, 0.32, 1.0)
        : hue < 0.86 ? vec3(1.0, 0.32, 0.42)
        : vec3(0.72, 0.28, 1.0);
    return mix(uCityColor, neon * 1.5, step(fract(id * 3.71), uNeon * 0.9));
}
vec3 faceDir(int face, vec2 fc) {
    float a = 2.0 * fc.x / uSize - 1.0;
    float b = 2.0 * fc.y / uSize - 1.0;
    vec3 d;
    if (face == 0) d = vec3(1.0, -b, -a);
    else if (face == 1) d = vec3(-1.0, -b, a);
    else if (face == 2) d = vec3(a, 1.0, b);
    else if (face == 3) d = vec3(a, -1.0, -b);
    else if (face == 4) d = vec3(a, -b, 1.0);
    else d = vec3(-a, -b, -1.0);
    return normalize(d);
}

void main() {
    vec2 fc = gl_FragCoord.xy;
    vec3 q = faceDir(uFace, fc);
    float U = texture(uB, q).g;
    float ocean = texture(uB, q).r;
    // B and C: population 8 and above feathers the mask onto nearby land.
    // The sea (B.r) stays empty. A leaves U as baked.
    if (uLook > 0.5 && uPop >= 7.5 && ocean < 0.22) {
        float push = clamp((uPop - 7.5) / 2.5, 0.0, 1.0);
        float district = texture(uB, q, 2.0).g;
        U = max(U, district * (0.65 + 0.30 * push));
    }
    if (uGas > 0.5 || U <= 0.0) {
        outC = vec4(0.0);
        return;
    }
    vec3 qx = faceDir(uFace, fc + vec2(1.0, 0.0));
    vec3 qy = faceDir(uFace, fc + vec2(0.0, 1.0));
    float texel = max(length(qx - q), length(qy - q));
    vec3 w1 = worleyF(q * 7.0 + uOffset);
    vec3 w2 = worleyF(q * 26.0 + uOffset.yzx);
    vec3 w3 = worleyF(q * 90.0 + uOffset.zxy);
    float H = roads(w1, 0.02, texel * 7.0);
    float A = roads(w2, 0.03, texel * 26.0);
    float S = roads(w3, 0.05, texel * 90.0);
    float K = exp(-pow(w1.x / (0.10 + 0.18 * U), 2.0));
    float fabric = 0.035 + 0.10 * K + 0.24 * H + 0.14 * A
        + 0.055 * S * smoothstep(0.05, 0.5, U);
    if (uLook > 0.5) fabric += ${CITY_LOOK_B.arterial} * A;
    vec3 base = uCityColor;
    vec3 accent = districtTint(w2.z);
    vec3 tint = mix(base, accent, 0.30 * uNeon);
    vec3 E = U * (tint * fabric + base * 0.35 * K * K);
    outC = vec4(clamp(E, 0.0, 1.0), clamp(U * K * K, 0.0, 1.0));
}`;

export type CityBake = {
    wants(profile: BakeProfile): boolean;
    /** Selects A, B or C before the next face. The page and the worker each have their own. */
    look(index: number): void;
    attach(gl: WebGL2RenderingContext, cube: GpuCube): void;
    paintFace(gl: WebGL2RenderingContext, cube: GpuCube, profile: BakeProfile, face: number): void;
    finish(gl: WebGL2RenderingContext, cube: GpuCube): void;
};

function must<T>(value: T | null, what: string): T {
    if (!value) throw new Error(what);
    return value;
}

/** One quad and one framebuffer for the C pass. The program is linked by the caller. */
export function createCityBake(gl: WebGL2RenderingContext, linked: LinkedProgram): CityBake {
    const quad = must(gl.createBuffer(), 'city quad');
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const fbo = must(gl.createFramebuffer(), 'city framebuffer');

    function attach(context: WebGL2RenderingContext, cube: GpuCube): void {
        const levels = Math.log2(cube.size) + 1;
        const texture = must(context.createTexture(), 'city cube');
        context.bindTexture(context.TEXTURE_CUBE_MAP, texture);
        context.texStorage2D(context.TEXTURE_CUBE_MAP, levels, context.RGBA8, cube.size, cube.size);
        context.texParameteri(context.TEXTURE_CUBE_MAP, context.TEXTURE_MIN_FILTER, context.LINEAR_MIPMAP_LINEAR);
        context.texParameteri(context.TEXTURE_CUBE_MAP, context.TEXTURE_MAG_FILTER, context.LINEAR);
        context.texParameteri(context.TEXTURE_CUBE_MAP, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
        context.texParameteri(context.TEXTURE_CUBE_MAP, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
        cube.c = texture;
    }

    function paintFace(context: WebGL2RenderingContext, cube: GpuCube, profile: BakeProfile, face: number): void {
        const texture = cube.c;
        if (!texture) return;
        const lights = profile.lights as { color?: number[]; neon?: number };
        const u = linked.uniforms;
        context.useProgram(linked.prog);
        context.bindFramebuffer(context.FRAMEBUFFER, fbo);
        context.framebufferTexture2D(context.FRAMEBUFFER, context.COLOR_ATTACHMENT0, context.TEXTURE_CUBE_MAP_POSITIVE_X + face, texture, 0);
        context.drawBuffers([context.COLOR_ATTACHMENT0]);
        const status = context.checkFramebufferStatus(context.FRAMEBUFFER);
        if (status !== context.FRAMEBUFFER_COMPLETE) throw new Error('city framebuffer ' + status);
        context.viewport(0, 0, cube.size, cube.size);
        context.activeTexture(context.TEXTURE0);
        context.bindTexture(context.TEXTURE_CUBE_MAP, cube.b);
        context.uniform1i(u.uB ?? null, 0);
        context.uniform1i(u.uFace ?? null, face);
        context.uniform1f(u.uSize ?? null, cube.size);
        context.uniform3fv(u.uOffset ?? null, profile.offsets);
        context.uniform3fv(u.uCityColor ?? null, norm3(lights.color || [255, 238, 226]));
        context.uniform1f(u.uNeon ?? null, lights.neon || 0);
        context.uniform1f(u.uGas ?? null, profile.kind === 'gas' ? 1 : 0);
        context.uniform1f(u.uLook ?? null, cityLook().index);
        context.uniform1f(u.uPop ?? null, (profile.lights as { pop?: number }).pop || 0);
        context.bindBuffer(context.ARRAY_BUFFER, quad);
        context.enableVertexAttribArray(0);
        context.vertexAttribPointer(0, 2, context.FLOAT, false, 0, 0);
        context.drawArrays(context.TRIANGLE_STRIP, 0, 4);
        context.bindFramebuffer(context.FRAMEBUFFER, null);
    }

    function finish(context: WebGL2RenderingContext, cube: GpuCube): void {
        if (!cube.c) return;
        context.bindFramebuffer(context.FRAMEBUFFER, null);
        context.bindTexture(context.TEXTURE_CUBE_MAP, cube.c);
        context.generateMipmap(context.TEXTURE_CUBE_MAP);
    }

    function look(index: number): void {
        setCityLook(index >= 1.5 ? 'C' : index >= 0.5 ? 'B' : 'A');
    }

    return { wants: cityWanted, look, attach, paintFace, finish };
}
