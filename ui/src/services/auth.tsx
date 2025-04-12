import axios from "axios";
import { createContext, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from 'react-router-dom';
import httpClient from "@app/services/base";

export type AuthProviderType = {
  isAuthenticated: boolean
  login: Function
  logout: Function
}

// @ts-ignore
const AuthContext = createContext();

export const AuthProvider = ({ children }: any) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    axios.get('/auth')
      .then(_ => setIsAuthenticated(true));
  }, []);

  const login = async (username: string, password: string) => {
    const payload = new URLSearchParams();
    payload.append('username', username);
    payload.append('password', password);

    return axios.post('/login', payload)
      .then(response => {
        setIsAuthenticated(true);
      });
  };

  const logout = () => {
    return axios.post('/logout')
      .then(response => {
        setIsAuthenticated(false);
      })
  }

  // Provide the authentication context to the children components
  return <AuthContext.Provider value={{ login, logout }}>
    {children}
  </AuthContext.Provider>
};

export const useAuth = (): AuthProviderType => {
  return useContext(AuthContext) as AuthProviderType;
};

export type RequireAuthProps = {
  children: JSX.Element
}

export function RequireAuth({ children }: RequireAuthProps) {
  let auth = useAuth();
  let location = useLocation();
  if (auth.isAuthenticated === true) return <Navigate to="/login" state={{ from: location }} />;
  return children;
}

export function Logout() {
  let auth = useAuth();
  auth.logout();
  return <Navigate to="/login" />
}
