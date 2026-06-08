import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';

export default function RootLayout() {
  const loadFromStorage = useAuthStore(s => s.loadFromStorage);
  useEffect(() => { loadFromStorage(); }, []);

  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="lobby" />
      <Stack.Screen name="game/[roomId]" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
