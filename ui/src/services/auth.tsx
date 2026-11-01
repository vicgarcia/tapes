// Auth context, hooks and route guards live together as the auth "service".
/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, request } from './base';

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

export type AuthContextType = {
    status: AuthStatus
    login: (username: string, password: string) => Promise<void>
    logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [status, setStatus] = useState<AuthStatus>('checking');

    useEffect(() => {
        const controller = new AbortController();
        request('/auth', { signal: controller.signal })
            .then(() => { if (!controller.signal.aborted) setStatus('authenticated'); })
            .catch(() => { if (!controller.signal.aborted) setStatus('anonymous'); });

        // any API call answering 401 ends the session
        const onUnauthorized = () => setStatus('anonymous');
        window.addEventListener('unauthorized', onUnauthorized);
        return () => {
            controller.abort();
            window.removeEventListener('unauthorized', onUnauthorized);
        };
    }, []);

    const login = useCallback(async (username: string, password: string) => {
        const body = new URLSearchParams({ username, password });
        await request('/login', { method: 'POST', body });
        setStatus('authenticated');
    }, []);

    const logout = useCallback(async () => {
        try {
            await request('/logout', { method: 'POST' });
        } finally {
            setStatus('anonymous');
        }
    }, []);

    return <AuthContext.Provider value={{ status, login, logout }}>
        {children}
    </AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth outside AuthProvider');
    return context;
}

export function isBadCredentials(error: unknown): boolean {
    return error instanceof ApiError && error.status === 401;
}

export function RequireAuth({ children }: { children: JSX.Element }) {
    const { status } = useAuth();
    const location = useLocation();
    if (status === 'checking') return null;
    if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location }} />;
    return children;
}

export function Logout() {
    const auth = useAuth();
    const navigate = useNavigate();
    const called = useRef(false);

    useEffect(() => {
        if (called.current) return;
        called.current = true;
        const finish = () => navigate('/login', { replace: true });
        void auth.logout().then(finish, finish);
    }, [auth, navigate]);

    return null;
}
