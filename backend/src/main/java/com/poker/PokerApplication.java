package com.poker;

import com.poker.lobby.Room;
import com.poker.lobby.RoomRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class PokerApplication {
    public static void main(String[] args) {
        SpringApplication.run(PokerApplication.class, args);
    }

    @Bean
    CommandLineRunner createDefaultRooms(RoomRepository repo) {
        return args -> {
            if (repo.count() == 0) {
                repo.save(Room.builder().name("Техасский стол #1").maxPlayers(6).smallBlind(10).bigBlind(20).build());
                repo.save(Room.builder().name("Хайроллер VIP").maxPlayers(4).smallBlind(50).bigBlind(100).build());
                repo.save(Room.builder().name("Новички $1/$2").maxPlayers(6).smallBlind(1).bigBlind(2).build());
            }
        };
    }
}
