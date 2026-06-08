package com.poker.game;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.*;

@Controller
@RequiredArgsConstructor
public class GameController {

    private final GameService gameService;

    @RestController
    @RequestMapping("/api/game")
    @RequiredArgsConstructor
    static class HttpGameController {
        private final GameService gameService;

        @PostMapping("/{roomId}/start")
        public ResponseEntity<GameService.GameStateDto> start(@PathVariable Long roomId,
                                                               @AuthenticationPrincipal UserDetails user) {
            GameState state = gameService.startGame(roomId);
            return ResponseEntity.ok(gameService.toDto(state));
        }

        @GetMapping("/{roomId}/state")
        public ResponseEntity<GameService.GameStateDto> getState(@PathVariable Long roomId,
                                                                  @AuthenticationPrincipal UserDetails user) {
            GameState state = gameService.getGame(roomId);
            if (state == null) return ResponseEntity.notFound().build();
            return ResponseEntity.ok(gameService.toDtoForPlayer(state, user.getUsername()));
        }

        @PostMapping("/{roomId}/rebuy")
        public ResponseEntity<GameService.GameStateDto> rebuy(@PathVariable Long roomId,
                                                               @AuthenticationPrincipal UserDetails user) {
            return ResponseEntity.ok(gameService.rebuy(roomId, user.getUsername()));
        }
    }

    @MessageMapping("/game/{roomId}/action")
    public void handleAction(@DestinationVariable Long roomId, @Payload ActionMessage msg) {
        if (msg.username() == null || msg.username().isBlank()) return;
        gameService.processAction(roomId, msg.username(),
                new GameService.PlayerAction(
                        GameService.PlayerAction.ActionType.valueOf(msg.type()),
                        msg.amount()
                ));
    }

    public record ActionMessage(String type, int amount, String username) {}
}
