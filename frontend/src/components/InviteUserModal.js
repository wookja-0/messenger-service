import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiX, FiSearch, FiUser, FiCheck } from 'react-icons/fi';
import './InviteUserModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function InviteUserModal({ roomId, user, onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadAllUsers();
  }, []);

  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      searchUsers();
    } else {
      loadAllUsers();
    }
  }, [searchQuery]);

  const loadAllUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      // 검색어가 없을 때는 빈 쿼리로 전체 사용자 목록 가져오기
      const query = searchQuery.trim() || '';
      const response = await fetch(`${API_URL}/api/users/search?query=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('사용자 목록 로드 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchUsers = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/users/search?query=${encodeURIComponent(searchQuery.trim())}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('사용자 검색 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserSelection = (userId) => {
    setSelectedUsers(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleInvite = async () => {
    if (selectedUsers.length === 0) {
      setError('초대할 사용자를 선택해주세요.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      // 현재 사용자 정보 가져오기
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const currentUser = await userResponse.json();
      
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/invite?user_id=${currentUser.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          user_ids: selectedUsers
        })
      });

      if (response.ok) {
        onSuccess();
      } else {
        const errorData = await response.json();
        setError(errorData.detail || '초대에 실패했습니다.');
      }
    } catch (error) {
      setError('서버에 연결할 수 없습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal-content invite-modal"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>사용자 초대</h2>
          <button className="close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <div className="modal-body">
          {error && <div className="error-message">{error}</div>}

          <div className="search-section">
            <div className="search-box">
              <FiSearch className="search-icon" />
              <input
                type="text"
                placeholder="이메일 또는 이름으로 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {selectedUsers.length > 0 && (
            <div className="selected-users">
              <h4>선택된 사용자 ({selectedUsers.length})</h4>
              <div className="selected-list">
                {selectedUsers.map(userId => {
                  const user = users.find(u => u.id === userId);
                  if (!user) return null;
                  return (
                    <div key={userId} className="selected-user-chip">
                      <span>{user.username}</span>
                      <button 
                        type="button"
                        onClick={() => toggleUserSelection(userId)}
                        className="remove-chip-btn"
                      >
                        <FiX size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="users-list">
            {loading ? (
              <div className="loading">로딩 중...</div>
            ) : users.length === 0 ? (
              <div className="empty-state">
                {searchQuery.trim().length >= 2 ? (
                  <p>검색 결과가 없습니다</p>
                ) : (
                  <p>사용자가 없습니다</p>
                )}
              </div>
            ) : (
              users
                .filter(u => !selectedUsers.includes(u.id))
                .map((u) => {
                  return (
                    <div
                      key={u.id}
                      className="user-item"
                      onClick={() => toggleUserSelection(u.id)}
                    >
                      <div className="user-avatar">
                        {u.username.charAt(0).toUpperCase()}
                      </div>
                      <div className="user-info">
                        <span className="user-name">{u.username}</span>
                        <span className="user-email">{u.email}</span>
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button
            type="button"
            className="cancel-btn"
            onClick={onClose}
            disabled={submitting}
          >
            취소
          </button>
          <motion.button
            type="button"
            className={`submit-btn ${selectedUsers.length > 0 ? 'active' : ''}`}
            onClick={handleInvite}
            disabled={submitting || selectedUsers.length === 0}
            whileHover={selectedUsers.length > 0 ? { scale: 1.02 } : {}}
            whileTap={selectedUsers.length > 0 ? { scale: 0.98 } : {}}
          >
            {submitting ? '초대 중...' : `${selectedUsers.length}명 초대하기`}
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default InviteUserModal;
