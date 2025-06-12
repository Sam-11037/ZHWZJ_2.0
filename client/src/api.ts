// src/api.ts
import axios from 'axios';
import { message } from 'antd';

const api = axios.create({
  baseURL: 'http://reuben.s7.tunnelfrp.com/',
});

// 请求拦截器：自动给请求加上token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：捕获401，自动登出
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      message.error('Session expired, please login again.');
      localStorage.removeItem('token');
      localStorage.removeItem('tokenExpiry');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
