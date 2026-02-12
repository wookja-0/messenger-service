import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FiX, FiLock } from 'react-icons/fi';
import './PasswordChangeModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function PasswordChangeModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('모든 필드를 입력해주세요');
      return;
    }

    if (newPassword.length < 6) {
      setError('새 비밀번호는 6자 이상이어야 합니다');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다');
      return;
    }

    if (currentPassword === newPassword) {
      setError('새 비밀번호는 현재 비밀번호와 달라야 합니다');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/me/change-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword
        })
      });

      if (response.ok) {
        // 성공 시 폼 초기화 및 모달 닫기
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
        alert('비밀번호가 성공적으로 변경되었습니다');
        onClose();
      } else {
        const errorData = await response.json();
        setError(errorData.detail || '비밀번호 변경에 실패했습니다');
      }
    } catch (error) {
      setError('서버 연결에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-content password-change-modal"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <FiLock className="modal-icon" />
            <h2>비밀번호 수정</h2>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && (
            <div className="error-message">{error}</div>
          )}

          <div className="form-group">
            <label htmlFor="current-password">현재 비밀번호</label>
            <input
              id="current-password"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호를 입력하세요"
              className="form-input"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="new-password">새 비밀번호</label>
            <input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호를 입력하세요 (6자 이상)"
              className="form-input"
              autoComplete="new-password"
              required
            />
            <p className="form-hint">비밀번호는 6자 이상이어야 합니다</p>
          </div>

          <div className="form-group">
            <label htmlFor="confirm-password">새 비밀번호 확인</label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호를 다시 입력하세요"
              className="form-input"
              autoComplete="new-password"
              required
            />
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={loading}
            >
              취소
            </button>
            <motion.button
              type="submit"
              className="btn-primary"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? '변경 중...' : '변경'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}

export default PasswordChangeModal;
