export function sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

export function isValidKey(key: string): boolean {
    return /^[a-zA-Z0-9_-]{1,128}$/.test(key);
}

// 只放行站内路径，拒绝 https://evil、//evil、/\evil 这类会跳到外站的地址
export function safeRedirectPath(value: unknown, fallback: string): string {
    if (typeof value !== 'string' || !value.startsWith('/')) {
        return fallback;
    }

    const base = 'https://redirect.invalid';
    try {
        const url = new URL(value, base);
        if (url.origin !== base) {
            return fallback;
        }
        return `${url.pathname}${url.search}${url.hash}`;
    } catch {
        return fallback;
    }
}

export function escapeHtml(text: string): string {
    const escapeMap: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => escapeMap[char]);
}
