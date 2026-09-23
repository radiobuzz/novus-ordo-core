/** Public static JSON, deliberately outside the authenticated PHP endpoint client. */
export function createTurnStatusReader(baseUrl, fetchImpl = globalThis.fetch) {
    return async (gameId, signal) => {
        if (!Number.isSafeInteger(gameId) || gameId < 1) throw new Error('Invalid game ID.');
        const url = new URL(`${baseUrl.replace(/\/$/, '')}/var/turn-status/game-${gameId}.json`);
        url.searchParams.set('_', String(Date.now()));
        const response = await fetchImpl(url, { signal, cache: 'no-store', credentials: 'omit' });
        if (!response.ok) throw new Error('Turn status unavailable.');
        const status = await response.json();
        if (
            status?.version !== 1 ||
            status.game_id !== gameId ||
            !Number.isSafeInteger(status.turn_number) ||
            status.turn_number < 1 ||
            !['ready', 'processing', 'failed'].includes(status.state) ||
            typeof status.revision !== 'string' ||
            !/^[a-f0-9]{32}$/.test(status.revision) ||
            !Number.isSafeInteger(status.updated_at) ||
            status.updated_at < 0
        )
            throw new Error('Invalid turn status.');
        return status;
    };
}
