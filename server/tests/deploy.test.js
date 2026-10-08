// Phase 5 — deployment: CORS origins, /health, production scripts, Render/Vercel config,
// and client reconnection when the server sleeps and wakes up (Render free tier).
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { io as connect } from "socket.io-client";
import { parseAllowedOrigins, isOriginAllowed, DEFAULT_ORIGINS } from "../utils/origins.js";

const serverDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.join(serverDir, "..");
const children = [];
after(() => children.forEach((c) => c.kill()));

function startServer(port, env = {}) {
    const child = spawn(process.execPath, ["index.js"], { cwd: serverDir, env: { ...process.env, PORT: String(port), ...env } });
    children.push(child);
    child.out = "";
    child.stdout.on("data", (d) => { child.out += d; });
    return new Promise((resolve, reject) => {
        const t = setInterval(() => { if (child.out.includes("SERVER RUNNING")) { clearInterval(t); resolve(child); } }, 50);
        setTimeout(() => reject(new Error("server did not start")), 8000);
    });
}
const stop = (child) => new Promise((resolve) => { child.once("exit", resolve); child.kill(); });

// ---------- CLIENT_URL parsing ----------

test("CLIENT_URL: comma-separated list, trailing slashes ignored, default localhost", () => {
    assert.deepEqual(parseAllowedOrigins(undefined), DEFAULT_ORIGINS);
    assert.deepEqual(parseAllowedOrigins("  "), DEFAULT_ORIGINS);
    assert.deepEqual(parseAllowedOrigins("http://localhost:5173, https://my-app.vercel.app/ ,"),
        ["http://localhost:5173", "https://my-app.vercel.app"]);
});

test("CLIENT_URL: '*' entries match one subdomain label (e.g. Vercel preview URLs)", () => {
    const allowed = parseAllowedOrigins("http://localhost:5173,https://*.vercel.app,https://scribble-*-utkarsh.vercel.app");
    assert.ok(isOriginAllowed("http://localhost:5173", allowed));
    assert.ok(isOriginAllowed("https://my-app.vercel.app", allowed));
    assert.ok(isOriginAllowed("https://scribble-git-main-utkarsh.vercel.app", allowed));
    assert.ok(!isOriginAllowed("https://evil.com", allowed));
    assert.ok(!isOriginAllowed("https://a.b.vercel.app", allowed), "only one label");
    assert.ok(!isOriginAllowed("https://my-app.vercel.app.evil.com", allowed), "anchored");
    assert.ok(!isOriginAllowed("http://my-app.vercel.app", allowed), "scheme must match");
});

// ---------- Production config ----------

test("server package.json: start = node (no nodemon in production), dev = nodemon", () => {
    const pkg = JSON.parse(readFileSync(path.join(serverDir, "package.json"), "utf8"));
    assert.equal(pkg.scripts.start, "node index.js");
    assert.equal(pkg.scripts.dev, "nodemon index.js");
    assert.equal(pkg.dependencies.nodemon, undefined, "nodemon is a devDependency only");
    assert.ok(pkg.devDependencies.nodemon);
    assert.ok(pkg.engines?.node);
});

test("render.yaml: rootDir server, npm install / npm start, health check, env vars", () => {
    const yaml = readFileSync(path.join(rootDir, "render.yaml"), "utf8");
    for (const line of ["rootDir: server", "buildCommand: npm install", "startCommand: npm start", "healthCheckPath: /health", "key: CLIENT_URL", "key: NODE_VERSION"]) {
        assert.ok(yaml.includes(line), line);
    }
});

test("client vercel.json rewrites every route to index.html", () => {
    const vercel = JSON.parse(readFileSync(path.join(rootDir, "client", "vercel.json"), "utf8"));
    assert.deepEqual(vercel.rewrites, [{ source: "/(.*)", destination: "/index.html" }]);
});

// ---------- Running server ----------

test("GET /health and CORS for allowed / disallowed origins (Express + Socket.IO handshake)", async () => {
    const port = 3995;
    const child = await startServer(port, { CLIENT_URL: "http://localhost:5173,https://*.vercel.app" });
    const base = `http://localhost:${port}`;

    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok" });

    const allowed = await fetch(`${base}/health`, { headers: { Origin: "https://my-app.vercel.app" } });
    assert.equal(allowed.headers.get("access-control-allow-origin"), "https://my-app.vercel.app");
    const blocked = await fetch(`${base}/health`, { headers: { Origin: "https://evil.com" } });
    assert.equal(blocked.headers.get("access-control-allow-origin"), null);

    const handshake = (origin) => fetch(`${base}/socket.io/?EIO=4&transport=polling`, { headers: { Origin: origin } });
    assert.equal((await handshake("http://localhost:5173")).headers.get("access-control-allow-origin"), "http://localhost:5173");
    assert.equal((await handshake("https://evil.com")).headers.get("access-control-allow-origin"), null);

    assert.match(child.out, /Allowed client origins: http:\/\/localhost:5173, \/\^https:/);
    await stop(child);
});

test("client reconnects on its own after the server sleeps and wakes up", async () => {
    const port = 3994;
    let child = await startServer(port);
    const socket = connect(`http://localhost:${port}`, {
        reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 200, reconnectionDelayMax: 500,
    });
    let connects = 0;
    socket.on("connect", () => { connects++; });
    await new Promise((r) => socket.once("connect", r));
    const firstId = socket.id;

    const dropped = new Promise((r) => socket.once("disconnect", r));
    await stop(child);                       // "free instance goes to sleep"
    await dropped;
    await new Promise((r) => setTimeout(r, 1500));
    assert.equal(socket.connected, false);

    child = await startServer(port);         // "first request wakes it up"
    await new Promise((resolve, reject) => {
        socket.once("connect", resolve);
        setTimeout(() => reject(new Error("did not reconnect")), 8000);
    });
    assert.equal(connects, 2);
    assert.notEqual(socket.id, firstId, "a new connection after the restart");
    socket.close();
    await stop(child);
});
