import WordManager from "../utils/WordManager.js";
import HintManager from "../utils/HintManager.js";

const WORD_SELECTION_TIME = 20; // seconds the drawer has to pick a word
const WORD_DIALOG_DELAY = 1000; // ms before the word choices are sent
const ROUND_END_DELAY = 5000;   // ms the "the word was…" screen stays up

/**
 * One game inside a Room. Owns the phase, rounds, turn order, timers, hints and scoring.
 *
 * Phases: 'lobby' → 'choosing' → 'drawing' → 'round_end' → ('choosing' … ) → 'game_over'
 * Guesses only count while 'drawing', and a turn can only end once.
 *
 * All client messages go through this.room.broadcast() / this.room.sendTo().
 * (Methods still accept a legacy `io` argument and ignore it.)
 */
export default class Game {
    constructor(room) {
        this.room = room;
        this.currentRound = 1;
        this.currentDrawerIndex = 0;

        this.currentDrawerId = null;
        this.timeLeft = room.settings.drawTime;

        this.timer = null
        this.currentWord = null;
        this.guessedPlayers = [];

        this.status = "waiting";
        this.displayWord = "";

        this.revealedIndexes = [];
        this.hintTimers = [];
        this.wordSelectionTimer = null;

        this.endRoundTimer = null;
        this.wordSelectionDelayTimer = null;

        this.wordOptions = [];
        this.wordSelectionTimeLeft = 0;

        this.phase = "lobby";
        this.turnPoints = {}; // playerId -> points earned in the current turn
        this.turnStartedAt = null;
    }

    clearWordSelectionTimers() {
        clearTimeout(this.wordSelectionDelayTimer);
        clearInterval(this.wordSelectionTimer);
        this.wordSelectionDelayTimer = null;
        this.wordSelectionTimer = null;
    }

    clearHintTimers() {
        this.hintTimers.forEach(timer => clearTimeout(timer));
        this.hintTimers = [];
    }

    // Per-turn guess state: both the list (sent in game_state) and each Player's flag.
    resetGuesses() {
        this.guessedPlayers = [];
        this.room.players.forEach((p) => { p.hasGuessedThisRound = false; });
    }

    reset() {
        clearInterval(this.timer);
        this.clearWordSelectionTimers();
        clearTimeout(this.endRoundTimer);
        this.clearHintTimers();

        this.currentRound = 1;
        this.currentDrawerIndex = 0;

        this.currentDrawerId = null;
        this.timeLeft = this.room.settings.drawTime;

        this.timer = null;
        this.currentWord = null;

        this.resetGuesses();
        this.status = "waiting";
        this.displayWord = "";

        this.revealedIndexes = [];
        this.endRoundTimer = null;

        this.wordOptions = [];
        this.wordSelectionTimeLeft = 0;

        this.phase = "lobby";
        this.turnPoints = {};
        this.turnStartedAt = null;
        this.room.droppedPlayers?.clear(); // seats can only be taken back within the same game
    }

    // ---------- Who may see / do what ----------

    isDrawer(playerId) {
        return playerId === this.currentDrawerId;
    }

    hasGuessed(playerId) {
        return this.guessedPlayers.includes(playerId);
    }

    // Players allowed to know the word right now: the drawer + everyone who guessed it.
    playersWhoKnowWord() {
        return [this.currentDrawerId, ...this.guessedPlayers].filter(Boolean);
    }

    canGuess(playerId) {
        // Only players can guess — spectators live in room.spectators and are never found here.
        return this.phase === "drawing" && !!this.currentWord && !!this.room.getPlayer(playerId)
            && !this.isDrawer(playerId) && !this.hasGuessed(playerId);
    }

    /**
     * Call BEFORE a player is removed from the room. Removing someone at or before the current
     * drawer's position shifts the turn order left by one, so the index moves with it —
     * otherwise the next player would be skipped (e.g. kicking/disconnecting the drawer).
     */
    beforePlayerRemoved(playerId) {
        if (!this.room.gameStarted) return;
        const index = this.room.players.findIndex((p) => p.id === playerId);
        if (index !== -1 && index <= this.currentDrawerIndex) this.currentDrawerIndex--;
    }

    // Who draws next (null if the game ends after this turn). Mirrors nextTurn().
    nextDrawerId() {
        let index = this.currentDrawerIndex + 1;
        let round = this.currentRound;
        if (index >= this.room.players.length) {
            index = 0;
            round++;
        }
        if (round > this.room.settings.maxRounds) return null;
        return this.room.players[index]?.id ?? null;
    }

    // ---------- Game lifecycle ----------

    startGame() {
        this.reset();
        this.room.players.forEach(p => p.score = 0);

        const firstDrawer = this.room.players[this.currentDrawerIndex];
        this.currentDrawerId = firstDrawer.id;

        this.room.gameStarted = true;
        this.room.resetReady(); // ready only gates the start; clear it for the next lobby
        this.status = "playing";
        this.startWordSelection();

        return {
            round: this.currentRound,
            drawerId: this.currentDrawerId
        };
    }

    startTimer() {
        clearInterval(this.timer); // never run two draw timers at once
        this.timeLeft = this.room.settings.drawTime;
        this.scheduleHints();

        this.timer = setInterval(() => {
            this.timeLeft--;
            this.emitGameState();

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.endRound();
            }
        }, 1000);
    }

    endRound() {
        // Only a drawing turn can end, and only once (timer and "everyone guessed" can race).
        if (this.phase !== "drawing") return;
        this.phase = "round_end";
        clearInterval(this.timer);
        this.clearHintTimers();

        // Turn summary: total scores plus the points each player earned this turn.
        const scores = this.room.players
            .map((p) => ({
                playerId: p.id,
                name: p.name,
                avatar: p.avatar,
                score: p.score,
                earned: this.turnPoints[p.id] || 0,
            }))
            .sort((a, b) => b.earned - a.earned || b.score - a.score);

        this.room.broadcast("round_end", {
            word: this.currentWord,
            scores,
            nextDrawerId: this.nextDrawerId(),
            // Timestamped stroke history of this turn, for the client-side replay.
            strokes: this.room.canvasStrokes,
        });

        this.endRoundTimer = setTimeout(() => {
            this.nextTurn();
        }, ROUND_END_DELAY);
    }

    // ---------- Word selection (20s) ----------

    startWordSelection() {
        const drawer = this.room.players.find(player => player.id === this.currentDrawerId);
        if (!drawer) return;

        this.clearWordSelectionTimers();
        this.phase = "choosing";
        this.turnPoints = {};
        this.resetGuesses();

        const wordOptions = this.generateWordOptions();

        this.wordOptions = wordOptions;
        this.wordSelectionTimeLeft = WORD_SELECTION_TIME;

        // Choices go only to the drawer; the countdown (no words in it) goes to the whole room.
        this.wordSelectionDelayTimer = setTimeout(() => {
            this.wordSelectionDelayTimer = null;
            this.emitGameState(); // round + drawer for clients that just opened the game screen
            this.room.sendTo(drawer.id, "word_options", { words: wordOptions, timeLeft: this.wordSelectionTimeLeft });
            const tick = () => this.room.broadcast("word_selection_tick", {
                timeLeft: this.wordSelectionTimeLeft,
                drawerId: drawer.id,
                drawerName: drawer.name
            });
            tick();

            this.wordSelectionTimer = setInterval(() => {
                this.wordSelectionTimeLeft--;
                tick();

                if (this.wordSelectionTimeLeft <= 0) {
                    const randomWord = wordOptions[Math.floor(Math.random() * wordOptions.length)];
                    this.selectWord(randomWord);
                }
            }, 1000);
        }, WORD_DIALOG_DELAY);
    }

    /**
     * Single entry point for picking the word (drawer click or auto-pick at 0).
     * Returns false if not choosing, a word was already chosen, or the word wasn't offered.
     * Accepts the legacy (io, word) call shape too.
     */
    selectWord(...args) {
        const word = args.length > 1 ? args[1] : args[0];
        if (this.phase !== "choosing" || this.currentWord || !this.wordOptions.includes(word)) return false;

        this.clearWordSelectionTimers();
        this.phase = "drawing";
        this.wordOptions = [];
        this.wordSelectionTimeLeft = 0;

        this.currentWord = word;
        this.displayWord = this.generateDisplayWord();
        this.revealedIndexes = [];
        this.turnStartedAt = Date.now();
        this.startTimer();
        this.emitGameState(); // show the full draw time immediately, not after the first tick

        this.room.broadcast("word_selected", { displayWord: this.displayWord });
        this.room.sendTo(this.currentDrawerId, "drawer_word", { word });
        return true;
    }

    // Exactly `wordCount` distinct options (duplicates are re-rolled; the attempt cap only
    // matters for a tiny custom pool, where fewer distinct words may exist).
    generateWordOptions() {
        const count = this.room.settings.wordCount;
        const options = [];
        for (let attempts = 0; options.length < count && attempts < count * 20; attempts++) {
            const word = this.generateRoundWord();
            if (!options.includes(word)) options.push(word);
        }
        return options;
    }

    // Picks from the room's pool: language + category built-ins, merged with or replaced by custom words.
    generateRoundWord() {
        const mode = this.room.settings.gameMode;
        const pool = WordManager.buildPool(this.room.settings);

        if (mode.toLowerCase() === "combination") {
            return WordManager.getCombinationWord(pool);
        }
        return WordManager.getRandomWords(1, pool)[0];
    }

    generateDisplayWord() {
        const mode = this.room.settings.gameMode;
        if (mode.toLowerCase() === "hidden") {
            return "";
        }
        return WordManager.createDisplayWord(
            this.currentWord
        );
    }

    // ---------- Hints ----------

    // Hint i (1..hintCount) is revealed at drawTime * i / (hintCount + 1) seconds elapsed,
    // so hints are spread evenly across the turn. No hints in Hidden mode or when hintCount is 0.
    static hintTimes(drawTime, hintCount) {
        const times = [];
        for (let i = 1; i <= hintCount; i++) {
            times.push(Math.round((drawTime * i / (hintCount + 1)) * 1000));
        }
        return times;
    }

    scheduleHints() {
        const { hintCount, drawTime, gameMode } = this.room.settings;
        if (!hintCount) return;
        if (gameMode.toLowerCase() === "hidden") return;

        for (const delay of Game.hintTimes(drawTime, hintCount)) {
            this.hintTimers.push(setTimeout(() => { this.revealHint(); }, delay));
        }
    }

    revealHint() {

        // Respects both the hint limit and the "never more than half the letters" rule.
        if (!HintManager.canReveal(this.revealedIndexes, this.room.settings.hintCount, this.currentWord)) return;

        const result = HintManager.revealLetter(
            this.currentWord,
            this.displayWord,
            this.revealedIndexes
        );

        this.displayWord = result.displayWord;
        this.revealedIndexes = result.revealedIndexes;

        this.room.broadcast("hint_reveal", {
            displayWord: this.displayWord,
            revealedIndex: result.revealedIndex
        });
    }

    // ---------- Turn order ----------

    nextTurn() {

        if (this.room.players.length === 0) return;

        clearInterval(this.timer);
        clearTimeout(this.endRoundTimer);
        this.clearWordSelectionTimers();
        this.wordOptions = [];

        this.room.canvasStrokes = [];
        this.room.broadcast("canvas_clear");

        this.currentDrawerIndex++;
        this.currentWord = null;

        this.displayWord = "";
        this.revealedIndexes = [];
        this.resetGuesses();
        this.clearHintTimers();

        if (this.currentDrawerIndex >= this.room.players.length) {
            this.currentDrawerIndex = 0;
            this.currentRound++;
        }

        if (this.currentRound > this.room.settings.maxRounds) {
            return this.endGame();
        }

        const drawer = this.room.players[this.currentDrawerIndex];
        if (!drawer) return;

        this.currentDrawerId = drawer.id;
        this.room.broadcast("new_round", {
            round: this.currentRound,
            drawerId: this.currentDrawerId
        });
        this.emitGameState();
        this.startWordSelection();

    }

    endGame() {
        clearInterval(this.timer);
        this.clearWordSelectionTimers();
        this.wordOptions = [];
        clearTimeout(this.endRoundTimer);
        this.clearHintTimers();

        this.room.gameStarted = false;
        this.room.resetReady(); // everyone is back to "not ready" for the next lobby
        this.status = "finished";
        this.phase = "game_over";

        const leaderboard = [...this.room.players]
            .sort((a, b) => b.score - a.score)
            .map((p) => p.toPublicJSON());

        this.room.broadcast("game_over", {
            winner: leaderboard[0],
            leaderboard
        });
    }

    // ---------- Scoring ----------

    // Scoring is unchanged: guesser gets timeLeft × 5, drawer gets timeLeft × 2 per correct guess.
    handleCorrectGuess(player) {

        if (!this.canGuess(player.id)) return;
        this.guessedPlayers.push(player.id);
        player.hasGuessedThisRound = true;

        const points = this.timeLeft * 5;
        player.score += points;
        this.turnPoints[player.id] = (this.turnPoints[player.id] || 0) + points;

        const drawer = this.room.players.find(p => p.id === this.currentDrawerId);
        if (drawer) {
            const drawerPoints = Math.floor(this.timeLeft * 2);
            drawer.score += drawerPoints;
            this.turnPoints[drawer.id] = (this.turnPoints[drawer.id] || 0) + drawerPoints;
        }

        // The guess text itself is never broadcast — only who got it and the points.
        this.room.broadcast("guess_result", {
            correct: true,
            playerId: player.id,
            playerName: player.name,
            points
        });
        this.room.broadcast("chat_message", {
            id: crypto.randomUUID(),
            type: "system",
            tone: "success",
            text: `${player.name} guessed the word!`
        });

        // Now that they know it, the guesser gets the real word too.
        this.room.sendTo(player.id, "drawer_word", { word: this.currentWord });

        this.room.broadcast("leaderboard_update",
            [...this.room.players].sort((a, b) => b.score - a.score).map((p) => p.toPublicJSON())
        );

        if (this.everyoneGuessed()) {
            this.endRound();
        }
    }

    // True when every player still in the room (except the drawer) has guessed. Checks the
    // current players, not a count: people who guessed and then left must not end the turn early.
    everyoneGuessed() {
        const guessers = this.room.players.filter((p) => p.id !== this.currentDrawerId);
        return guessers.length > 0 && guessers.every((p) => this.guessedPlayers.includes(p.id));
    }

    /**
     * A dropped player took their seat back with a new socket id: carry this turn's guess state
     * and points over, so they can't guess (and score) a second time.
     */
    playerReconnected(oldId, player) {
        const index = this.guessedPlayers.indexOf(oldId);
        if (index !== -1) {
            this.guessedPlayers[index] = player.id;
            player.hasGuessedThisRound = true;
        }
        if (oldId in this.turnPoints) {
            this.turnPoints[player.id] = this.turnPoints[oldId];
            delete this.turnPoints[oldId];
        }
    }

    // Game state everyone may see (`word` is the blanks/hints, never the secret word).
    publicState() {
        return {
            status: this.status,
            phase: this.phase,
            currentRound: this.currentRound,
            maxRounds: this.room.settings.maxRounds,
            drawerId: this.currentDrawerId,
            timeLeft: this.timeLeft,
            guessedPlayers: this.guessedPlayers,
            word: this.displayWord
        };
    }

    emitGameState() {
        this.room.broadcast("game_state", this.publicState());
    }

    /**
     * Everything a client needs to show the game correctly when it arrives mid-game
     * (spectator joining, or the game screen mounting): state, strokes, word-choice countdown.
     */
    snapshot() {
        const drawer = this.room.getPlayer(this.currentDrawerId);
        return {
            gameState: this.publicState(),
            strokes: this.room.canvasStrokes,
            wordSelection: this.phase === "choosing" && this.wordSelectionTimer && drawer
                ? { timeLeft: this.wordSelectionTimeLeft, drawerId: drawer.id, drawerName: drawer.name }
                : null,
            // Recent public chat (private / "guessed" messages are never stored, so none leak here).
            chat: this.room.chatManager.getMessages(),
        };
    }

    // Milliseconds since the current drawing turn started (stamped on stroke points for replay).
    elapsedTurnMs() {
        return this.turnStartedAt ? Date.now() - this.turnStartedAt : 0;
    }

    /**
     * "Play again": back to the lobby with the same players. Scores and ready states reset,
     * and spectators become players while there is space.
     */
    returnToLobby() {
        this.reset();
        this.room.gameStarted = false;
        this.room.canvasStrokes = [];
        this.room.players.forEach((p) => { p.score = 0; });
        for (const spectator of [...this.room.spectators]) {
            if (this.room.isFull()) break;
            this.room.removeSpectator(spectator.id);
            this.room.addPlayer(spectator.toPlayer());
        }
        this.room.resetReady();
    }
}
