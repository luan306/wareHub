import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useT, LanguageSwitch } from '../i18n';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

export function Login() {
  const { login } = useAuth();
  const { t } = useT();
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
      <LanguageSwitch className="login-lang" />
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-logo"><img src={smcLogo} alt="SMC" /></div>
        <div className="login-eyebrow">{t('login.eyebrow')}</div>
        <h1>{t('login.titlePrefix')}<span>WareHub</span></h1>

        <div className="login-fields">
          <label htmlFor="username">{t('login.username')}</label>
          <input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />

          <label htmlFor="password">{t('login.password')}</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <div className="login-options">
          <label className="remember-option"><input type="checkbox" /> <span>{t('login.keepSignedIn')}</span></label>
          <button className="forgot-link" type="button" onClick={() => setError(t('login.forgotMessage'))}>{t('login.forgot')}</button>
        </div>

        {error && <div className="error-box">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? t('login.signingIn') : t('login.signIn')}
        </button>
      </form>
    </div>
  );
}
