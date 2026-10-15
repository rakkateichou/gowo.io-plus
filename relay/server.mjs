import { createHash } from 'node:crypto';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { createMessageStore } from './store.mjs';

const roomPattern = /^[a-f0-9]{64}$/;
const clientPattern = /^[a-f0-9]{32}$/;
const keyPattern = /^[a-f0-9]{64}$/;
const maxClients = 1000;
const maxClientsPerRoom = 64;
const maxMessagesPerSecond = 60;
const maxPayload = 32 * 1024;
const messageIdLimit = 1024;
// Browsers answer pings on their own, even from a background tab, so a silent
// connection is a dropped one: find it within one or two beats.
const heartbeatMs = 5000;

function cleanName(value) {
    return String(value || 'Anonymous')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 40) || 'Anonymous';
}

// The grammatical gender each person set in their Gowo profile, for wording
// such as "покинул" / "покинула"; empty when unknown.
function cleanGender(value) {
    return value === 'f' || value === 'm' ? value : '';
}

function cleanText(value, limit) {
    return String(value ?? '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, limit);
}

function cleanUrl(value, image) {
    if (typeof value !== 'string' || value.length > 2048) return '';
    try {
        const url = new URL(value);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
        // Clients only ever load images from the GIF source Gowo itself uses.
        if (image && (url.protocol !== 'https:' ||
            !(url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com')))) return '';
        return url.href;
    } catch {
        return '';
    }
}

// Messages are stored as plain text, link and image parts, never as markup.
function cleanParts(parts) {
    if (!Array.isArray(parts)) return [];
    let remaining = 4000;
    return parts.slice(0, 128).flatMap(part => {
        if (!part || typeof part.text !== 'string' || remaining <= 0) return [];
        const text = cleanText(part.text, remaining);
        remaining -= text.length;
        if (part.type === 'text') return [{ type: 'text', text }];
        if (part.type !== 'link' && part.type !== 'image') return [];
        const url = cleanUrl(part.url, part.type === 'image');
        return url ? [{ type: part.type, text, url }] : [{ type: 'text', text }];
    });
}

function cleanChatMessage(value) {
    if (!value || typeof value.id !== 'string' || !value.id ||
        value.id.length > messageIdLimit || typeof value.author !== 'string') return null;
    const author = cleanText(value.author, 200).trim();
    if (!author) return null;
    return {
        id: value.id,
        author,
        ...(value.crown === 'owner' || value.crown === 'admin' ? { crown: value.crown } : {}),
        parts: cleanParts(value.parts),
        reply: value.reply && typeof value.reply.author === 'string' ? {
            author: cleanText(value.reply.author, 200).trim(),
            parts: cleanParts(value.reply.parts)
        } : null
    };
}

// A browser proves authorship with a secret only it holds; the store keeps a hash.
function ownerOf(key) {
    return typeof key === 'string' && keyPattern.test(key) ?
        createHash('sha256').update(key).digest('hex') : '';
}

function send(socket, payload) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(payload));
    }
}

export function createPluginRelay(options = {}) {
    const allowedOrigins = new Set(
        options.allowedOrigins || ['https://gowo.io']
    );
    const store = createMessageStore(options.databasePath);
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
        maxPayload,
        perMessageDeflate: false
    });

    function broadcast(roomId, payload, except = null) {
        const room = rooms.get(roomId);
        if (!room) return;
        for (const peer of room) {
            if (peer !== except) send(peer, payload);
        }
    }

    const peerInfo = ({ client, username, gender }) => ({ client, username, ...(gender ? { gender } : {}) });

    function leave(socket) {
        const { room, client, username, gender } = socket.gowo || {};
        if (!room) return;
        const peers = rooms.get(room);
        peers?.delete(socket);
        if (peers?.size === 0) rooms.delete(room);
        socket.gowo.room = '';
        // A tab that reconnected before its old connection timed out is still here.
        if ([...(peers || [])].some(peer => peer.gowo.client === client)) return;
        broadcast(room, {
            type: 'cursor',
            client,
            username,
            visible: false
        }, socket);
        broadcast(room, { type: 'peer', ...peerInfo({ client, username, gender }), present: false }, socket);
    }

    server.on('upgrade', (request, socket, head) => {
        const origin = request.headers.origin;
        const path = new URL(request.url || '/', 'http://relay.local').pathname;
        if (path !== '/gowo-plugin' || !allowedOrigins.has(origin)) {
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
            gender: '',
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
                state.gender = cleanGender(message.gender);
                const returning = [...room].some(peer => peer.gowo.client === state.client);
                room.add(socket);
                rooms.set(state.room, room);
                clearTimeout(joinDeadline);
                // Who else runs Gowo.io+ here, and news of us for them.
                send(socket, {
                    type: 'joined',
                    peers: [...room].filter(peer => peer !== socket).map(peer => peerInfo(peer.gowo))
                });
                if (!returning) {
                    broadcast(state.room, { type: 'peer', ...peerInfo(state), present: true }, socket);
                }
                return;
            }

            if (!state.room) return;
            if (message?.type === 'sync') {
                const after = Number.isSafeInteger(message.after) && message.after > 0 ? message.after : 0;
                send(socket, { type: 'history', page: true, ...store.since(state.room, after) });
                return;
            }
            if (message?.type === 'seen') {
                const chatMessage = cleanChatMessage(message.message);
                const result = chatMessage && store.record(state.room, chatMessage, {
                    live: message.live === true,
                    age: Number(message.age),
                    owner: ownerOf(message.key),
                    next: typeof message.next === 'string' ? message.next.slice(0, messageIdLimit) : ''
                });
                if (!result) return;
                const payload = { type: 'history', messages: [result.row] };
                // Everyone learns the shared time of a new message; a repeat
                // report only needs its own answer.
                if (result.created) broadcast(state.room, payload);
                else send(socket, payload);
                return;
            }
            if (message?.type === 'gone') {
                const row = typeof message.id === 'string' && message.id.length <= messageIdLimit ?
                    store.remove(state.room, message.id) : null;
                if (row) broadcast(state.room, { type: 'history', messages: [row] });
                return;
            }
            if (message?.type === 'autopause') {
                // The owner's browser paused because someone dropped out; say who.
                if (clientPattern.test(message.client || '')) {
                    broadcast(state.room, {
                        type: 'autopause',
                        ...peerInfo({ client: message.client, username: cleanName(message.username), gender: cleanGender(message.gender) })
                    }, socket);
                }
                return;
            }
            if (message?.type === 'edit') {
                if (typeof message.id !== 'string' || message.id.length > messageIdLimit) return;
                // An edit is text and links; it cannot turn a message into an image.
                const parts = cleanParts(message.parts).filter(part => part.type !== 'image');
                const row = parts.some(part => part.text.trim()) ?
                    store.edit(state.room, message.id, ownerOf(message.key), parts) : null;
                if (row) broadcast(state.room, { type: 'history', messages: [row] });
                else send(socket, { type: 'edit-refused', id: message.id });
                return;
            }
            if (message?.type === 'control') {
                // A viewer asks whoever controls the room to pause, resume or seek.
                const time = Number(message.time);
                if (message.action === 'pause' || message.action === 'play') {
                    broadcast(state.room, { type: 'control', action: message.action }, socket);
                } else if (message.action === 'seek' && Number.isFinite(time) && time >= 0 && time < 1e6) {
                    broadcast(state.room, { type: 'control', action: 'seek', time }, socket);
                }
                return;
            }
            if (message?.type !== 'cursor') return;
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
    }, heartbeatMs);
    heartbeat.unref();

    return {
        server,
        webSocketServer,
        close: async () => {
            clearInterval(heartbeat);
            for (const socket of sockets) socket.terminate();
            await new Promise(resolve => server.close(resolve));
            store.close();
        }
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const host = process.env.HOST || '127.0.0.1';
    const port = Number(process.env.PORT || 3000);
    // With systemd, StateDirectory= provides STATE_DIRECTORY. Without a path
    // the chat history lives in memory and is lost on restart.
    const databasePath = process.env.DATABASE_PATH || (process.env.STATE_DIRECTORY ?
        `${process.env.STATE_DIRECTORY}/relay.sqlite` : ':memory:');
    const relay = createPluginRelay({ databasePath });
    relay.server.listen(port, host, () => {
        console.log(`Gowo plugin relay listening on ${host}:${port}`);
    });

    const shutdown = async () => {
        await relay.close();
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
}
