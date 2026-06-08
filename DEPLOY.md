# Deploy на VPS

## 1. Установить Docker на VPS
```bash
curl -fsSL https://get.docker.com | sh
apt install docker-compose-plugin -y
```

## 2. Загрузить проект
```bash
git clone <your-repo> /opt/poker
cd /opt/poker
```

## 3. Запустить
```bash
docker compose up -d --build
```

Бэкенд доступен на `http://YOUR_VPS_IP:8080`

## 4. Обновить IP в мобильном приложении

В файле `mobile/api/client.ts` заменить:
```ts
const BASE_URL = 'http://YOUR_VPS_IP:8080';
```

## 5. Запустить Expo
```bash
cd mobile
npm install
npx expo start
```
Отсканировать QR через Expo Go.

## Nginx (опционально, для домена)
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```
