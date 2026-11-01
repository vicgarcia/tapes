import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate, Outlet, Link } from 'react-router-dom';
import { AuthProvider, RequireAuth, Logout } from '@app/services/auth';
import { useServerStatus } from '@app/hooks/useServerStatus';
import { Login } from './Login';
import { Offline } from './Offline';
import { Icon } from './common/Icon';
import { CamerasHome } from './cameras/CamerasHome';

const CameraView = lazy(() => import('./player/CameraView'));

export default function App() {
    const { isServerReachable, retry } = useServerStatus();
    if (isServerReachable === null) return null;
    if (!isServerReachable) return <Offline onRetry={retry} />;

    return <HashRouter>
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/logout" element={<Logout />} />
                <Route element={<RequireAuth><Shell /></RequireAuth>}>
                    <Route path="/" element={<CamerasHome />} />
                </Route>
                <Route path="/cameras/:name" element={<RequireAuth><Suspense fallback={<main className="fullscreen-state"><div className="spinner" /></main>}><CameraView /></Suspense></RequireAuth>} />
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </AuthProvider>
    </HashRouter>;
}

function Shell() {
    return <div className="shell">
        <header className="topbar">
            <div className="topbar-inner">
                <span className="brand">TAPES</span>
                <Link to="/logout" className="btn-icon topbar-logout" aria-label="Sign out" title="Sign out">
                    <Icon name="logout" size={20} />
                </Link>
            </div>
        </header>
        <Outlet />
    </div>;
}
