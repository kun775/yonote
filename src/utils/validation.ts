export function sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
}

export function isValidKey(key: string): boolean {
    return /^[a-zA-Z0-9_-]{1,128}$/.test(key);
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
