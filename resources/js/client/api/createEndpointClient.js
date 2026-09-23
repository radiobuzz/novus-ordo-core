/** Endpoint definitions contain URLs; callers provide data, never transport implementation. */
export function createEndpointClient(definitions, request) {
    return Object.freeze(
        Object.fromEntries(
            Object.entries(definitions).map(([name, endpoint]) => [
                name,
                async ({ params = {}, query, body, signal } = {}) => {
                    const path = endpoint.path.replace(/\{(\w+)\}/g, (_, key) => {
                        if (params[key] === undefined || params[key] === null)
                            throw new Error(`Missing route parameter: ${key}`);
                        const value = String(params[key]);
                        // Dot segments would be normalized by URL(), changing the requested endpoint.
                        if (value === '.' || value === '..')
                            throw new Error(`Invalid route parameter: ${key}`);
                        const encoded = encodeURIComponent(value);
                        return endpoint.doubleEncodedParams?.includes(key)
                            ? encodeURIComponent(encoded)
                            : encoded;
                    });
                    return request({ method: endpoint.method, path, query, body, signal });
                },
            ]),
        ),
    );
}
