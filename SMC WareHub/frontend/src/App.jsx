import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { PrintQueueProvider } from './context/PrintQueueContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Devices } from './pages/Devices';
import { DeviceHistory } from './pages/DeviceHistory';
import { Users } from './pages/Users';

export default function App() {
  return (
    <AuthProvider>
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
    </AuthProvider>
  );
}
