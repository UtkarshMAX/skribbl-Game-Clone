import roomManager from "../managers/RoomManager.js";

/**
 * Registers every socket event in one place. For each incoming message it:
 *   1. turns a missing / non-object payload into {}  (never crash on bad input)
 *   2. checks payload field types against the route's schema
 *   3. looks up the room and player, then runs the route's permission checks in order
 *      (room exists, sender is a member, players-only (no spectators), host-only, drawer-only,
 *      lobby-only, game running)
 *   4. calls the route handler with a context object
 *   5. catches any exception so one bad message can't take the server down
 *
 * Routes are declared in handlers/*.js via messageHandler.on(event, route).
 */

// Permission checks. Each returns null when OK, or the default error message.
const CHECKS = {
    room: (ctx) => (ctx.room ? null : "Room not found"),
    member: (ctx) => (ctx.member ? null : "You are not in this room"),          // player or spectator
    player: (ctx) => (ctx.player ? null : "Spectators can't do that"),          // players only
    host: (ctx) => (ctx.room.hostId === ctx.socket.id ? null : "Only the host can do that"),
    notHost: (ctx) => (ctx.room.hostId !== ctx.socket.id ? null : "The host can't do that"),
    drawer: (ctx) => (ctx.room.game.isDrawer(ctx.socket.id) ? null : "Only the drawer can do that"),
    lobby: (ctx) => (!ctx.room.gameStarted ? null : "The game has already started"),
    playing: (ctx) => (ctx.room.gameStarted ? null : "The game hasn't started"),
};

// Schema types: "string" | "number" | "object" | "boolean"; a trailing "?" makes the field optional.
function validatePayload(schema = {}, payload) {
    for (const [field, spec] of Object.entries(schema)) {
        const optional = spec.endsWith("?");
        const type = optional ? spec.slice(0, -1) : spec;
        const value = payload[field];
        if (value === undefined || value === null) {
            if (optional) continue;
            return `${field} is required`;
        }
        const ok = type === "number" ? typeof value === "number" && Number.isFinite(value)
            : type === "object" ? typeof value === "object" && !Array.isArray(value)
                : typeof value === type;
        if (!ok) return `${field} must be a ${type}`;
    }
    return null;
}

export default class MessageHandler {
    constructor(io, rooms = roomManager) {
        this.io = io;
        this.rooms = rooms;
        this.rooms.attach(io);
        this.routes = new Map();
        this.disconnectHandlers = [];
    }

    /**
     * Declares an event.
     * route = {
     *   schema:   { field: "string" | "number?" ... },
     *   requires: ["room", "member", "host", ...]   // checked in this order
     *   messages: { host: "custom error", ... }     // override default check messages
     *   silent:   true                              // drop failures quietly (e.g. drawing spam)
     *   handler:  (ctx) => {}
     * }
     */
    on(event, route) {
        this.routes.set(event, route);
        return this;
    }

    onDisconnect(handler) {
        this.disconnectHandlers.push(handler);
        return this;
    }

    /** Attaches all declared routes to a newly connected socket. */
    register(socket) {
        for (const [event, route] of this.routes) {
            socket.on(event, (payload, ack) => this.dispatch(socket, event, route, payload, ack));
        }
        socket.on("disconnect", () => {
            for (const handler of this.disconnectHandlers) {
                this.safely(socket, "disconnect", () => handler({ io: this.io, socket, rooms: this.rooms }));
            }
        });
    }

    dispatch(socket, event, route, rawPayload, ack) {
        const payload = rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
        const reply = typeof ack === "function" ? ack : () => {};

        const fail = (message) => {
            if (!route.silent) socket.emit("error", { message });
            if (typeof ack === "function") ack({ success: false, message });
        };

        const schemaError = validatePayload(route.schema, payload);
        if (schemaError) return fail(`Invalid request: ${schemaError}`);

        const room = typeof payload.roomCode === "string" ? this.rooms.getRoom(payload.roomCode) : undefined;
        const ctx = {
            io: this.io,
            socket,
            rooms: this.rooms,
            payload,
            reply,
            room,
            // Roles come from the room's own lists — never from anything the client sends.
            player: room?.getPlayer(socket.id),     // in room.players
            member: room?.getMember(socket.id),     // in room.players or room.spectators
            error: (message) => socket.emit("error", { message }),
        };

        for (const check of route.requires || []) {
            const failure = CHECKS[check](ctx);
            if (failure) return fail(route.messages?.[check] ?? failure);
        }

        this.safely(socket, event, () => route.handler(ctx));
    }

    safely(socket, event, fn) {
        try {
            return fn();
        } catch (err) {
            console.error(`[socket] "${event}" handler failed:`, err);
            socket.emit("error", { message: "Something went wrong on the server" });
        }
    }
}
