FROM nginx:alpine

# nginx.conf를 conf.d에 복사 (기본 nginx.conf가 include /etc/nginx/conf.d/*.conf를 사용)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
