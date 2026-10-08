import io from 'socket.io-client';

// Server URL: VITE_SERVER_URL (set in Vercel to the Render URL), or the local dev server.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

if (!import.meta.env.VITE_SERVER_URL && import.meta.env.PROD) {
    console.warn('VITE_SERVER_URL is not set — falling back to http://localhost:3001');
}

// Keep retrying forever: a free Render instance can take ~50s to wake up, and
// brief network drops should reconnect on their own.
const socket = io(SERVER_URL, {
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
});

export default socket;
