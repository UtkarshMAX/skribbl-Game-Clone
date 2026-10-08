import { handlePlayerMessage } from "./messageFlow.js";

// Game events: start, word choice, guesses. Permission checks are declared per route
// and enforced by the MessageHandler before these handlers run.

export default function registerGameEvents(handler) {

    // ----------Start Game--------------

    handler.on("start_game", {
        schema: { roomCode: "string?" },
        requires: ["room", "host", "lobby"],
        messages: { host: "Only the host can start the game" },
        handler: ({ room, error }) => {
            // Same rule as the lobby's Start button: ≥ 2 players and every non-host player ready.
            const blocker = room.startBlocker();
            if (blocker) return error(blocker);

            room.game.startGame();
            room.game.emitGameState();
            room.broadcast("game_started");
        },
    });

    // ----------------Word-------------------------

    handler.on("word_chosen", {
        schema: { roomCode: "string", word: "string" },
        requires: ["room", "drawer"],
        silent: true,
        // Ignored if a word is already chosen (double click / auto-pick race) or wasn't offered.
        handler: ({ room, payload }) => room.game.selectWord(payload.word),
    });

    // --------------- Guess ---------------------
    // Matching, scoring and who-sees-what live in messageFlow.js (shared with chat).

    // Players only: a spectator's guess is rejected by the server (never scored, never shown).
    handler.on("guess", {
        schema: { roomCode: "string", guess: "string" },
        requires: ["room", "member", "player"],
        messages: { player: "Spectators can't guess" },
        handler: (ctx) => handlePlayerMessage({ ...ctx, text: ctx.payload.guess, isGuess: true }),
    });
}
