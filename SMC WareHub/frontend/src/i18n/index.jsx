import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { common, serverMessages } from './messages/common';
import { devices } from './messages/devices';
import { handovers } from './messages/handovers';
import { loans } from './messages/loans';

const MESSAGES = { ...common, ...devices, ...handovers, ...loans };

export const LANGUAGES = ['vi', 'en'];
const STORAGE_KEY = 'warehub-lang';

function readStoredLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(saved) ? saved : 'vi';
  } catch {
    return 'vi';
  }
}

let currentLanguage = readStoredLanguage();

export function translate(key, vars) {
  const entry = MESSAGES[key];
  let text = entry ? entry[currentLanguage === 'en' ? 1 : 0] : key;
  if (vars) Object.entries(vars).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
  return text;
}

export function translateServerMessage(message) {
  if (currentLanguage !== 'en' || !message) return message;
  const exact = serverMessages.exact[message];
  if (exact) return exact;
  for (const [pattern, build] of serverMessages.patterns) {
    const match = pattern.exec(message);
    if (match) return build(...match.slice(1));
  }
  return message;
}

export const currentLocale = () => (currentLanguage === 'en' ? 'en-GB' : 'vi-VN');

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(currentLanguage);

  const setLanguage = useCallback((next) => {
    if (!LANGUAGES.includes(next)) return;
    currentLanguage = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
    setLanguageState(next);
  }, []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  const value = useMemo(() => ({
    language,
    setLanguage,
    t: (key, vars) => translate(key, vars),
    locale: language === 'en' ? 'en-GB' : 'vi-VN',
  }), [language, setLanguage]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT() {
  return useContext(LanguageContext);
}

export function LanguageSwitch({ className = '' }) {
  const { language, setLanguage, t } = useT();
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t('lang.label')}>
      {LANGUAGES.map((code) => (
        <button
          key={code}
          type="button"
          className={language === code ? 'active' : ''}
          aria-pressed={language === code}
          title={t(`lang.${code}`)}
          onClick={() => setLanguage(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
