import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 관리자 토큰 확인 (admin-token 사용)
    const token = localStorage.getItem('admin-token');
    if (token) {
      fetchUserInfo(token);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserInfo = async (token) => {
    try {
      const response = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const userData = await response.json();
        // 관리자만 접근 가능
        if (userData.email === 'admin@admin.com') {
          setUser(userData);
        } else {
          localStorage.removeItem('admin-token');
        }
      } else {
        localStorage.removeItem('admin-token');
      }
    } catch (error) {
      console.error('사용자 정보 조회 실패:', error);
      localStorage.removeItem('admin-token');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (token, userData) => {
    localStorage.setItem('admin-token', token);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin-token');
    setUser(null);
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <Router basename="/admin">
      <Routes>
        <Route 
          path="/" 
          element={!user ? <AdminLogin onLogin={handleLogin} /> : <Navigate to="/dashboard" />} 
        />
        <Route 
          path="/dashboard" 
          element={user ? <AdminDashboard user={user} onLogout={handleLogout} /> : <Navigate to="/" />} 
        />
      </Routes>
    </Router>
  );
}

export default App;
