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

const FELT  = '#2d7a40';
const FELT2 = '#1f5c2e';
const RIM   = '#1a0d02';
const BG    = '#0d0a0a';
const RED   = '#8b1515';
const RED2  = '#c0392b';
const GOLD  = '#f0c040';
const PBOX  = 'rgba(8,5,5,0.90)';
const TOP_H = 36;
const ACT_H = 74;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const BADGE_COLORS: Record<string, { bg: string; label: string }> = {
  D:  { bg: '#c8a84b', label: 'D' },
  SB: { bg: '#2980b9', label: 'SB' },
  BB: { bg: '#8b1515', label: 'BB' },
};

export default function GameScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const id = Number(roomId);
  const { token, username, chips, setChips } = useAuthStore();
  const { gameState, lastResult, setGameState, reset } = useGameStore();
  const { width: W, height: H } = useWindowDimensions();

  const SW = W;
  const SH = H;
  const PLAY_H = Math.max(220, SH - TOP_H - ACT_H);

  const PW      = clamp(Math.round(SW * 0.18), 104, 124);
  const TABLE_W = Math.round(clamp(SW * 0.52, 280, SW - PW * 2 - 28));
  const TABLE_H = Math.round(clamp(TABLE_W * 0.36, 100, PLAY_H * 0.48));
  const TABLE_L = Math.round((SW - TABLE_W) / 2);
  const TABLE_T = Math.round(clamp((PLAY_H - TABLE_H) * 0.28, 44, PLAY_H - TABLE_H - 92));
  const TABLE_B = TABLE_T + TABLE_H;
  const CX      = TABLE_L + Math.round(TABLE_W / 2);
  const myBoxTop = clamp(TABLE_B + 78, 0, PLAY_H - 38);
  const myCardsTop = clamp(myBoxTop - 78, TABLE_B + 4, PLAY_H - 116);

  const seats = [
    [clamp(CX - PW / 2, 6, SW - PW - 6), TABLE_T - 42],
    [clamp(TABLE_L - PW - 6, 6, SW - PW - 6), TABLE_T + Math.round(TABLE_H * 0.08)],
    [clamp(TABLE_L - PW - 6, 6, SW - PW - 6), TABLE_T + Math.round(TABLE_H * 0.58)],
    [clamp(TABLE_L + TABLE_W + 6, 6, SW - PW - 6), TABLE_T + Math.round(TABLE_H * 0.08)],
    [clamp(TABLE_L + TABLE_W + 6, 6, SW - PW - 6), TABLE_T + Math.round(TABLE_H * 0.58)],
  ];

  const sliderW  = useRef(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [started, setStarted]   = useState(false);
  const [raiseAmt, setRaiseAmt] = useState(40);
  const [leaving, setLeaving]   = useState(false);

  useEffect(() => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT);
    return () => { ScreenOrientation.unlockAsync(); };
  }, []);

  // Block Android back button
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
    if (lastResult) {
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2600),
        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]).start();
    }
  }, [lastResult]);

  const me       = gameState?.players.find(p => p.username === username);
  const opps     = gameState?.players.filter(p => p.username !== username) ?? [];
  const isMyTurn = gameState?.currentPlayer === username && !me?.folded;
  const callAmt  = Math.max(0, (gameState?.currentBet ?? 0) - (me?.currentBet ?? 0));
  const bd       = gameState?.bigBlind ?? 20;
  const pot      = gameState?.pot ?? 0;
  const minRaise = Math.max(gameState?.currentBet ?? bd, bd);
  const maxRaise = (me?.chips ?? 0) + (me?.currentBet ?? 0);
  const dealerIdx = gameState?.dealerIndex ?? 0;
  const nPlayers  = gameState?.players.length ?? 1;
  const eliminated = Boolean(started && gameState && username && !me);
  const busted = eliminated || (me?.chips ?? chips) <= 0;
  const gameActive = Boolean(started && gameState?.phase && gameState.phase !== 'WAITING' && !eliminated);
  const canRaise = isMyTurn && (me?.chips ?? 0) > callAmt && maxRaise > minRaise;

  // Sync chips with auth store
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
      'Вы уверены? Ваши ставки будут потеряны.',
      [
        { text: 'Остаться', style: 'cancel' },
        {
          text: 'Покинуть', style: 'destructive',
          onPress: async () => {
            setLeaving(true);
            await lobbyApi.leaveRoom(id);
            disconnectWebSocket(); reset();
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
    }
    catch (e: any) { Alert.alert('Ошибка', e.response?.data ?? 'Ошибка'); }
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

  // Slider
  const fillPct = maxRaise > minRaise
    ? Math.round(((raiseAmt - minRaise) / (maxRaise - minRaise)) * 100) : 0;

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => updateSlider(e.nativeEvent.locationX),
    onPanResponderMove: (e) => updateSlider(e.nativeEvent.locationX),
  })).current;

  const updateSlider = useCallback((x: number) => {
    if (!sliderW.current) return;
    const ratio = Math.max(0, Math.min(1, x / sliderW.current));
    const v = Math.round(minRaise + ratio * (maxRaise - minRaise));
    setRaiseAmt(Math.max(minRaise, Math.min(maxRaise, v)));
  }, [minRaise, maxRaise]);

  // Helper: get badge for a player by their index in players array
  const getBadge = (playerIdx: number): string | null => {
    if (nPlayers < 2) return null;
    if (playerIdx === dealerIdx % nPlayers) return 'D';
    if (playerIdx === (dealerIdx + 1) % nPlayers) return 'SB';
    if (playerIdx === (dealerIdx + 2) % nPlayers) return 'BB';
    return null;
  };

  // ── WAITING ───────────────────────────────────────────────────────────────
  if (!gameActive) {
    return (
      <View style={st.waitBg}>
        <View style={st.waitCard}>
          <Text style={st.waitTitle}>
            {started || gameState?.message ? 'Игра завершена' : `Стол #${id}`}
          </Text>
          {!!gameState?.message && <Text style={st.waitMsg}>{gameState.message}</Text>}
          {eliminated && (
            <Text style={st.waitMsg}>
              У вас закончились фишки. Сделайте ребай или покиньте стол.
            </Text>
          )}
          <View style={st.waitList}>
            {(gameState?.players ?? []).map((p, i) => (
              <View key={p.username} style={st.waitRow}>
                <View style={[st.av, p.username.startsWith('BOT') ? st.avBot : st.avMe]}>
                  <Text style={st.avTxt}>{p.username.startsWith('BOT') ? 'B' : p.username[0].toUpperCase()}</Text>
                </View>
                <Text style={st.wName}>{p.username}</Text>
                {getBadge(i) && (
                  <View style={[st.badgeInline, { backgroundColor: BADGE_COLORS[getBadge(i)!].bg }]}>
                    <Text style={st.badgeInlineTxt}>{getBadge(i)}</Text>
                  </View>
                )}
                <Text style={st.wChips}>${p.chips}</Text>
              </View>
            ))}
            {!gameState?.players?.length && <Text style={st.waitEmpty}>Ожидание игроков...</Text>}
          </View>
          <View style={st.waitBtns}>
            <TouchableOpacity style={st.botBtn} onPress={addBot}>
              <Text style={st.botTxt}>BOT +</Text>
            </TouchableOpacity>
            {busted ? (
              <TouchableOpacity style={st.startBtn} onPress={rebuy}>
                <Text style={st.startTxt}>РЕБАЙ $1000</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={st.startBtn} onPress={startGame}>
                <Text style={st.startTxt}>СТАРТ</Text>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={st.leaveFullBtn} onPress={confirmLeave}>
            <Text style={st.leaveFullTxt}>Покинуть стол</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── GAME ─────────────────────────────────────────────────────────────────
  return (
    <View style={[st.bg, { width: SW, height: SH }]}>

      {/* TOP BAR */}
      <View style={[st.topBar, { height: TOP_H, width: SW }]}>
        <TouchableOpacity onPress={confirmLeave} style={st.exitBtn}>
          <Text style={st.exitBtnTxt}>Выйти</Text>
        </TouchableOpacity>
        <Text style={st.phaseLbl}>{PHASE_LABELS[gameState?.phase ?? ''] ?? ''}</Text>
        <Text style={st.topUser}>{username}  <Text style={{ color: GOLD }}>${me?.chips ?? 0}</Text></Text>
      </View>

      {/* WIN BANNER */}
      <Animated.View style={[st.banner, { opacity: fadeAnim, left: clamp(CX - 140, 8, SW - 288) }]} pointerEvents="none">
        <Text style={st.bannerTxt}>{lastResult}</Text>
      </Animated.View>

      {/* PLAY AREA */}
      <View style={[st.playArea, { width: SW, height: PLAY_H, top: TOP_H }]}>

        {/* Table */}
        <View style={[st.tableRim, {
          left: TABLE_L, top: TABLE_T,
          width: TABLE_W, height: TABLE_H,
          borderRadius: TABLE_H / 2,
        }]}>
          <View style={[st.tableFelt, { borderRadius: (TABLE_H - 10) / 2 }]}>
            <Text style={st.potTxt}>Pot: ${pot}</Text>
            <View style={st.boardRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <PlayingCard key={i} card={gameState?.communityCards[i] ?? ''} size="sm" />
              ))}
            </View>
          </View>
        </View>

        {/* Opponents */}
        {opps.map((p, idx) => {
          const [sl, st_] = seats[idx] ?? seats[0];
          // Find this opponent's index in the full players array for badge
          const fullIdx = gameState?.players.findIndex(pl => pl.username === p.username) ?? -1;
          const badge = getBadge(fullIdx);
          return (
            <SeatBox key={p.username} p={p}
              active={gameState?.currentPlayer === p.username}
              badge={badge}
              style={{ position: 'absolute', left: sl, top: st_, width: PW }}
            />
          );
        })}

        {/* My hole cards */}
        <View style={[
          st.myCardsRow,
          { position: 'absolute', left: clamp(CX - 44, 8, SW - 112), top: myCardsTop },
          me?.folded && st.myCardsFolded,
        ]}>
          {(me?.holeCards?.length ? me.holeCards : ['', '']).map((c, i) => (
            <View key={i} style={me?.folded ? { transform: [{ rotate: i === 0 ? '-8deg' : '8deg' }] } : {}}>
              <PlayingCard card={c} size="md" />
            </View>
          ))}
          {me?.folded && (
            <View style={st.foldedOverlay}>
              <Text style={st.foldedOverlayTxt}>ФОЛД</Text>
            </View>
          )}
        </View>

        {/* My info */}
        {(() => {
          const myFullIdx = gameState?.players.findIndex(pl => pl.username === username) ?? -1;
          const myBadge = getBadge(myFullIdx);
          return (
            <View style={[st.myBox, isMyTurn && st.myBoxActive, {
              position: 'absolute',
              left: clamp(CX - 65, 8, SW - 132),
              top: myBoxTop,
            }]}>
              <View style={[st.av, st.avMe]}>
                <Text style={st.avTxt}>{username?.[0]?.toUpperCase()}</Text>
              </View>
              <Text style={st.myName}>{username}</Text>
              {myBadge && (
                <View style={[st.badge, { backgroundColor: BADGE_COLORS[myBadge].bg }]}>
                  <Text style={st.badgeTxt}>{myBadge}</Text>
                </View>
              )}
              {(me?.currentBet ?? 0) > 0 &&
                <View style={st.betChip}><Text style={st.betChipTxt}>${me?.currentBet}</Text></View>}
              {me?.lastAction ? <Text style={st.lastActTxt}>{me.lastAction}</Text> : null}
            </View>
          );
        })()}
      </View>

      {/* ACTION BAR */}
      <View style={[st.actBar, { width: SW, height: ACT_H, top: SH - ACT_H }]}>
        {isMyTurn && !me?.folded ? (
          <View style={st.actInner}>
            <View style={st.actBtns}>
              <TouchableOpacity style={st.btnFold} onPress={() => act('FOLD')}>
                <Text style={st.btnTxt}>Фолд</Text>
              </TouchableOpacity>
              <TouchableOpacity style={st.btnMain} onPress={() => act(callAmt === 0 ? 'CHECK' : 'CALL')}>
                <Text style={st.btnTxt}>{callAmt === 0 ? 'Чекк' : `Колл $${callAmt}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[st.btnMain, !canRaise && st.btnDisabled]} disabled={!canRaise} onPress={() => act('RAISE', raiseAmt)}>
                <Text style={st.btnTxt}>Рейз ${raiseAmt}</Text>
              </TouchableOpacity>
            </View>
            <View style={st.sliderSection}>
              <Text style={st.sliderLbl}>Мин</Text>
              <View style={st.sliderTrack}
                onLayout={e => { sliderW.current = e.nativeEvent.layout.width; }}
                {...panResponder.panHandlers}>
                <View style={[st.sliderFill, { width: `${fillPct}%` as any }]} />
                <View style={[st.sliderThumb, { left: `${fillPct}%` as any, marginLeft: -8 }]} />
              </View>
              <Text style={st.sliderLbl}>Макс</Text>
              <View style={st.raiseValBox}><Text style={st.raiseVal}>{raiseAmt}</Text></View>
              {[['МИН', minRaise], ['3ВВ', bd * 3], ['ПОТ', pot], ['ВСЁ', maxRaise]].map(([l, v]) => (
                <TouchableOpacity key={l} style={st.preset}
                  onPress={() => setRaiseAmt(Math.min(maxRaise, Math.max(minRaise, Number(v))))}>
                  <Text style={st.presetTxt}>{l}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : (
          <View style={st.waitAct}>
            {me?.folded ? (
              <Text style={st.waitActTxt}>— Вы сбросили карты —</Text>
            ) : (
              <Text style={st.waitActTxt}>Ход: {gameState?.currentPlayer ?? '...'}</Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function SeatBox({ p, active, badge, style }: { p: PlayerDto; active: boolean; badge: string | null; style?: any }) {
  const isBot = p.username.startsWith('BOT');
  return (
    <View style={[st.seatBox, active && st.seatActive, p.folded && st.seatFolded, style]}>
      {/* Avatar */}
      <View style={[st.av, isBot ? st.avBot : st.avOpp]}>
        <Text style={st.avTxt}>{isBot ? 'B' : p.username[0].toUpperCase()}</Text>
      </View>

      {/* Info column — fixed width to prevent overflow */}
      <View style={st.seatTexts}>
        <View style={st.seatNameRow}>
          <Text style={st.seatName} numberOfLines={1} ellipsizeMode="tail">{p.username}</Text>
          {badge && (
            <View style={[st.badge, { backgroundColor: BADGE_COLORS[badge].bg }]}>
              <Text style={st.badgeTxt} numberOfLines={1}>{badge}</Text>
            </View>
          )}
        </View>
        <Text style={st.seatChips} numberOfLines={1}>${p.chips}</Text>
        {p.lastAction ? (
          <Text style={st.lastActTxt} numberOfLines={1} ellipsizeMode="tail">{p.lastAction}</Text>
        ) : null}
      </View>

      {/* Bet + cards */}
      <View style={st.seatRight}>
        {p.currentBet > 0 &&
          <View style={st.betChip}><Text style={st.betChipTxt} numberOfLines={1}>${p.currentBet}</Text></View>}
        <View style={st.hiddenCards}>
          {p.folded
            ? <Text style={st.foldTag}>ПАС</Text>
            : <>
                <PlayingCard card="" size="xs" hidden />
                <PlayingCard card="" size="xs" hidden />
              </>
          }
        </View>
      </View>
    </View>
  );
}

const PHASE_LABELS: Record<string, string> = {
  PRE_FLOP: 'ПРЕФЛОП', FLOP: 'ФЛОП', TURN: 'ТЁРН', RIVER: 'РИВЕР', SHOWDOWN: 'ВСКРЫТИЕ',
};

const st = StyleSheet.create({
  waitBg:   { flex: 1, backgroundColor: BG, justifyContent: 'center', alignItems: 'center' },
  waitCard: { backgroundColor: '#111', borderRadius: 14, padding: 22, width: '86%', maxWidth: 360, borderWidth: 1, borderColor: '#222' },
  waitTitle:{ color: GOLD, fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  waitMsg:  { color: '#bbb', fontSize: 12, textAlign: 'center', lineHeight: 17, marginBottom: 10 },
  waitList: { gap: 8, marginBottom: 14 },
  waitEmpty:{ color: '#555', textAlign: 'center', fontSize: 13 },
  waitRow:  { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 8 },
  wName:    { flex: 1, color: '#fff', fontSize: 13, fontWeight: '600' },
  wChips:   { color: GOLD, fontSize: 12 },
  waitBtns: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  botBtn:   { flex: 1, backgroundColor: '#1a2a3a', borderRadius: 8, padding: 11, alignItems: 'center', borderWidth: 1, borderColor: '#2a4a6a' },
  botTxt:   { color: '#7fb3d3', fontWeight: '700', fontSize: 13 },
  startBtn: { flex: 1, backgroundColor: RED, borderRadius: 8, padding: 11, alignItems: 'center' },
  startTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
  leaveFullBtn: { backgroundColor: '#1a0a0a', borderRadius: 8, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#3a1010' },
  leaveFullTxt: { color: '#c0392b', fontWeight: '700', fontSize: 14 },

  bg:       { backgroundColor: BG, position: 'absolute' },
  topBar:    { position: 'absolute', top: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, backgroundColor: '#080505', borderBottomWidth: 1, borderBottomColor: '#1a0808' },
  exitBtn:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 5, borderWidth: 1, borderColor: '#5c1010' },
  exitBtnTxt:{ color: '#c0392b', fontSize: 11, fontWeight: '700' },
  phaseLbl:  { color: '#888', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  topUser:   { color: '#ccc', fontSize: 11, fontWeight: '600' },

  banner:    { position: 'absolute', top: 40, width: 280, zIndex: 99, backgroundColor: 'rgba(0,0,0,0.96)', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: GOLD },
  bannerTxt: { color: GOLD, fontSize: 13, fontWeight: 'bold', textAlign: 'center' },

  playArea:  { position: 'absolute', overflow: 'visible' },
  tableRim:  { position: 'absolute', backgroundColor: RIM, elevation: 16, shadowColor: '#000', shadowOpacity: 0.9, shadowRadius: 14 },
  tableFelt: { flex: 1, margin: 5, backgroundColor: FELT, borderWidth: 2, borderColor: FELT2, alignItems: 'center', justifyContent: 'center', gap: 5 },
  potTxt:    { color: '#fff', fontSize: 12, fontWeight: 'bold', textShadowColor: 'rgba(0,0,0,0.9)', textShadowRadius: 4 },
  boardRow:  { flexDirection: 'row', gap: 4 },

  seatBox:    { backgroundColor: PBOX, borderRadius: 7, paddingHorizontal: 5, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  seatActive: { borderColor: GOLD, shadowColor: GOLD, shadowOpacity: 0.7, shadowRadius: 6, elevation: 6 },
  seatFolded: { opacity: 0.45 },
  seatTexts:  { width: 52, flexShrink: 0 },
  seatNameRow:{ flexDirection: 'row', alignItems: 'center', gap: 2, overflow: 'hidden' },
  seatName:   { color: '#fff', fontSize: 9, fontWeight: '700', maxWidth: 36, flexShrink: 1 },
  seatChips:  { color: GOLD, fontSize: 8 },
  lastActTxt: { color: '#4fc3f7', fontSize: 8, fontWeight: '600', maxWidth: 52 },
  seatRight:  { flexDirection: 'column', alignItems: 'flex-end', gap: 3 },
  foldTag:    { color: '#888', fontSize: 8, fontStyle: 'italic' },
  hiddenCards:{ flexDirection: 'row', gap: 2, alignItems: 'center' },

  av:     { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  avMe:   { backgroundColor: '#7d3c98' },
  avOpp:  { backgroundColor: '#1a5c8a' },
  avBot:  { backgroundColor: '#1a3a1a' },
  avTxt:  { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  badge:         { borderRadius: 3, paddingHorizontal: 4, paddingVertical: 1 },
  badgeTxt:      { color: '#fff', fontSize: 7, fontWeight: '900' },
  badgeInline:   { borderRadius: 3, paddingHorizontal: 5, paddingVertical: 2 },
  badgeInlineTxt:{ color: '#fff', fontSize: 9, fontWeight: '900' },

  betChip:    { backgroundColor: '#0a1520', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 1, borderColor: '#4a90d9' },
  betChipTxt: { color: '#4a90d9', fontSize: 7, fontWeight: 'bold' },

  myCardsRow: { flexDirection: 'row', gap: 8 },
  myCardsFolded: { opacity: 0.35 },
  foldedOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 5 },
  foldedOverlayTxt: { color: '#fff', fontSize: 11, fontWeight: '900', letterSpacing: 1 },

  myBox:      { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: PBOX, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.1)' },
  myBoxActive:{ borderColor: GOLD },
  myName:     { color: '#fff', fontSize: 10, fontWeight: '700' },

  actBar:    { position: 'absolute', backgroundColor: '#080404', borderTopWidth: 1, borderTopColor: '#1a0808' },
  actInner:  { flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, gap: 6 },
  actBtns:   { flexDirection: 'row', gap: 6 },
  btnFold:   { backgroundColor: '#4a0808', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center', borderWidth: 1, borderColor: RED },
  btnMain:   { backgroundColor: RED, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, alignItems: 'center' },
  btnDisabled: { opacity: 0.45 },
  btnTxt:    { color: '#fff', fontWeight: '800', fontSize: 12 },
  leaveBtn:  { backgroundColor: '#1a0808', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#3a1010' },
  leaveBtnTxt:{ color: '#c0392b', fontSize: 12, fontWeight: '700' },

  sliderSection: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  sliderLbl:     { color: '#888', fontSize: 10 },
  sliderTrack:   { flex: 1, height: 20, justifyContent: 'center' },
  sliderFill:    { position: 'absolute', left: 0, height: 3, backgroundColor: RED2, borderRadius: 2 },
  sliderThumb:   { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', top: 2, elevation: 4 },
  raiseValBox:   { backgroundColor: '#1a0808', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, borderColor: '#3a1010', minWidth: 40, alignItems: 'center' },
  raiseVal:      { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  preset:        { backgroundColor: '#1a0808', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 4, borderWidth: 1, borderColor: '#3a1010' },
  presetTxt:     { color: '#aaa', fontSize: 9, fontWeight: '700' },

  waitAct:    { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20 },
  waitActTxt: { color: '#666', fontSize: 13 },
});
