import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AuthState {
  token: string | null;
  username: string | null;
  chips: number;
  setAuth: (token: string, username: string, chips: number) => void;
  setChips: (chips: number) => void;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  username: null,
  chips: 0,

  setAuth: async (token, username, chips) => {
    await AsyncStorage.setItem('token', token);
    await AsyncStorage.setItem('username', username);
    set({ token, username, chips });
  },

  setChips: (chips) => set({ chips }),

  logout: async () => {
    await AsyncStorage.multiRemove(['token', 'username']);
    set({ token: null, username: null, chips: 0 });
  },

  loadFromStorage: async () => {
    const token = await AsyncStorage.getItem('token');
    const username = await AsyncStorage.getItem('username');
    if (token && username) set({ token, username });
  },
}));
