import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiLock, FiMail, FiShield } from 'react-icons/fi';
import './AdminLogin.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function AdminLogin({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_URL}/api/admin/login`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        onLogin(data.access_token, data.user);
        navigate('/dashboard');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || '로그인에 실패했습니다');
      }
    } catch (error) {
      console.error('관리자 로그인 오류:', error);
      setError('서버 연결에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <motion.div
        className="admin-login-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="admin-login-header">
          <FiShield className="admin-icon" />
          <h1>관리자 로그인</h1>
          <p>관리자 전용 페이지입니다</p>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="form-group">
            <label htmlFor="email">
              <FiMail />
              이메일
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@admin.com"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">
              <FiLock />
              비밀번호
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              required
            />
          </div>

          {error && (
            <motion.div
              className="error-message"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {error}
            </motion.div>
          )}

          <motion.button
            type="submit"
            className="admin-login-button"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

export default AdminLogin;
