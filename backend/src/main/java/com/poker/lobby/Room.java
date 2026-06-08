package com.poker.lobby;

import jakarta.persistence.*;
import lombok.*;

import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "rooms")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Room {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String name;

    @Builder.Default
    private int maxPlayers = 6;

    @Builder.Default
    private int smallBlind = 10;

    @Builder.Default
    private int bigBlind = 20;

    @ElementCollection
    @Builder.Default
    private List<String> playerUsernames = new ArrayList<>();

    @Builder.Default
    private boolean gameStarted = false;
}
