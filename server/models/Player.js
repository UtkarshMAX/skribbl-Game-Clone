// One connected player. `id` is the Socket.IO socket id.
export default class Player {
    // `clientId` is a persistent id from the browser's localStorage (survives reconnects); used for bans.
    constructor(socketId, name, avatar = "😀", clientId = null) {
        this.id = socketId;
        this.clientId = clientId;
        this.name = name;
        this.score = 0;
        this.avatar = avatar;
        this.ready = false;

        this.isHost = false;              // kept in sync by Room (addPlayer / transferHost)
        this.hasGuessedThisRound = false; // set by Game on a correct guess, reset every turn
    }

    // What other clients are allowed to see about this player.
    toPublicJSON() {
        return {
            id: this.id,
            name: this.name,
            avatar: this.avatar,
            score: this.score,
            ready: this.ready,
            isHost: this.isHost,
            hasGuessedThisRound: this.hasGuessedThisRound,
        };
    }
}
