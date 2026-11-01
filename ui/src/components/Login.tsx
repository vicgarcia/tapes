import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { isBadCredentials, useAuth } from "@app/services/auth";
import { Icon } from "./common/Icon";

export function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const navigate = useNavigate();
    const location = useLocation();
    const auth = useAuth();

    // back to where the user was headed before the login redirect
    const from = (location.state as { from?: { pathname: string, search: string } } | null)?.from;

    useEffect(() => {
        if (auth.status === 'authenticated') {
            navigate(from ? `${from.pathname}${from.search}` : '/', { replace: true });
        }
    }, [auth.status, from, navigate]);

    const submit = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (username.trim() === '') return setError('Enter your username');
        if (password === '') return setError('Enter your password');
        setBusy(true);
        try {
            await auth.login(username.trim(), password);
        } catch (err) {
            setError(isBadCredentials(err) ? 'Wrong username or password' : 'Could not sign in, try again');
            setBusy(false);
        }
    };

    const edit = (setter: (value: string) => void) => (value: string) => {
        setError(null);
        setter(value);
    };

    if (auth.status === 'checking') return null;

    return <main className="login">
        <form className="login-card" onSubmit={submit} noValidate>
            <div className="login-brand">
                <span className="brand-mark"><Icon name="shield" size={26} /></span>
                <h1>Tapes</h1>
            </div>
            <label className="field">
                <span>Username</span>
                <input
                    type="text"
                    name="username"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    value={username}
                    onChange={e => edit(setUsername)(e.currentTarget.value)}
                    aria-invalid={error !== null}
                    autoFocus
                />
            </label>
            <label className="field">
                <span>Password</span>
                <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={e => edit(setPassword)(e.currentTarget.value)}
                    aria-invalid={error !== null}
                />
            </label>
            <div className="login-error" role="alert">{error}</div>
            <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? 'Signing in…' : 'Sign in'}
            </button>
        </form>
    </main>;
}
