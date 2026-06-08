import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, RefreshControl, TextStyle
} from 'react-native';
import { router } from 'expo-router';
import { lobbyApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface Room {
  id: number; name: string; maxPlayers: number;
  smallBlind: number; bigBlind: number;
  players: string[]; gameStarted: boolean;
}

const TABS = ['Кэш-игры', 'Турниры', 'Spin&Win', 'Live'];

export default function LobbyScreen() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Room | null>(null);
  const { username, chips, logout } = useAuthStore();

  const loadRooms = async () => {
    try { const r = await lobbyApi.getRooms(); setRooms(r.data); } catch {}
  };

  useEffect(() => {
    loadRooms();
    const t = setInterval(loadRooms, 4000);
    return () => clearInterval(t);
  }, []);

  const refresh = async () => { setRefreshing(true); await loadRooms(); setRefreshing(false); };

  const createRoom = async () => {
    if (!roomName.trim()) return;
    try {
      const res = await lobbyApi.createRoom(roomName);
      setShowCreate(false); setRoomName('');
      router.push(`/game/${res.data.id}`);
    } catch { Alert.alert('Ошибка'); }
  };

  const joinRoom = async (room: Room) => {
    if (room.gameStarted) { Alert.alert('Идёт игра', 'Стол уже играет'); return; }
    if (room.players.length >= room.maxPlayers) { Alert.alert('Стол полный'); return; }
    try { await lobbyApi.joinRoom(room.id); router.push(`/game/${room.id}`); }
    catch { Alert.alert('Ошибка', 'Не удалось войти'); }
  };

  return (
    <View style={s.bg}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.logo}>
          <Text style={s.logoStar}>✦</Text>
          <Text style={s.logoTxt}>POKER</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.balanceBox}>
            <Text style={s.balanceLabel}>Ваш баланс</Text>
            <Text style={s.balanceVal}>${chips}</Text>
          </View>
          <TouchableOpacity style={s.cashBtn}>
            <Text style={s.cashBtnTxt}>КАССА</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { logout(); router.replace('/'); }}>
            <View style={s.avatarSmall}><Text style={s.avatarSmallTxt}>{username?.[0]?.toUpperCase()}</Text></View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Sub tabs — только Texas Hold'em */}
      <View style={s.subTabs}>
        <View style={[s.subTab, s.subTabActive]}>
          <Text style={s.subTabTxtActive}>♠ Техасский Холдем</Text>
        </View>
        <View style={[s.subTab, { opacity: 0.4 }]}>
          <Text style={s.subTabTxt}>Турниры</Text>
        </View>
        <View style={[s.subTab, { opacity: 0.4 }]}>
          <Text style={s.subTabTxt}>Spin&Win</Text>
        </View>
      </View>

      {/* Column headers */}
      <View style={s.colHeader}>
        <Text style={[s.colTxt, { flex: 2 }]}>НАЗВАНИЕ СТОЛА</Text>
        <Text style={[s.colTxt, { width: 80, textAlign: 'center' }]}>БЛАЙНДЫ</Text>
        <Text style={[s.colTxt, { width: 60, textAlign: 'center' }]}>ИГРОКИ</Text>
        <Text style={[s.colTxt, { width: 90, textAlign: 'center' }]}>MIN/MAX</Text>
      </View>

      {/* Main content */}
      <View style={s.content}>
        {/* Table list */}
        <FlatList
          style={s.list}
          data={rooms}
          keyExtractor={r => r.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#e60000" />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTxt}>Нет доступных столов</Text>
              <Text style={s.emptySub}>Создайте первый стол</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <TouchableOpacity
              style={[s.row, index % 2 === 0 ? s.rowEven : s.rowOdd, selected?.id === item.id && s.rowSelected]}
              onPress={() => setSelected(item)}
            >
              <View style={{ flex: 2 }}>
                <Text style={s.rowName}>{item.name}</Text>
                <Text style={s.rowType}>БЛ Холдем</Text>
              </View>
              <Text style={[s.rowBlinds, { width: 80, textAlign: 'center' }]}>
                ${item.smallBlind}/${item.bigBlind}
              </Text>
              <View style={{ width: 60, alignItems: 'center' }}>
                <Text style={[s.rowPlayers, item.players.length >= item.maxPlayers && { color: '#e60000' }]}>
                  {item.players.length}/{item.maxPlayers}
                </Text>
              </View>
              <TouchableOpacity
                style={[s.joinBtn, item.gameStarted && s.joinBtnPlaying]}
                onPress={() => joinRoom(item)}
              >
                <Text style={s.joinBtnTxt}>
                  ${item.smallBlind * 50}/${item.bigBlind * 50}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        />

        {/* Right panel (selected table) */}
        {selected && (
          <View style={s.rightPanel}>
            <Text style={s.panelName}>{selected.name}</Text>
            <Text style={s.panelType}>БЛ Холдем</Text>
            <View style={s.panelDivider} />
            <View style={s.panelHeader}>
              <Text style={s.panelCol}>ИГРОК</Text>
              <Text style={s.panelCol}>КЭШ</Text>
            </View>
            {selected.players.map(p => (
              <View key={p} style={s.panelRow}>
                <Text style={s.panelPlayerName}>{p}</Text>
                <Text style={s.panelPlayerChips}>$1000</Text>
              </View>
            ))}
            {selected.players.length === 0 && (
              <Text style={s.panelEmpty}>Пустой стол</Text>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity style={s.playBtn} onPress={() => joinRoom(selected)}>
              <Text style={s.playBtnTxt}>ИГРАТЬ</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Create FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setShowCreate(true)}>
        <Text style={s.fabTxt}>+ Создать стол</Text>
      </TouchableOpacity>

      {/* Create modal */}
      <Modal visible={showCreate} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Новый стол</Text>
            <TextInput
              style={s.input}
              placeholder="Название стола"
              placeholderTextColor="#555"
              value={roomName}
              onChangeText={setRoomName}
              autoFocus
              selectionColor="#e60000"
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={s.cancelTxt}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={createRoom}>
                <Text style={s.confirmTxt}>Создать</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#0d0d0d' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#111', paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#222' },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  logoStar: { color: '#e60000', fontSize: 20, fontWeight: 'bold' },
  logoTxt: { color: '#fff', fontSize: 22, fontWeight: '900', letterSpacing: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceBox: { alignItems: 'flex-end' },
  balanceLabel: { color: '#666', fontSize: 10 },
  balanceVal: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  cashBtn: { backgroundColor: '#e60000', borderRadius: 4, paddingHorizontal: 14, paddingVertical: 8 },
  cashBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  avatarSmall: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#555' },
  avatarSmallTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold' },

  // Nav tabs
  navTabs: { flexDirection: 'row', backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  navTab: { paddingHorizontal: 18, paddingVertical: 14 },
  navTabActive: { borderBottomWidth: 2, borderBottomColor: '#e60000' },
  navTabTxt: { color: '#666', fontSize: 13, fontWeight: '700' },
  navTabTxtActive: { color: '#fff' },

  // Sub tabs
  subTabs: { flexDirection: 'row', backgroundColor: '#0d0d0d', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  subTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a2a2a' },
  subTabActive: { backgroundColor: '#e60000', borderColor: '#e60000' },
  subTabTxt: { color: '#666', fontSize: 13, fontWeight: '600' },
  subTabTxtActive: { color: '#fff', fontWeight: '700' },

  // Columns
  colHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#111', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  colTxt: { color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },

  // Content
  content: { flex: 1, flexDirection: 'row' },
  list: { flex: 1 },

  // Rows
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  rowEven: { backgroundColor: '#0d0d0d' },
  rowOdd: { backgroundColor: '#111111' },
  rowSelected: { backgroundColor: '#1a1a0d' },
  rowName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  rowType: { color: '#555', fontSize: 11, marginTop: 1 },
  rowBlinds: { color: '#ccc', fontSize: 13 },
  rowPlayers: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  joinBtn: { width: 88, borderWidth: 1.5, borderColor: '#e60000', borderRadius: 4, paddingVertical: 7, alignItems: 'center' },
  joinBtnPlaying: { borderColor: '#555' },
  joinBtnTxt: { color: '#e60000', fontWeight: '700', fontSize: 12 },

  // Right panel
  rightPanel: { width: 160, backgroundColor: '#111', borderLeftWidth: 1, borderLeftColor: '#222', padding: 14 },
  panelName: { color: '#fff', fontSize: 15, fontWeight: 'bold', marginBottom: 3 },
  panelType: { color: '#666', fontSize: 12, marginBottom: 10 },
  panelDivider: { height: 1, backgroundColor: '#222', marginBottom: 10 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  panelCol: { color: '#555', fontSize: 10, fontWeight: '700' },
  panelRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  panelPlayerName: { color: '#ddd', fontSize: 12 },
  panelPlayerChips: { color: '#aaa', fontSize: 12 },
  panelEmpty: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 10 },
  playBtn: { backgroundColor: '#e60000', borderRadius: 6, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
  playBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15, letterSpacing: 1 },

  // Empty
  empty: { alignItems: 'center', marginTop: 60 },
  emptyTxt: { color: '#444', fontSize: 18, fontWeight: '600' },
  emptySub: { color: '#333', fontSize: 13, marginTop: 6 },

  // FAB
  fab: { position: 'absolute', bottom: 24, right: 16, backgroundColor: '#e60000', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 13, elevation: 8 },
  fabTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  // Modal
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', padding: 32 },
  modal: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 18, textAlign: 'center' },
  input: { backgroundColor: '#111', borderRadius: 6, padding: 14, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#333', marginBottom: 18, selectionColor: '#e60000' } as TextStyle,
  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 6, borderWidth: 1, borderColor: '#333', alignItems: 'center' },
  cancelTxt: { color: '#888', fontSize: 14 },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 6, backgroundColor: '#e60000', alignItems: 'center' },
  confirmTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
