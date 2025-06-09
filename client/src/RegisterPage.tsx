import './RegisterPage.css';
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const RegisterPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username || !password) {
      alert('Please enter both username and password');
      return;
    }

    try {
      const response = await axios.post('http://localhost:4000/register', { username, password });

      if (response.data.token) {
        localStorage.setItem('token', response.data.token);
        // 设置滑动过期时间
        localStorage.setItem('token_expire', (Date.now() + 60 * 60 * 1000).toString());
        navigate('/dashboard');
      }
    } catch (error: any) {
      console.error('Registration failed:', error);
      if (error.response?.data?.message) {
        alert(error.response.data.message);
      } else {
        alert('Registration failed. Please try again.');
      }
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <h1>Register</h1>
        <form onSubmit={handleRegister}>
          <div>
            <label>Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit">Register</button>
        </form>
        <p>Already have an account? <button onClick={() => navigate('/login')}>Login here</button></p>
      </div>
    </div>
  );
};

export default RegisterPage;
