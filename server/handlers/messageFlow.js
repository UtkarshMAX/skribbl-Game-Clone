import { isCorrect, isClose, containsWord } from "../utils/wordMatch.js";
import { cleanText } from "../utils/text.js";
import RateLimiter from "../utils/RateLimiter.js";

// Max 5 chat/guess messages per 3 seconds per player (shared by both events).
export const messageLimiter = new RateLimiter(5, 3000);

/**
 * Single path for every chat message and guess. Decides who may see it:
 *
 * While a word is being drawn:
 *  - drawer / players who already guessed -> only the drawer + other correct guessers ("guessed" style)
 *  - correct guess  -> scored; everyone gets guess_result + "X guessed the word!" (never the text)
 *  - close guess    -> close_guess to the sender only
 *  - text that contains the word but isn't a correct/close guess -> echoed to the sender only
 *  - anything else (a wrong guess) -> normal chat for everyone
 *  - spectators: never score; correct/close/word-containing text is echoed to them only
 * Outside a drawing turn (lobby, choosing, round end) -> normal chat for everyone.
 *
 * `room` and `member` (a player or a spectator) come from the MessageHandler, which already
 * checked the sender is in the room. Guesses (`isGuess`) only ever arrive from players.
 */
export function handlePlayerMessage({ socket, room, member, text, isGuess }) {
    if (!messageLimiter.allow(socket.id)) {
        return socket.emit("error", { message: "You're sending messages too fast — slow down!" });
    }

    const message = cleanText(text);
    if (!message) return;

    const game = room.game;
    const isSpectator = !!room.getSpectator(member.id);
    const chat = { id: crypto.randomUUID(), playerId: member.id, playerName: member.name, text: message };
    if (isSpectator) chat.spectator = true; // shown with 👁 next to the name
    const broadcast = () => {
        room.chatManager.addMessage(chat);
        room.broadcast("chat_message", chat);
    };

    if (game.phase !== "drawing" || !game.currentWord) {
        return broadcast();
    }

    // Word-leak protection: people who know the word only talk among themselves.
    if (game.isDrawer(member.id) || game.hasGuessed(member.id)) {
        const privateChat = { ...chat, type: "guessed" };
        for (const id of game.playersWhoKnowWord()) room.sendTo(id, "chat_message", privateChat);
        return;
    }

    // Spectators can chat but never guess or score. Anything that is (or is close to / contains)
    // the word is echoed back to them only, so it can't help the players.
    if (isSpectator) {
        if (isCorrect(message, game.currentWord) || isClose(message, game.currentWord) || containsWord(message, game.currentWord)) {
            return room.sendTo(member.id, "chat_message", { ...chat, private: true });
        }
        return broadcast();
    }

    const player = member; // from here on the sender is a player

    if (isCorrect(message, game.currentWord)) {
        return game.handleCorrectGuess(player);
    }

    const wrongResult = { correct: false, playerId: player.id, playerName: player.name, points: 0, guess: message };

    if (isClose(message, game.currentWord)) {
        return room.sendTo(player.id, "close_guess", { guess: message });
    }

    if (containsWord(message, game.currentWord)) {
        // e.g. "is it a cat?" for "Cat" would reveal the word — only the sender sees it.
        room.sendTo(player.id, "chat_message", { ...chat, private: true });
        if (isGuess) room.sendTo(player.id, "guess_result", wrongResult);
        return;
    }

    // A wrong guess is just a normal chat message (like skribbl.io).
    if (isGuess) room.sendTo(player.id, "guess_result", wrongResult);
    broadcast();
}
