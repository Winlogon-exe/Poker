import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { BASE_URL } from './client';
import { useGameStore } from '../store/gameStore';
import { PlayerDto } from '../store/gameStore';

let stompClient: Client | null = null;

export function connectWebSocket(token: string, roomId: number, username: string) {
  stompClient = new Client({
    webSocketFactory: () => new SockJS(`${BASE_URL}/ws`),
    connectHeaders: { Authorization: `Bearer ${token}` },
    onConnect: () => {
      // Личный канал — карты видны нам (работает после WebSocketAuthInterceptor)
      stompClient!.subscribe(`/user/queue/game/${roomId}`, (msg) => {
        useGameStore.getState().setGameState(JSON.parse(msg.body));
      });

      // Публичный — без карт, но сохраняем свои карты из предыдущего стейта
      stompClient!.subscribe(`/topic/game/${roomId}`, (msg) => {
        const newState = JSON.parse(msg.body);
        const prev = useGameStore.getState().gameState;
        if (prev) {
          newState.players = newState.players.map((np: PlayerDto) => {
            const old = prev.players.find(p => p.username === np.username);
            return { ...np, holeCards: np.holeCards?.length ? np.holeCards : (old?.holeCards ?? []) };
          });
        }
        useGameStore.getState().setGameState(newState);
      });

      stompClient!.subscribe(`/topic/game/${roomId}/result`, (msg) => {
        useGameStore.getState().setResult(msg.body);
        setTimeout(() => useGameStore.getState().clearResult(), 4000);
      });
    },
    onStompError: (f) => console.error('STOMP', f),
    reconnectDelay: 3000,
  });
  stompClient.activate();
}

export function sendAction(roomId: number, type: string, amount = 0, username = '') {
  if (!stompClient?.connected) return;
  stompClient.publish({
    destination: `/app/game/${roomId}/action`,
    body: JSON.stringify({ type, amount, username }),
  });
}

export function disconnectWebSocket() {
  stompClient?.deactivate();
  stompClient = null;
}
