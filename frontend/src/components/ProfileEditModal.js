import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { FiX, FiUser, FiCamera } from 'react-icons/fi';
import './ProfileEditModal.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost';

function ProfileEditModal({ user, onClose, onSuccess }) {
  const [username, setUsername] = useState(user.username || '');
  const [profileImage, setProfileImage] = useState(user.profile_image_url || null);
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState(user.profile_image_url || null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 이미지 파일만 허용
    if (!file.type.startsWith('image/')) {
      setError('이미지 파일만 업로드 가능합니다');
      return;
    }

    // 파일 크기 제한 (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('이미지 크기는 5MB 이하여야 합니다');
      return;
    }

    setProfileImageFile(file);
    setError('');

    // 미리보기 생성
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfileImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleImageUpload = async () => {
    if (!profileImageFile) return null;

    setUploadingImage(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', profileImageFile);

      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const fileData = await response.json();
        let imageUrl = fileData.url;
        // CloudFront URL인 경우 그대로 사용, 상대 경로인 경우만 처리
        if (!imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
          // 상대 경로인 경우 API_URL과 결합
          imageUrl = imageUrl.startsWith('/') ? imageUrl : `/${imageUrl}`;
        }
        // 상태 업데이트: 업로드된 이미지 URL 저장 (CloudFront URL 또는 상대 경로)
        setProfileImage(imageUrl);
        setProfileImagePreview(imageUrl); // 미리보기도 업데이트
        setProfileImageFile(null); // 파일 참조 제거
        setUploadingImage(false);
        return imageUrl;
      } else {
        const errorData = await response.json();
        setError(errorData.detail || '이미지 업로드에 실패했습니다');
        setUploadingImage(false);
        return null;
      }
    } catch (error) {
      setError('이미지 업로드 중 오류가 발생했습니다');
      setUploadingImage(false);
      return null;
    }
  };

  const handleRemoveImage = () => {
    setProfileImage(null);
    setProfileImageFile(null);
    setProfileImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!username.trim()) {
      setError('사용자 이름을 입력해주세요');
      return;
    }

    // 이미지가 선택되었지만 아직 업로드되지 않은 경우
    let finalProfileImage = profileImage;
    if (profileImageFile && !profileImage) {
      // 이미지 업로드 버튼을 클릭하지 않고 바로 저장한 경우
      const uploadedUrl = await handleImageUpload();
      if (!uploadedUrl) {
        return; // 업로드 실패
      }
      finalProfileImage = uploadedUrl;
    } else if (profileImageFile && profileImage) {
      // 이미 업로드된 이미지가 있는 경우, profileImage 사용
      finalProfileImage = profileImage;
    }

    const hasChanges = username.trim() !== user.username || 
                      finalProfileImage !== (user.profile_image_url || null);

    if (!hasChanges) {
      onClose();
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/api/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          username: username.trim(),
          profile_image_url: finalProfileImage
        })
      });

      if (response.ok) {
        const updatedUser = await response.json();
        onSuccess(updatedUser);
      } else {
        const errorData = await response.json();
        setError(errorData.detail || '프로필 수정에 실패했습니다');
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
        className="modal-content profile-edit-modal"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <FiUser className="modal-icon" />
            <h2>프로필 관리</h2>
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
            <label>프로필 사진</label>
            <div className="profile-image-upload">
              <div className="profile-image-preview">
                {profileImagePreview ? (
                  <img src={profileImagePreview} alt="Profile" />
                ) : (
                  <div className="profile-image-placeholder">
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="profile-image-overlay">
                  <button
                    type="button"
                    className="profile-image-btn"
                    onClick={() => fileInputRef.current?.click()}
                    title="사진 변경"
                  >
                    <FiCamera />
                  </button>
                  {profileImagePreview && (
                    <button
                      type="button"
                      className="profile-image-btn profile-image-remove"
                      onClick={handleRemoveImage}
                      title="사진 제거"
                    >
                      <FiX />
                    </button>
                  )}
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                style={{ display: 'none' }}
              />
              {profileImageFile && !profileImage && (
                <button
                  type="button"
                  className="btn-upload-image"
                  onClick={handleImageUpload}
                  disabled={uploadingImage}
                >
                  {uploadingImage ? '업로드 중...' : '이미지 업로드'}
                </button>
              )}
            </div>
            <p className="form-hint">JPG, PNG 형식, 최대 5MB</p>
          </div>

          <div className="form-group">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
              value={user.email}
              disabled
              className="form-input disabled"
            />
            <p className="form-hint">이메일은 변경할 수 없습니다</p>
          </div>

          <div className="form-group">
            <label htmlFor="username">사용자 이름</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="사용자 이름을 입력하세요"
              className="form-input"
              autoComplete="off"
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
              {loading ? '저장 중...' : '저장'}
            </motion.button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
}

export default ProfileEditModal;
