const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;
const PASSWORD_ITERATIONS = 100000;
const PASSWORD_SALT_LENGTH = 16;
const PASSWORD_PREFIX = 'pbkdf2$';

function base64Encode(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.length; i++) {
        binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
}

function base64Decode(str: string): Uint8Array {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

function hexToBytes(hex: string): Uint8Array | null {
    if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
        return null;
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: ALGORITHM, length: KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );
}

async function derivePasswordBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );

    return new Uint8Array(bits);
}

export async function encryptContent(content: string, encryptionKey: string): Promise<string> {
    if (!content) return '';

    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const key = await deriveKey(encryptionKey, salt);

    const encrypted = await crypto.subtle.encrypt(
        { name: ALGORITHM, iv: iv },
        key,
        new TextEncoder().encode(content)
    );

    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return base64Encode(combined);
}

export async function decryptContent(encryptedData: string, encryptionKey: string): Promise<string> {
    if (!encryptedData) return '';

    try {
        const combined = base64Decode(encryptedData);

        const salt = combined.slice(0, SALT_LENGTH);
        const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

        const key = await deriveKey(encryptionKey, salt);

        const decrypted = await crypto.subtle.decrypt(
            { name: ALGORITHM, iv: iv },
            key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('Decryption error:', e);
        return '[解密失败]';
    }
}

async function hashPasswordLegacy(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = new Uint8Array(hashBuffer);

    let hex = '';
    for (let i = 0; i < hashArray.length; i++) {
        hex += hashArray[i].toString(16).padStart(2, '0');
    }
    return hex;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = crypto.getRandomValues(new Uint8Array(PASSWORD_SALT_LENGTH));
    const derived = await derivePasswordBits(password, salt, PASSWORD_ITERATIONS);
    return `${PASSWORD_PREFIX}${PASSWORD_ITERATIONS}$${base64Encode(salt)}$${base64Encode(derived)}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
    if (!storedHash) return false;

    if (storedHash.startsWith(PASSWORD_PREFIX)) {
        const parts = storedHash.split('$');
        if (parts.length !== 4) return false;
        const iterations = Number(parts[1]);
        if (!Number.isFinite(iterations) || iterations <= 0) return false;
        const salt = base64Decode(parts[2]);
        const expected = base64Decode(parts[3]);
        const derived = await derivePasswordBits(password, salt, iterations);
        return timingSafeEqual(derived, expected);
    }

    const legacyHash = await hashPasswordLegacy(password);
    const legacyBytes = hexToBytes(legacyHash);
    const storedBytes = hexToBytes(storedHash);
    if (!legacyBytes || !storedBytes) return false;
    return timingSafeEqual(legacyBytes, storedBytes);
}

export function generateKey(minLength = 3, maxLength = 7): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz';
    const length = Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);

    let key = '';
    for (let i = 0; i < length; i++) {
        key += chars[randomValues[i] % chars.length];
    }
    return key;
}

export function generateSessionToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return base64Encode(bytes).replace(/[+/=]/g, c =>
        c === '+' ? '-' : c === '/' ? '_' : ''
    );
}
