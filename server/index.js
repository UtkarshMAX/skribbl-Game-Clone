import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';

import MessageHandler from "./socket/MessageHandler.js";
import registerRoomEvents from "./handlers/roomHandler.js";
import registerGameEvents from "./handlers/gameHandler.js";
import registerDrawingEvents from "./handlers/drawingHandler.js";
import registerChatEvents from "./handlers/chatHandler.js";
import registerModerationEvents from "./handlers/moderationHandler.js";
import { parseAllowedOrigins } from "./utils/origins.js";

// CLIENT_URL = comma-separated list of allowed browser origins (e.g. localhost + the Vercel domain).
const allowedOrigins = parseAllowedOrigins(process.env.CLIENT_URL);

const app = express();

app.use(cors({ origin: allowedOrigins }));

app.get("/", (req, res) => {
    res.send("Scribble Backend Running");
});

// Health check for Render (and for waking the free instance).
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
    },
})

// Every socket event is declared once on the MessageHandler (validation + permissions live there).
const messageHandler = new MessageHandler(io);
registerRoomEvents(messageHandler);
registerGameEvents(messageHandler);
registerDrawingEvents(messageHandler);
registerChatEvents(messageHandler);
registerModerationEvents(messageHandler);

io.on("connection", (socket) => {
    messageHandler.register(socket);
});
// Render (and most hosts) provide PORT; 3001 is the local default.
const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
    console.log(`SERVER RUNNING ON ${PORT}`);
    console.log(`Allowed client origins: ${allowedOrigins.map(String).join(", ")}`);
});