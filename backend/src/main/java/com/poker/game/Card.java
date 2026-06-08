package com.poker.game;

public record Card(Suit suit, Rank rank) {

    public enum Suit { SPADES, HEARTS, DIAMONDS, CLUBS }

    public enum Rank {
        TWO(2), THREE(3), FOUR(4), FIVE(5), SIX(6), SEVEN(7), EIGHT(8),
        NINE(9), TEN(10), JACK(11), QUEEN(12), KING(13), ACE(14);

        public final int value;
        Rank(int value) { this.value = value; }
    }

    @Override
    public String toString() {
        return rank.name() + "_OF_" + suit.name();
    }
}
