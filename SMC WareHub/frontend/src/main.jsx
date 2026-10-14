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
// Phiếu bàn giao/mượn thiết bị in theo phong cách chữ có chân cổ điển (Times New Roman) + chữ không chân (Arial) —
// cả 2 đều là font của Microsoft, không được phép đóng gói/tự host kèm ứng dụng. Tinos và Arimo là font MIỄN PHÍ,
// GIẤY PHÉP MỞ (Apache 2.0, của Google) tương thích kích thước gần như tuyệt đối với Times New Roman/Arial — thay
// thế vào thì bản in gần như không đổi hình thức, nhưng không còn phụ thuộc máy in có cài sẵn font bản quyền.
import '@fontsource/tinos/400.css';
import '@fontsource/tinos/700.css';
import '@fontsource/tinos/400-italic.css';
import '@fontsource-variable/arimo/wght.css';
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
