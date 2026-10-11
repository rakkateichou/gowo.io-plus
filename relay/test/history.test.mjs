import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { WebSocket } from 'ws';
import { createPluginRelay } from '../server.mjs';
import { createMessageStore } from '../store.mjs';

const room = 'a'.repeat(64);
const otherRoom = 'b'.repeat(64);
const chat = (id, text = id, author = 'Alice Example') => ({
    id, author, parts: [{ type: 'text', text }], reply: null
});

test('a live message is stored once, timed by the server less the reporter delay', () => {
    const store = createMessageStore();
    const first = store.record(room, chat('m1'), { live: true, age: 400, now: 10_000 });
    assert.equal(first.created, true);
    assert.deepEqual(first.row, {
        id: 'm1', rev: 1, at: 9_600, approx: false, deleted: false,
        author: 'Alice Example', parts: [{ type: 'text', text: 'm1' }], reply: null
    });
    const repeat = store.record(room, chat('m1', 'forged text'), { live: true, now: 99_000 });
    assert.equal(repeat.created, false);
    assert.deepEqual(repeat.row, first.row, 'the first report is kept');
    store.close();
});

test('replayed messages get approximate times that keep their chat order', () => {
    const store = createMessageStore();
    store.record(room, chat('m3'), { live: true, now: 5_000 });
    // A newcomer reports the replay newest-first, each naming its successor.
    const m2 = store.record(room, chat('m2'), { next: 'm3', now: 60_000 }).row;
    const m1 = store.record(room, chat('m1'), { next: 'm2', now: 60_000 }).row;
    const m4 = store.record(room, chat('m4'), { now: 60_000 }).row;
    assert.deepEqual([m1.at, m2.at, m4.at], [4_998, 4_999, 60_000]);
    assert.ok(m1.approx && m2.approx && m4.approx);
    // A reporter that saved the message earlier contributes its own first sight.
    const old = store.record(room, chat('m0'), { next: 'm1', age: 59_000, now: 60_000 }).row;
    assert.equal(old.at, 1_000);
    store.close();
});

test('catch-up pages through every change after a revision, per room', () => {
    const store = createMessageStore();
    for (let index = 1; index <= 250; index++) store.record(room, chat(`m${index}`), { live: true, now: index });
    store.record(otherRoom, chat('elsewhere'), { live: true, now: 1 });
    const first = store.since(room, 0);
    assert.equal(first.messages.length, 100);
    assert.deepEqual([first.through, first.more, first.rev], [100, true, 250]);
    const second = store.since(room, first.through);
    const third = store.since(room, second.through);
    assert.deepEqual([third.messages.length, third.through, third.more], [50, 250, false]);
    assert.deepEqual(store.since(room, 250), { messages: [], rev: 250, through: 250, more: false });
    assert.deepEqual(store.since(otherRoom, 0).messages.map(row => row.id), ['elsewhere']);
    store.close();
});

test('a deletion leaves a content-free tombstone that later clients still receive', () => {
    const store = createMessageStore();
    store.record(room, chat('m1', 'secret'), { live: true, now: 1_000 });
    store.record(room, chat('m2'), { live: true, now: 2_000 });
    const tombstone = store.remove(room, 'm1', 3_000);
    assert.deepEqual(tombstone, { id: 'm1', rev: 3, at: 1_000, approx: false, deleted: true });
    assert.equal(store.remove(room, 'm1'), null);
    assert.equal(store.remove(room, 'unknown'), null);
    assert.deepEqual(store.since(room, 2).messages, [tombstone]);
    store.close();
});

test('a room keeps only its newest 2000 messages and history survives a restart', () => {
    const directory = mkdtempSync(join(tmpdir(), 'gowo-relay-'));
    const path = join(directory, 'relay.sqlite');
    let store = createMessageStore(path);
    // Real times: rooms untouched for half a year are dropped when the store opens.
    const base = Date.now();
    for (let index = 1; index <= 2005; index++) store.record(room, chat(`m${index}`), { live: true, now: base + index });
    store.close();
    store = createMessageStore(path);
    const ids = [];
    for (let after = 0, page; (page = store.since(room, after)).messages.length; after = page.through) {
        ids.push(...page.messages.map(row => row.id));
    }
    assert.equal(ids.length, 2000);
    assert.deepEqual([ids[0], ids.at(-1)], ['m6', 'm2005']);
    assert.equal(store.record(room, chat('m2006'), { live: true }).row.rev, 2006);
    store.close();
    rmSync(directory, { recursive: true, force: true });
});

async function connect(port, client) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/gowo-plugin`, { origin: 'https://gowo.io' });
    const inbox = [];
    const waiting = [];
    socket.on('message', data => {
        const message = JSON.parse(data.toString());
        const next = waiting.shift();
        if (next) next(message);
        else inbox.push(message);
    });
    await once(socket, 'open');
    const any = () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise(resolve => waiting.push(resolve));
    // Peers leaving also produce cursor packets; these tests follow the chat log.
    const next = async () => {
        for (;;) {
            const message = await any();
            if (message.type !== 'cursor') return message;
        }
    };
    const say = message => socket.send(JSON.stringify(message));
    say({ type: 'join', room, client, username: 'Tester' });
    assert.equal((await next()).type, 'joined');
    return { socket, next, say };
}

test('a message one client reports reaches the room now and an absent client later', async () => {
    const relay = createPluginRelay();
    relay.server.listen(0, '127.0.0.1');
    await once(relay.server, 'listening');
    const { port } = relay.server.address();
    const alice = await connect(port, '1'.repeat(32));
    const bob = await connect(port, '2'.repeat(32));

    const unsafe = {
        id: 'm1', author: ' Alice Example ', crown: 'emperor', html: '<script>',
        parts: [
            { type: 'text', text: 'hello ' },
            { type: 'link', text: 'site', url: 'javascript:alert(1)' },
            { type: 'image', text: 'GIF', url: 'https://media.giphy.com/media/x/giphy.gif' },
            { type: 'image', text: 'pixel', url: 'https://tracker.example/p.gif' }
        ],
        reply: { author: 'Bob', parts: [{ type: 'text', text: 'quoted' }] }
    };
    alice.say({ type: 'seen', live: true, age: 0, message: unsafe });
    const toAlice = await alice.next();
    const toBob = await bob.next();
    assert.deepEqual(toBob, toAlice);
    const [row] = toBob.messages;
    assert.equal(toBob.type, 'history');
    assert.deepEqual({ ...row, at: 0 }, {
        id: 'm1', rev: 1, at: 0, approx: false, deleted: false, author: 'Alice Example',
        parts: [
            { type: 'text', text: 'hello ' },
            { type: 'text', text: 'site' },
            { type: 'image', text: 'GIF', url: 'https://media.giphy.com/media/x/giphy.gif' },
            { type: 'text', text: 'pixel' }
        ],
        reply: { author: 'Bob', parts: [{ type: 'text', text: 'quoted' }] }
    });
    assert.ok(Math.abs(row.at - Date.now()) < 5_000);

    // A second witness only gets its own answer; nothing is broadcast again.
    bob.say({ type: 'seen', live: true, message: chat('m1', 'different') });
    assert.deepEqual((await bob.next()).messages, [row]);
    bob.say({ type: 'seen', live: true, message: { id: 'bad', parts: [] } });

    bob.socket.close();
    await once(bob.socket, 'close');
    alice.say({ type: 'seen', live: true, message: chat('m2', 'while Bob was away') });
    await alice.next();
    alice.say({ type: 'gone', id: 'm1' });
    assert.equal((await alice.next()).messages[0].deleted, true);

    const late = await connect(port, '3'.repeat(32));
    late.say({ type: 'sync', after: 1 });
    const page = await late.next();
    assert.deepEqual(
        { page: page.page, rev: page.rev, through: page.through, more: page.more },
        { page: true, rev: 3, through: 3, more: false }
    );
    assert.deepEqual(page.messages.map(entry => [entry.id, entry.deleted, entry.parts?.[0].text]), [
        ['m2', false, 'while Bob was away'],
        ['m1', true, undefined]
    ]);

    alice.socket.close();
    late.socket.close();
    await Promise.all([once(alice.socket, 'close'), once(late.socket, 'close')]);
    await relay.close();
});
