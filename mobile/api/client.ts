import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ngrok: https://xxxx-xx-xx-xxx.ngrok-free.app
// локально (если телефон в той же сети): http://192.168.1.XXX:8080
//const BASE_URL = 'http://192.168.1.65:8080';
const BASE_URL = 'http://89.185.85.7:8088';
export const api = axios.create({ baseURL: BASE_URL });

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/api/auth/login', { username, password }),
  register: (username: string, password: string) =>
    api.post('/api/auth/register', { username, password }),
};

export const lobbyApi = {
  getRooms: () => api.get('/api/lobby/rooms'),
  createRoom: (name: string, maxPlayers = 6, smallBlind = 10, bigBlind = 20) =>
    api.post('/api/lobby/rooms', { name, maxPlayers, smallBlind, bigBlind }),
  joinRoom: (id: number) => api.post(`/api/lobby/rooms/${id}/join`),
  leaveRoom: (id: number) => api.post(`/api/lobby/rooms/${id}/leave`),
  addBot: (id: number) => api.post(`/api/lobby/rooms/${id}/add-bot`),
};

export const gameApi = {
  startGame: (roomId: number) => api.post(`/api/game/${roomId}/start`),
  getState: (roomId: number) => api.get(`/api/game/${roomId}/state`),
  rebuy: (roomId: number) => api.post(`/api/game/${roomId}/rebuy`),
};

export { BASE_URL };
