# Kubernetes 배포 예제

이 디렉토리는 Kubernetes로 이관할 때 참고할 수 있는 예제 파일들을 포함합니다.

## 주요 구성 요소

1. **Namespace**: messenger
2. **Deployments**: 
   - chat-service
   - file-service
   - frontend
3. **Services**: 각 서비스에 대한 ClusterIP Service
4. **Ingress**: Nginx Ingress Controller 사용 예제
5. **ConfigMap**: 환경 설정
6. **PersistentVolumeClaim**: 파일 저장소용

## 배포 순서

1. Namespace 생성
2. ConfigMap 생성
3. PersistentVolumeClaim 생성
4. Deployments 생성
5. Services 생성
6. Ingress 생성

## 참고사항

- 실제 환경에 맞게 리소스 제한 및 요청량 조정 필요
- Ingress Controller 설치 필요 (예: Nginx Ingress Controller)
- StorageClass 설정 필요 (PersistentVolumeClaim 사용 시)
- 이미지는 Docker Hub나 Private Registry에 푸시 필요
