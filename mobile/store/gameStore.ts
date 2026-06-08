import { create } from 'zustand';

export interface PlayerDto {
  username: string;
  chips: number;
  currentBet: number;
  folded: boolean;
  allIn: boolean;
  holeCards: string[];
  lastAction: string;
}

export interface GameStateDto {
  roomId: number;
  phase: string;
  communityCards: string[];
  pot: number;
  currentBet: number;
  players: PlayerDto[];
  currentPlayer: string | null;
  bigBlind: number;
  dealerIndex: number;
  message?: string;
}

interface GameStore {
  gameState: GameStateDto | null;
  lastResult: string | null;
  setGameState: (s: GameStateDto) => void;
  setResult: (msg: string) => void;
  clearResult: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameState: null,
  lastResult: null,
  setGameState: (s) => set({ gameState: s }),
  setResult: (msg) => set({ lastResult: msg }),
  clearResult: () => set({ lastResult: null }),
  reset: () => set({ gameState: null, lastResult: null }),
}));
