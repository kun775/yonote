export function timeAgo(timestamp: number): string {
    const now = Math.floor(Date.now() / 1000);
    const secondsAgo = now - timestamp;

    if (secondsAgo < 60) {
        return `${secondsAgo}秒前`;
    } else if (secondsAgo < 3600) {
        return `${Math.floor(secondsAgo / 60)}分钟前`;
    } else if (secondsAgo < 86400) {
        return `${Math.floor(secondsAgo / 3600)}小时前`;
    } else if (secondsAgo < 604800) {
        return `${Math.floor(secondsAgo / 86400)}天前`;
    } else {
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
}

export function formatDate(timestamp: number): string {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN');
}

export function now(): number {
    return Math.floor(Date.now() / 1000);
}
