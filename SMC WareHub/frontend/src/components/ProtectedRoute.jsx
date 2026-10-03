import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children, adminOnly = false }) {
  const { user, isAdmin } = useAuth();

  if (!user) return <Navigate to="/login" replace />;
  // isAdmin (không phải so sánh thẳng user.role) để superadmin cũng vào được các trang chỉ-dành-cho-admin.
  if (adminOnly && !isAdmin) return <Navigate to="/thiet-bi" replace />;

  return children;
}
