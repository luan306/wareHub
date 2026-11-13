import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PrintQueueProvider } from './context/PrintQueueContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { PrintLabelsProvider } from './context/PrintLabelsContext';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Devices } from './pages/Devices';
import { Handovers } from './pages/Handovers';
import { Loans } from './pages/Loans';
import { DeviceHistory } from './pages/DeviceHistory';
import { Users } from './pages/Users';
import { PrintTemplates } from './pages/PrintTemplates';

function LoginRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/thiet-bi" replace /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <ConnectionProvider>
      <ConnectionStatus />
      <PrintLabelsProvider>
      <PrintQueueProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/thiet-bi" element={<Devices />} />
            <Route path="/phieu-ban-giao" element={<Handovers />} />
            <Route path="/muon-thiet-bi" element={<Loans />} />
            <Route
              path="/lich-su-sua"
              element={
                <ProtectedRoute adminOnly>
                  <DeviceHistory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nguoi-dung"
              element={
                <ProtectedRoute adminOnly>
                  <Users />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mau-in"
              element={
                <ProtectedRoute adminOnly>
                  <PrintTemplates />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/thiet-bi" replace />} />
        </Routes>
      </PrintQueueProvider>
      </PrintLabelsProvider>
      </ConnectionProvider>
    </AuthProvider>
  );
}
