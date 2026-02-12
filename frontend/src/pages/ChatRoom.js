import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiSend, FiPaperclip, FiDownload, FiUser, FiLogOut, 
  FiMessageCircle, FiFile, FiClock, FiX, FiImage, FiVideo, 
  FiMusic, FiArrowLeft, FiUsers, FiUserPlus, FiSettings,
  FiTrash2, FiLogOut as FiExit
} from 'react-icons/fi';
import InviteUserModal from '../components/InviteUserModal';
import './ChatRoom.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';
const CLOUDFRONT_URL = process.env.REACT_APP_CLOUDFRONT_URL || '';

function ChatRoom({ user, onLogout }) {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [socket, setSocket] = useState(null);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadRoomInfo();
    loadMessages();
    loadMembers();
    
    // WebSocket 연결
    const ws = connectWebSocket();

    return () => {
      if (ws) {
        console.log('[ChatRoom] WebSocket 연결 종료');
        ws.close();
      }
    };
  }, [roomId]);

  useEffect(() => {
    if (messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      // 메시지를 읽었으므로 읽음 시간 업데이트
      updateReadTime();
    }
  }, [messages, roomId]);

  const updateReadTime = async () => {
    try {
      const token = localStorage.getItem('token');
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const currentUser = await userResponse.json();
      
      // 읽음 시간 업데이트를 위한 API 호출 (간단하게 채팅방 입장 시 자동 업데이트되므로 생략 가능)
      // 실제로는 WebSocket 연결 시 이미 업데이트됨
    } catch (error) {
      console.error('읽음 시간 업데이트 실패:', error);
    }
  };

  const loadRoomInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      // 현재 사용자 정보 가져오기
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const currentUser = await userResponse.json();
      
      const response = await fetch(`${API_URL}/api/rooms/${roomId}?user_id=${currentUser.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRoom(data);
        setCurrentUserId(currentUser.id);
      } else if (response.status === 403) {
        alert('이 채팅방에 접근할 권한이 없습니다.');
        navigate('/');
      }
    } catch (error) {
      console.error('채팅방 정보 로드 실패:', error);
    }
  };

  const loadMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      // 현재 사용자 정보 가져오기
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const currentUser = await userResponse.json();
      
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/messages?user_id=${currentUser.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (error) {
      console.error('메시지 로드 실패:', error);
    }
  };

  const loadMembers = async () => {
    try {
      const token = localStorage.getItem('token');
      // 현재 사용자 정보 가져오기
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const currentUser = await userResponse.json();
      
      const response = await fetch(`${API_URL}/api/rooms/${roomId}/members?user_id=${currentUser.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setMembers(data);
      }
    } catch (error) {
      console.error('멤버 목록 로드 실패:', error);
    }
  };

  const connectWebSocket = () => {
    // WebSocket URL 구성 - 현재 페이지의 프로토콜과 호스트 사용
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host;
    const wsUrl = `${wsProtocol}//${wsHost}/ws/${roomId}`;
    console.log('[ChatRoom] WebSocket 연결 시도:', wsUrl);
    
    const ws = new WebSocket(wsUrl);

    ws.onopen = async () => {
      console.log('[ChatRoom] WebSocket 연결 성공');
      // 현재 사용자 정보 가져오기
      try {
        const token = localStorage.getItem('token');
        const userResponse = await fetch(`${API_URL}/api/me`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const currentUser = await userResponse.json();
        
        // 사용자 입장
        console.log('[ChatRoom] 사용자 입장 요청:', currentUser.username);
        ws.send(JSON.stringify({
          type: 'join',
          user_id: currentUser.id,
          username: currentUser.username
        }));
      } catch (error) {
        console.error('[ChatRoom] 사용자 정보 조회 실패:', error);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[ChatRoom] WebSocket 메시지 수신:', data.type);
        
        if (data.type === 'previousMessages') {
          console.log('[ChatRoom] 이전 메시지 로드:', data.messages?.length, '개');
          setMessages(data.messages || []);
        } else if (data.type === 'message') {
          console.log('[ChatRoom] 새 메시지 수신:', data.username, data.text?.substring(0, 20));
          setMessages(prev => {
            // 중복 메시지 방지
            const exists = prev.find(m => m.id === data.id);
            if (exists) {
              console.log('[ChatRoom] 중복 메시지 무시:', data.id);
              return prev;
            }
            return [...prev, {
              id: data.id,
              username: data.username,
              text: data.text,
              timestamp: data.timestamp,
              fileInfo: data.fileInfo,
              profile_image_url: data.profile_image_url
            }];
          });
        } else if (data.type === 'roomMembers') {
          console.log('[ChatRoom] 참여자 목록 업데이트:', data.members?.length, '명');
          setMembers(data.members || []);
        } else if (data.type === 'onlineUsers') {
          // 온라인 사용자 목록 업데이트 (필요시)
        } else if (data.type === 'error') {
          console.error('[ChatRoom] WebSocket 에러:', data.message);
          alert(data.message);
          navigate('/');
        }
      } catch (error) {
        console.error('[ChatRoom] WebSocket 메시지 파싱 실패:', error, event.data);
      }
    };

    ws.onerror = (error) => {
      console.error('[ChatRoom] WebSocket 오류:', error);
    };

    ws.onclose = (event) => {
      console.log('[ChatRoom] WebSocket 연결 종료:', event.code, event.reason);
      // 재연결 로직 (정상 종료가 아닌 경우)
      if (event.code !== 1000) {
        console.log('[ChatRoom] 비정상 종료, 3초 후 재연결 시도...');
        setTimeout(() => {
          if (roomId) {
            const newWs = connectWebSocket();
            setSocket(newWs);
          }
        }, 3000);
      }
    };

    setSocket(ws);
    return ws;
  };

  const sendMessage = async (e) => {
    e.preventDefault();
    
    if (selectedFiles.length > 0) {
      await handleFileUpload();
    }
    
    if (inputMessage.trim()) {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('[ChatRoom] WebSocket이 연결되지 않음');
        alert('연결이 끊어졌습니다. 페이지를 새로고침해주세요.');
        return;
      }
      
      console.log('[ChatRoom] 메시지 전송:', inputMessage.substring(0, 20));
      socket.send(JSON.stringify({
        type: 'message',
        text: inputMessage
      }));
      setInputMessage('');
    }
  };

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    addFiles(files);
  };

  const addFiles = (files) => {
    const newFiles = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
      id: Date.now() + Math.random()
    }));
    setSelectedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id) => {
    setSelectedFiles(prev => {
      const fileToRemove = prev.find(f => f.id === id);
      if (fileToRemove?.preview) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  const handleFileUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    const uploadPromises = selectedFiles.map((fileObj) => {
      return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', fileObj.file);

        const xhr = new XMLHttpRequest();

        // 업로드 진행률 추적
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentCompleted = Math.round(
              (e.loaded * 100) / e.total
            );
            setUploadProgress(prev => ({
              ...prev,
              [fileObj.id]: percentCompleted
            }));
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            try {
              const fileData = JSON.parse(xhr.responseText);
              
              if (socket && socket.readyState === WebSocket.OPEN) {
                // 이미지 파일인 경우 텍스트 없이 파일 정보만 전송
                const isImage = fileData.mimetype?.startsWith('image/');
                socket.send(JSON.stringify({
                  type: 'message',
                  text: isImage ? '' : `📎 ${fileData.originalName}`,
                  fileInfo: fileData
                }));
              }
              
              resolve(fileData);
            } catch (error) {
              reject(new Error('파일 응답 파싱 실패'));
            }
          } else {
            reject(new Error(`파일 업로드 실패: ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('파일 업로드 네트워크 오류'));
        });

        xhr.open('POST', `${API_URL}/api/upload`);
        xhr.send(formData);
      });
    });

    try {
      await Promise.all(uploadPromises);
      selectedFiles.forEach(fileObj => {
        if (fileObj.preview) {
          URL.revokeObjectURL(fileObj.preview);
        }
      });
      setSelectedFiles([]);
      setUploadProgress({});
    } catch (error) {
      console.error('파일 업로드 실패:', error);
      alert('파일 업로드에 실패했습니다.');
    } finally {
      setUploadProgress({});
      setUploading(false);
    }
  };

  const handleFileDownload = (filename, originalName, fileUrl = null) => {
    window.open(`${API_URL}/api/files/${filename}`, '_blank');
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  const formatTime = (timestamp) => {
    // ISO 문자열이 'Z'로 끝나지 않으면 UTC로 간주하고 추가
    let isoString = timestamp;
    if (!isoString.endsWith('Z') && !isoString.includes('+') && !isoString.includes('-', 10)) {
      isoString = isoString + 'Z';
    }
    const date = new Date(isoString);
    // 한국 시간대로 변환하여 표시
    return date.toLocaleTimeString('ko-KR', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'Asia/Seoul'
    });
  };

  const formatDate = (timestamp) => {
    // ISO 문자열이 'Z'로 끝나지 않으면 UTC로 간주하고 추가
    let isoString = timestamp;
    if (!isoString.endsWith('Z') && !isoString.includes('+') && !isoString.includes('-', 10)) {
      isoString = isoString + 'Z';
    }
    const date = new Date(isoString);
    
    // 한국 시간대로 변환
    const kstDate = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 날짜만 비교 (시간 제외)
    const kstDateOnly = new Date(kstDate.getFullYear(), kstDate.getMonth(), kstDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    if (kstDateOnly.getTime() === todayOnly.getTime()) {
      return '오늘';
    } else if (kstDateOnly.getTime() === yesterdayOnly.getTime()) {
      return '어제';
    } else {
      return date.toLocaleDateString('ko-KR', { 
        month: 'long', 
        day: 'numeric',
        timeZone: 'Asia/Seoul'
      });
    }
  };

  const getFileIcon = (mimetype) => {
    if (!mimetype) return <FiFile />;
    if (mimetype.startsWith('image/')) return <FiImage />;
    if (mimetype.startsWith('video/')) return <FiVideo />;
    if (mimetype.startsWith('audio/')) return <FiMusic />;
    return <FiFile />;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm('정말로 이 채팅방을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const currentUser = await userResponse.json();

      const response = await fetch(`${API_URL}/api/rooms/${roomId}?user_id=${currentUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('채팅방이 삭제되었습니다.');
        navigate('/');
      } else {
        const errorData = await response.json();
        alert(errorData.detail || '채팅방 삭제에 실패했습니다.');
      }
    } catch (error) {
      console.error('채팅방 삭제 실패:', error);
      alert('채팅방 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleLeaveRoom = async () => {
    if (!window.confirm('정말로 이 채팅방에서 나가시겠습니까?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const userResponse = await fetch(`${API_URL}/api/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const currentUser = await userResponse.json();

      const response = await fetch(`${API_URL}/api/rooms/${roomId}/leave?user_id=${currentUser.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        alert('채팅방에서 나갔습니다.');
        navigate('/');
      } else {
        const errorData = await response.json();
        alert(errorData.detail || '채팅방 나가기에 실패했습니다.');
      }
    } catch (error) {
      console.error('채팅방 나가기 실패:', error);
      alert('채팅방 나가기 중 오류가 발생했습니다.');
    }
  };

  if (!room) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div 
      className="chat-room-page"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="chat-room-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate('/')}>
            <FiArrowLeft />
          </button>
          <div className="room-info">
            <h1>{room.name}</h1>
            {room.description && <p>{room.description}</p>}
          </div>
        </div>
        <div className="header-right">
          <button 
            className="show-members-btn"
            onClick={() => setShowMembers(!showMembers)}
            title={showMembers ? "참여자 목록 닫기" : "참여자 목록 보기"}
          >
            <FiUsers />
          </button>
          <div className="user-menu">
            <FiUser />
            <span>{user.username}</span>
          </div>
          {room && currentUserId && (
            <>
              {room.creator_id === currentUserId ? (
                <button 
                  className="delete-room-btn" 
                  onClick={handleDeleteRoom}
                  title="채팅방 삭제"
                >
                  <FiTrash2 />
                </button>
              ) : (
                <button 
                  className="leave-room-btn" 
                  onClick={handleLeaveRoom}
                  title="채팅방 나가기"
                >
                  <FiExit />
                </button>
              )}
            </>
          )}
          <button className="logout-btn" onClick={onLogout}>
            <FiLogOut />
          </button>
        </div>
      </header>

      <div className="chat-room-content">
        <div className={`chat-section ${isDragging ? 'dragging' : ''}`}>
          {isDragging && (
            <div className="drag-overlay">
              <div className="drag-content">
                <FiPaperclip size={48} />
                <p>파일을 여기에 놓으세요</p>
              </div>
            </div>
          )}

          <div className="chat-header">
            <h2>채팅</h2>
            <div className="online-indicator">
              <span className="dot"></span>
              <span>{members.length}명 참여 중</span>
            </div>
          </div>

          <div className="messages-container">
            <AnimatePresence>
              {messages.map((msg, index) => {
                const isOwn = msg.username === user.username;
                const showDate = index === 0 || 
                  formatDate(messages[index - 1].timestamp) !== formatDate(msg.timestamp);
                
                // 같은 사용자의 연속 메시지인지 확인
                const prevMessage = index > 0 ? messages[index - 1] : null;
                const isConsecutive = prevMessage && 
                  !showDate && 
                  prevMessage.username === msg.username &&
                  isOwn;
                const isConsecutiveOther = prevMessage && 
                  !showDate && 
                  prevMessage.username === msg.username &&
                  !isOwn;
                
                return (
                  <React.Fragment key={msg.id}>
                    {showDate && (
                      <div className="date-divider">
                        {formatDate(msg.timestamp)}
                      </div>
                    )}
                    <motion.div
                      className={`message-wrapper ${isOwn ? 'own-message-wrapper' : ''}`}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      {!msg.isSystem && !isOwn && !isConsecutiveOther && msg.profile_image_url && (
                        <div className="message-avatar">
                          <img 
                            src={msg.profile_image_url.startsWith('http') ? msg.profile_image_url : (msg.profile_image_url.startsWith('/') ? `${API_URL}${msg.profile_image_url}` : `${API_URL}/${msg.profile_image_url}`)} 
                            alt={msg.username}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      {!msg.isSystem && isOwn && !isConsecutive && msg.profile_image_url && (
                        <div className="message-avatar own-avatar">
                          <img 
                            src={msg.profile_image_url.startsWith('http') ? msg.profile_image_url : (msg.profile_image_url.startsWith('/') ? `${API_URL}${msg.profile_image_url}` : `${API_URL}/${msg.profile_image_url}`)} 
                            alt={msg.username}
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      <motion.div
                        className={`message ${isOwn ? 'own-message' : ''} ${msg.isSystem ? 'system-message' : ''} ${msg.fileInfo ? 'file-message' : ''} ${isConsecutive ? 'consecutive-own' : ''} ${isConsecutiveOther ? 'consecutive-other' : ''}`}
                      >
                        {!msg.isSystem && (
                          <div className="message-header">
                            <span className="message-username">{msg.username}</span>
                            <span className="message-time">
                              <FiClock />
                              {formatTime(msg.timestamp)}
                            </span>
                          </div>
                        )}
                      
                      {msg.fileInfo ? (
                        <div className="file-message-content">
                          {msg.fileInfo.mimetype?.startsWith('image/') ? (
                            <div className="image-preview">
                              <img 
                                src={msg.fileInfo.url.startsWith('http') ? msg.fileInfo.url : `${API_URL}${msg.fileInfo.url}`} 
                                alt={msg.fileInfo.originalName}
                                onClick={() => handleFileDownload(msg.fileInfo.filename, msg.fileInfo.originalName, msg.fileInfo.url)}
                              />
                              <div className="image-info">
                                <span className="file-name">{msg.fileInfo.originalName}</span>
                                <span className="file-size">{formatFileSize(msg.fileInfo.size)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="file-attachment">
                              <div className="file-icon-large">
                                {getFileIcon(msg.fileInfo.mimetype)}
                              </div>
                              <div className="file-details">
                                <span className="file-name">{msg.fileInfo.originalName}</span>
                                <span className="file-size">{formatFileSize(msg.fileInfo.size)}</span>
                              </div>
                              <button 
                                className="download-file-btn"
                                onClick={() => handleFileDownload(msg.fileInfo.filename, msg.fileInfo.originalName, msg.fileInfo.url)}
                              >
                                <FiDownload />
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="message-text">{msg.text}</div>
                      )}
                      </motion.div>
                    </motion.div>
                  </React.Fragment>
                );
              })}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

          {selectedFiles.length > 0 && (
            <div className="file-preview-container">
              {selectedFiles.map((fileObj) => (
                <motion.div
                  key={fileObj.id}
                  className="file-preview-item"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                >
                  {fileObj.preview ? (
                    <div className="image-preview-item">
                      <img src={fileObj.preview} alt={fileObj.file.name} />
                      <button 
                        className="remove-preview-btn"
                        onClick={() => removeFile(fileObj.id)}
                      >
                        <FiX />
                      </button>
                      {uploadProgress[fileObj.id] !== undefined && (
                        <div className="upload-progress">
                          <div 
                            className="progress-bar"
                            style={{ width: `${uploadProgress[fileObj.id]}%` }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="file-preview-item-content">
                      <div className="file-icon-preview">
                        {getFileIcon(fileObj.file.type)}
                      </div>
                      <div className="file-info-preview">
                        <span className="file-name-preview">{fileObj.file.name}</span>
                        <span className="file-size-preview">{formatFileSize(fileObj.file.size)}</span>
                      </div>
                      <button 
                        className="remove-preview-btn"
                        onClick={() => removeFile(fileObj.id)}
                      >
                        <FiX />
                      </button>
                      {uploadProgress[fileObj.id] !== undefined && (
                        <div className="upload-progress">
                          <div 
                            className="progress-bar"
                            style={{ width: `${uploadProgress[fileObj.id]}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          )}

          <form onSubmit={sendMessage} className="message-input-form">
            <div className="input-container">
              <label className="file-attach-btn">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  onChange={handleFileSelect}
                  className="file-input"
                />
                <FiPaperclip />
              </label>
              <input
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder="메시지를 입력하세요..."
                className="message-input"
              />
              <motion.button 
                type="submit" 
                className="send-btn"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                disabled={(!inputMessage.trim() && selectedFiles.length === 0) || uploading}
              >
                <FiSend />
              </motion.button>
            </div>
          </form>
        </div>

        <AnimatePresence>
          {showMembers && (
            <motion.div 
              className="members-sidebar"
              initial={{ x: 300, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 300, opacity: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              <div className="members-header">
                <h3>
                  <FiUsers />
                  참여자 ({members.length})
                </h3>
                <div className="members-header-actions">
                  <button 
                    className="invite-btn-small"
                    onClick={() => setShowInviteModal(true)}
                    title="사용자 초대"
                  >
                    <FiUserPlus />
                  </button>
                  <button 
                    className="close-members-btn"
                    onClick={() => setShowMembers(false)}
                  >
                    <FiX />
                  </button>
                </div>
              </div>
              <div className="members-list">
                {members.map((member) => (
                  <div key={member.id} className="member-item">
                    <div className="member-avatar">
                      {member.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="member-info">
                      <div className="member-name-row">
                        <span className="member-name">{member.username}</span>
                        {member.is_online && (
                          <span className="online-status-dot"></span>
                        )}
                      </div>
                      {member.is_admin && (
                        <span className="admin-badge">관리자</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showInviteModal && (
          <InviteUserModal
            roomId={roomId}
            user={user}
            onClose={() => setShowInviteModal(false)}
            onSuccess={() => {
              setShowInviteModal(false);
              loadMembers();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default ChatRoom;
