package com.poker.lobby;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/lobby")
@RequiredArgsConstructor
public class LobbyController {

    private final RoomRepository roomRepository;
    private final SimpMessagingTemplate messaging;

    @GetMapping("/rooms")
    public List<RoomDto> getRooms() {
        return roomRepository.findByGameStartedFalse().stream()
                .map(RoomDto::from)
                .toList();
    }

    @PostMapping("/rooms")
    public ResponseEntity<RoomDto> createRoom(@RequestBody CreateRoomRequest req,
                                              @AuthenticationPrincipal UserDetails user) {
        Room room = Room.builder()
                .name(req.name())
                .maxPlayers(req.maxPlayers() > 0 ? req.maxPlayers() : 6)
                .smallBlind(req.smallBlind() > 0 ? req.smallBlind() : 10)
                .bigBlind(req.bigBlind() > 0 ? req.bigBlind() : 20)
                .build();
        room.getPlayerUsernames().add(user.getUsername());
        room = roomRepository.save(room);
        broadcastLobby();
        return ResponseEntity.ok(RoomDto.from(room));
    }

    @PostMapping("/rooms/{id}/join")
    public ResponseEntity<RoomDto> joinRoom(@PathVariable Long id,
                                            @AuthenticationPrincipal UserDetails user) {
        Room room = roomRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Room not found"));
        if (room.isGameStarted()) {
            return ResponseEntity.badRequest().build();
        }
        if (room.getPlayerUsernames().size() >= room.getMaxPlayers()) {
            return ResponseEntity.badRequest().build();
        }
        if (!room.getPlayerUsernames().contains(user.getUsername())) {
            room.getPlayerUsernames().add(user.getUsername());
            roomRepository.save(room);
            broadcastLobby();
            messaging.convertAndSend("/topic/room/" + id, RoomDto.from(room));
        }
        return ResponseEntity.ok(RoomDto.from(room));
    }

    @PostMapping("/rooms/{id}/add-bot")
    public ResponseEntity<RoomDto> addBot(@PathVariable Long id) {
        Room room = roomRepository.findById(id).orElseThrow();
        if (room.getPlayerUsernames().size() >= room.getMaxPlayers()) {
            return ResponseEntity.badRequest().build();
        }
        long botNum = room.getPlayerUsernames().stream().filter(n -> n.startsWith("BOT_")).count() + 1;
        room.getPlayerUsernames().add("BOT_" + botNum);
        roomRepository.save(room);
        broadcastLobby();
        messaging.convertAndSend("/topic/room/" + id, RoomDto.from(room));
        return ResponseEntity.ok(RoomDto.from(room));
    }

    @PostMapping("/rooms/{id}/leave")
    public ResponseEntity<Void> leaveRoom(@PathVariable Long id,
                                          @AuthenticationPrincipal UserDetails user) {
        Room room = roomRepository.findById(id).orElseThrow();
        room.getPlayerUsernames().remove(user.getUsername());
        if (room.getPlayerUsernames().isEmpty()) {
            roomRepository.delete(room);
        } else {
            roomRepository.save(room);
            messaging.convertAndSend("/topic/room/" + id, RoomDto.from(room));
        }
        broadcastLobby();
        return ResponseEntity.ok().build();
    }

    private void broadcastLobby() {
        List<RoomDto> rooms = roomRepository.findByGameStartedFalse().stream()
                .map(RoomDto::from).toList();
        messaging.convertAndSend("/topic/lobby", rooms);
    }

    public record CreateRoomRequest(String name, int maxPlayers, int smallBlind, int bigBlind) {}

    public record RoomDto(Long id, String name, int maxPlayers, int smallBlind, int bigBlind,
                          List<String> players, boolean gameStarted) {
        static RoomDto from(Room r) {
            return new RoomDto(r.getId(), r.getName(), r.getMaxPlayers(),
                    r.getSmallBlind(), r.getBigBlind(),
                    r.getPlayerUsernames(), r.isGameStarted());
        }
    }
}
