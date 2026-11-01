import axios from "axios";
import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from 'react-router-dom';

export type AuthProviderType = {
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthProviderType|undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    axios.get('/auth')
      .then(() => setIsAuthenticated(true));
  }, []);

  const login = async (username: string, password: string) => {
    const payload = new URLSearchParams();
    payload.append('username', username);
    payload.append('password', password);

    return axios.post('/login', payload)
      .then(() => {
        setIsAuthenticated(true);
      });
  };

  const logout = async () => {
    return axios.post('/logout')
      .then(() => {
        setIsAuthenticated(false);
      })
  }

  // Provide the authentication context to the children components
  return <AuthContext.Provider value={{ isAuthenticated, login, logout }}>
    {children}
  </AuthContext.Provider>
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthProviderType => {
  return useContext(AuthContext) as AuthProviderType;
};

export type RequireAuthProps = {
  children: JSX.Element
}

export function RequireAuth({ children }: RequireAuthProps) {
  const auth = useAuth();
  const location = useLocation();
  if (auth.isAuthenticated !== true) return <Navigate to="/login" state={{ from: location }} />;
  return children;
}

export function Logout() {
  const auth = useAuth();
  auth.logout();
  return <Navigate to="/login" />
}
