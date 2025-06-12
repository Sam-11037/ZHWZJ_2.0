// index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { HashRouter } from 'react-router-dom';  // 引入 BrowserRouter
import 'katex/dist/katex.min.css';
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <HashRouter>  {/* 将 HashRouter 包裹整个应用 */}
      <App />
    </HashRouter>
  </React.StrictMode>
);

reportWebVitals();
