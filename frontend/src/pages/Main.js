import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiPlus, FiLogOut, FiUser, FiMessageCircle, FiUsers, 
  FiSearch, FiX, FiSettings, FiGlobe
} from 'react-icons/fi';
import CreateRoomModal from '../components/CreateRoomModal';
import ProfileMenu from '../components/ProfileMenu';
import './Main.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function Main({ user, onLogout, onProfileUpdate }) {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [showOnlineUsers, setShowOnlineUsers] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadRooms();
    loadOnlineUsers();
    // 주기적으로 온라인 사용자 목록 및 채팅방 목록 갱신
    const onlineInterval = setInterval(loadOnlineUsers, 3000);
    const roomsInterval = setInterval(loadRooms, 5000);
    return () => {
      clearInterval(onlineInterval);
      clearInterval(roomsInterval);
    };
  }, []);

  const loadRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('[Main] 채팅방 목록 로드 시작');
      
      // user 정보에서 id 가져오기
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!userResponse.ok) {
        console.error('[Main] 사용자 정보 조회 실패:', userResponse.status);
        setRooms([]);
        setLoading(false);
        return;
      }
      
      const currentUser = await userResponse.json();
      console.log('[Main] 현재 사용자:', currentUser.id);
      
      const response = await fetch(`${API_URL}/api/rooms?user_id=${currentUser.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('[Main] 채팅방 목록 응답 상태:', response.status, response.statusText);

      if (response.ok) {
        const data = await response.json();
        console.log('[Main] 채팅방 목록 로드 성공:', data.length, '개');
        setRooms(data || []);
      } else {
        const responseText = await response.text();
        console.error('[Main] 채팅방 목록 로드 실패:', response.status, responseText);
        let errorData = {};
        try {
          errorData = JSON.parse(responseText);
        } catch (e) {
          console.error('[Main] JSON 파싱 실패:', e);
        }
        setRooms([]);
      }
    } catch (error) {
      console.error('[Main] 채팅방 목록 로드 중 예외 발생:', error);
      setRooms([]);
    } finally {
      setLoading(false);
    }
  };

  const loadOnlineUsers = async () => {
    try {
      const token = localStorage.getItem('token');
      console.log('[Main] 온라인 사용자 목록 로드 시작');
      const response = await fetch(`${API_URL}/api/online-users`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('[Main] 온라인 사용자 응답 상태:', response.status, response.statusText);
      
      if (response.ok) {
        const data = await response.json();
        console.log('[Main] 온라인 사용자 목록 로드 성공:', data.length, '명');
        setOnlineUsers(data);
      } else {
        const responseText = await response.text();
        console.error('[Main] 온라인 사용자 목록 로드 실패:', response.status, responseText.substring(0, 200));
        setOnlineUsers([]);
      }
    } catch (error) {
      console.error('[Main] 온라인 사용자 목록 로드 중 예외 발생:', error);
      setOnlineUsers([]);
    }
  };

  const handleRoomClick = (roomId) => {
    navigate(`/room/${roomId}`);
  };

  const formatLastMessageTime = (timestamp) => {
    if (!timestamp) return '';
    // ISO 문자열이 'Z'로 끝나지 않으면 UTC로 간주하고 추가
    let isoString = timestamp;
    if (!isoString.endsWith('Z') && !isoString.includes('+') && !isoString.includes('-', 10)) {
      isoString = isoString + 'Z';
    }
    const date = new Date(isoString);
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
    
    // 한국 시간대로 변환하여 표시
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    });
  };

  const filteredRooms = rooms.filter(room =>
    room.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="main-page">
      <header className="main-header">
        <div className="header-content">
          <div className="header-left">
            <FiMessageCircle className="header-logo" />
            <h1>사내 메신저</h1>
          </div>
          <div className="header-right">
            <button
              className="show-online-users-btn header-icon-btn"
              onClick={() => setShowOnlineUsers(true)}
              title="온라인 사용자"
            >
              <FiUsers />
              {onlineUsers.length > 0 && (
                <span className="online-count-badge">{onlineUsers.length}</span>
              )}
            </button>
            <button
              className="header-icon-btn"
              onClick={() => window.open('/admin', '_blank')}
              title="관리자 페이지 (새 창)"
            >
              <FiSettings />
            </button>
            <div className="user-menu">
              <FiUser />
              <span>{user.username}</span>
            </div>
            <ProfileMenu
              user={user}
              onLogout={onLogout}
              onProfileUpdate={onProfileUpdate}
            />
          </div>
        </div>
      </header>

      <div className="main-content">
        <div className="sidebar">
          <div className="sidebar-header">
            <h2>채팅방</h2>
            <motion.button
              className="create-room-btn create-room-btn--small"
              onClick={() => setShowCreateModal(true)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              title="새 방 만들기"
            >
              <FiPlus />
              <span className="create-room-btn-text">새 방 만들기</span>
            </motion.button>
          </div>

          <div className="search-box">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="채팅방 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search"
                onClick={() => setSearchQuery('')}
              >
                <FiX />
              </button>
            )}
          </div>

          <div className="rooms-list">
            {loading ? (
              <div className="loading">로딩 중...</div>
            ) : filteredRooms.length === 0 ? (
              <div className="empty-state">
                <FiMessageCircle size={48} />
                <p>채팅방이 없습니다</p>
                <p className="empty-hint">새 방을 만들어 시작하세요</p>
              </div>
            ) : (
              <AnimatePresence>
                {filteredRooms.map((room) => (
                  <motion.div
                    key={room.id}
                    className="room-item"
                    onClick={() => handleRoomClick(room.id)}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className={`room-icon ${room.name === "오픈채팅방" ? "room-icon-open" : "room-icon-private"}`}>
                      {room.name === "오픈채팅방" ? <FiGlobe /> : <FiMessageCircle />}
                    </div>
                    <div className="room-info">
                      <div className="room-name-row">
                        <div className="room-name-container">
                          <div className="room-name">{room.name}</div>
                          {room.name === "오픈채팅방" && (
                            <span className="room-type-badge open">오픈</span>
                          )}
                        </div>
                        <div className="room-header-right">
                          {room.last_message_time && (
                            <span className="room-timestamp">{formatLastMessageTime(room.last_message_time)}</span>
                          )}
                          {room.unread_count > 0 && (
                            <span className="unread-badge">{room.unread_count}</span>
                          )}
                        </div>
                      </div>
                      {room.last_message && (
                        <div className="room-last-message">{room.last_message}</div>
                      )}
                      <div className="room-meta">
                        <FiUsers size={12} />
                        <span>{room.member_count || 0}명</span>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </div>

        <div className="main-area">
          <motion.div
            className="empty-panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            <FiMessageCircle size={72} />
            <h2>채팅방을 선택하세요</h2>
            <p>왼쪽에서 채팅방을 선택하거나 새 방을 만들어 시작하세요</p>
          </motion.div>
        </div>

        <AnimatePresence>
          {showOnlineUsers && (
            <motion.div
              className="online-users-drawer"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: "spring", stiffness: 100 }}
            >
              <div className="drawer-header">
                <h3>
                  <FiUsers />
                  온라인 사용자 ({onlineUsers.length})
                </h3>
                <button
                  className="close-drawer-btn"
                  onClick={() => setShowOnlineUsers(false)}
                >
                  <FiX />
                </button>
              </div>
              <div className="online-users-list">
                {onlineUsers.length === 0 ? (
                  <div className="empty-online">온라인 사용자가 없습니다</div>
                ) : (
                  onlineUsers.map((onlineUser) => (
                    <div key={onlineUser.id} className="online-user-item">
                      <div className="online-indicator-dot"></div>
                      <span>{onlineUser.username}</span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateRoomModal
            user={user}
            onClose={() => setShowCreateModal(false)}
            onSuccess={() => {
              setShowCreateModal(false);
              loadRooms();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default Main;
