// Small fetch wrapper shared by the domain services.
//
// - 401 → `unauthorized` window event (AuthProvider drops the session and the
//   router sends the user to the login page)
// - network failure → `server-unreachable` window event (App shows the offline
//   screen, e.g. when the VPN is down)
// - aborted requests are silent

export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
    }
}

export function isAbort(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
}

export type Query = Record<string, string | number | null | undefined>;

export function withQuery(path: string, query: Query = {}): string {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
        if (value !== null && value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

export async function request(url: string, init: RequestInit = {}): Promise<Response> {
    let response: Response;
    try {
        response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...init });
    } catch (error) {
        if (!isAbort(error)) window.dispatchEvent(new CustomEvent('server-unreachable'));
        throw error;
    }
    if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('unauthorized'));
        throw new ApiError(401, 'unauthorized');
    }
    if (!response.ok) {
        let message = response.statusText;
        try {
            message = (await response.json()).error ?? message;
        } catch {
            // body was not json
        }
        throw new ApiError(response.status, message);
    }
    return response;
}

export async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
    const response = await request(url, { signal, headers: { Accept: 'application/json' } });
    return response.json() as Promise<T>;
}
