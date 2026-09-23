// getRandomValues also works on the LAN HTTP development origin, unlike randomUUID.
export function randomId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}
