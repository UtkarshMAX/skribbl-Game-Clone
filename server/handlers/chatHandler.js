import { handlePlayerMessage, messageLimiter } from "./messageFlow.js";

export default function registerChatEvents(handler) {

    // Chat goes through the same rules as guesses (word-leak protection, rate limit, cleanup).
    handler.on("chat", {
        schema: { roomCode: "string", text: "string" },
        requires: ["room", "member"],
        silent: true,
        handler: (ctx) => handlePlayerMessage({ ...ctx, text: ctx.payload.text, isGuess: false }),
    });

    handler.onDisconnect(({ socket }) => {
        messageLimiter.forget(socket.id);
    });
}
