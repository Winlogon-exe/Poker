package com.poker.game;

import lombok.RequiredArgsConstructor;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.util.Random;

@Service
@RequiredArgsConstructor
public class BotService {

    private final GameService gameService;
    private final Random random = new Random();

    @Scheduled(fixedDelay = 1200)
    public void processBotTurns() {
        gameService.getActiveGames().forEach((roomId, state) -> {
            if (state.getPhase() == GameState.Phase.WAITING ||
                state.getPhase() == GameState.Phase.SHOWDOWN) return;

            GameState.PlayerState current;
            try { current = state.getActivePlayer(); } catch (Exception e) { return; }

            if (!current.getUsername().startsWith("BOT_")) return;

            try { Thread.sleep(900); } catch (InterruptedException ignored) {}

            int callAmt = state.getCurrentBet() - current.getCurrentBet();
            GameService.PlayerAction action;

            double roll = random.nextDouble();
            if (callAmt == 0) {
                action = roll < 0.75
                    ? new GameService.PlayerAction(GameService.PlayerAction.ActionType.CHECK, 0)
                    : new GameService.PlayerAction(GameService.PlayerAction.ActionType.RAISE, state.getBigBlind());
            } else {
                if (roll < 0.15) {
                    action = new GameService.PlayerAction(GameService.PlayerAction.ActionType.FOLD, 0);
                } else if (roll < 0.82) {
                    action = new GameService.PlayerAction(GameService.PlayerAction.ActionType.CALL, 0);
                } else {
                    action = new GameService.PlayerAction(GameService.PlayerAction.ActionType.RAISE, state.getBigBlind());
                }
            }

            try {
                gameService.processAction(roomId, current.getUsername(), action);
            } catch (Exception ignored) {}
        });
    }
}
