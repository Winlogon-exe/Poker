import { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, RefreshControl, TextStyle
} from 'react-native';
import { router } from 'expo-router';
import { lobbyApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

interface Room {
  id: number;
  name: string;
  maxPlayers: number;
  smallBlind: number;
  bigBlind: number;
  players: string[];
  gameStarted: boolean;
}

const FILTERS = ['Cash', 'Holdem', '6-Max'];

export default function LobbyScreen() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<Room | null>(null);
  const { username, chips, logout } = useAuthStore();

  const loadRooms = async () => {
    try {
      const res = await lobbyApi.getRooms();
      setRooms(res.data);
      setSelected(prev => prev ? (res.data.find((r: Room) => r.id === prev.id) ?? null) : prev);
    } catch {}
  };

  useEffect(() => {
    loadRooms();
    const timer = setInterval(loadRooms, 4000);
    return () => clearInterval(timer);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const createRoom = async () => {
    if (!roomName.trim()) return;
    try {
      const res = await lobbyApi.createRoom(roomName.trim());
      setShowCreate(false);
      setRoomName('');
      router.push(`/game/${res.data.id}`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось создать стол');
    }
  };

  const joinRoom = async (room: Room) => {
    if (room.gameStarted) {
      Alert.alert('Идет игра', 'Этот стол уже играет');
      return;
    }
    if (room.players.length >= room.maxPlayers) {
      Alert.alert('Стол полный');
      return;
    }
    try {
      await lobbyApi.joinRoom(room.id);
      router.push(`/game/${room.id}`);
    } catch {
      Alert.alert('Ошибка', 'Не удалось войти');
    }
  };

  return (
    <View style={s.bg}>
      <View style={s.header}>
        <View>
          <Text style={s.kicker}>MOBILE POKER</Text>
          <Text style={s.title}>Cash Games</Text>
        </View>
        <View style={s.headerRight}>
          <View style={s.wallet}>
            <Text style={s.walletLabel}>Balance</Text>
            <Text style={s.walletValue}>${chips}</Text>
          </View>
          <TouchableOpacity style={s.profileBtn} onPress={() => { logout(); router.replace('/'); }}>
            <Text style={s.profileTxt}>{username?.[0]?.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={s.filters}>
        {FILTERS.map((filter, idx) => (
          <View key={filter} style={[s.filter, idx === 0 && s.filterActive]}>
            <Text style={[s.filterTxt, idx === 0 && s.filterTxtActive]}>{filter}</Text>
          </View>
        ))}
      </View>

      <View style={s.tableHeader}>
        <Text style={[s.colTxt, { flex: 1.6 }]}>TABLE</Text>
        <Text style={[s.colTxt, { width: 76, textAlign: 'right' }]}>BLINDS</Text>
        <Text style={[s.colTxt, { width: 58, textAlign: 'center' }]}>SEATS</Text>
        <Text style={[s.colTxt, { width: 82, textAlign: 'right' }]}>BUY-IN</Text>
      </View>

      <View style={s.content}>
        <FlatList
          style={s.list}
          data={rooms}
          keyExtractor={room => room.id.toString()}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#b81020" />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyTitle}>Нет открытых столов</Text>
              <Text style={s.emptySub}>Создайте стол и добавьте игроков</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isSelected = selected?.id === item.id;
            const isFull = item.players.length >= item.maxPlayers;
            return (
              <TouchableOpacity
                style={[s.row, isSelected && s.rowSelected]}
                onPress={() => setSelected(item)}
                activeOpacity={0.85}
              >
                <View style={s.tableCell}>
                  <View style={[s.statusDot, item.gameStarted && s.statusBusy]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.rowMeta}>No Limit Hold'em</Text>
                  </View>
                </View>
                <Text style={s.rowBlinds}>${item.smallBlind}/${item.bigBlind}</Text>
                <Text style={[s.rowSeats, isFull && s.rowSeatsFull]}>{item.players.length}/{item.maxPlayers}</Text>
                <TouchableOpacity
                  style={[s.buyInBtn, (item.gameStarted || isFull) && s.buyInDisabled]}
                  onPress={() => joinRoom(item)}
                >
                  <Text style={s.buyInTxt}>${item.bigBlind * 50}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />

        {selected && (
          <View style={s.detailPanel}>
            <Text style={s.panelKicker}>SELECTED TABLE</Text>
            <Text style={s.panelTitle} numberOfLines={1}>{selected.name}</Text>
            <View style={s.panelStatRow}>
              <PanelStat label="Blinds" value={`$${selected.smallBlind}/${selected.bigBlind}`} />
              <PanelStat label="Players" value={`${selected.players.length}/${selected.maxPlayers}`} />
            </View>
            <View style={s.panelDivider} />
            <Text style={s.panelSubTitle}>Players</Text>
            <View style={s.playersList}>
              {selected.players.map(player => (
                <View key={player} style={s.playerRow}>
                  <View style={s.playerAvatar}>
                    <Text style={s.playerAvatarTxt}>{player.startsWith('BOT_') ? 'B' : player[0].toUpperCase()}</Text>
                  </View>
                  <Text style={s.playerName} numberOfLines={1}>{player}</Text>
                  <Text style={s.playerStack}>$1000</Text>
                </View>
              ))}
              {selected.players.length === 0 && <Text style={s.panelEmpty}>Стол свободен</Text>}
            </View>
            <TouchableOpacity style={s.playBtn} onPress={() => joinRoom(selected)}>
              <Text style={s.playBtnTxt}>SIT DOWN</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <TouchableOpacity style={s.createBtn} onPress={() => setShowCreate(true)}>
        <Text style={s.createBtnTxt}>CREATE TABLE</Text>
      </TouchableOpacity>

      <Modal visible={showCreate} transparent animationType="fade">
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>New Table</Text>
            <TextInput
              style={s.input}
              placeholder="Table name"
              placeholderTextColor="#686a73"
              value={roomName}
              onChangeText={setRoomName}
              autoFocus
              selectionColor="#b81020"
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setShowCreate(false)}>
                <Text style={s.cancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={createRoom}>
                <Text style={s.confirmTxt}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function PanelStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.panelStat}>
      <Text style={s.panelStatLabel}>{label}</Text>
      <Text style={s.panelStatValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: '#070707' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 46, paddingBottom: 12, paddingHorizontal: 14, backgroundColor: '#0c0c0e', borderBottomWidth: 1, borderBottomColor: '#24242a' },
  kicker: { color: '#858791', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#f3f3f5', fontSize: 22, fontWeight: '900', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  wallet: { alignItems: 'flex-end' },
  walletLabel: { color: '#858791', fontSize: 10, fontWeight: '700' },
  walletValue: { color: '#d9b45f', fontSize: 16, fontWeight: '900' },
  profileBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#2a2a31', borderWidth: 1, borderColor: '#44454f', justifyContent: 'center', alignItems: 'center' },
  profileTxt: { color: '#f3f3f5', fontSize: 14, fontWeight: '900' },

  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#09090a' },
  filter: { height: 32, paddingHorizontal: 16, borderRadius: 4, borderWidth: 1, borderColor: '#2b2c33', justifyContent: 'center', backgroundColor: '#151519' },
  filterActive: { backgroundColor: '#b81020', borderColor: '#b81020' },
  filterTxt: { color: '#aaaeb8', fontSize: 12, fontWeight: '900' },
  filterTxtActive: { color: '#fff' },

  tableHeader: { height: 30, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, backgroundColor: '#111114', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#24242a' },
  colTxt: { color: '#686a73', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  content: { flex: 1, flexDirection: 'row' },
  list: { flex: 1 },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#19191e', backgroundColor: '#0d0d10' },
  rowSelected: { backgroundColor: '#19161a', borderLeftWidth: 3, borderLeftColor: '#b81020', paddingLeft: 11 },
  tableCell: { flex: 1.6, flexDirection: 'row', alignItems: 'center', gap: 9, minWidth: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2fb25d' },
  statusBusy: { backgroundColor: '#8d8f98' },
  rowName: { color: '#f3f3f5', fontSize: 14, fontWeight: '900' },
  rowMeta: { color: '#686a73', fontSize: 11, fontWeight: '700', marginTop: 2 },
  rowBlinds: { width: 76, textAlign: 'right', color: '#d7d8df', fontSize: 13, fontWeight: '800' },
  rowSeats: { width: 58, textAlign: 'center', color: '#aaaeb8', fontSize: 13, fontWeight: '900' },
  rowSeatsFull: { color: '#e26370' },
  buyInBtn: { width: 82, height: 32, borderRadius: 4, borderWidth: 1.5, borderColor: '#b81020', justifyContent: 'center', alignItems: 'center' },
  buyInDisabled: { borderColor: '#494a52', opacity: 0.65 },
  buyInTxt: { color: '#f3f3f5', fontSize: 12, fontWeight: '900' },

  detailPanel: { width: 176, backgroundColor: '#101014', borderLeftWidth: 1, borderLeftColor: '#24242a', padding: 12 },
  panelKicker: { color: '#686a73', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  panelTitle: { color: '#f3f3f5', fontSize: 16, fontWeight: '900', marginTop: 4 },
  panelStatRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  panelStat: { flex: 1, backgroundColor: '#18181d', borderWidth: 1, borderColor: '#2b2c33', borderRadius: 5, padding: 7 },
  panelStatLabel: { color: '#686a73', fontSize: 9, fontWeight: '900' },
  panelStatValue: { color: '#d9b45f', fontSize: 12, fontWeight: '900', marginTop: 2 },
  panelDivider: { height: 1, backgroundColor: '#24242a', marginVertical: 12 },
  panelSubTitle: { color: '#aaaeb8', fontSize: 11, fontWeight: '900', marginBottom: 6 },
  playersList: { flex: 1, gap: 6 },
  playerRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6 },
  playerAvatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#245a87', justifyContent: 'center', alignItems: 'center' },
  playerAvatarTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  playerName: { flex: 1, color: '#e5e6eb', fontSize: 11, fontWeight: '800' },
  playerStack: { color: '#d9b45f', fontSize: 10, fontWeight: '900' },
  panelEmpty: { color: '#686a73', fontSize: 12, textAlign: 'center', marginTop: 12 },
  playBtn: { height: 42, borderRadius: 5, backgroundColor: '#b81020', justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  playBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },

  empty: { alignItems: 'center', marginTop: 70 },
  emptyTitle: { color: '#aaaeb8', fontSize: 16, fontWeight: '900' },
  emptySub: { color: '#686a73', fontSize: 12, marginTop: 5 },
  createBtn: { position: 'absolute', right: 14, bottom: 18, height: 42, paddingHorizontal: 18, borderRadius: 5, backgroundColor: '#b81020', justifyContent: 'center', alignItems: 'center', elevation: 8 },
  createBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '900' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', justifyContent: 'center', padding: 28 },
  modal: { backgroundColor: '#111114', borderRadius: 7, padding: 18, borderWidth: 1, borderColor: '#303038' },
  modalTitle: { color: '#f3f3f5', fontSize: 18, fontWeight: '900', marginBottom: 14, textAlign: 'center' },
  input: { backgroundColor: '#18181d', borderRadius: 5, padding: 13, color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#303038', marginBottom: 14, selectionColor: '#b81020' } as TextStyle,
  modalBtns: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, height: 42, borderRadius: 5, borderWidth: 1, borderColor: '#303038', justifyContent: 'center', alignItems: 'center' },
  cancelTxt: { color: '#aaaeb8', fontSize: 13, fontWeight: '800' },
  confirmBtn: { flex: 1, height: 42, borderRadius: 5, backgroundColor: '#b81020', justifyContent: 'center', alignItems: 'center' },
  confirmTxt: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
