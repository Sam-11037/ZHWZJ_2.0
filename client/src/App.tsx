import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Modal } from 'antd';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import Dashboard from './Dashboard';
import DocumentEditor from './DocumentEditor';
import PersonalCenter from './PersonalCenter';
import axios from 'axios';
import SheetEditor from './SheetEditor'; 
import MarkdownEditor from './MarkdownEditor'; 
const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const location = useLocation();
  const navigate = useNavigate();

  // 检查token和过期时间
  useEffect(() => {
    const token = localStorage.getItem('token');
    const expire = Number(localStorage.getItem('token_expire'));
    const now = Date.now();

    if (token && expire && now < expire) {
      axios.get('http://localhost:4000/me', {
        headers: { Authorization: `Bearer ${token}` }
      }).then(() => {
        setIsAuthenticated(true);
      }).catch((error) => {
        localStorage.removeItem('token');
        localStorage.removeItem('token_expire');
        setIsAuthenticated(false);

        // 如果是“Session expired or invalid”，弹窗提示
        const msg = error?.response?.data?.message;
        if (msg === 'Session expired or invalid') {
          Modal.warning({
            title: '账号已在其他设备登录',
            content: '您的账号已在其他设备登录，当前会话已失效。',
            onOk: () => {
              if (location.pathname !== '/login' && location.pathname !== '/register') {
                navigate('/login', { replace: true });
              }
            }
          });
        } else {
          if (location.pathname !== '/login' && location.pathname !== '/register') {
            navigate('/login', { replace: true });
          }
        }
      });
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('token_expire');
      setIsAuthenticated(false);
      if (location.pathname !== '/login' && location.pathname !== '/register') {
        navigate('/login', { replace: true });
      }
    }
    // eslint-disable-next-line
  }, [location.pathname, navigate]);

  // 用户有操作时刷新过期时间
  useEffect(() => {
    const refreshExpire = () => {
      if (localStorage.getItem('token')) {
        localStorage.setItem('token_expire', (Date.now() + 60 * 60 * 1000).toString());
      }
    };
    window.addEventListener('click', refreshExpire);
    window.addEventListener('keydown', refreshExpire);
    window.addEventListener('mousemove', refreshExpire);
    window.addEventListener('scroll', refreshExpire);

    return () => {
      window.removeEventListener('click', refreshExpire);
      window.removeEventListener('keydown', refreshExpire);
      window.removeEventListener('mousemove', refreshExpire);
      window.removeEventListener('scroll', refreshExpire);
    };
  }, []);

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/personal-center" element={<PersonalCenter />} />
      <Route path="/edit/:id" element={<DocumentEditor />} />
      <Route path="/sheet/:id" element={<SheetEditor />} />
      <Route path="/md/:id" element={<MarkdownEditor />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

export default App;
