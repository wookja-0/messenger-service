import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiUser, FiLock, FiLogOut } from 'react-icons/fi';
import ProfileEditModal from './ProfileEditModal';
import PasswordChangeModal from './PasswordChangeModal';
import './ProfileMenu.css';

function ProfileMenu({ user, onLogout, onProfileUpdate }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  const handleProfileEdit = () => {
    setShowMenu(false);
    setShowProfileEdit(true);
  };

  const handlePasswordChange = () => {
    setShowMenu(false);
    setShowPasswordChange(true);
  };

  const handleLogout = () => {
    setShowMenu(false);
    onLogout();
  };

  return (
    <>
      <div className="profile-menu-container" ref={menuRef}>
        <button
          className="profile-avatar-btn"
          onClick={() => setShowMenu(!showMenu)}
        >
          <div className="profile-avatar">
            {user.profile_image_url ? (
              <img 
                src={user.profile_image_url.startsWith('http') ? user.profile_image_url : `${process.env.REACT_APP_API_URL || 'http://localhost'}${user.profile_image_url.startsWith('/') ? user.profile_image_url : '/' + user.profile_image_url}`} 
                alt={user.username}
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div 
              className="profile-avatar-placeholder"
              style={{ display: user.profile_image_url ? 'none' : 'flex' }}
            >
              {user.username.charAt(0).toUpperCase()}
            </div>
          </div>
        </button>

        <AnimatePresence>
          {showMenu && (
            <motion.div
              className="profile-dropdown"
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.2 }}
            >
              <div className="profile-dropdown-header">
                <div className="profile-dropdown-avatar">
                  {user.profile_image_url ? (
                    <img 
                      src={user.profile_image_url.startsWith('http') ? user.profile_image_url : `${process.env.REACT_APP_API_URL || 'http://localhost'}${user.profile_image_url.startsWith('/') ? user.profile_image_url : '/' + user.profile_image_url}`} 
                      alt={user.username}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div 
                    className="profile-dropdown-avatar-placeholder"
                    style={{ display: user.profile_image_url ? 'none' : 'flex' }}
                  >
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="profile-dropdown-info">
                  <div className="profile-dropdown-name">{user.username}</div>
                  <div className="profile-dropdown-email">{user.email}</div>
                </div>
              </div>
              <div className="profile-dropdown-divider"></div>
              <div className="profile-dropdown-menu">
                <button
                  className="profile-menu-item"
                  onClick={handleProfileEdit}
                >
                  <FiUser />
                  <span>프로필 관리</span>
                </button>
                <button
                  className="profile-menu-item"
                  onClick={handlePasswordChange}
                >
                  <FiLock />
                  <span>비밀번호 수정</span>
                </button>
                <div className="profile-dropdown-divider"></div>
                <button
                  className="profile-menu-item profile-menu-item-danger"
                  onClick={handleLogout}
                >
                  <FiLogOut />
                  <span>로그아웃</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {showProfileEdit && (
        <ProfileEditModal
          user={user}
          onClose={() => setShowProfileEdit(false)}
          onSuccess={(updatedUser) => {
            setShowProfileEdit(false);
            if (onProfileUpdate) {
              onProfileUpdate(updatedUser);
            }
          }}
        />
      )}

      {showPasswordChange && (
        <PasswordChangeModal
          onClose={() => setShowPasswordChange(false)}
        />
      )}
    </>
  );
}

export default ProfileMenu;
