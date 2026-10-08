// Drawing events. Only the current drawer of a running game may draw;
// anything else is dropped silently (these events arrive many times per second).

const DRAWER_ONLY = ["room", "playing", "drawer"];

export default function registerDrawingEvents(handler) {

    // -----------Draw Start---------

    handler.on("draw_start", {
        // `size` may arrive as a number or a numeric string (the brush slider's value) — coerced below.
        schema: { roomCode: "string", x: "number", y: "number", color: "string" },
        requires: DRAWER_ONLY,
        silent: true,
        handler: ({ socket, room, payload }) => {
            const { x, y, color } = payload;
            const size = Number(payload.size);
            const stroke = {
                id: crypto.randomUUID(),
                color: color.slice(0, 32),
                size: Number.isFinite(size) ? Math.min(Math.max(size, 1), 50) : 5,
                points: [{ x, y, t: room.game.elapsedTurnMs() }] // t = ms into the turn (for replay)
            };
            socket.currentStrokeId = stroke.id;
            room.canvasStrokes.push(stroke);
            room.broadcast("draw_start", stroke);
        },
    });

    // -------------Draw Move-------------

    handler.on("draw_move", {
        schema: { roomCode: "string", x: "number", y: "number" },
        requires: DRAWER_ONLY,
        silent: true,
        handler: ({ socket, room, payload }) => {
            const { x, y } = payload;
            const stroke = room.canvasStrokes.find(s => s.id === socket.currentStrokeId);
            if (!stroke) return;
            stroke.points.push({ x, y, t: room.game.elapsedTurnMs() });
            room.broadcast("draw_move", { strokeId: stroke.id, x, y });
        },
    });

    // -----------End Draw--------------

    handler.on("draw_end", {
        silent: true,
        handler: ({ socket }) => {
            socket.currentStrokeId = null;
        },
    });

    // ----------------Undo------------

    handler.on("draw_undo", {
        schema: { roomCode: "string" },
        requires: DRAWER_ONLY,
        silent: true,
        handler: ({ room }) => {
            room.canvasStrokes.pop();
            room.broadcast("draw_undo", room.canvasStrokes);
        },
    });

    // ------------Reset---------------

    handler.on("canvas_clear", {
        schema: { roomCode: "string" },
        requires: DRAWER_ONLY,
        silent: true,
        handler: ({ room }) => {
            room.canvasStrokes = [];
            room.broadcast("canvas_clear");
        },
    });
}
