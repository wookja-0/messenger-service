import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiX } from 'react-icons/fi';
import './CreateRoomModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function CreateRoomModal({ user, onClose, onSuccess }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
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
    setLoadingUsers(true);
    try {
      const token = localStorage.getItem('token');
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
      setLoadingUsers(false);
    }
  };

  const searchUsers = async () => {
    setLoadingUsers(true);
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
      setLoadingUsers(false);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('채팅방 이름을 입력해주세요.');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      console.log('[CreateRoomModal] 채팅방 생성 시작');
      
      // 현재 사용자 정보 가져오기
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!userResponse.ok) {
        console.error('[CreateRoomModal] 사용자 정보 조회 실패:', userResponse.status);
        setError('사용자 정보를 가져올 수 없습니다.');
        setLoading(false);
        return;
      }
      
      const currentUser = await userResponse.json();
      console.log('[CreateRoomModal] 현재 사용자:', currentUser.id);
      
      const requestBody = {
        name: name.trim(),
        description: description.trim() || null,
        is_private: false
      };
      console.log('[CreateRoomModal] 요청 데이터:', requestBody);
      
      const response = await fetch(`${API_URL}/api/rooms?user_id=${currentUser.id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      console.log('[CreateRoomModal] 응답 상태:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('[CreateRoomModal] 채팅방 생성 성공:', data);
        
        // 선택된 사용자들이 있으면 초대
        if (selectedUsers.length > 0) {
          try {
            const inviteResponse = await fetch(`${API_URL}/api/rooms/${data.id}/invite?user_id=${currentUser.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
              },
              body: JSON.stringify({
                user_ids: selectedUsers
              })
            });

            if (inviteResponse.ok) {
              console.log('[CreateRoomModal] 사용자 초대 성공');
            } else {
              console.error('[CreateRoomModal] 사용자 초대 실패:', inviteResponse.status);
            }
          } catch (inviteError) {
            console.error('[CreateRoomModal] 사용자 초대 중 예외 발생:', inviteError);
          }
        }
        
        onSuccess();
      } else {
        const responseText = await response.text();
        console.error('[CreateRoomModal] 채팅방 생성 실패:', response.status, responseText);
        let errorData = { detail: '채팅방 생성에 실패했습니다.' };
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          console.error('[CreateRoomModal] JSON 파싱 실패:', e);
        }
        setError(errorData.detail || '채팅방 생성에 실패했습니다.');
      }
    } catch (error) {
      console.error('[CreateRoomModal] 채팅방 생성 중 예외 발생:', error);
      setError('서버에 연결할 수 없습니다. 네트워크 연결을 확인해주세요.');
    } finally {
      setLoading(false);
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
        className="modal-content"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>새 채팅방 만들기</h2>
          <button className="close-btn" onClick={onClose}>
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label>채팅방 이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 개발팀 채팅방"
              required
              maxLength={50}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label>설명 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="채팅방에 대한 설명을 입력하세요"
              rows={3}
              maxLength={200}
              autoComplete="off"
            />
          </div>

          <div className="form-group">
            <label>사용자 초대 (선택)</label>
            <div className="user-invite-section">
              <div className="search-box-invite">
                <input
                  type="text"
                  placeholder="이메일 또는 이름으로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoComplete="off"
                />
              </div>

              {selectedUsers.length > 0 && (
                <div className="selected-users-invite">
                  <div className="selected-list-invite">
                    {selectedUsers.map(userId => {
                      const user = users.find(u => u.id === userId);
                      if (!user) return null;
                      return (
                        <div key={userId} className="selected-user-chip-invite">
                          <span>{user.username}</span>
                          <button
                            type="button"
                            onClick={() => toggleUserSelection(userId)}
                            className="remove-chip-btn-invite"
                          >
                            <FiX size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="users-list-invite">
                {loadingUsers ? (
                  <div className="loading-invite">로딩 중...</div>
                ) : users.length === 0 ? (
                  <div className="empty-state-invite">
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
                          className="user-item-invite"
                          onClick={() => toggleUserSelection(u.id)}
                        >
                          <div className="user-avatar-invite">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="user-info-invite">
                            <span className="user-name-invite">{u.username}</span>
                            <span className="user-email-invite">{u.email}</span>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </div>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
              disabled={loading}
            >
              취소
            </button>
            <motion.button
              type="submit"
              className="submit-btn"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? '생성 중...' : '생성하기'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export default CreateRoomModal;
