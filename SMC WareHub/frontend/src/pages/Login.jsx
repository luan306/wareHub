import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/thiet-bi');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo"><img src={smcLogo} alt="SMC" /></div>
        <div className="login-eyebrow">Warehouse Control Center</div>
        <h1>Sign in to <span>WareHub</span></h1>

        <div className="login-fields">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="login-options">
          <label className="remember-option"><input type="checkbox" /> <span>Keep me signed in</span></label>
          <button className="forgot-link" type="button" onClick={() => setError('Vui lòng liên hệ quản trị viên để đặt lại mật khẩu.')}>Forgot password? ↗</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}
