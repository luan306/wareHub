import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PrintQueueProvider } from './context/PrintQueueContext';
import { ConnectionProvider } from './context/ConnectionContext';
import { ConnectionStatus } from './components/ConnectionStatus';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Devices } from './pages/Devices';
import { Handovers } from './pages/Handovers';
import { Loans } from './pages/Loans';
import { DeviceHistory } from './pages/DeviceHistory';
import { Users } from './pages/Users';

// Đã đăng nhập rồi mà gõ thẳng /login (hoặc bấm Back) thì đưa luôn về trang chính — không hiện lại form đăng nhập
// (dễ gây tưởng nhầm cần đăng nhập lại, hoặc lỡ tay đăng nhập đè bằng tài khoản khác giữa chừng).
function LoginRoute() {
  const { user } = useAuth();
  return user ? <Navigate to="/thiet-bi" replace /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <ConnectionProvider>
      <ConnectionStatus />
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
          </Route>

          <Route path="*" element={<Navigate to="/thiet-bi" replace />} />
        </Routes>
      </PrintQueueProvider>
      </ConnectionProvider>
    </AuthProvider>
  );
}
