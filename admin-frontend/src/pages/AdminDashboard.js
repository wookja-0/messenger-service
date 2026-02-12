import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  FiUsers, FiMessageCircle, FiHome, FiLogOut, FiRefreshCw,
  FiTrendingUp, FiActivity, FiBarChart2, FiShield, FiEye, FiX
} from 'react-icons/fi';
import './AdminDashboard.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function AdminDashboard({ user, onLogout }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomMessages, setRoomMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersLoading, setUsersLoading] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    // 관리자 권한 확인 (admin-token 사용)
    const token = localStorage.getItem('admin-token');
    if (!token) {
      handleLogout();
      return;
    }

    // 사용자 정보 확인
    fetch(`${API_URL}/api/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    })
      .then(res => {
        if (!res.ok) {
          handleLogout();
          return;
        }
        return res.json();
      })
      .then(userData => {
        if (userData && userData.email === 'admin@admin.com') {
          loadStats();
          loadUsers();
          loadRooms();
        } else {
          handleLogout();
        }
      })
      .catch(() => {
        handleLogout();
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('admin-token');
      const response = await fetch(`${API_URL}/api/admin/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setStats(data);
      } else {
        if (response.status === 403 || response.status === 401) {
          handleLogout();
        } else {
          setError('통계 정보를 불러오는데 실패했습니다');
        }
      }
    } catch (error) {
      console.error('통계 로드 오류:', error);
      setError('서버 연결에 실패했습니다');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const token = localStorage.getItem('admin-token');
      const response = await fetch(`${API_URL}/api/admin/users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data.users || []);
      } else {
        if (response.status === 403 || response.status === 401) {
          handleLogout();
        } else {
          setError('사용자 목록을 불러오는데 실패했습니다');
        }
      }
    } catch (error) {
      console.error('사용자 목록 로드 오류:', error);
      setError('서버 연결에 실패했습니다');
    } finally {
      setUsersLoading(false);
    }
  };

  const loadRooms = async () => {
    setRoomsLoading(true);
    try {
      const token = localStorage.getItem('admin-token');
      const response = await fetch(`${API_URL}/api/admin/rooms`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRooms(data.rooms || []);
      } else {
        if (response.status === 403 || response.status === 401) {
          handleLogout();
        } else {
          setError('채팅방 목록을 불러오는데 실패했습니다');
        }
      }
    } catch (error) {
      console.error('채팅방 목록 로드 오류:', error);
      setError('서버 연결에 실패했습니다');
    } finally {
      setRoomsLoading(false);
    }
  };

  const loadRoomMessages = async (roomId) => {
    setMessagesLoading(true);
    try {
      const token = localStorage.getItem('admin-token');
      const response = await fetch(`${API_URL}/api/admin/rooms/${roomId}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRoomMessages(data || []);
      } else {
        if (response.status === 403 || response.status === 401) {
          handleLogout();
        } else {
          setError('메시지를 불러오는데 실패했습니다');
        }
      }
    } catch (error) {
      console.error('메시지 로드 오류:', error);
      setError('서버 연결에 실패했습니다');
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleRoomClick = (room) => {
    setSelectedRoom(room);
    loadRoomMessages(room.id);
  };

  const closeRoomViewer = () => {
    setSelectedRoom(null);
    setRoomMessages([]);
  };

  const handleLogout = () => {
    localStorage.removeItem('admin-token');
    onLogout();
    navigate('/');
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatMessageTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '방금';
    if (diffMins < 60) return `${diffMins}분 전`;
    if (diffHours < 24) return `${diffHours}시간 전`;
    if (diffDays === 1) return '어제';
    if (diffDays < 7) return `${diffDays}일 전`;
    
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="admin-dashboard-loading">
        <div className="loading-spinner"></div>
        <p>로딩 중...</p>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="admin-header-content">
          <div className="admin-header-left">
            <FiShield className="admin-header-icon" />
            <h1>관리자 대시보드</h1>
          </div>
          <div className="admin-header-right">
            <button
              className="admin-refresh-btn"
              onClick={() => {
                loadStats();
                loadUsers();
                loadRooms();
              }}
              title="새로고침"
            >
              <FiRefreshCw />
            </button>
            <button
              className="admin-home-btn"
              onClick={() => window.location.href = '/'}
              title="홈으로"
            >
              <FiHome />
            </button>
            <button
              className="admin-logout-btn"
              onClick={handleLogout}
              title="로그아웃"
            >
              <FiLogOut />
            </button>
          </div>
        </div>
      </header>

      <div className="admin-content">
        {error && (
          <motion.div
            className="admin-error"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {error}
          </motion.div>
        )}

        {/* 통계 카드 */}
        {stats && (
          <div className="admin-stats-section">
            <h2 className="section-title">전체 통계</h2>
            <div className="stats-grid">
              <motion.div
                className="stat-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
              >
                <div className="stat-icon users">
                  <FiUsers />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stats.total.users}</div>
                  <div className="stat-label">전체 사용자</div>
                  <div className="stat-sub">활성: {stats.total.active_users}</div>
                </div>
              </motion.div>

              <motion.div
                className="stat-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <div className="stat-icon rooms">
                  <FiMessageCircle />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stats.total.rooms}</div>
                  <div className="stat-label">채팅방</div>
                </div>
              </motion.div>

              <motion.div
                className="stat-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <div className="stat-icon messages">
                  <FiActivity />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stats.total.messages}</div>
                  <div className="stat-label">메시지</div>
                </div>
              </motion.div>

              <motion.div
                className="stat-card"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                <div className="stat-icon trending">
                  <FiTrendingUp />
                </div>
                <div className="stat-content">
                  <div className="stat-value">{stats.recent_7d.new_users}</div>
                  <div className="stat-label">최근 7일 신규 사용자</div>
                </div>
              </motion.div>
            </div>

            <div className="stats-details">
              <div className="detail-section">
                <h3 className="detail-title">
                  <FiBarChart2 />
                  최근 활동
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">최근 7일:</span>
                    <span className="detail-value">
                      사용자 {stats.recent_7d.new_users}명, 
                      방 {stats.recent_7d.new_rooms}개, 
                      메시지 {stats.recent_7d.new_messages}개
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">최근 30일:</span>
                    <span className="detail-value">
                      사용자 {stats.recent_30d.new_users}명, 
                      방 {stats.recent_30d.new_rooms}개, 
                      메시지 {stats.recent_30d.new_messages}개
                    </span>
                  </div>
                </div>
              </div>

              <div className="detail-section">
                <h3 className="detail-title">
                  <FiBarChart2 />
                  평균 통계
                </h3>
                <div className="detail-grid">
                  <div className="detail-item">
                    <span className="detail-label">사용자당 평균 방 수:</span>
                    <span className="detail-value">{stats.averages.rooms_per_user}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">사용자당 평균 메시지 수:</span>
                    <span className="detail-value">{stats.averages.messages_per_user}</span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">방당 평균 메시지 수:</span>
                    <span className="detail-value">{stats.averages.messages_per_room}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 채팅방 목록 */}
        <div className="admin-rooms-section">
          <div className="section-header">
            <h2 className="section-title">채팅방 목록</h2>
            <span className="room-count">총 {rooms.length}개</span>
          </div>

          {roomsLoading ? (
            <div className="loading-state">로딩 중...</div>
          ) : rooms.length === 0 ? (
            <div className="empty-state">채팅방이 없습니다</div>
          ) : (
            <div className="rooms-grid">
              {rooms.map((room, index) => (
                <motion.div
                  key={room.id}
                  className="room-card"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleRoomClick(room)}
                >
                  <div className="room-card-header">
                    <FiMessageCircle className="room-icon" />
                    <div className="room-card-title">
                      <h3>{room.name}</h3>
                      {room.is_private && <span className="private-badge">비공개</span>}
                    </div>
                  </div>
                  <div className="room-card-info">
                    <div className="room-info-item">
                      <span className="room-info-label">생성자:</span>
                      <span className="room-info-value">{room.creator_name}</span>
                    </div>
                    <div className="room-info-item">
                      <span className="room-info-label">멤버:</span>
                      <span className="room-info-value">{room.member_count}명</span>
                    </div>
                    {room.last_message && (
                      <div className="room-last-message">
                        <span className="room-info-label">최근 메시지:</span>
                        <span className="room-info-value">{room.last_message}</span>
                      </div>
                    )}
                  </div>
                  <button className="view-room-btn">
                    <FiEye /> 메시지 보기
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </div>

        {/* 사용자 목록 */}
        <div className="admin-users-section">
          <div className="section-header">
            <h2 className="section-title">사용자 목록</h2>
            <span className="user-count">총 {users.length}명</span>
          </div>

          {usersLoading ? (
            <div className="loading-state">로딩 중...</div>
          ) : users.length === 0 ? (
            <div className="empty-state">사용자가 없습니다</div>
          ) : (
            <div className="users-table-container">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>이메일</th>
                    <th>사용자명</th>
                    <th>가입일</th>
                    <th>상태</th>
                    <th>참여 방 수</th>
                    <th>메시지 수</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user, index) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <td>{user.email}</td>
                      <td>{user.username}</td>
                      <td>{formatDate(user.created_at)}</td>
                      <td>
                        <span className={`status-badge ${user.is_active ? 'active' : 'inactive'}`}>
                          {user.is_active ? '활성' : '비활성'}
                        </span>
                      </td>
                      <td>{user.room_count}</td>
                      <td>{user.message_count}</td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 채팅방 메시지 뷰어 모달 */}
        {selectedRoom && (
          <motion.div
            className="room-viewer-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeRoomViewer}
          >
            <motion.div
              className="room-viewer-modal"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="room-viewer-header">
                <div>
                  <h2>{selectedRoom.name}</h2>
                  <p className="room-viewer-subtitle">
                    생성자: {selectedRoom.creator_name} | 멤버: {selectedRoom.member_count}명
                  </p>
                </div>
                <button className="close-viewer-btn" onClick={closeRoomViewer}>
                  <FiX />
                </button>
              </div>

              <div className="room-viewer-content">
                {messagesLoading ? (
                  <div className="loading-state">메시지 로딩 중...</div>
                ) : roomMessages.length === 0 ? (
                  <div className="empty-state">메시지가 없습니다</div>
                ) : (
                  <div className="messages-list">
                    {roomMessages.map((msg, index) => (
                      <motion.div
                        key={msg.id}
                        className="message-item"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.02 }}
                      >
                        <div className="message-header">
                          <span className="message-username">{msg.username}</span>
                          <span className="message-time">
                            {formatMessageTime(msg.timestamp)}
                          </span>
                        </div>
                        <div className="message-content">
                          {msg.fileInfo ? (
                            <div className="file-message">
                              <span>📎 {msg.fileInfo.originalName || '파일'}</span>
                              {msg.text && <span className="file-caption">{msg.text}</span>}
                            </div>
                          ) : (
                            <span>{msg.text}</span>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
