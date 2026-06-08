import { View, Text, StyleSheet } from 'react-native';

const RANK_MAP: Record<string, string> = {
  ACE: 'A', KING: 'K', QUEEN: 'Q', JACK: 'J',
  TEN: '10', NINE: '9', EIGHT: '8', SEVEN: '7',
  SIX: '6', FIVE: '5', FOUR: '4', THREE: '3', TWO: '2',
};
const SUIT_SYMBOL: Record<string, string> = {
  SPADES: '♠', HEARTS: '♥', DIAMONDS: '♦', CLUBS: '♣',
};
const RED_SUITS = new Set(['HEARTS', 'DIAMONDS']);

interface Props {
  card: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  hidden?: boolean;
}

export default function PlayingCard({ card, size = 'md', hidden = false }: Props) {
  const s = SIZES[size];

  if (hidden) {
    return (
      <View style={[styles.card, s.card, styles.back]}>
        <View style={styles.backPattern} />
      </View>
    );
  }

  if (!card) return <View style={[styles.card, s.card, styles.empty]} />;

  const parts = card.split('_OF_');
  const rank = parts[0];
  const suit = parts[1];
  const rankDisplay = RANK_MAP[rank] ?? rank;
  const suitDisplay = SUIT_SYMBOL[suit] ?? '?';
  const isRed = RED_SUITS.has(suit);
  const color = isRed ? '#CC0000' : '#111';

  return (
    <View style={[styles.card, s.card]}>
      <View style={styles.corner}>
        <Text style={[s.rankText, { color }]}>{rankDisplay}</Text>
        <Text style={[s.suitSmall, { color }]}>{suitDisplay}</Text>
      </View>
      <Text style={[s.suitCenter, { color }]}>{suitDisplay}</Text>
    </View>
  );
}

const SIZES = {
  xs: {
    card: { width: 28, height: 40, borderRadius: 3 },
    rankText: { fontSize: 9, fontWeight: '800' as const, lineHeight: 11 },
    suitSmall: { fontSize: 7, lineHeight: 9 },
    suitCenter: { fontSize: 16 },
  },
  sm: {
    card: { width: 36, height: 52, borderRadius: 4 },
    rankText: { fontSize: 11, fontWeight: '800' as const, lineHeight: 13 },
    suitSmall: { fontSize: 9, lineHeight: 10 },
    suitCenter: { fontSize: 20 },
  },
  md: {
    card: { width: 52, height: 72, borderRadius: 5 },
    rankText: { fontSize: 15, fontWeight: '800' as const, lineHeight: 17 },
    suitSmall: { fontSize: 11, lineHeight: 12 },
    suitCenter: { fontSize: 28 },
  },
  lg: {
    card: { width: 68, height: 96, borderRadius: 7 },
    rankText: { fontSize: 20, fontWeight: '800' as const, lineHeight: 22 },
    suitSmall: { fontSize: 14, lineHeight: 15 },
    suitCenter: { fontSize: 36 },
  },
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  corner: { position: 'absolute', top: 3, left: 4, alignItems: 'center' },
  suitCenter: { fontWeight: '600' },
  back: { backgroundColor: '#1a3a6e', justifyContent: 'center', alignItems: 'center' },
  backPattern: {
    width: '75%', height: '75%',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 3,
    backgroundColor: '#0f2550',
  },
  empty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', borderStyle: 'dashed' },
});
