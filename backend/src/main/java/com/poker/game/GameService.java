package com.poker.game;

import com.poker.auth.UserRepository;
import com.poker.lobby.Room;
import com.poker.lobby.RoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

@Service
@RequiredArgsConstructor
public class GameService {

    private static final int REBUY_CHIPS = 1000;

    private final RoomRepository roomRepository;
    private final UserRepository userRepository;
    private final SimpMessagingTemplate messaging;
    private final HandEvaluator handEvaluator = new HandEvaluator();
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();

    private final Map<Long, GameState> games = new ConcurrentHashMap<>();

    public GameState startGame(Long roomId) {
        Room room = roomRepository.findById(roomId).orElseThrow();
        GameState state = new GameState(roomId, room.getSmallBlind(), room.getBigBlind());

        for (String username : room.getPlayerUsernames()) {
            int chips = userRepository.findByUsername(username)
                    .map(u -> u.getChips()).orElse(REBUY_CHIPS);
            if (chips > 0) {
                state.getPlayers().add(new GameState.PlayerState(username, chips));
            }
        }

        if (state.getPlayers().size() < 2) {
            throw new IllegalStateException("Need at least 2 players with chips");
        }

        room.setGameStarted(true);
        roomRepository.save(room);
        games.put(roomId, state);

        dealNewHand(state);
        return state;
    }

    private void dealNewHand(GameState state) {
        synchronized (state) {
            state.setDeck(new Deck());
            state.getCommunityCards().clear();
            state.setPot(0);
            state.setCurrentBet(state.getBigBlind());
            state.setPhase(GameState.Phase.PRE_FLOP);
            state.setMessage("");

            for (GameState.PlayerState p : state.getPlayers()) {
                p.setFolded(false);
                p.setAllIn(false);
                p.setActed(false);
                p.setCurrentBet(0);
                p.setLastAction("");
                p.getHoleCards().clear();
                p.getHoleCards().add(state.getDeck().deal());
                p.getHoleCards().add(state.getDeck().deal());
            }

            int players = state.getPlayers().size();
            state.setDealerIndex(Math.floorMod(state.getDealerIndex(), players));
            int sbIdx = players == 2 ? state.getDealerIndex() : (state.getDealerIndex() + 1) % players;
            int bbIdx = players == 2 ? (state.getDealerIndex() + 1) % players : (state.getDealerIndex() + 2) % players;

            postBlind(state, sbIdx, state.getSmallBlind());
            postBlind(state, bbIdx, state.getBigBlind());

            state.setCurrentPlayerIndex(players == 2 ? sbIdx : (bbIdx + 1) % players);
        }

        broadcastState(state);
    }

    private void postBlind(GameState state, int idx, int amount) {
        GameState.PlayerState p = state.getPlayers().get(idx);
        int bet = Math.min(amount, p.getChips());
        p.setChips(p.getChips() - bet);
        p.setCurrentBet(bet);
        state.setPot(state.getPot() + bet);
        if (p.getChips() == 0) p.setAllIn(true);
    }

    public GameState processAction(Long roomId, String username, PlayerAction action) {
        GameState state = games.get(roomId);
        if (state == null) throw new IllegalStateException("Game not started");

        synchronized (state) {
            GameState.PlayerState player = state.getCurrentPlayer()
                    .orElseThrow(() -> new IllegalStateException("No player can act"));
            if (!player.getUsername().equals(username)) {
                throw new IllegalStateException("Not your turn");
            }

            switch (action.type()) {
                case FOLD -> {
                    player.setFolded(true);
                    player.setLastAction("Фолд");
                }
                case CHECK -> {
                    if (state.getCurrentBet() > player.getCurrentBet()) {
                        throw new IllegalStateException("Cannot check, must call or raise");
                    }
                    player.setLastAction("Чек");
                }
                case CALL -> {
                    int toCall = state.getCurrentBet() - player.getCurrentBet();
                    int actual = Math.min(toCall, player.getChips());
                    player.setChips(player.getChips() - actual);
                    player.setCurrentBet(player.getCurrentBet() + actual);
                    state.setPot(state.getPot() + actual);
                    if (player.getChips() == 0) player.setAllIn(true);
                    player.setLastAction("Колл $" + actual);
                }
                case RAISE -> {
                    int toCall = state.getCurrentBet() - player.getCurrentBet();
                    int total = toCall + Math.max(0, action.amount());
                    int actual = Math.min(total, player.getChips());
                    player.setChips(player.getChips() - actual);
                    player.setCurrentBet(player.getCurrentBet() + actual);
                    state.setPot(state.getPot() + actual);
                    state.setCurrentBet(player.getCurrentBet());
                    if (player.getChips() == 0) player.setAllIn(true);
                    player.setLastAction("Рейз $" + player.getCurrentBet());
                    state.getPlayers().forEach(p -> {
                        if (!p.getUsername().equals(username) && !p.isFolded() && !p.isAllIn()) {
                            p.setActed(false);
                        }
                    });
                }
            }

            player.setActed(true);

            if (state.getActivePlayers().size() == 1) {
                endRound(state);
            } else if (state.getActionablePlayers().isEmpty()) {
                runBoardToShowdown(state);
                endRound(state);
            } else if (state.isEveryoneActed()) {
                advancePhase(state);
            } else {
                state.nextPlayer();
            }
        }

        broadcastState(state);
        return state;
    }

    private void advancePhase(GameState state) {
        state.getPlayers().forEach(p -> {
            p.setCurrentBet(0);
            p.setActed(false);
        });
        state.setCurrentBet(0);

        switch (state.getPhase()) {
            case PRE_FLOP -> {
                state.getCommunityCards().add(state.getDeck().deal());
                state.getCommunityCards().add(state.getDeck().deal());
                state.getCommunityCards().add(state.getDeck().deal());
                state.setPhase(GameState.Phase.FLOP);
            }
            case FLOP -> {
                state.getCommunityCards().add(state.getDeck().deal());
                state.setPhase(GameState.Phase.TURN);
            }
            case TURN -> {
                state.getCommunityCards().add(state.getDeck().deal());
                state.setPhase(GameState.Phase.RIVER);
            }
            case RIVER -> endRound(state);
            default -> {}
        }

        if (state.getPhase() == GameState.Phase.SHOWDOWN || state.getActionablePlayers().isEmpty()) {
            return;
        }

        int players = state.getPlayers().size();
        int start = (state.getDealerIndex() + 1) % players;
        for (int i = 0; i < players; i++) {
            int idx = (start + i) % players;
            GameState.PlayerState player = state.getPlayers().get(idx);
            if (!player.isFolded() && !player.isAllIn() && player.getChips() > 0) {
                state.setCurrentPlayerIndex(idx);
                break;
            }
        }
    }

    private void runBoardToShowdown(GameState state) {
        while (state.getCommunityCards().size() < 5) {
            state.getCommunityCards().add(state.getDeck().deal());
        }
    }

    private void endRound(GameState state) {
        state.setPhase(GameState.Phase.SHOWDOWN);
        List<GameState.PlayerState> active = state.getActivePlayers();
        String message;

        if (active.size() == 1) {
            GameState.PlayerState winner = active.get(0);
            winner.setChips(winner.getChips() + state.getPot());
            message = winner.getUsername() + " wins " + state.getPot() + " chips!";
        } else {
            GameState.PlayerState winner = active.stream()
                    .max(Comparator.comparing(p -> handEvaluator.evaluate(p.getHoleCards(), state.getCommunityCards())))
                    .orElseThrow();
            winner.setChips(winner.getChips() + state.getPot());
            HandEvaluator.HandResult result = handEvaluator.evaluate(winner.getHoleCards(), state.getCommunityCards());
            message = winner.getUsername() + " wins " + state.getPot() + " chips with "
                    + result.rank().name().replace("_", " ") + "!";
        }

        state.setMessage(message);
        broadcastResult(state, message);

        state.getPlayers().forEach(p -> userRepository.findByUsername(p.getUsername()).ifPresent(u -> {
            u.setChips(p.getChips());
            userRepository.save(u);
        }));

        List<String> bustedBots = state.getPlayers().stream()
                .filter(p -> p.getChips() == 0 && p.getUsername().startsWith("BOT_"))
                .map(GameState.PlayerState::getUsername)
                .toList();
        state.getPlayers().removeIf(p -> p.getChips() == 0);
        syncRoomAfterRound(state, bustedBots);

        if (state.getPlayers().size() >= 2) {
            state.setDealerIndex((state.getDealerIndex() + 1) % state.getPlayers().size());
            scheduler.schedule(() -> {
                synchronized (state) {
                    if (games.get(state.getRoomId()) == state && state.getPlayers().size() >= 2) {
                        dealNewHand(state);
                    }
                }
            }, 3, TimeUnit.SECONDS);
        } else {
            state.setPhase(GameState.Phase.WAITING);
            state.setPot(0);
            state.setCurrentBet(0);
            state.setCurrentPlayerIndex(0);
            state.setDealerIndex(0);
            roomRepository.findById(state.getRoomId()).ifPresent(r -> {
                r.setGameStarted(false);
                roomRepository.save(r);
            });
        }
    }

    private void syncRoomAfterRound(GameState state, List<String> bustedBots) {
        roomRepository.findById(state.getRoomId()).ifPresent(room -> {
            if (!bustedBots.isEmpty()) {
                room.getPlayerUsernames().removeAll(bustedBots);
            }
            roomRepository.save(room);
        });
    }

    public GameStateDto rebuy(Long roomId, String username) {
        userRepository.findByUsername(username).ifPresent(u -> {
            if (u.getChips() <= 0) {
                u.setChips(REBUY_CHIPS);
                userRepository.save(u);
            }
        });

        Room room = roomRepository.findById(roomId).orElseThrow();
        if (!room.getPlayerUsernames().contains(username)) {
            if (room.getPlayerUsernames().size() >= room.getMaxPlayers()) {
                throw new IllegalStateException("Room is full");
            }
            room.getPlayerUsernames().add(username);
            roomRepository.save(room);
        }

        GameState state = games.computeIfAbsent(roomId,
                id -> new GameState(roomId, room.getSmallBlind(), room.getBigBlind()));

        synchronized (state) {
            Optional<GameState.PlayerState> existing = state.getPlayers().stream()
                    .filter(p -> p.getUsername().equals(username))
                    .findFirst();

            if (existing.isPresent()) {
                GameState.PlayerState player = existing.get();
                if (player.getChips() <= 0) {
                    player.setChips(REBUY_CHIPS);
                }
                player.setAllIn(false);
                player.setLastAction("Ребай");
            } else {
                GameState.PlayerState player = new GameState.PlayerState(username, REBUY_CHIPS);
                player.setFolded(state.getPhase() != GameState.Phase.WAITING);
                player.setActed(true);
                player.setLastAction("Ребай");
                state.getPlayers().add(player);
            }
            state.setMessage("Ребай: " + username + " получил " + REBUY_CHIPS + " фишек");
        }

        broadcastState(state);
        return toDtoForPlayer(state, username);
    }

    private void broadcastState(GameState state) {
        state.getPlayers().forEach(p ->
            messaging.convertAndSendToUser(
                p.getUsername(),
                "/queue/game/" + state.getRoomId(),
                toDtoForPlayer(state, p.getUsername())
            )
        );
        messaging.convertAndSend("/topic/game/" + state.getRoomId(), toDto(state));
    }

    private void broadcastResult(GameState state, String message) {
        messaging.convertAndSend("/topic/game/" + state.getRoomId() + "/result", message);
    }

    public GameStateDto toDto(GameState state) {
        boolean showdown = state.getPhase() == GameState.Phase.SHOWDOWN;
        return new GameStateDto(
                state.getRoomId(),
                state.getPhase().name(),
                state.getCommunityCards().stream().map(Card::toString).toList(),
                state.getPot(),
                state.getCurrentBet(),
                state.getPlayers().stream().map(p -> new PlayerDto(
                        p.getUsername(), p.getChips(), p.getCurrentBet(),
                        p.isFolded(), p.isAllIn(),
                        showdown ? p.getHoleCards().stream().map(Card::toString).toList() : List.of(),
                        p.getLastAction()
                )).toList(),
                currentPlayerName(state),
                state.getBigBlind(),
                state.getDealerIndex(),
                state.getMessage()
        );
    }

    public GameStateDto toDtoForPlayer(GameState state, String playerUsername) {
        boolean showdown = state.getPhase() == GameState.Phase.SHOWDOWN;
        return new GameStateDto(
                state.getRoomId(),
                state.getPhase().name(),
                state.getCommunityCards().stream().map(Card::toString).toList(),
                state.getPot(),
                state.getCurrentBet(),
                state.getPlayers().stream().map(p -> new PlayerDto(
                        p.getUsername(), p.getChips(), p.getCurrentBet(),
                        p.isFolded(), p.isAllIn(),
                        (p.getUsername().equals(playerUsername) || showdown)
                            ? p.getHoleCards().stream().map(Card::toString).toList()
                            : List.of(),
                        p.getLastAction()
                )).toList(),
                currentPlayerName(state),
                state.getBigBlind(),
                state.getDealerIndex(),
                state.getMessage()
        );
    }

    private String currentPlayerName(GameState state) {
        if (state.getPhase() == GameState.Phase.WAITING || state.getPhase() == GameState.Phase.SHOWDOWN) {
            return null;
        }
        return state.getCurrentPlayer().map(GameState.PlayerState::getUsername).orElse(null);
    }

    public GameState getGame(Long roomId) {
        return games.get(roomId);
    }

    public Map<Long, GameState> getActiveGames() {
        return Map.copyOf(games);
    }

    public record PlayerAction(ActionType type, int amount) {
        public enum ActionType { FOLD, CHECK, CALL, RAISE }
    }

    public record PlayerDto(String username, int chips, int currentBet, boolean folded,
                            boolean allIn, List<String> holeCards, String lastAction) {}

    public record GameStateDto(Long roomId, String phase, List<String> communityCards,
                               int pot, int currentBet, List<PlayerDto> players,
                               String currentPlayer, int bigBlind, int dealerIndex,
                               String message) {}
}
