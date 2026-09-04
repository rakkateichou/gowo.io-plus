import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const roomPattern = /^[a-f0-9]{64}$/;
const clientPattern = /^[a-f0-9]{32}$/;
const maxClients = 1000;
const maxClientsPerRoom = 64;
const maxMessagesPerSecond = 30;

function cleanName(value) {
    return String(value || 'Anonymous')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 40) || 'Anonymous';
}

function send(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

export function createCursorRelay(options = {}) {
    const allowedOrigins = new Set(
        options.allowedOrigins || ['https://gowo.io']
    );
    const rooms = new Map();
    const sockets = new Set();
    const server = http.createServer((request, response) => {
        if (request.method === 'GET' && request.url === '/health') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(JSON.stringify({ status: 'ok' }));
            return;
        }
        response.writeHead(404);
        response.end();
    });
    const webSocketServer = new WebSocketServer({
        noServer: true,
        maxPayload: 2048,
        perMessageDeflate: false
    });

    function broadcast(roomId, payload, except = null) {
        const room = rooms.get(roomId);
        if (!room) return;
        for (const peer of room) {
            if (peer !== except) send(peer, payload);
        }
    }

    function leave(socket) {
        const { room, client, username } = socket.gowo || {};
        if (!room) return;
        const peers = rooms.get(room);
        peers?.delete(socket);
        if (peers?.size === 0) rooms.delete(room);
        socket.gowo.room = '';
        broadcast(room, {
            type: 'cursor',
            client,
            username,
            visible: false
        }, socket);
    }

    server.on('upgrade', (request, socket, head) => {
        const origin = request.headers.origin;
        const path = new URL(request.url || '/', 'http://relay.local').pathname;
        if (path !== '/gowo-cursor' || !allowedOrigins.has(origin)) {
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
        }
        if (sockets.size >= maxClients) {
            socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
            socket.destroy();
            return;
        }
        webSocketServer.handleUpgrade(request, socket, head, ws => {
            webSocketServer.emit('connection', ws);
        });
    });

    webSocketServer.on('connection', socket => {
        sockets.add(socket);
        socket.isAlive = true;
        socket.gowo = {
            room: '',
            client: '',
            username: 'Anonymous',
            rateStartedAt: Date.now(),
            rateCount: 0
        };
        const joinDeadline = setTimeout(() => socket.terminate(), 5000);

        socket.on('pong', () => {
            socket.isAlive = true;
        });
        socket.on('message', data => {
            const now = Date.now();
            const state = socket.gowo;
            if (now - state.rateStartedAt >= 1000) {
                state.rateStartedAt = now;
                state.rateCount = 0;
            }
            state.rateCount++;
            if (state.rateCount > maxMessagesPerSecond) {
                socket.close(1008, 'Rate limit exceeded');
                return;
            }

            let message;
            try {
                message = JSON.parse(data.toString());
            } catch {
                socket.close(1003, 'Invalid JSON');
                return;
            }

            if (message?.type === 'join') {
                if (state.room || !roomPattern.test(message.room || '') ||
                    !clientPattern.test(message.client || '')) {
                    socket.close(1008, 'Invalid join');
                    return;
                }
                const room = rooms.get(message.room) || new Set();
                if (room.size >= maxClientsPerRoom) {
                    socket.close(1013, 'Room is full');
                    return;
                }
                state.room = message.room;
                state.client = message.client;
                state.username = cleanName(message.username);
                room.add(socket);
                rooms.set(state.room, room);
                clearTimeout(joinDeadline);
                send(socket, { type: 'joined' });
                return;
            }

            if (message?.type !== 'cursor' || !state.room) return;
            const visible = message.visible !== false;
            const payload = {
                type: 'cursor',
                client: state.client,
                username: cleanName(message.username || state.username),
                visible
            };
            state.username = payload.username;
            if (visible) {
                const x = Number(message.x);
                const y = Number(message.y);
                if (!Number.isFinite(x) || !Number.isFinite(y) ||
                    x < 0 || x > 1 || y < 0 || y > 1) {
                    return;
                }
                payload.x = x;
                payload.y = y;
            }
            broadcast(state.room, payload, socket);
        });
        socket.on('close', () => {
            clearTimeout(joinDeadline);
            leave(socket);
            sockets.delete(socket);
        });
        socket.on('error', () => {
            // The close handler owns cleanup.
        });
    });

    const heartbeat = setInterval(() => {
        for (const socket of sockets) {
            if (!socket.isAlive) {
                socket.terminate();
                continue;
            }
            socket.isAlive = false;
            socket.ping();
        }
    }, 30000);
    heartbeat.unref();

    return {
        server,
        webSocketServer,
        close: async () => {
            clearInterval(heartbeat);
            for (const socket of sockets) socket.terminate();
            await new Promise(resolve => server.close(resolve));
        }
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const host = process.env.HOST || '127.0.0.1';
    const port = Number(process.env.PORT || 3000);
    const relay = createCursorRelay();
    relay.server.listen(port, host, () => {
        console.log(`Gowo cursor relay listening on ${host}:${port}`);
    });

    const shutdown = async () => {
        await relay.close();
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
}
