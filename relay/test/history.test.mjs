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

test('only the browser that claimed a message can edit it', () => {
    const store = createMessageStore();
    // A bystander reports first; the author claims the message afterwards.
    store.record(room, chat('m1', 'frist'), { live: true, now: 1_000 });
    assert.equal(store.edit(room, 'm1', 'author', [{ type: 'text', text: 'x' }], 2_000), null, 'unclaimed');
    assert.equal(store.record(room, chat('m1'), { live: true, owner: 'author', now: 1_100 }).created, false);
    store.record(room, chat('m1'), { live: true, owner: 'latecomer', now: 1_200 });
    assert.equal(store.edit(room, 'm1', 'latecomer', [{ type: 'text', text: 'hijack' }], 2_000), null);
    assert.equal(store.edit(room, 'm1', '', [{ type: 'text', text: 'hijack' }], 2_000), null);

    const edited = store.edit(room, 'm1', 'author', [{ type: 'text', text: 'first' }], 3_000);
    assert.deepEqual(edited, {
        id: 'm1', rev: 2, at: 1_000, approx: false, deleted: false,
        author: 'Alice Example', parts: [{ type: 'text', text: 'first' }], reply: null, edited: 3_000
    });
    assert.deepEqual(store.since(room, 1).messages, [edited], 'absent clients receive the edit');
    assert.equal(JSON.stringify(edited).includes('author"') && !('owner' in edited), true);

    // Claimed on first report; a deleted message cannot be edited back.
    store.record(room, chat('m2'), { live: true, owner: 'author', now: 4_000 });
    store.remove(room, 'm2', 5_000);
    assert.equal(store.edit(room, 'm2', 'author', [{ type: 'text', text: 'x' }], 6_000), null);
    store.close();
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
    // Peers coming and going also produce cursor and presence packets; these
    // tests follow the chat log.
    const next = async () => {
        for (;;) {
            const message = await any();
            if (message.type !== 'cursor' && message.type !== 'peer') return message;
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

    // Playback requests go to the others in the room, and only valid ones.
    late.say({ type: 'control', action: 'explode' });
    late.say({ type: 'control', action: 'seek', time: 'soon' });
    late.say({ type: 'control', action: 'pause', time: 3 });
    assert.deepEqual(await alice.next(), { type: 'control', action: 'pause' });
    late.say({ type: 'control', action: 'seek', time: 61.5, extra: true });
    assert.deepEqual(await alice.next(), { type: 'control', action: 'seek', time: 61.5 });

    // Edits: the author's key works, anyone else's is refused.
    const key = 'c'.repeat(64);
    alice.say({ type: 'seen', live: true, key, message: chat('m3', 'tpyo') });
    await alice.next();
    await late.next();
    late.say({ type: 'edit', id: 'm3', key: 'd'.repeat(64), parts: [{ type: 'text', text: 'mine now' }] });
    assert.deepEqual(await late.next(), { type: 'edit-refused', id: 'm3' });
    alice.say({ type: 'edit', id: 'm3', key, parts: [{ type: 'text', text: '   ' }] });
    assert.deepEqual(await alice.next(), { type: 'edit-refused', id: 'm3' });
    alice.say({ type: 'edit', id: 'm3', key, parts: [
        { type: 'text', text: 'typo ' },
        { type: 'image', text: 'GIF', url: 'https://media.giphy.com/media/x/giphy.gif' }
    ] });
    const fixed = (await late.next()).messages[0];
    assert.deepEqual(await alice.next(), { type: 'history', messages: [fixed] });
    assert.deepEqual([fixed.id, fixed.rev, fixed.parts, typeof fixed.edited, 'key' in fixed, 'owner' in fixed],
        ['m3', 5, [{ type: 'text', text: 'typo ' }], 'number', false, false]);

    alice.socket.close();
    late.socket.close();
    await Promise.all([once(alice.socket, 'close'), once(late.socket, 'close')]);
    await relay.close();
});

test('everyone learns who else is in the room, who joins, who drops out, and why the room paused', async () => {
    const relay = createPluginRelay();
    relay.server.listen(0, '127.0.0.1');
    await once(relay.server, 'listening');
    const { port } = relay.server.address();
    const open = async (client, username) => {
        const socket = new WebSocket(`ws://127.0.0.1:${port}/gowo-plugin`, { origin: 'https://gowo.io' });
        const inbox = [], waiting = [];
        socket.on('message', data => {
            const message = JSON.parse(data.toString());
            if (message.type === 'cursor') return;
            const next = waiting.shift();
            if (next) next(message); else inbox.push(message);
        });
        await once(socket, 'open');
        socket.send(JSON.stringify({ type: 'join', room, client, username }));
        const next = () => inbox.length ? Promise.resolve(inbox.shift()) : new Promise(resolve => waiting.push(resolve));
        return { socket, next, say: message => socket.send(JSON.stringify(message)), joined: await next() };
    };
    const owner = await open('1'.repeat(32), 'Руслан Эммм');
    assert.deepEqual(owner.joined, { type: 'joined', peers: [] });
    const friend = await open('2'.repeat(32), 'Аня Пример');
    assert.deepEqual(friend.joined, { type: 'joined', peers: [{ client: '1'.repeat(32), username: 'Руслан Эммм' }] });
    assert.deepEqual(await owner.next(), { type: 'peer', client: '2'.repeat(32), username: 'Аня Пример', present: true });

    // The same tab reconnecting before its old connection is gone is not news.
    const again = await open('2'.repeat(32), 'Аня Пример');
    friend.socket.close();
    await once(friend.socket, 'close');
    again.socket.close();
    assert.deepEqual(await owner.next(), { type: 'peer', client: '2'.repeat(32), username: 'Аня Пример', present: false });

    const third = await open('3'.repeat(32), 'Третий');
    await owner.next();
    owner.say({ type: 'autopause', client: 'nope', username: 'x' });
    owner.say({ type: 'autopause', client: '2'.repeat(32), username: 'Аня Пример' });
    assert.deepEqual(await third.next(), { type: 'autopause', client: '2'.repeat(32), username: 'Аня Пример' });

    owner.socket.close();
    third.socket.close();
    await Promise.all([once(owner.socket, 'close'), once(third.socket, 'close')]);
    await relay.close();
});
