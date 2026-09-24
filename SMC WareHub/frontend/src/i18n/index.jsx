import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { common, serverMessages } from './messages/common';
import { devices } from './messages/devices';
import { handovers } from './messages/handovers';

// Mỗi khoá là [tiếng Việt, tiếng Anh] để hai ngôn ngữ luôn nằm cạnh nhau, khó bỏ sót.
const MESSAGES = { ...common, ...devices, ...handovers };

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

// Ngôn ngữ hiện tại cũng được giữ ở mức module để code ngoài React (api client, confirm/alert) dùng được.
let currentLanguage = readStoredLanguage();

export function translate(key, vars) {
  const entry = MESSAGES[key];
  let text = entry ? entry[currentLanguage === 'en' ? 1 : 0] : key;
  if (vars) Object.entries(vars).forEach(([name, value]) => { text = text.split(`{${name}}`).join(String(value)); });
  return text;
}

// Lỗi trả về từ backend là tiếng Việt; khi giao diện đang ở tiếng Anh thì dịch các câu đã biết, câu lạ giữ nguyên.
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
    currentLanguage = next; // đặt ngay để mọi lần dịch trong lượt render kế tiếp đã dùng ngôn ngữ mới
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* bỏ qua */ }
    setLanguageState(next);
  }, []);

  useEffect(() => { document.documentElement.lang = language; }, [language]);

  // Đổi identity của t khi ngôn ngữ đổi để các component dùng useT() render lại.
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
