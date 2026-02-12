import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FiMail, FiLock, FiMessageCircle } from 'react-icons/fi';
import './Login.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function Login({ onLogin }) {
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

      const response = await fetch(`${API_URL}/token`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        onLogin(data.access_token, data.user);
        navigate('/');
      } else {
        const errorData = await response.json();
        setError(errorData.detail || '로그인에 실패했습니다.');
      }
    } catch (error) {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <div className="auth-header">
          <FiMessageCircle className="auth-logo" />
          <h1>사내 메신저</h1>
          <p>로그인하여 시작하세요</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}
          
          <div className="input-group">
            <FiMail className="input-icon" />
            <input
              type="email"
              placeholder="이메일"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <FiLock className="input-icon" />
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <motion.button
            type="submit"
            className="auth-button"
            disabled={loading}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {loading ? '로그인 중...' : '로그인'}
          </motion.button>
        </form>

        <div className="auth-footer">
          <p>계정이 없으신가요? <Link to="/register">회원가입</Link></p>
        </div>
      </motion.div>
    </div>
  );
}

export default Login;
