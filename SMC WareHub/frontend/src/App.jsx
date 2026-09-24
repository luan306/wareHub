import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrintQueueProvider } from './context/PrintQueueContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Devices } from './pages/Devices';
import { Handovers } from './pages/Handovers';
import { DeviceHistory } from './pages/DeviceHistory';
import { Users } from './pages/Users';

export default function App() {
  return (
    <AuthProvider>
      <ConnectionProvider>
      <ConnectionStatus />
      <PrintQueueProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/thiet-bi" element={<Devices />} />
            <Route path="/phieu-ban-giao" element={<Handovers />} />
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
          </Route>

          <Route path="*" element={<Navigate to="/thiet-bi" replace />} />
        </Routes>
      </PrintQueueProvider>
      </ConnectionProvider>
    </AuthProvider>
  );
}
