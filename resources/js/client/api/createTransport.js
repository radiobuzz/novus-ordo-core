import { ApiError } from './ApiError.js';

function appendQuery(search, value, key) {
    if (value === undefined || value === null) return;
    if (typeof value === 'object') {
        for (const [child, item] of Object.entries(value))
            appendQuery(search, item, key ? `${key}[${child}]` : child);
    } else search.append(key, String(value));
}

export function createTransport({
    baseUrl,
    csrfToken,
    getCsrfToken,
    getLocale,
    gameId,
    getGameId,
    fetchImpl = globalThis.fetch,
}) {
    return async ({ method = 'GET', path, query, body, signal }) => {
        const url = new URL(`${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`);
        appendQuery(url.searchParams, query);
        const selectedGameId = getGameId ? getGameId() : gameId;
        const mutation = !['GET', 'HEAD'].includes(method);
        const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
        let response;
        try {
            response = await fetchImpl(url, {
                method,
                signal,
                credentials: 'same-origin',
                cache: 'no-store',
                headers: {
                    Accept: 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                    ...(selectedGameId != null ? { 'X-Game-Id': String(selectedGameId) } : {}),
                    ...(getLocale ? { 'X-Client-Locale': getLocale() } : {}),
                    ...(mutation
                        ? {
                              'X-CSRF-TOKEN': getCsrfToken?.() ?? csrfToken,
                              ...(!multipart ? { 'Content-Type': 'application/json' } : {}),
                          }
                        : {}),
                },
                ...(mutation && body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}),
            });
        } catch (cause) {
            const aborted = signal?.aborted || cause.name === 'AbortError';
            throw new ApiError(
                aborted ? 'abort' : 'network',
                aborted ? 'Request cancelled.' : 'Unable to reach the server.',
                { cause, uncertain: mutation },
            );
        }
        const status = response.status;
        if (response.redirected || status === 401 || status === 419) {
            throw new ApiError('session', 'Your session changed or expired. Sign in again.', {
                status,
                uncertain: mutation && response.redirected,
            });
        }
        if (status === 204) return null;
        let data;
        try {
            const text = await response.text();
            data = text ? JSON.parse(text) : null;
        } catch (cause) {
            if (signal?.aborted || cause.name === 'AbortError')
                throw new ApiError('abort', 'Request cancelled.', { status, uncertain: mutation, cause });
            if (response.ok)
                throw new ApiError('malformed', 'The server returned an unreadable response.', {
                    status,
                    uncertain: mutation,
                });
        }
        if (!response.ok) {
            const category =
                status === 422
                    ? 'validation'
                    : status === 409
                      ? 'conflict'
                      : status === 403
                        ? 'forbidden'
                        : [429, 503].includes(status)
                          ? 'unavailable'
                          : status === 404
                            ? 'not-found'
                            : 'server';
            const messages = {
                validation: 'Some values were rejected.',
                conflict: 'This action conflicts with the current state. Refresh to continue.',
                forbidden: 'You do not have access to this information.',
                unavailable: 'The server is busy or advancing the turn. Try again shortly.',
                'not-found': 'This information is no longer available.',
                server: 'The server could not complete this request.',
            };
            // Do not surface raw HTML, exception traces or database messages.
            throw new ApiError(category, messages[category], {
                status,
                fields: category === 'validation' ? (data?.errors ?? {}) : {},
                uncertain: mutation && status >= 500,
            });
        }
        return data;
    };
}
