import boto3
import os
from typing import Optional
from datetime import datetime
from botocore.exceptions import ClientError
import logging

logger = logging.getLogger(__name__)

# AWS 설정
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION", "ap-northeast-2")
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME")
CLOUDFRONT_URL = os.getenv("CLOUDFRONT_URL", "").rstrip("/")

# S3 클라이언트 초기화
s3_client = None
if AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and S3_BUCKET_NAME:
    try:
        s3_client = boto3.client(
            's3',
            aws_access_key_id=AWS_ACCESS_KEY_ID,
            aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
            region_name=AWS_REGION
        )
        # 버킷 존재 확인
        s3_client.head_bucket(Bucket=S3_BUCKET_NAME)
        logger.info(f"S3 클라이언트 초기화 성공 - 버킷: {S3_BUCKET_NAME}")
    except ClientError as e:
        logger.error(f"S3 클라이언트 초기화 실패: {e}")
        s3_client = None
else:
    logger.warning("S3 설정이 완료되지 않았습니다. 환경 변수를 확인하세요.")


def get_s3_client():
    """S3 클라이언트 반환"""
    return s3_client


def upload_file_to_s3(file_content: bytes, s3_key: str, content_type: Optional[str] = None) -> bool:
    """
    S3에 파일 업로드
    
    Args:
        file_content: 파일 내용 (bytes)
        s3_key: S3 키 (경로)
        content_type: MIME 타입
    
    Returns:
        업로드 성공 여부
    """
    if not s3_client:
        logger.error("S3 클라이언트가 초기화되지 않았습니다")
        return False
    
    try:
        extra_args = {}
        if content_type:
            extra_args['ContentType'] = content_type
        
        s3_client.put_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key,
            Body=file_content,
            **extra_args
        )
        logger.info(f"S3 업로드 성공: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"S3 업로드 실패: {e}")
        return False


def delete_file_from_s3(s3_key: str) -> bool:
    """
    S3에서 파일 삭제
    
    Args:
        s3_key: S3 키 (경로)
    
    Returns:
        삭제 성공 여부
    """
    if not s3_client:
        logger.error("S3 클라이언트가 초기화되지 않았습니다")
        return False
    
    try:
        s3_client.delete_object(
            Bucket=S3_BUCKET_NAME,
            Key=s3_key
        )
        logger.info(f"S3 삭제 성공: {s3_key}")
        return True
    except ClientError as e:
        logger.error(f"S3 삭제 실패: {e}")
        return False


def get_s3_url(s3_key: str, use_cloudfront: bool = True) -> str:
    """
    S3 파일의 URL 생성
    
    Args:
        s3_key: S3 키 (경로)
        use_cloudfront: CloudFront URL 사용 여부
    
    Returns:
        파일 URL
    """
    if use_cloudfront and CLOUDFRONT_URL:
        return f"{CLOUDFRONT_URL}/{s3_key}"
    elif s3_client:
        return f"https://{S3_BUCKET_NAME}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"
    else:
        return f"/api/files/{s3_key}"


def generate_s3_key(original_filename: str, prefix: str = "uploads") -> str:
    """
    S3 키 생성 (년/월 기반 경로)
    
    Args:
        original_filename: 원본 파일명
        prefix: 경로 접두사 (uploads 또는 profiles)
    
    Returns:
        S3 키
    """
    now = datetime.utcnow()
    year = now.strftime("%Y")
    month = now.strftime("%m")
    
    # 파일명에서 확장자 추출
    import uuid
    from pathlib import Path
    file_ext = Path(original_filename).suffix
    unique_filename = f"{uuid.uuid4()}{file_ext}"
    
    return f"{prefix}/{year}/{month}/{unique_filename}"


def file_exists_in_s3(s3_key: str) -> bool:
    """
    S3에 파일이 존재하는지 확인
    
    Args:
        s3_key: S3 키 (경로)
    
    Returns:
        파일 존재 여부
    """
    if not s3_client:
        return False
    
    try:
        s3_client.head_object(Bucket=S3_BUCKET_NAME, Key=s3_key)
        return True
    except ClientError as e:
        if e.response['Error']['Code'] == '404':
            return False
        logger.error(f"S3 파일 존재 확인 실패: {e}")
        return False
