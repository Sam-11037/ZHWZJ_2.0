// index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';  // 引入 BrowserRouter

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter>  {/* 将 BrowserRouter 包裹整个应用 */}
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// 如果想开始衡量应用性能，可以传递一个函数来记录结果
reportWebVitals();
