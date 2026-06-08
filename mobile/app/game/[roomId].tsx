import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Animated, useWindowDimensions, PanResponder, BackHandler,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { gameApi, lobbyApi } from '../../api/client';
import { connectWebSocket, sendAction, disconnectWebSocket } from '../../api/websocket';
import { useGameStore, PlayerDto } from '../../store/gameStore';
import { useAuthStore } from '../../store/authStore';
import PlayingCard from '../../components/PlayingCard';

const BG = '#070707';
const PANEL = '#111114';
const PANEL2 = '#19191d';
const LINE = '#2a2a31';
const RED = '#b81020';
const RED_DARK = '#5f0710';
const GOLD = '#d9b45f';
const BLUE = '#3387c8';
const FELT = '#116132';
const FELT_DARK = '#07391e';
const RAIL = '#2a1610';
const RAIL_DARK = '#120907';
const TEXT = '#f3f3f5';
const MUTED = '#8b8d96';
const TOP_H = 44;
const ACT_H = 92;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const BADGE_COLORS: Record<string, string> = {
  D: GOLD,
  SB: BLUE,
  BB: RED,
};

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const id = Number(roomId);
  const { token, username, chips, setChips } = useAuthStore();
  const { gameState, lastResult, setGameState, reset } = useGameStore();
  const { width: W, height: H } = useWindowDimensions();

  const SW = W;
  const SH = H;
  const PLAY_H = Math.max(236, SH - TOP_H - ACT_H);
  const seatW = clamp(Math.round(SW * 0.2), 118, 148);
  const tableW = Math.round(clamp(SW * 0.58, 320, SW - 38));
  const tableH = Math.round(clamp(tableW * 0.39, 126, PLAY_H * 0.58));
  const tableL = Math.round((SW - tableW) / 2);
  const tableT = Math.round(clamp((PLAY_H - tableH) * 0.3, 42, PLAY_H - tableH - 82));
  const tableB = tableT + tableH;
  const cx = tableL + tableW / 2;
  const myCardsTop = clamp(tableB + 8, tableT + tableH * 0.68, PLAY_H - 116);
  const myBoxTop = clamp(myCardsTop + 74, 0, PLAY_H - 36);

  const seats = [
    [clamp(cx - seatW / 2, 8, SW - seatW - 8), clamp(tableT - 42, 4, PLAY_H - 42)],
    [clamp(tableL + tableW * 0.08, 8, SW - seatW - 8), clamp(tableT + 2, 4, PLAY_H - 42)],
    [clamp(tableL - seatW * 0.42, 8, SW - seatW - 8), clamp(tableT + tableH * 0.52, 4, PLAY_H - 42)],
    [clamp(tableL + tableW - seatW - tableW * 0.08, 8, SW - seatW - 8), clamp(tableT + 2, 4, PLAY_H - 42)],
    [clamp(tableL + tableW - seatW * 0.58, 8, SW - seatW - 8), clamp(tableT + tableH * 0.52, 4, PLAY_H - 42)],
  ];

  const sliderW = useRef(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [started, setStarted] = useState(false);
  const [raiseAmt, setRaiseAmt] = useState(40);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!token) return;
    connectWebSocket(token, id, username ?? '');
    loadState();
    return () => { disconnectWebSocket(); reset(); };
  }, [id, token]);

  useEffect(() => {
    if (!lastResult) return;
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(2600),
      Animated.timing(fadeAnim, { toValue: 0, duration: 260, useNativeDriver: true }),
    ]).start();
  }, [lastResult]);

  const me = gameState?.players.find(p => p.username === username);
  const opps = gameState?.players.filter(p => p.username !== username) ?? [];
  const isMyTurn = gameState?.currentPlayer === username && !me?.folded;
  const callAmt = Math.max(0, (gameState?.currentBet ?? 0) - (me?.currentBet ?? 0));
  const bb = gameState?.bigBlind ?? 20;
  const pot = gameState?.pot ?? 0;
  const minRaise = Math.max(gameState?.currentBet ?? bb, bb);
  const maxRaise = (me?.chips ?? 0) + (me?.currentBet ?? 0);
  const dealerIdx = gameState?.dealerIndex ?? 0;
  const nPlayers = gameState?.players.length ?? 1;
  const eliminated = Boolean(started && gameState && username && !me);
  const busted = eliminated || (me?.chips ?? chips) <= 0;
  const gameActive = Boolean(started && gameState?.phase && gameState.phase !== 'WAITING' && !eliminated);
  const canRaise = isMyTurn && (me?.chips ?? 0) > callAmt && maxRaise > minRaise;

  useEffect(() => {
    if (me?.chips !== undefined) setChips(me.chips);
  }, [me?.chips]);

  useEffect(() => {
    setRaiseAmt(r => Math.min(maxRaise, Math.max(minRaise, r)));
  }, [minRaise, maxRaise]);

  const loadState = async () => {
    try {
      const res = await gameApi.getState(id);
      setGameState(res.data);
      setStarted(res.data.phase !== 'WAITING');
    } catch {}
  };

  const act = (type: string, amount = 0) => sendAction(id, type, amount, username ?? '');

  const confirmLeave = () => {
    Alert.alert(
      'Покинуть стол',
      'Выйти из текущей раздачи и вернуться в лобби?',
      [
        { text: 'Остаться', style: 'cancel' },
        {
          text: 'Выйти', style: 'destructive',
          onPress: async () => {
            await lobbyApi.leaveRoom(id);
            disconnectWebSocket();
            reset();
            ScreenOrientation.unlockAsync();
            router.replace('/lobby');
          },
        },
      ]
    );
  };

  const addBot = async () => {
    try { await lobbyApi.addBot(id); await loadState(); }
    catch { Alert.alert('Ошибка', 'Не удалось добавить бота'); }
  };

  const startGame = async () => {
    try {
      const res = await gameApi.startGame(id);
      setGameState(res.data);
      setStarted(true);
    } catch (e: any) {
      Alert.alert('Ошибка', e.response?.data ?? 'Ошибка старта');
    }
  };

  const rebuy = async () => {
    try {
      const res = await gameApi.rebuy(id);
      setGameState(res.data);
      setStarted(res.data.phase !== 'WAITING');
      const stack = res.data.players.find((p: PlayerDto) => p.username === username)?.chips ?? 1000;
      setChips(stack);
    } catch (e: any) {
      Alert.alert('Ошибка', e.response?.data ?? 'Не удалось сделать ребай');
    }
  };

  const fillPct = maxRaise > minRaise
    ? Math.round(((raiseAmt - minRaise) / (maxRaise - minRaise)) * 100) : 0;

  const updateSlider = useCallback((x: number) => {
    if (!sliderW.current) return;
    const ratio = clamp(x / sliderW.current, 0, 1);
    const value = Math.round(minRaise + ratio * (maxRaise - minRaise));
    setRaiseAmt(clamp(value, minRaise, maxRaise));
  }, [minRaise, maxRaise]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => updateSlider(e.nativeEvent.locationX),
    onPanResponderMove: (e) => updateSlider(e.nativeEvent.locationX),
  })).current;

  const getBadge = (playerIdx: number): string | null => {
    if (nPlayers < 2) return null;
    if (playerIdx === dealerIdx % nPlayers) return 'D';
    if (playerIdx === (dealerIdx + 1) % nPlayers) return 'SB';
    if (playerIdx === (dealerIdx + 2) % nPlayers) return 'BB';
    return null;
  };

  if (!gameActive) {
    return (
      <View style={st.waitBg}>
        <View style={st.waitPanel}>
          <View style={st.waitHeader}>
            <Text style={st.waitKicker}>TABLE #{id}</Text>
            <Text style={st.waitTitle}>{started || gameState?.message ? 'Раздача завершена' : 'Ожидание игроков'}</Text>
          </View>
          {!!gameState?.message && <Text style={st.waitMsg}>{gameState.message}</Text>}
          {eliminated && <Text style={st.waitMsg}>У вас закончились фишки. Сделайте ребай или покиньте стол.</Text>}

          <View style={st.waitList}>
            {(gameState?.players ?? []).map((p, i) => (
              <View key={p.username} style={st.waitRow}>
                <Avatar name={p.username} tone={p.username === username ? 'me' : p.username.startsWith('BOT_') ? 'bot' : 'opp'} />
                <View style={st.waitPlayerText}>
                  <Text style={st.waitName} numberOfLines={1}>{p.username}</Text>
                  <Text style={st.waitMeta}>Texas Hold'em</Text>
                </View>
                {getBadge(i) && <Badge label={getBadge(i)!} />}
                <Text style={st.waitChips}>${p.chips}</Text>
              </View>
            ))}
            {!gameState?.players?.length && <Text style={st.waitEmpty}>Свободный стол</Text>}
          </View>

          <View style={st.waitBtns}>
            <TouchableOpacity style={st.secondaryBtn} onPress={addBot}>
              <Text style={st.secondaryBtnTxt}>BOT +</Text>
            </TouchableOpacity>
            {busted ? (
              <TouchableOpacity style={st.primaryBtn} onPress={rebuy}>
                <Text style={st.primaryBtnTxt}>РЕБАЙ $1000</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={st.primaryBtn} onPress={startGame}>
                <Text style={st.primaryBtnTxt}>ИГРАТЬ</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={st.exitFullBtn} onPress={confirmLeave}>
            <Text style={st.exitFullTxt}>Покинуть стол</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.bg, { width: SW, height: SH }]}>
      <View style={[st.topBar, { height: TOP_H, width: SW }]}>
        <TouchableOpacity onPress={confirmLeave} style={st.topBackBtn}>
          <Text style={st.topBackTxt}>Lobby</Text>
        </TouchableOpacity>
        <View style={st.topCenter}>
          <Text style={st.topTable}>TABLE #{id}</Text>
          <Text style={st.phaseLbl}>{PHASE_LABELS[gameState?.phase ?? ''] ?? 'WAITING'}</Text>
        </View>
        <View style={st.topStack}>
          <Text style={st.topUser} numberOfLines={1}>{username}</Text>
          <Text style={st.topMoney}>${me?.chips ?? 0}</Text>
        </View>
      </View>

      <Animated.View style={[st.banner, { opacity: fadeAnim, left: clamp(cx - 150, 8, SW - 308) }]} pointerEvents="none">
        <Text style={st.bannerTxt}>{lastResult}</Text>
      </Animated.View>

      <View style={[st.playArea, { width: SW, height: PLAY_H, top: TOP_H }]}>
        <View style={[st.tableShadow, {
          left: tableL - 7, top: tableT - 7,
          width: tableW + 14, height: tableH + 14,
          borderRadius: (tableH + 14) / 2,
        }]} />
        <View style={[st.tableRail, {
          left: tableL, top: tableT,
          width: tableW, height: tableH,
          borderRadius: tableH / 2,
        }]}>
          <View style={[st.tableFelt, { borderRadius: (tableH - 18) / 2 }]}>
            <View style={st.potPill}>
              <Text style={st.potLabel}>POT</Text>
              <Text style={st.potValue}>${pot}</Text>
            </View>
            <View style={st.boardRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <PlayingCard key={i} card={gameState?.communityCards[i] ?? ''} size="sm" />
              ))}
            </View>
          </View>
        </View>

        {opps.map((p, idx) => {
          const [left, top] = seats[idx] ?? seats[0];
          const fullIdx = gameState?.players.findIndex(pl => pl.username === p.username) ?? -1;
          return (
            <SeatBox
              key={p.username}
              p={p}
              active={gameState?.currentPlayer === p.username}
              badge={getBadge(fullIdx)}
              style={{ position: 'absolute', left, top, width: seatW }}
            />
          );
        })}

        <View style={[
          st.myCardsRow,
          { position: 'absolute', left: clamp(cx - 48, 8, SW - 118), top: myCardsTop },
          me?.folded && st.myCardsFolded,
        ]}>
          {(me?.holeCards?.length ? me.holeCards : ['', '']).map((card, i) => (
            <View key={`${card}-${i}`} style={{ transform: [{ rotate: i === 0 ? '-4deg' : '4deg' }] }}>
              <PlayingCard card={card} size="md" />
            </View>
          ))}
          {me?.folded && (
            <View style={st.foldedOverlay}>
              <Text style={st.foldedOverlayTxt}>FOLD</Text>
            </View>
          )}
        </View>

        <View style={[st.heroSeat, isMyTurn && st.heroSeatActive, {
          position: 'absolute',
          left: clamp(cx - 76, 8, SW - 152),
          top: myBoxTop,
          width: 152,
        }]}>
          <Avatar name={username ?? ''} tone="me" />
          <View style={st.heroText}>
            <Text style={st.heroName} numberOfLines={1}>{username}</Text>
            <Text style={st.heroStack}>${me?.chips ?? 0}</Text>
          </View>
          {getBadge(gameState?.players.findIndex(pl => pl.username === username) ?? -1) && (
            <Badge label={getBadge(gameState?.players.findIndex(pl => pl.username === username) ?? -1)!} />
          )}
          {(me?.currentBet ?? 0) > 0 && <Chip amount={me?.currentBet ?? 0} />}
        </View>
      </View>

      <View style={[st.actBar, { width: SW, height: ACT_H, top: SH - ACT_H }]}>
        {isMyTurn && !me?.folded ? (
          <View style={st.actInner}>
            <View style={st.actionInfo}>
              <Text style={st.actionTitle}>Ваш ход</Text>
              <Text style={st.actionSub}>Call ${callAmt} · Stack ${me?.chips ?? 0}</Text>
            </View>
            <View style={st.actBtns}>
              <TouchableOpacity style={st.btnFold} onPress={() => act('FOLD')}>
                <Text style={st.btnTxt}>Fold</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnCall} onPress={() => act(callAmt === 0 ? 'CHECK' : 'CALL')}>
                <Text style={st.btnTxt}>{callAmt === 0 ? 'Check' : `Call $${callAmt}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btnRaise, !canRaise && st.btnDisabled]} disabled={!canRaise} onPress={() => act('RAISE', raiseAmt)}>
                <Text style={st.btnTxt}>Raise ${raiseAmt}</Text>
              </TouchableOpacity>
            </View>
            <View style={st.sliderSection}>
              <View style={st.sliderTop}>
                <Text style={st.sliderLbl}>MIN</Text>
                <Text style={st.raiseVal}>${raiseAmt}</Text>
                <Text style={st.sliderLbl}>MAX</Text>
              </View>
              <View style={st.sliderTrack}
                onLayout={e => { sliderW.current = e.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}>
                <View style={[st.sliderFill, { width: `${fillPct}%` as any }]} />
                <View style={[st.sliderThumb, { left: `${fillPct}%` as any, marginLeft: -9 }]} />
              </View>
              <View style={st.presets}>
                {[['MIN', minRaise], ['3BB', bb * 3], ['POT', pot], ['ALL', maxRaise]].map(([label, value]) => (
                  <TouchableOpacity key={label} style={st.preset}
                    onPress={() => setRaiseAmt(Math.min(maxRaise, Math.max(minRaise, Number(value))))}>
                    <Text style={st.presetTxt}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <View style={st.waitAct}>
            <Text style={st.waitActTxt}>
              {me?.folded ? 'Вы сбросили карты' : `Ход: ${gameState?.currentPlayer ?? '...'}`}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Avatar({ name, tone }: { name: string; tone: 'me' | 'opp' | 'bot' }) {
  const initials = name.startsWith('BOT_') ? 'B' : (name[0] ?? '?').toUpperCase();
  return (
    <View style={[st.avatar, tone === 'me' && st.avatarMe, tone === 'opp' && st.avatarOpp, tone === 'bot' && st.avatarBot]}>
      <Text style={st.avatarTxt}>{initials}</Text>
    </View>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <View style={[st.badge, { backgroundColor: BADGE_COLORS[label] ?? GOLD }]}>
      <Text style={st.badgeTxt}>{label}</Text>
    </View>
  );
}

function Chip({ amount }: { amount: number }) {
  return (
    <View style={st.chip}>
      <Text style={st.chipTxt}>${amount}</Text>
    </View>
  );
}

function SeatBox({ p, active, badge, style }: { p: PlayerDto; active: boolean; badge: string | null; style?: any }) {
  const tone = p.username.startsWith('BOT_') ? 'bot' : 'opp';
  return (
    <View style={[st.seatBox, active && st.seatActive, p.folded && st.seatFolded, style]}>
      <View style={st.seatTop}>
        <Avatar name={p.username} tone={tone} />
        <View style={st.seatText}>
          <Text style={st.seatName} numberOfLines={1}>{p.username}</Text>
          <Text style={st.seatStack}>${p.chips}</Text>
        </View>
        {badge && <Badge label={badge} />}
      </View>
      <View style={st.seatBottom}>
        {p.currentBet > 0 ? <Chip amount={p.currentBet} /> : <View />}
        {p.folded ? (
          <Text style={st.foldTag}>FOLD</Text>
        ) : (
          <View style={st.hiddenCards}>
            <PlayingCard card="" size="xs" hidden />
            <PlayingCard card="" size="xs" hidden />
          </View>
        )}
      </View>
      {!!p.lastAction && <Text style={st.lastActTxt} numberOfLines={1}>{p.lastAction}</Text>}
    </View>
  );
}

const PHASE_LABELS: Record<string, string> = {
  PRE_FLOP: 'PRE-FLOP',
  FLOP: 'FLOP',
  TURN: 'TURN',
  RIVER: 'RIVER',
  SHOWDOWN: 'SHOWDOWN',
};

const st = StyleSheet.create({
  bg: { backgroundColor: BG, position: 'absolute' },
  waitBg: { flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center', padding: 18 },
  waitPanel: { width: '88%', maxWidth: 390, backgroundColor: PANEL, borderRadius: 8, borderWidth: 1, borderColor: LINE, padding: 16 },
  waitHeader: { alignItems: 'center', marginBottom: 12 },
  waitKicker: { color: MUTED, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  waitTitle: { color: TEXT, fontSize: 20, fontWeight: '900', marginTop: 3 },
  waitMsg: { color: '#c7c8ce', fontSize: 12, textAlign: 'center', lineHeight: 17, marginBottom: 10 },
  waitList: { gap: 7, marginBottom: 12 },
  waitRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#18181c', borderWidth: 1, borderColor: '#27272e', borderRadius: 6, paddingHorizontal: 8 },
  waitPlayerText: { flex: 1 },
  waitName: { color: TEXT, fontSize: 13, fontWeight: '800' },
  waitMeta: { color: MUTED, fontSize: 10, marginTop: 1 },
  waitChips: { color: GOLD, fontSize: 12, fontWeight: '800' },
  waitEmpty: { color: MUTED, textAlign: 'center', fontSize: 13, paddingVertical: 12 },
  waitBtns: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  primaryBtn: { flex: 1, height: 42, backgroundColor: RED, borderRadius: 5, justifyContent: 'center', alignItems: 'center' },
  primaryBtnTxt: { color: TEXT, fontSize: 13, fontWeight: '900' },
  secondaryBtn: { width: 96, height: 42, backgroundColor: '#202027', borderRadius: 5, borderWidth: 1, borderColor: LINE, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnTxt: { color: '#d4d6de', fontSize: 13, fontWeight: '800' },
  exitFullBtn: { height: 38, justifyContent: 'center', alignItems: 'center', borderRadius: 5, borderWidth: 1, borderColor: '#381018', backgroundColor: '#13080a' },
  exitFullTxt: { color: '#e4828c', fontSize: 12, fontWeight: '800' },

  topBar: { position: 'absolute', top: 0, backgroundColor: '#0b0b0d', borderBottomWidth: 1, borderBottomColor: '#24242a', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10 },
  topBackBtn: { height: 28, minWidth: 62, justifyContent: 'center', alignItems: 'center', backgroundColor: PANEL2, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
  topBackTxt: { color: '#d8d9df', fontSize: 11, fontWeight: '800' },
  topCenter: { alignItems: 'center' },
  topTable: { color: TEXT, fontSize: 12, fontWeight: '900', letterSpacing: 0.8 },
  phaseLbl: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginTop: 1 },
  topStack: { alignItems: 'flex-end', width: 92 },
  topUser: { color: '#d7d8dd', fontSize: 11, fontWeight: '700', maxWidth: 92 },
  topMoney: { color: GOLD, fontSize: 12, fontWeight: '900' },

  banner: { position: 'absolute', top: 50, zIndex: 20, width: 300, backgroundColor: '#0c0c0e', borderWidth: 1.5, borderColor: GOLD, borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center' },
  bannerTxt: { color: GOLD, fontSize: 13, fontWeight: '900', textAlign: 'center' },

  playArea: { position: 'absolute', overflow: 'visible' },
  tableShadow: { position: 'absolute', backgroundColor: '#020202', opacity: 0.9 },
  tableRail: { position: 'absolute', backgroundColor: RAIL_DARK, borderWidth: 7, borderColor: RAIL, elevation: 16, shadowColor: '#000', shadowOpacity: 0.95, shadowRadius: 15 },
  tableFelt: { flex: 1, margin: 5, backgroundColor: FELT, borderWidth: 2, borderColor: FELT_DARK, alignItems: 'center', justifyContent: 'center' },
  potPill: { position: 'absolute', top: 13, minWidth: 86, height: 30, borderRadius: 15, backgroundColor: 'rgba(5,10,7,0.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  potLabel: { color: MUTED, fontSize: 9, fontWeight: '900' },
  potValue: { color: TEXT, fontSize: 12, fontWeight: '900' },
  boardRow: { flexDirection: 'row', gap: 5, marginTop: 22 },

  seatBox: { backgroundColor: '#101014', borderRadius: 6, borderWidth: 1.5, borderColor: '#2a2a31', padding: 5, gap: 4, overflow: 'hidden' },
  seatActive: { borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.45, shadowRadius: 7, elevation: 7 },
  seatFolded: { opacity: 0.48 },
  seatTop: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  seatText: { flex: 1, minWidth: 0 },
  seatName: { color: TEXT, fontSize: 10, fontWeight: '900' },
  seatStack: { color: GOLD, fontSize: 9, fontWeight: '900', marginTop: 1 },
  seatBottom: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hiddenCards: { flexDirection: 'row', gap: 2 },
  foldTag: { color: MUTED, fontSize: 9, fontWeight: '900' },
  lastActTxt: { color: '#74c7ff', fontSize: 9, fontWeight: '800' },

  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  avatarMe: { backgroundColor: '#8140aa' },
  avatarOpp: { backgroundColor: '#245a87' },
  avatarBot: { backgroundColor: '#28613a' },
  avatarTxt: { color: TEXT, fontSize: 12, fontWeight: '900' },
  badge: { minWidth: 22, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
  badgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  chip: { minWidth: 38, height: 18, paddingHorizontal: 6, borderRadius: 9, backgroundColor: '#111c29', borderWidth: 1, borderColor: '#4d8fcf', justifyContent: 'center', alignItems: 'center' },
  chipTxt: { color: '#8ccaff', fontSize: 9, fontWeight: '900' },

  myCardsRow: { flexDirection: 'row', gap: 6 },
  myCardsFolded: { opacity: 0.38 },
  foldedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 5 },
  foldedOverlayTxt: { color: TEXT, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  heroSeat: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#111116', borderRadius: 6, borderWidth: 1.5, borderColor: '#303038', paddingHorizontal: 6 },
  heroSeatActive: { borderColor: GOLD },
  heroText: { flex: 1, minWidth: 0 },
  heroName: { color: TEXT, fontSize: 11, fontWeight: '900' },
  heroStack: { color: GOLD, fontSize: 10, fontWeight: '900' },

  actBar: { position: 'absolute', backgroundColor: '#0a0a0c', borderTopWidth: 1, borderTopColor: '#24242a' },
  actInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 },
  actionInfo: { width: 86 },
  actionTitle: { color: TEXT, fontSize: 13, fontWeight: '900' },
  actionSub: { color: MUTED, fontSize: 9, marginTop: 2, lineHeight: 12 },
  actBtns: { flexDirection: 'row', gap: 6 },
  btnFold: { height: 38, minWidth: 64, borderRadius: 5, backgroundColor: RED_DARK, borderWidth: 1, borderColor: RED, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  btnCall: { height: 38, minWidth: 82, borderRadius: 5, backgroundColor: '#2a2a31', borderWidth: 1, borderColor: '#44454f', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  btnRaise: { height: 38, minWidth: 92, borderRadius: 5, backgroundColor: RED, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 },
  btnDisabled: { opacity: 0.45 },
  btnTxt: { color: TEXT, fontSize: 12, fontWeight: '900' },
  sliderSection: { flex: 1, gap: 4 },
  sliderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderLbl: { color: MUTED, fontSize: 9, fontWeight: '900' },
  raiseVal: { color: GOLD, fontSize: 12, fontWeight: '900' },
  sliderTrack: { height: 18, justifyContent: 'center' },
  sliderFill: { position: 'absolute', left: 0, height: 4, backgroundColor: RED, borderRadius: 2 },
  sliderThumb: { position: 'absolute', top: 0, width: 18, height: 18, borderRadius: 9, backgroundColor: '#f2f2f2', borderWidth: 2, borderColor: '#c7c7c7' },
  presets: { flexDirection: 'row', gap: 4 },
  preset: { flex: 1, height: 24, borderRadius: 4, backgroundColor: '#18181d', borderWidth: 1, borderColor: '#303038', justifyContent: 'center', alignItems: 'center' },
  presetTxt: { color: '#c3c5cd', fontSize: 9, fontWeight: '900' },
  waitAct: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  waitActTxt: { color: '#a6a8b0', fontSize: 14, fontWeight: '800' },
});
