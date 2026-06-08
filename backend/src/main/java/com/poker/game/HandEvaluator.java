package com.poker.game;

import java.util.*;
import java.util.stream.Collectors;

public class HandEvaluator {

    public enum HandRank {
        HIGH_CARD, ONE_PAIR, TWO_PAIR, THREE_OF_A_KIND,
        STRAIGHT, FLUSH, FULL_HOUSE, FOUR_OF_A_KIND,
        STRAIGHT_FLUSH, ROYAL_FLUSH
    }

    public record HandResult(HandRank rank, List<Integer> tiebreakers) implements Comparable<HandResult> {
        @Override
        public int compareTo(HandResult other) {
            int cmp = this.rank.compareTo(other.rank);
            if (cmp != 0) return cmp;
            for (int i = 0; i < Math.min(this.tiebreakers.size(), other.tiebreakers.size()); i++) {
                cmp = Integer.compare(this.tiebreakers.get(i), other.tiebreakers.get(i));
                if (cmp != 0) return cmp;
            }
            return 0;
        }
    }

    public HandResult evaluate(List<Card> holeCards, List<Card> communityCards) {
        List<Card> all = new ArrayList<>(holeCards);
        all.addAll(communityCards);
        return bestFiveCardHand(all);
    }

    private HandResult bestFiveCardHand(List<Card> cards) {
        HandResult best = null;
        List<List<Card>> combos = combinations(cards, 5);
        for (List<Card> combo : combos) {
            HandResult result = evaluateFive(combo);
            if (best == null || result.compareTo(best) > 0) {
                best = result;
            }
        }
        return best;
    }

    private HandResult evaluateFive(List<Card> cards) {
        List<Integer> values = cards.stream()
                .map(c -> c.rank().value)
                .sorted(Comparator.reverseOrder())
                .collect(Collectors.toList());

        Map<Integer, Long> freq = cards.stream()
                .collect(Collectors.groupingBy(c -> c.rank().value, Collectors.counting()));

        boolean flush = cards.stream().map(Card::suit).distinct().count() == 1;
        boolean straight = isStraight(values);

        List<Integer> sorted = freq.entrySet().stream()
                .sorted(Map.Entry.<Integer, Long>comparingByValue().reversed()
                        .thenComparing(Map.Entry.<Integer, Long>comparingByKey().reversed()))
                .map(Map.Entry::getKey)
                .collect(Collectors.toList());

        if (flush && straight) {
            boolean royal = values.contains(14) && values.contains(13);
            return new HandResult(royal ? HandRank.ROYAL_FLUSH : HandRank.STRAIGHT_FLUSH, values);
        }
        if (freq.containsValue(4L)) {
            return new HandResult(HandRank.FOUR_OF_A_KIND, sorted);
        }
        if (freq.containsValue(3L) && freq.containsValue(2L)) {
            return new HandResult(HandRank.FULL_HOUSE, sorted);
        }
        if (flush) {
            return new HandResult(HandRank.FLUSH, values);
        }
        if (straight) {
            return new HandResult(HandRank.STRAIGHT, values);
        }
        if (freq.containsValue(3L)) {
            return new HandResult(HandRank.THREE_OF_A_KIND, sorted);
        }
        long pairs = freq.values().stream().filter(v -> v == 2L).count();
        if (pairs == 2) {
            return new HandResult(HandRank.TWO_PAIR, sorted);
        }
        if (pairs == 1) {
            return new HandResult(HandRank.ONE_PAIR, sorted);
        }
        return new HandResult(HandRank.HIGH_CARD, values);
    }

    private boolean isStraight(List<Integer> values) {
        List<Integer> unique = values.stream().distinct().sorted(Comparator.reverseOrder()).toList();
        if (unique.size() < 5) return false;
        // check A-2-3-4-5
        if (unique.containsAll(List.of(14, 2, 3, 4, 5))) return true;
        for (int i = 0; i < unique.size() - 4; i++) {
            boolean seq = true;
            for (int j = 0; j < 4; j++) {
                if (unique.get(i + j) - unique.get(i + j + 1) != 1) { seq = false; break; }
            }
            if (seq) return true;
        }
        return false;
    }

    private <T> List<List<T>> combinations(List<T> list, int k) {
        List<List<T>> result = new ArrayList<>();
        combine(list, k, 0, new ArrayList<>(), result);
        return result;
    }

    private <T> void combine(List<T> list, int k, int start, List<T> current, List<List<T>> result) {
        if (current.size() == k) { result.add(new ArrayList<>(current)); return; }
        for (int i = start; i < list.size(); i++) {
            current.add(list.get(i));
            combine(list, k, i + 1, current, result);
            current.remove(current.size() - 1);
        }
    }
}
