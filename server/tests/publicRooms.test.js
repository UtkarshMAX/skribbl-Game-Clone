// Public / private rooms: Room.isFull / isJoinable and RoomManager.findPublicRoom (Quick Play matchmaking).
import { test } from "node:test";
import assert from "node:assert/strict";
import { RoomManager } from "../managers/RoomManager.js";
import Player from "../models/Player.js";
import Spectator from "../models/Spectator.js";

// A RoomManager with rooms made from [code, settings, playerCount] rows.
function managerWith(rows) {
    const manager = new RoomManager();
    for (const [code, settings, players] of rows) {
        const room = manager.createRoom(code, `${code}-host`, settings);
        for (let i = 0; i < players; i++) room.addPlayer(new Player(`${code}-p${i}`, `P${i}x`));
    }
    return manager;
}

test("isFull / isJoinable", () => {
    const manager = managerWith([["ROOM01", { maxPlayers: 2 }, 1]]);
    const room = manager.getRoom("ROOM01");
    assert.equal(room.isFull(), false);
    assert.equal(room.isJoinable(), true);

    room.addSpectator(new Spectator("spec", "Spec"));
    assert.equal(room.isFull(), false, "spectators don't count toward the limit");

    room.addPlayer(new Player("p2", "Two"));
    assert.equal(room.isFull(), true);
    assert.equal(room.isJoinable(), false);

    room.removePlayer("p2");
    room.gameStarted = true;
    assert.equal(room.isJoinable(), false, "started rooms aren't joinable");
});

test("findPublicRoom skips private, started and full rooms", () => {
    const manager = managerWith([
        ["PRIV01", { isPrivate: true }, 5],
        ["FULL01", { isPrivate: false, maxPlayers: 2 }, 2],
        ["STAR01", { isPrivate: false }, 4],
        ["OPEN01", { isPrivate: false }, 1],
    ]);
    manager.getRoom("STAR01").gameStarted = true;
    assert.equal(manager.findPublicRoom()?.roomCode, "OPEN01");

    manager.getRoom("OPEN01").gameStarted = true;
    assert.equal(manager.findPublicRoom(), null, "nothing open -> caller creates a new public room");
});

test("Create Room defaults to private, so it is never matched", () => {
    const manager = managerWith([["DEFLT1", {}, 1]]);
    assert.equal(manager.getRoom("DEFLT1").isPrivate, true);
    assert.equal(manager.findPublicRoom(), null);
});

test("findPublicRoom prefers the public room with the most players (oldest on a tie)", () => {
    const manager = managerWith([
        ["SMALL1", { isPrivate: false }, 1],
        ["BIG001", { isPrivate: false }, 3],
        ["BIG002", { isPrivate: false }, 3],
        ["PRIV02", { isPrivate: true }, 6],
    ]);
    assert.equal(manager.findPublicRoom().roomCode, "BIG001");
});

test("findPublicRoom skips rooms that banned this browser", () => {
    const manager = managerWith([
        ["BIG003", { isPrivate: false }, 3],
        ["SMALL2", { isPrivate: false }, 1],
    ]);
    manager.getRoom("BIG003").bannedClientIds.add("banned-client-1");
    assert.equal(manager.findPublicRoom("banned-client-1").roomCode, "SMALL2");
    assert.equal(manager.findPublicRoom("someone-else-1").roomCode, "BIG003");
});
