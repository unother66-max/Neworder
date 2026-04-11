# (선택) 컨테이너 배포용 — 맥 로컬 + Cloudflare Tunnel 만 쓰면 빌드 불필요
# Playwright 공식 이미지 (package.json 의 playwright 메이저와 맞출 것)
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY extractMeta.mjs server.mjs ./

ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
