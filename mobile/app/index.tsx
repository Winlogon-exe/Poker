import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, KeyboardAvoidingView, Platform, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function AuthScreen() {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const submit = async () => {
    if (!username.trim() || !password.trim()) { Alert.alert('Ошибка', 'Заполните все поля'); return; }
    setLoading(true);
    try {
      const res = isLogin ? await authApi.login(username, password) : await authApi.register(username, password);
      await setAuth(res.data.token, res.data.username, res.data.chips);
      router.replace('/lobby');
    } catch (e: any) {
      Alert.alert('Ошибка', e.response?.data || 'Что-то пошло не так');
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#111" />

      {/* Logo */}
      <View style={styles.logoArea}>
        <View style={styles.starRow}>
          <Text style={styles.starLeft}>★</Text>
          <Text style={styles.logoText}>POKER</Text>
          <Text style={styles.starRight}>★</Text>
        </View>
        <Text style={styles.logoSub}>TEXAS HOLD'EM</Text>
      </View>

      {/* Card */}
      <View style={styles.card}>
        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, isLogin && styles.tabActive]} onPress={() => setIsLogin(true)}>
            <Text style={[styles.tabText, isLogin && styles.tabTextActive]}>ВХОД</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.tab, !isLogin && styles.tabActive]} onPress={() => setIsLogin(false)}>
            <Text style={[styles.tabText, !isLogin && styles.tabTextActive]}>РЕГИСТРАЦИЯ</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.form}>
          <Text style={styles.fieldLabel}>Имя пользователя</Text>
          <TextInput
            style={styles.input}
            placeholder="Введите имя"
            placeholderTextColor="#555"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            selectionColor="#e60000"
          />

          <Text style={styles.fieldLabel}>Пароль</Text>
          <TextInput
            style={styles.input}
            placeholder="Введите пароль"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            selectionColor="#e60000"
          />

          <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={submit} disabled={loading}>
            <Text style={styles.btnText}>{loading ? 'Загрузка...' : isLogin ? 'ВОЙТИ' : 'СОЗДАТЬ АККАУНТ'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.footer}>Только для демонстрации. 18+</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center', padding: 24 },
  logoArea: { alignItems: 'center', marginBottom: 32 },
  starRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  starLeft: { color: '#e60000', fontSize: 28 },
  starRight: { color: '#e60000', fontSize: 28 },
  logoText: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 6 },
  logoSub: { color: '#555', fontSize: 12, letterSpacing: 5, marginTop: 4 },
  card: { width: '100%', maxWidth: 380, backgroundColor: '#1c1c1c', borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: '#2a2a2a' },
  tabs: { flexDirection: 'row', backgroundColor: '#161616' },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#e60000' },
  tabText: { color: '#555', fontSize: 13, fontWeight: '700', letterSpacing: 1 },
  tabTextActive: { color: '#fff' },
  form: { padding: 24, gap: 6 },
  fieldLabel: { color: '#888', fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: '#111', borderRadius: 4, padding: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#333', marginBottom: 4 },
  btn: { backgroundColor: '#e60000', borderRadius: 4, padding: 16, alignItems: 'center', marginTop: 16 },
  btnDisabled: { backgroundColor: '#7a0000' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 1 },
  footer: { color: '#333', fontSize: 11, marginTop: 24 },
});
