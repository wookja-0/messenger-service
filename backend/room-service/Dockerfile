FROM python:3.11-slim

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY shared ./shared
COPY room-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY room-service .

EXPOSE 8004

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8004"]
