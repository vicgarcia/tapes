import { HashRouter, Routes, Navigate } from "react-router-dom";
import { Route } from "react-router-dom";
import { AuthProvider, RequireAuth, Logout } from "@app/services/auth";
import { Login } from "@app/components/Login";
import { Dashboard } from "@app/components/Dashboard";

function App() {
    return <HashRouter>
        <AuthProvider>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
                <Route path="/logout" element={<Logout />} />
                <Route path="*" element={<Navigate to="/login" />} />
            </Routes>
        </AuthProvider>
    </HashRouter>
}

export default App;
