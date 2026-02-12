# 사내 메신저 웹 서비스

FastAPI 기반 마이크로서비스 아키텍처(MSA)로 구성된 실시간 채팅 및 파일 공유 웹 서비스입니다.

## 아키텍처

- **Frontend**: React (SPA) - 모던 UI/UX, React Router
- **API Gateway**: Nginx
- **Auth Service**: FastAPI (JWT 인증, 회원가입/로그인)
- **Room Service**: FastAPI (채팅방 관리, 사용자 초대)
- **Chat Service**: FastAPI (WebSocket 지원, Room 기반 채팅)
- **File Service**: FastAPI (파일 업로드/다운로드)
- **Database**: PostgreSQL 15

## 주요 기능

### 사용자 관리
- ✅ 사용자 인증 (회원가입/로그인)
- ✅ 프로필 이미지 업로드 및 관리
- ✅ 프로필 정보 수정 (사용자 이름, 프로필 이미지)
- ✅ 비밀번호 변경
- ✅ 관리자 계정 분리 (일반 사용자와 독립된 세션)

### 채팅방 관리
- ✅ 채팅방 생성 및 관리
- ✅ 오픈채팅방 (모든 사용자 자동 참여)
- ✅ 사설 채팅방 (초대 기반)
- ✅ 채팅방 검색
- ✅ 사용자 초대 기능
- ✅ 채팅방 삭제 (방 생성자만)
- ✅ 채팅방 나가기

### 실시간 채팅
- ✅ 실시간 채팅 (WebSocket, Room 기반)
- ✅ 메시지에 프로필 이미지 표시
- ✅ 파일 첨부 (이미지, 문서 등)
- ✅ 이미지 미리보기
- ✅ 파일 미리보기 및 진행률 표시
- ✅ 참여자 목록 표시
- ✅ 온라인 사용자 목록

### 관리자 기능
- ✅ 관리자 대시보드 (통계, 사용자 관리, 채팅방 관리)
- ✅ 관리자 전용 로그인 페이지

## 프로젝트 구조

```
.
├── frontend/                    # React 프론트엔드 (일반 사용자)
│   ├── src/
│   │   ├── pages/              # 페이지 컴포넌트
│   │   │   ├── Login.js        # 로그인 페이지
│   │   │   ├── Register.js     # 회원가입 페이지
│   │   │   ├── Main.js         # 메인 페이지 (채팅방 목록)
│   │   │   └── ChatRoom.js     # 채팅방 페이지
│   │   ├── components/         # 공통 컴포넌트
│   │   │   ├── CreateRoomModal.js      # 채팅방 생성 모달
│   │   │   ├── InviteUserModal.js      # 사용자 초대 모달
│   │   │   ├── ProfileMenu.js           # 프로필 메뉴
│   │   │   ├── ProfileEditModal.js      # 프로필 수정 모달
│   │   │   └── PasswordChangeModal.js   # 비밀번호 변경 모달
│   │   └── App.js
├── admin-frontend/              # React 프론트엔드 (관리자)
│   └── src/
│       ├── pages/
│       │   └── AdminDashboard.js  # 관리자 대시보드
│       └── App.js
├── backend/
│   ├── shared/                 # 공통 데이터베이스 모델
│   │   └── database.py
│   ├── auth-service/           # 인증 서비스
│   ├── room-service/           # 채팅방 관리 서비스
│   ├── chat-service/           # 채팅 서비스
│   └── file-service/          # 파일 서비스
├── nginx/                      # API Gateway 설정
└── docker-compose.yml          # Docker Compose 설정
```

## 시작하기

### 사전 요구사항

- Docker
- Docker Compose

### 실행 방법

1. 프로젝트 클론 또는 다운로드

2. Docker Compose로 서비스 시작:
```bash
docker-compose up -d --build
```

3. 브라우저에서 접속:
```
http://localhost          # 일반 사용자 페이지
http://localhost/admin    # 관리자 페이지
```

4. 회원가입 후 로그인하여 사용
   - 일반 사용자: 회원가입 후 자동으로 오픈채팅방에 참여
   - 관리자: 관리자 페이지에서 기본 계정으로 로그인
     - ID: `admin@admin.com`
     - PW: `adminadmin`

### 서비스별 포트

- **Nginx (API Gateway)**: 80
- **Auth Service**: 8003 (내부)
- **Room Service**: 8004 (내부)
- **Chat Service**: 8001 (내부)
- **File Service**: 8002 (내부)
- **Frontend**: 3000 (내부)
- **Admin Frontend**: 3001 (내부)
- **PostgreSQL**: 5432 (내부)

## API 엔드포인트

### 인증 서비스
- `POST /api/register` - 회원가입
- `POST /token` - 로그인 (OAuth2)
- `POST /api/login` - 로그인 (일반)
- `POST /api/admin/login` - 관리자 로그인
- `GET /api/me` - 현재 사용자 정보
- `PUT /api/me` - 사용자 정보 수정 (프로필 이미지 포함)
- `POST /api/me/change-password` - 비밀번호 변경
- `GET /api/users/search` - 사용자 검색 (초대용, 관리자 제외)

### 채팅방 서비스
- `POST /api/rooms` - 채팅방 생성 (사용자 초대 포함)
- `GET /api/rooms` - 채팅방 목록 조회
- `GET /api/rooms/{room_id}` - 채팅방 상세 정보
- `GET /api/rooms/{room_id}/members` - 참여자 목록
- `POST /api/rooms/{room_id}/invite` - 사용자 초대
- `DELETE /api/rooms/{room_id}` - 채팅방 삭제 (방 생성자만)
- `DELETE /api/rooms/{room_id}/leave` - 채팅방 나가기

### 채팅 서비스
- `GET /api/rooms/{room_id}/messages` - 메시지 목록 조회 (프로필 이미지 포함)
- `WS /ws/{room_id}` - WebSocket 연결 (Room 기반)
- `GET /api/online-users` - 온라인 사용자 목록

### 파일 서비스
- `POST /api/upload` - 파일 업로드
- `GET /api/files` - 파일 목록 조회
- `GET /api/files/{filename}` - 파일 다운로드
- `DELETE /api/files/{filename}` - 파일 삭제

## 데이터베이스 스키마

- **users**: 사용자 정보 (id, email, username, password_hash, profile_image_url, created_at, is_active)
- **rooms**: 채팅방 정보 (id, name, description, creator_id, created_at, is_private)
- **room_users**: 채팅방 멤버십 (id, room_id, user_id, joined_at, is_admin, last_read_at)
- **messages**: 채팅 메시지 (id, room_id, user_id, username, text, timestamp, socket_id, file_info)
- **file_metadata**: 파일 메타데이터 (id, original_name, filename, size, mimetype, upload_date, url)
- **invitations**: 초대 정보 (id, room_id, inviter_id, invitee_email, status, created_at, expires_at)

## 주요 기능 상세

### 1. 사용자 인증 및 프로필 관리
- 이메일/비밀번호 기반 회원가입 및 로그인
- JWT 토큰 기반 인증
- 자동 로그인 유지
- 프로필 이미지 업로드 및 관리
- 프로필 정보 수정 (사용자 이름, 프로필 이미지)
- 비밀번호 변경
- 관리자 계정 분리 (일반 사용자와 독립된 세션)

### 2. 채팅방 관리
- 오픈채팅방 (모든 사용자 자동 참여, 신규 회원가입 시 자동 참여)
- 사설 채팅방 생성 (초대 기반)
- 채팅방 생성 시 사용자 초대 기능
- 채팅방 목록 조회 (마지막 메시지, 시간 표시)
- 채팅방 검색
- 채팅방 삭제 (방 생성자만)
- 채팅방 나가기

### 3. 실시간 채팅
- Room 기반 채팅
- 실시간 메시지 전송/수신
- 메시지에 프로필 이미지 표시
- 연속 메시지 그룹핑
- 입장/퇴장 알림
- 참여자 목록 실시간 업데이트
- 온라인 사용자 목록

### 4. 파일 공유
- 드래그 앤 드롭 업로드
- 이미지 미리보기 (썸네일)
- 파일 미리보기
- 업로드 진행률 표시
- 채팅 메시지에 파일 첨부
- 파일명 표시 (UUID 제거, ellipsis 처리)

### 5. 관리자 기능
- 관리자 대시보드
- 사용자 통계 및 관리
- 채팅방 통계 및 관리
- 관리자 전용 로그인 페이지
- 관리자 계정은 일반 채팅방에서 제외

## Kubernetes 이관

이 프로젝트는 Kubernetes로 이관을 고려하여 설계되었습니다:

1. 각 서비스는 독립적인 컨테이너로 실행
2. 서비스 간 통신은 내부 네트워크를 통해 이루어짐
3. Nginx는 API Gateway 역할을 수행
4. Health check 엔드포인트 제공
5. 공통 데이터베이스 모델 사용

### Kubernetes 배포 시 고려사항

- 각 서비스를 별도의 Deployment로 배포
- Service 리소스로 서비스 디스커버리 구성
- Ingress Controller 사용 (Nginx 대신)
- ConfigMap/Secret으로 설정 관리 (JWT Secret 등)
- PersistentVolume으로 파일 저장소 관리
- StatefulSet으로 PostgreSQL 배포

## 개발

### 로컬 개발 환경

각 서비스를 개별적으로 실행할 수 있습니다:

#### 인증 서비스
```bash
cd backend/auth-service
pip install -r requirements.txt
python main.py
```

#### 채팅방 서비스
```bash
cd backend/room-service
pip install -r requirements.txt
python main.py
```

#### 채팅 서비스
```bash
cd backend/chat-service
pip install -r requirements.txt
python main.py
```

#### 파일 서비스
```bash
cd backend/file-service
pip install -r requirements.txt
python main.py
```

#### 프론트엔드
```bash
cd frontend
npm install
npm start
```

## 기술 스택

### Backend
- FastAPI
- SQLAlchemy (ORM)
- PostgreSQL
- WebSocket
- JWT (python-jose)
- bcrypt (비밀번호 해싱)

### Frontend
- React 18
- React Router
- Framer Motion (애니메이션)
- React Icons
- React Portal (모달 렌더링)
- Axios

### Infrastructure
- Docker & Docker Compose
- Nginx (API Gateway)
- PostgreSQL 15

## UI/UX 특징

- **2-Column Split Layout**: 좌측 사이드바(채팅방 목록) + 우측 메인 영역
- **Flat List Design**: 카드 스타일에서 리스트 스타일로 전환
- **프로필 이미지 표시**: 채팅 메시지 옆에 프로필 이미지 표시
- **반응형 디자인**: 모던하고 깔끔한 UI
- **모달 시스템**: React Portal을 사용한 중앙 정렬 모달
- **실시간 업데이트**: WebSocket 기반 실시간 채팅 및 상태 업데이트

## 주요 개선사항

### v2.0 (최신)
- ✅ 프로필 이미지 업로드 및 관리 기능 추가
- ✅ 프로필 정보 수정 및 비밀번호 변경 기능
- ✅ 오픈채팅방 기능 (모든 사용자 자동 참여)
- ✅ 관리자 대시보드 추가
- ✅ 관리자 계정 분리 (일반 사용자와 독립된 세션)
- ✅ 채팅방에서 프로필 이미지 표시
- ✅ UI/UX 개선 (2-Column Layout, Flat List Design)
- ✅ React Portal을 사용한 모달 렌더링 개선

### v1.0
- ✅ 기본 채팅 기능
- ✅ 파일 업로드/다운로드
- ✅ 사용자 초대 기능

## 라이선스

MIT
