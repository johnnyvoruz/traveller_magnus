/**
 * A software WebAuthn authenticator for the passkey tests.
 * It uses Node's WebCrypto P-256 key and attestation format "none".
 * @simplewebauthn/server verifies the responses.
 */
import { webcrypto } from 'node:crypto';
import { encodeCBOR } from '@levischuck/tiny-cbor';

const subtle = webcrypto.subtle;

function b64url(bytes) {
    return Buffer.from(bytes).toString('base64url');
}

function b64urlToBytes(value) {
    return new Uint8Array(Buffer.from(value, 'base64url'));
}

function derFromRaw(raw) {
    function integer(buf) {
        let start = 0;
        while (start < buf.length - 1 && buf[start] === 0) start += 1;
        let body = Buffer.from(buf.subarray(start));
        if (body[0] & 0x80) body = Buffer.concat([Buffer.from([0]), body]);
        return Buffer.concat([Buffer.from([0x02, body.length]), body]);
    }
    const r = integer(raw.subarray(0, raw.length / 2));
    const s = integer(raw.subarray(raw.length / 2));
    const body = Buffer.concat([r, s]);
    return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

async function sha256(bytes) {
    const digest = await subtle.digest('SHA-256', bytes);
    return new Uint8Array(digest);
}

function clientData(type, challenge, origin) {
    return new TextEncoder().encode(JSON.stringify({
        type,
        challenge,
        origin,
        crossOrigin: false,
    }));
}

function coseKey(x, y) {
    return encodeCBOR(new Map([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, x],
        [-3, y],
    ]));
}

/** One P-256 credential. `origin` is the site origin and `rpID` is its host. */
export async function createSoftwareAuthenticator() {
    const key = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const credentialId = webcrypto.getRandomValues(new Uint8Array(32));
    const jwk = await subtle.exportKey('jwk', key.publicKey);
    return {
        async registrationResponse({ challenge, rpID, origin }) {
            const rpIdHash = await sha256(new TextEncoder().encode(rpID));
            const cose = coseKey(b64urlToBytes(jwk.x), b64urlToBytes(jwk.y));
            const authData = Buffer.concat([
                Buffer.from(rpIdHash),
                Buffer.from([0x45]),
                Buffer.from([0, 0, 0, 0]),
                Buffer.alloc(16),
                Buffer.from([(credentialId.length >> 8) & 0xff, credentialId.length & 0xff]),
                Buffer.from(credentialId),
                Buffer.from(cose),
            ]);
            const attestation = encodeCBOR(new Map([
                ['fmt', 'none'],
                ['attStmt', new Map()],
                ['authData', new Uint8Array(authData)],
            ]));
            const collected = clientData('webauthn.create', challenge, origin);
            return {
                id: b64url(credentialId),
                rawId: b64url(credentialId),
                type: 'public-key',
                authenticatorAttachment: 'platform',
                clientExtensionResults: {},
                response: {
                    clientDataJSON: b64url(collected),
                    attestationObject: b64url(attestation),
                    transports: ['internal'],
                },
            };
        },
        async authenticationResponse({ challenge, rpID, origin }) {
            const rpIdHash = await sha256(new TextEncoder().encode(rpID));
            const authData = Buffer.concat([
                Buffer.from(rpIdHash),
                Buffer.from([0x05]),
                Buffer.from([0, 0, 0, 0]),
            ]);
            const collected = clientData('webauthn.get', challenge, origin);
            const clientHash = await sha256(collected);
            const signed = Buffer.concat([authData, Buffer.from(clientHash)]);
            const raw = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key.privateKey, signed));
            return {
                id: b64url(credentialId),
                rawId: b64url(credentialId),
                type: 'public-key',
                authenticatorAttachment: 'platform',
                clientExtensionResults: {},
                response: {
                    clientDataJSON: b64url(collected),
                    authenticatorData: b64url(authData),
                    signature: b64url(derFromRaw(raw)),
                    userHandle: b64url(credentialId),
                },
            };
        },
    };
}
