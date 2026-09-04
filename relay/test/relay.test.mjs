import assert from 'node:assert/strict';
import { once } from 'node:events';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createCursorRelay } from '../server.mjs';

const room = 'a'.repeat(64);
const firstClient = '1'.repeat(32);
const secondClient = '2'.repeat(32);

function nextJson(socket) {
    return new Promise((resolve, reject) => {
        socket.once('message', data => {
            try {
                resolve(JSON.parse(data.toString()));
            } catch (error) {
                reject(error);
            }
        });
    });
}

test('relays cursor packets only to peers in the same room', async () => {
    const relay = createCursorRelay();
    relay.server.listen(0, '127.0.0.1');
    await once(relay.server, 'listening');
    const { port } = relay.server.address();
    const url = `ws://127.0.0.1:${port}/gowo-cursor`;
    const first = new WebSocket(url, { origin: 'https://gowo.io' });
    const second = new WebSocket(url, { origin: 'https://gowo.io' });

    await Promise.all([once(first, 'open'), once(second, 'open')]);
    first.send(JSON.stringify({
        type: 'join', room, client: firstClient, username: 'Alice'
    }));
    second.send(JSON.stringify({
        type: 'join', room, client: secondClient, username: 'Bob'
    }));
    assert.equal((await nextJson(first)).type, 'joined');
    assert.equal((await nextJson(second)).type, 'joined');

    const received = nextJson(second);
    first.send(JSON.stringify({
        type: 'cursor', visible: true, x: 0.25, y: 0.75
    }));
    assert.deepEqual(await received, {
        type: 'cursor',
        client: firstClient,
        username: 'Alice',
        visible: true,
        x: 0.25,
        y: 0.75
    });

    first.close();
    second.close();
    await Promise.all([once(first, 'close'), once(second, 'close')]);
    await relay.close();
});

test('rejects websocket upgrades from other origins', async () => {
    const relay = createCursorRelay();
    relay.server.listen(0, '127.0.0.1');
    await once(relay.server, 'listening');
    const { port } = relay.server.address();
    const socket = new WebSocket(
        `ws://127.0.0.1:${port}/gowo-cursor`,
        { origin: 'https://example.com' }
    );
    const [error] = await once(socket, 'error');
    assert.match(error.message, /403/);
    await relay.close();
});
