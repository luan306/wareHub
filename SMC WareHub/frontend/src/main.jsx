import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { LanguageProvider } from './i18n';
// Font tự lưu trong ứng dụng (gói @fontsource), không tải từ Google Fonts: máy trong mạng nội bộ không cần internet.
// Các gói này có sẵn các bộ ký tự latin, latin-ext và vietnamese nên tiếng Việt có dấu hiển thị đúng.
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/sora/wght.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-ext-500.css';
import '@fontsource/ibm-plex-mono/vietnamese-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-ext-600.css';
import '@fontsource/ibm-plex-mono/vietnamese-600.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);
