# Poker — Texas Hold'em (онлайн, мультиплеер)

Учебный проект онлайн-покера (техасский холдем) с realtime-игрой за столом против других игроков и ботов.
Состоит из двух частей: серверного приложения на **Spring Boot** и мобильного клиента на **React Native (Expo)**.

---

## Стек технологий

**Backend (`backend/`)**
- Java 17 / Spring Boot 3.2.5, сборка через Maven
- Spring Web (REST) + Spring WebSocket (STOMP поверх SockJS) — для realtime
- Spring Security + JWT (библиотека `jjwt` 0.12.5) — аутентификация
- Spring Data JPA + встроенная БД **H2** (файловая) — хранение пользователей и столов
- Lombok — генерация геттеров/билдеров
- Docker (multi-stage сборка)

**Mobile (`mobile/`)**
- Expo SDK 54, React Native 0.81, React 19, TypeScript
- `expo-router` — файловая навигация
- `zustand` — управление состоянием
- `axios` — REST-запросы
- `@stomp/stompjs` + `sockjs-client` — WebSocket
- `@react-native-async-storage/async-storage` — хранение токена

---

## Возможности

- Регистрация и вход (JWT), стартовый стек 1000 фишек
- Лобби: список столов, создание стола, вход/выход, добавление ботов
- Игровой стол: раздача, блайнды, ставки (Fold / Check / Call / Raise со слайдером), борд (флоп/тёрн/ривер), вскрытие
- Определение победителя по комбинации (от старшей карты до роял-флеша)
- Боты, ходящие автоматически
- Ребай при обнулении стека
- Скрытие чужих карт до вскрытия (раздельные каналы WebSocket)

---

## Структура проекта

```
Poker/
├── backend/
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/main/
│       ├── java/com/poker/
│       │   ├── PokerApplication.java      # точка входа, сидинг столов
│       │   ├── auth/                       # регистрация/логин, JWT, User
│       │   ├── config/                     # Security, CORS, WebSocket, JWT-фильтры
│       │   ├── game/                       # вся игровая логика
│       │   └── lobby/                      # столы (Room) и лобби
│       └── resources/application.yml       # БД, порт, JWT-секрет
└── mobile/
    ├── app.json, package.json, tsconfig.json
    ├── api/         # client.ts (axios), websocket.ts (STOMP)
    ├── app/         # экраны (expo-router): index, lobby, game/[roomId]
    ├── components/  # PlayingCard.tsx
    └── store/       # authStore.ts, gameStore.ts (zustand)
```

---

## Запуск

### Backend

Требования: JDK 17+ (Docker-образ использует 21), Maven.

```bash
cd backend
./mvnw spring-boot:run        # или: mvn spring-boot:run
```

Сервер поднимется на **порту 8088** (см. `application.yml`).
Консоль H2 доступна по `/h2-console`.

Через Docker:

```bash
cd backend
docker build -t poker-backend .
docker run -p 8088:8088 poker-backend
```

> Примечание: в `Dockerfile` стоит `EXPOSE 8080`, но приложение реально слушает `8088`
> (порт задаётся в `application.yml`). Пробрасывать нужно `8088`.

### Mobile

Требования: Node.js, Expo CLI, телефон с Expo Go или эмулятор.

1. В файле `mobile/api/client.ts` поменяй `BASE_URL` на IP машины с бэкендом
   (телефон и компьютер должны быть в одной сети), например `http://192.168.1.65:8088`.
2. Запуск:

```bash
cd mobile
npm install
npm start          # затем сканируй QR в Expo Go (или 'a' / 'i' для эмулятора)
```

---

## Конфигурация

`backend/src/main/resources/application.yml`:
- `spring.datasource.url` — файловая БД H2 `./poker-db`
- `server.port: 8088`
- `jwt.secret` — ключ подписи токена (Base64), `jwt.expiration` — срок жизни (24 часа)

---

## REST API (кратко)

| Метод | Путь | Назначение |
|-------|------|------------|
| POST | `/api/auth/register` | Регистрация, возвращает токен |
| POST | `/api/auth/login` | Вход, возвращает токен |
| GET  | `/api/lobby/rooms` | Список открытых столов |
| POST | `/api/lobby/rooms` | Создать стол |
| POST | `/api/lobby/rooms/{id}/join` | Войти за стол |
| POST | `/api/lobby/rooms/{id}/leave` | Покинуть стол |
| POST | `/api/lobby/rooms/{id}/add-bot` | Добавить бота |
| POST | `/api/game/{roomId}/start` | Начать игру |
| GET  | `/api/game/{roomId}/state` | Текущее состояние (с моими картами) |
| POST | `/api/game/{roomId}/rebuy` | Докупить фишки |

Все запросы, кроме `/api/auth/**` и `/ws/**`, требуют заголовок `Authorization: Bearer <token>`.

## WebSocket (STOMP)

- Endpoint подключения: `/ws` (SockJS)
- Клиент → сервер: `/app/game/{roomId}/action` — ход игрока
- Сервер → игроку (приватно, с картами): `/user/queue/game/{roomId}`
- Сервер → всем (публично, карты скрыты): `/topic/game/{roomId}`
- Результат раздачи: `/topic/game/{roomId}/result`
- Обновления лобби/стола: `/topic/lobby`, `/topic/room/{id}`

---

## Как устроена игра (коротко)

- Состояние партии (`GameState`) хранится **в оперативной памяти сервера** в `GameService`
  (`ConcurrentHashMap<roomId, GameState>`), а **не** в БД. В БД сохраняются только
  пользователи и столы; фишки игроков переписываются в БД после каждой раздачи.
- Фазы: `WAITING → PRE_FLOP → FLOP → TURN → RIVER → SHOWDOWN`.
- Победитель определяется перебором лучших 5 карт из 7 (`HandEvaluator`).

---

## Известные ограничения / зона для доработки

- Игровое состояние не переживает рестарт сервера (хранится в памяти).
- `jwt.secret` захардкожен в `application.yml`.
- CORS открыт для всех источников; H2-консоль включена — это удобно для разработки, но небезопасно в проде.
- Ход по WebSocket доверяет `username` из тела сообщения, а не аутентифицированному пользователю.
- Адрес сервера (`BASE_URL`) в мобильном клиенте прописан вручную.

> Проект учебный/демонстрационный (18+, без реальных денег).
