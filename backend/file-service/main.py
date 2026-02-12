from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, DateTime, Integer, Text
from sqlalchemy.ext.declarative import declarative_base
from typing import List
import os
import uuid
from datetime import datetime
from pathlib import Path
import sys
import time

# 공통 데이터베이스 모델 경로 추가
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))
from shared.database import init_db, get_db, Base
from shared.s3_client import (
    get_s3_client, upload_file_to_s3, delete_file_from_s3,
    get_s3_url, generate_s3_key, file_exists_in_s3
)

# FileMetadata 모델 정의
class FileMetadata(Base):
    __tablename__ = "file_metadata"

    id = Column(String, primary_key=True)
    original_name = Column(String, nullable=False)
    filename = Column(String, nullable=False, unique=True)
    size = Column(Integer, nullable=False)
    mimetype = Column(String)
    upload_date = Column(DateTime, default=datetime.utcnow, nullable=False)
    url = Column(String, nullable=False)
    s3_key = Column(Text, nullable=True)  # S3 키 저장 (S3 사용 시)

app = FastAPI(title="File Service", version="1.0.0")

# 데이터베이스 초기화 (재시도 로직 포함)
def init_database_with_retry(max_retries=5, delay=2):
    for i in range(max_retries):
        try:
            init_db()
            print("데이터베이스 초기화 성공")
            return
        except Exception as e:
            if i < max_retries - 1:
                print(f"데이터베이스 연결 실패, {delay}초 후 재시도... ({i+1}/{max_retries})")
                time.sleep(delay)
            else:
                print(f"데이터베이스 초기화 실패: {e}")
                raise

init_database_with_retry()

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 업로드 디렉토리 설정 (로컬 폴백용)
UPLOAD_DIR = Path("/app/uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

# S3 사용 여부 확인
USE_S3 = get_s3_client() is not None


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "file-service"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """파일 업로드 (S3 또는 로컬)"""
    try:
        # 파일 크기 확인
        contents = await file.read()
        if len(contents) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail="파일 크기가 50MB를 초과합니다.")
        
        file_id = str(uuid.uuid4())
        unique_filename = f"{uuid.uuid4()}-{file.filename}"
        s3_key = None
        file_url = None
        
        # S3 사용 여부에 따라 업로드
        if USE_S3:
            # S3에 업로드
            s3_key = generate_s3_key(file.filename, prefix="uploads")
            if upload_file_to_s3(contents, s3_key, file.content_type):
                # CloudFront URL 생성
                file_url = get_s3_url(s3_key, use_cloudfront=True)
                print(f"[UPLOAD] S3 업로드 성공: {s3_key}")
            else:
                raise HTTPException(status_code=500, detail="S3 업로드에 실패했습니다.")
        else:
            # 로컬에 저장 (폴백)
            file_path = UPLOAD_DIR / unique_filename
            with open(file_path, "wb") as f:
                f.write(contents)
            file_url = f"/api/files/{unique_filename}"
            print(f"[UPLOAD] 로컬 저장: {unique_filename}")
        
        file_info = {
            "id": file_id,
            "originalName": file.filename,
            "filename": unique_filename,
            "size": len(contents),
            "mimetype": file.content_type,
            "uploadDate": datetime.now().isoformat(),
            "url": file_url
        }
        
        # DB에 파일 메타데이터 저장
        db_file = FileMetadata(
            id=file_id,
            original_name=file.filename,
            filename=unique_filename,
            size=len(contents),
            mimetype=file.content_type,
            upload_date=datetime.now(),
            url=file_url,
            s3_key=s3_key
        )
        db.add(db_file)
        db.commit()
        
        return file_info
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[UPLOAD] 에러 발생: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"파일 업로드 실패: {str(e)}")


@app.get("/api/files/{filename}")
async def download_file(filename: str, db: Session = Depends(get_db)):
    """파일 다운로드 (S3 또는 로컬)"""
    # DB에서 파일 메타데이터 조회
    file_metadata = db.query(FileMetadata).filter(FileMetadata.filename == filename).first()
    
    if not file_metadata:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    
    # S3에 저장된 파일인 경우 CloudFront URL로 리다이렉트
    if file_metadata.s3_key and USE_S3:
        s3_url = get_s3_url(file_metadata.s3_key, use_cloudfront=True)
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=s3_url, status_code=302)
    
    # 로컬 파일인 경우
    file_path = UPLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    
    # 원본 파일명 추출 (UUID-원본파일명 형식)
    original_name = file_metadata.original_name
    
    return FileResponse(
        path=file_path,
        filename=original_name,
        media_type=file_metadata.mimetype or "application/octet-stream"
    )


@app.get("/api/files")
async def list_files(db: Session = Depends(get_db)):
    """업로드된 파일 목록 조회"""
    files = db.query(FileMetadata).order_by(FileMetadata.upload_date.desc()).all()
    
    return [
        {
            "filename": file.filename,
            "originalName": file.original_name,
            "size": file.size,
            "uploadDate": file.upload_date.isoformat(),
            "url": file.url
        }
        for file in files
    ]


@app.delete("/api/files/{filename}")
async def delete_file(filename: str, db: Session = Depends(get_db)):
    """파일 삭제 (S3 또는 로컬)"""
    file_metadata = db.query(FileMetadata).filter(FileMetadata.filename == filename).first()
    
    if not file_metadata:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
    
    try:
        # S3에 저장된 파일인 경우 S3에서 삭제
        if file_metadata.s3_key and USE_S3:
            delete_file_from_s3(file_metadata.s3_key)
            print(f"[DELETE] S3 삭제 성공: {file_metadata.s3_key}")
        else:
            # 로컬 파일 삭제
            file_path = UPLOAD_DIR / filename
            if file_path.exists():
                file_path.unlink()
                print(f"[DELETE] 로컬 삭제 성공: {filename}")
        
        # DB에서 메타데이터 삭제
        db.delete(file_metadata)
        db.commit()
        return {"message": "파일이 삭제되었습니다."}
    except Exception as e:
        print(f"[DELETE] 에러 발생: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"파일 삭제 실패: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)
