import Room from "../models/Room.js";

export class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.io = null;
    }

    // Called once at startup so every Room can broadcast through Socket.IO.
    attach(io) {
        this.io = io;
    }

    createRoom(roomCode, hostId, settings){
        const room = new Room(roomCode, hostId, settings, this.io);
        this.rooms.set(roomCode, room);

        return room;
    }

    getRoom(roomCode){
        return this.rooms.get(roomCode);
    }

    /**
     * Quick Play matchmaking: the joinable PUBLIC room with the most players (oldest wins a tie).
     * Private, started and full rooms are never returned, nor rooms that banned this browser.
     */
    findPublicRoom(clientId){
        let best = null;
        for (const room of this.rooms.values()) {
            if (room.isPrivate || !room.isJoinable() || room.isBanned(clientId)) continue;
            if (!best || room.players.length > best.players.length) best = room;
        }
        return best;
    }

    deleteRoom(roomCode){
        this.rooms.delete(roomCode);
    }
}

export default new RoomManager();
