package com.poker.game;

import lombok.Data;

import java.util.*;

@Data
public class GameState {

    public enum Phase { WAITING, PRE_FLOP, FLOP, TURN, RIVER, SHOWDOWN }

    private final Long roomId;
    private Phase phase = Phase.WAITING;
    private Deck deck;
    private List<Card> communityCards = new ArrayList<>();
    private List<PlayerState> players = new ArrayList<>();
    private int pot = 0;
    private int currentBet = 0;
    private int dealerIndex = 0;
    private int currentPlayerIndex = 0;
    private int smallBlind;
    private int bigBlind;
    private String message = "";

    @Data
    public static class PlayerState {
        private final String username;
        private int chips;
        private List<Card> holeCards = new ArrayList<>();
        private int currentBet = 0;
        private boolean folded = false;
        private boolean allIn = false;
        private boolean acted = false;
        private String lastAction = "";

        public PlayerState(String username, int chips) {
            this.username = username;
            this.chips = chips;
        }
    }

    public GameState(Long roomId, int smallBlind, int bigBlind) {
        this.roomId = roomId;
        this.smallBlind = smallBlind;
        this.bigBlind = bigBlind;
    }

    public PlayerState getActivePlayer() {
        return players.get(currentPlayerIndex);
    }

    public Optional<PlayerState> getCurrentPlayer() {
        if (players.isEmpty() || currentPlayerIndex < 0 || currentPlayerIndex >= players.size()) {
            return Optional.empty();
        }
        PlayerState player = players.get(currentPlayerIndex);
        if (player.isFolded() || player.isAllIn()) {
            return Optional.empty();
        }
        return Optional.of(player);
    }

    public boolean isEveryoneActed() {
        List<PlayerState> actionable = getActionablePlayers();
        return actionable.isEmpty() || actionable.stream()
                .filter(p -> !p.isFolded() && !p.isAllIn())
                .allMatch(p -> p.isActed() && p.getCurrentBet() == currentBet);
    }

    public List<PlayerState> getActivePlayers() {
        return players.stream().filter(p -> !p.isFolded()).toList();
    }

    public List<PlayerState> getActionablePlayers() {
        return players.stream()
                .filter(p -> !p.isFolded() && !p.isAllIn() && p.getChips() > 0)
                .toList();
    }

    public void nextPlayer() {
        if (getActionablePlayers().isEmpty()) {
            return;
        }
        do {
            currentPlayerIndex = (currentPlayerIndex + 1) % players.size();
        } while (players.get(currentPlayerIndex).isFolded() || players.get(currentPlayerIndex).isAllIn());
    }
}
