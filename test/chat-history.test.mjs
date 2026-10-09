import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { IDBFactory } from 'fake-indexeddb';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const settings = '<app-chat-settings-room><div class="settings"><form><h3>Настройки комнаты</h3></form></div></app-chat-settings-room>';
const chat = content => `<app-chat-messages-room><div class="messages-wrapper"><div class="messages">${content}</div></div></app-chat-messages-room>${settings}`;
const message = (id, text = 'Hello', author = 'Руслан Эммм', quote = '') => `<div class="message" id="${id}"><div class="user"><div class="text"><div class="header-message"><p>${author}</p></div>${quote}<div class="w-100">${text}</div></div><ul class="actions"><app-icon-undo></app-icon-undo></ul></div></div>`;
const quote = '<div class="text__reply"><p class="text__reply__name">Друг Другов</p><p class="text__reply__text">Quoted :pog:</p></div>';

// Same ID length/shape and nested markup as the reported Gowo message, but
// synthetic IDs and profile details: do not publish a user's opaque identifiers.
const nativeId = suffix => `${'a'.repeat(32)}:${'b'.repeat(191)}${suffix}`;
const nativeMessage = (id, formatted = false, omitNickname = false) => `
  <div _ngcontent-ng-c629038734="" class="message" id="${id}" ${formatted ? 'data-formatted="1" data-gowo-message-time="18:11:23"' : ''}>
    <div _ngcontent-ng-c629038734="" class="user d-flex justify-content-between align-items-center w-100">
      <div _ngcontent-ng-c629038734="" class="d-flex w-100">
        <a target="_blank" href="/user/id-example"><div class="position-relative">
          <app-picture><picture><img alt="Гость Пример" title="Гость Пример" src="/assets/images/photo_none_man.png"></picture></app-picture>
        </div></a>
        <div _ngcontent-ng-c629038734="" class="text ms-2">
          <div class="header-message">${omitNickname ? '' : `<p class="mb-0">${formatted ? 'Гость:' : 'Гость Пример'}</p>`}
            <ul class="list-unstyled actions"><li><app-icon-undo></app-icon-undo></li></ul>
          </div>
          <div class="w-100 gowo-emote-only">${formatted ? Array.from({ length: 3 }, () => '<img class="gowo-chat-emote" src="https://cdn.7tv.app/emote/01F6NPP6YG00013ACMMJP3W06V/2x.webp" alt="peepoLove" title=":peepolove:">').join(' ') : ':peepolove: :peepolove: :peepolove:'}</div>
        </div>
      </div>
    </div>
  </div>`;

function harness({ database = new IDBFactory(), room = 'room-a', content = '', html, clock = { now: 1800000000000 } } = {}) {
    const dom = parseHTML(`<!doctype html><html><head></head><body>${html ?? chat(content)}</body></html>`);
    const { document } = dom;
    const listeners = new Map(), observers = [], resizes = [], frames = [];
    const wrappedStyles = new WeakSet();
    const metrics = { extra: 0 };
    const window = {
        document, location: new URL(`https://gowo.io/orooms/${room}?platform=turbo`), indexedDB: database,
        confirm: () => true,
        addEventListener(type, callback) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(callback);
        },
        ResizeObserver: class {
            constructor(callback) { resizes.push(callback); }
            observe() {}
            disconnect() {}
        }
    };
    window.self = window.top = window;
    const storage = { getItem: () => null, setItem() {} };
    const setupDom = () => {
        for (const wrapper of document.querySelectorAll('.messages-wrapper')) {
            if (wrapper.fixtureMetrics) continue;
            wrapper.fixtureMetrics = true;
            let top = 0;
            Object.defineProperties(wrapper, {
                clientHeight: { get: () => 100 },
                scrollHeight: { get: () => Math.max(100, wrapper.querySelectorAll('.message').length * 30 + metrics.extra) },
                scrollTop: { get: () => top, set: value => { top = Math.max(0, Math.min(value, wrapper.scrollHeight - 100)); } }
            });
        }
        for (const author of document.querySelectorAll('.text__reply__name, .reply__content .name')) {
            if (wrappedStyles.has(author)) continue;
            wrappedStyles.add(author);
            const style = author.style, priorities = new Map();
            Object.defineProperty(author, 'style', { value: new Proxy(style, {
                get(target, property) {
                    if (property === 'setProperty') return (name, value, priority = '') => {
                        priorities.set(name, priority);
                        style.setProperty(name, value);
                    };
                    if (property === 'getPropertyPriority') return name => priorities.get(name) || '';
                    return target[property];
                }
            }) });
        }
    };
    setupDom();
    const context = vm.createContext({
        window, document, URL, console, crypto: webcrypto, TextEncoder, Intl,
        Date: class extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } },
        HTMLDivElement: dom.HTMLDivElement, HTMLIFrameElement: dom.HTMLIFrameElement, CustomEvent: dom.CustomEvent,
        NodeFilter: { SHOW_TEXT: 4 }, localStorage: storage, sessionStorage: storage,
        requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
        cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
        MutationObserver: class {
            constructor(callback) { observers.push(callback); }
            observe() {}
        }
    });
    vm.runInContext(runtime, context);
    const h = {
        document, window, database, clock, metrics,
        apply(records = []) { setupDom(); for (const callback of observers) callback(records); },
        emit(type, event = {}) { for (const callback of listeners.get(type) || []) callback(event); },
        resize() { for (const callback of resizes) callback(); },
        event(element, type, props = {}) {
            const event = new dom.Event(type);
            Object.assign(event, props);
            element.dispatchEvent(event);
        },
        add(id, text, author, quoted) {
            const holder = document.createElement('div');
            holder.innerHTML = message(id, text, author, quoted);
            document.querySelector('.messages').append(holder.firstElementChild);
            h.apply();
        },
        async settle() {
            for (let i = 0; i < 15; i++) {
                await new Promise(resolve => setImmediate(resolve));
                h.apply();
                let count = 0;
                while (frames.length) {
                    if (++count > 30) throw new Error('Unbounded scrolling loop');
                    frames.shift()();
                }
            }
        }
    };
    return h;
}

async function stored(database, alias = 'room-a', value) {
    const db = await new Promise((resolve, reject) => {
        const request = database.open('gowo-plus-chat-history', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('rooms', { keyPath: 'room' });
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
    return new Promise((resolve, reject) => {
        const tx = db.transaction('rooms', value ? 'readwrite' : 'readonly');
        const request = value ? tx.objectStore('rooms').put(value) : tx.objectStore('rooms').get(alias);
        tx.oncomplete = () => { resolve(request.result); db.close(); };
        tx.onabort = () => reject(tx.error);
    });
}

test('reload restores room messages, full-name colours, quotes, emotes and first-seen timestamps', async () => {
    const first = harness({ content: message('m1', 'Hello :pog:', 'Руслан Эммм', quote) });
    await first.settle();
    const data = await stored(first.database);
    assert.equal(data.messages.length, 1);
    assert.equal(data.messages[0].author, 'Руслан Эммм');
    assert.equal(data.messages[0].reply.author, 'Друг Другов');
    assert.equal(data.messages[0].parts[0].text, 'Hello :pog:');
    const reload = harness({ database: first.database, clock: { now: first.clock.now + 86400000 } });
    await reload.settle();
    const saved = reload.document.querySelector('[data-gowo-history-id="m1"]');
    assert.ok(saved);
    assert.equal(saved.querySelector('.header-message p').textContent, 'Руслан:');
    assert.equal(saved.querySelector('.header-message p').style.color, first.document.querySelector('#m1 .header-message p').style.color);
    assert.equal(saved.querySelector('.text__reply__name').textContent, 'Друг');
    assert.equal(saved.querySelectorAll('.gowo-chat-emote').length, 2);
    assert.equal(saved.dataset.gowoMessageTime, new Date(first.clock.now).toLocaleString());
    // Restored messages offer reply, never Gowo's delete handler.
    assert.deepEqual([...saved.querySelectorAll('.actions button')].map(button => button.title), ['Reply']);
    assert.equal((await stored(first.database)).messages.length, 1);
});

test('real-shaped 225-character IDs save both messages intact and survive reload at the bottom', async () => {
    assert.equal(nativeId('1').length, 225);
    assert.equal(nativeId('1').slice(0, 200), nativeId('2').slice(0, 200));
    const h = harness({ content: nativeMessage(nativeId('1')) + nativeMessage(nativeId('2')) });
    await h.settle();
    const data = await stored(h.database);
    assert.deepEqual(data?.messages.map(entry => entry.id), [nativeId('1'), nativeId('2')]);
    assert.match(h.document.querySelector('.gowo-history-status').textContent, /Сохранено: 2 \/ 1000/);
    assert.equal(data.messages[0].parts[0].text, ':peepolove: :peepolove: :peepolove:');
    const reload = harness({ database: h.database });
    reload.metrics.extra = 150;
    await reload.settle();
    assert.equal(reload.document.querySelectorAll('.gowo-history-message').length, 2);
    assert.equal(reload.document.querySelectorAll('.gowo-history-message .gowo-chat-emote').length, 6);
    const wrapper = reload.document.querySelector('.messages-wrapper');
    assert.equal(wrapper.scrollTop, wrapper.scrollHeight - wrapper.clientHeight);
});

test('already-formatted native messages recover full author names from avatar labels', async () => {
    const h = harness({ content: nativeMessage(nativeId('1'), true) + nativeMessage(nativeId('2'), true, true) });
    await h.settle();
    assert.deepEqual((await stored(h.database))?.messages.map(entry => entry.author), ['Гость Пример', 'Гость Пример']);
    const reload = harness({ database: h.database });
    await reload.settle();
    assert.deepEqual([...reload.document.querySelectorAll('.gowo-history-message .header-message p')].map(el => el.textContent), ['Гость:', 'Гость:']);
});

test('long IDs are deduplicated without truncation and remain cleared after native replay', async () => {
    const first = harness({ content: nativeMessage(nativeId('1')) + nativeMessage(nativeId('2')) });
    await first.settle();
    const replay = harness({ database: first.database, content: nativeMessage(nativeId('2')) });
    await replay.settle();
    assert.equal(replay.document.querySelectorAll('.message').length, 2);
    assert.deepEqual([...replay.document.querySelectorAll('.gowo-history-message')].map(el => el.dataset.gowoHistoryId), [nativeId('1')]);
    replay.clock.now += 100;
    replay.document.querySelector('.gowo-history-setting button').click();
    await replay.settle();
    assert.equal((await stored(first.database)).messages.length, 0);
    const cleared = harness({ database: first.database, content: nativeMessage(nativeId('1')) + nativeMessage(nativeId('2')), clock: { now: replay.clock.now + 100 } });
    await cleared.settle();
    assert.equal((await stored(first.database)).messages.length, 0);
    assert.deepEqual((await stored(first.database)).ignoredIds.sort(), [nativeId('1'), nativeId('2')]);
});

test('opaque IDs can be longer than the reported example while oversized records remain bounded', async () => {
    const validId = 'c'.repeat(4096);
    const h = harness({ content: message(validId) + message('d'.repeat(32769)) });
    await h.settle();
    assert.deepEqual((await stored(h.database))?.messages.map(entry => entry.id), [validId]);
    const reload = harness({ database: h.database });
    await reload.settle();
    assert.equal(reload.document.querySelector('.gowo-history-message')?.dataset.gowoHistoryId, validId);
});

test('deduplication uses message IDs, not identical text; native replay keeps its original timestamp', async () => {
    const first = harness({ content: message('m1') + message('m2') });
    await first.settle();
    const reload = harness({ database: first.database, content: message('m2'), clock: { now: first.clock.now + 10000 } });
    await reload.settle();
    assert.equal(reload.document.querySelectorAll('.message').length, 2);
    assert.equal(reload.document.querySelectorAll('[data-gowo-history-id="m2"]').length, 0);
    assert.equal(reload.document.querySelector('#m2').dataset.gowoMessageTime, new Date(first.clock.now).toLocaleString());
    assert.equal((await stored(first.database)).messages.length, 2);
});

test('room keys ignore player query parameters but never mix different rooms', async () => {
    const a = harness({ content: message('a', 'Room A') });
    await a.settle();
    const b = harness({ database: a.database, room: 'room-b', content: message('b', 'Room B') });
    await b.settle();
    assert.equal(b.document.querySelector('[data-gowo-history-id="a"]'), null);
    b.window.location.search = '?platform=alloha';
    await b.settle();
    assert.equal((await stored(a.database, 'room-a')).messages[0].id, 'a');
    assert.equal((await stored(a.database, 'room-b')).messages[0].id, 'b');
});

test('late chat mount and SPA navigation do not capture outgoing room DOM', async () => {
    const h = harness({ html: '' });
    h.document.body.innerHTML = chat(message('a', 'Room A'));
    await h.settle();
    h.window.location.pathname = '/orooms/room-b';
    await h.settle();
    assert.equal(await stored(h.database, 'room-b'), undefined);
    h.document.body.innerHTML = chat(message('b', 'Room B'));
    await h.settle();
    assert.deepEqual((await stored(h.database, 'room-b')).messages.map(entry => entry.id), ['b']);
});

test('native pruning preserves missing old messages without duplicate restoration', async () => {
    const h = harness({ content: message('m1') + message('m2') });
    await h.settle();
    h.document.querySelector('#m1').remove();
    await h.settle();
    assert.equal(h.document.querySelectorAll('[data-gowo-history-id="m1"]').length, 1);
    h.add('m1');
    await h.settle();
    assert.equal(h.document.querySelectorAll('[data-gowo-history-id="m1"]').length, 0);
});

test('restored history follows the welcome notice and precedes the live message insertion anchor', async () => {
    const first = harness({ content: message('saved') });
    await first.settle();
    const h = harness({ database: first.database, content: '<div class="welcome">Welcome</div><!--live messages-->' });
    await h.settle();
    const list = h.document.querySelector('.messages');
    assert.equal(list.firstElementChild.className, 'welcome');
    assert.equal(list.lastElementChild.className, 'gowo-chat-history');
    assert.equal(list.lastChild.nodeType, 8);
    assert.equal(list.querySelector('.gowo-history-heading'), null);
    assert.ok([...list.querySelector('.gowo-chat-history').children].every(el => el.classList.contains('message')));
    assert.ok(h.document.querySelector('.gowo-history-setting button')); // Management stays in Settings, not the transcript.
});

test('an observed native deletion is removed from the archive rather than resurrected after reload', async () => {
    const h = harness({ content: message('m1') + message('m2') });
    await h.settle();
    const original = h.document.querySelector('#m1');
    const list = original.parentElement;
    const deleted = h.document.createElement('div');
    deleted.className = 'message';
    deleted.innerHTML = '<div><div class="text text-muted">Сообщение удалено</div></div>';
    original.replaceWith(deleted);
    h.apply([{ target: list, removedNodes: [original], addedNodes: [deleted] }]);
    await h.settle();
    assert.deepEqual((await stored(h.database)).messages.map(entry => entry.id), ['m2']);
    const reload = harness({ database: h.database });
    await reload.settle();
    assert.equal(reload.document.querySelector('[data-gowo-history-id="m1"]'), null);
});

test('native GIF and safe links survive, while untrusted stored HTML/URLs are not replayed', async () => {
    const h = harness({ content: message('gif', '<img alt="gif" src="https://media.giphy.com/media/example/giphy.gif"><a href="https://example.com/path">Example</a>').replace('<div class="header-message"><p>Руслан Эммм</p></div>', '<p>Руслан Эммм</p>') });
    await h.settle();
    const data = await stored(h.database);
    assert.equal(data.messages[0].parts[0].type, 'image');
    data.messages[0].parts.push({ type: 'text', text: '<script>bad()</script>' }, { type: 'image', url: 'https://evil.example/pixel', text: 'blocked' }, { type: 'link', url: 'javascript:bad()', text: 'unsafe link' });
    await stored(h.database, 'room-a', data);
    const reload = harness({ database: h.database });
    await reload.settle();
    const archive = reload.document.querySelector('.gowo-chat-history');
    assert.equal(archive.querySelectorAll('img').length, 1);
    assert.equal(archive.querySelectorAll('a').length, 1);
    assert.equal(archive.querySelector('script'), null);
    assert.match(archive.textContent, /<script>bad\(\)<\/script>/);
    assert.equal(archive.querySelector('a').getAttribute('rel'), 'nofollow noopener noreferrer');
});

test('clear affects only this room and does not immediately re-save visible messages or resurrect them in another tab', async () => {
    const a = harness({ content: message('a') });
    await a.settle();
    const another = harness({ database: a.database, content: message('a') });
    const b = harness({ database: a.database, room: 'room-b', content: message('b') });
    await another.settle();
    await b.settle();
    a.clock.now += 100;
    a.document.querySelector('.gowo-history-setting button').click();
    await a.settle();
    assert.equal((await stored(a.database)).messages.length, 0);
    assert.ok(a.document.querySelector('#a')); // Native live messages are not deleted.
    another.emit('focus');
    await another.settle();
    assert.equal((await stored(a.database)).messages.length, 0);
    assert.equal((await stored(a.database, 'room-b')).messages.length, 1);
    a.clock.now += 100;
    a.add('new', 'After clearing');
    await a.settle();
    assert.deepEqual((await stored(a.database)).messages.map(entry => entry.id), ['new']);
    const reload = harness({ database: a.database, content: message('a'), clock: a.clock });
    await reload.settle();
    assert.deepEqual((await stored(a.database)).messages.map(entry => entry.id), ['new']);
});

test('declining clear confirmation preserves the saved transcript', async () => {
    const h = harness({ content: message('m1') });
    await h.settle();
    h.window.confirm = () => false;
    h.document.querySelector('.gowo-history-setting button').click();
    await h.settle();
    assert.equal((await stored(h.database)).messages.length, 1);
});

test('transactional writes from two tabs merge IDs instead of overwriting each other', async () => {
    const database = new IDBFactory();
    const a = harness({ database, content: message('a') });
    const b = harness({ database, content: message('b') });
    await Promise.all([a.settle(), b.settle()]);
    assert.deepEqual((await stored(database)).messages.map(entry => entry.id).sort(), ['a', 'b']);
});

test('per-room retention is bounded to the newest 1000 messages', async () => {
    const database = new IDBFactory();
    await stored(database, 'room-a', { room: 'room-a', clearedAt: 0, ignoredIds: [], messages: Array.from({ length: 1000 }, (_, i) => ({ id: `m${i}`, author: 'Test', receivedAt: i + 1, parts: [{ type: 'text', text: String(i) }], reply: null })) });
    const h = harness({ database, content: message('latest') });
    await h.settle();
    const messages = (await stored(database)).messages;
    assert.equal(messages.length, 1000);
    assert.equal(messages[0].id, 'm1');
    assert.equal(messages.at(-1).id, 'latest');
});

test('reload starts at the latest messages, including late image/layout growth, without fighting upward scrolling', async () => {
    const first = harness({ content: Array.from({ length: 12 }, (_, i) => message(`m${i}`)).join('') });
    await first.settle();
    const h = harness({ database: first.database });
    await h.settle();
    const wrapper = h.document.querySelector('.messages-wrapper');
    assert.equal(wrapper.scrollTop, wrapper.scrollHeight - wrapper.clientHeight);
    h.metrics.extra = 150;
    h.resize();
    await h.settle();
    assert.equal(wrapper.scrollTop, wrapper.scrollHeight - wrapper.clientHeight);
    h.event(wrapper, 'wheel', { deltaY: -100 });
    wrapper.scrollTop = 30;
    h.event(wrapper, 'scroll');
    h.metrics.extra += 150;
    h.resize();
    await h.settle();
    assert.equal(wrapper.scrollTop, 30);
    wrapper.scrollTop = wrapper.scrollHeight;
    h.event(wrapper, 'scroll');
    h.metrics.extra += 150;
    h.resize();
    await h.settle();
    assert.equal(wrapper.scrollTop, wrapper.scrollHeight - wrapper.clientHeight);
});

test('blocked storage shows a settings error but leaves chat formatting and initial scrolling working', async () => {
    const h = harness({ database: null, content: Array.from({ length: 6 }, (_, i) => message(`m${i}`)).join('') });
    await h.settle();
    assert.match(h.document.querySelector('.gowo-history-status').textContent, /Хранилище недоступно/);
    assert.equal(h.document.querySelector('#m0 .header-message p').textContent, 'Руслан:');
    const wrapper = h.document.querySelector('.messages-wrapper');
    assert.equal(wrapper.scrollTop, wrapper.scrollHeight - 100);
});

const grouping = h => [...h.document.querySelectorAll('.messages .message')].map(element => ({
    id: element.dataset.gowoHistoryId || element.id,
    consecutive: element.classList.contains('gowo-consecutive-message'),
    name: element.querySelector('.header-message > p')?.textContent
}));

test('restored messages group consecutive full author names, including emotes and replies', async () => {
    const first = harness({ content:
        message('m1', 'Tea :teatime:', 'Руслан Эммм') +
        message('m2', ':peepohappy: :teatime:', 'Руслан Эммм', quote) +
        message('m3', 'Different person, same first name', 'Руслан Другой') +
        message('m4', 'First person again', 'Руслан Эммм')
    });
    await first.settle();
    const reload = harness({ database: first.database });
    await reload.settle();
    assert.deepEqual(grouping(reload).map(row => row.consecutive), [false, true, false, false]);
    assert.deepEqual(grouping(reload).map(row => row.name), ['Руслан:', 'Руслан:', 'Руслан:', 'Руслан:']);
    assert.equal(reload.document.querySelector('[data-gowo-history-id="m2"] .text__reply__name').textContent, 'Друг');
    assert.equal(reload.document.querySelector('[data-gowo-history-id="m2"]').querySelectorAll('.gowo-chat-emote').length, 3);
    const before = reload.document.querySelector('.messages').innerHTML;
    await reload.settle();
    assert.equal(reload.document.querySelector('.messages').innerHTML, before, 'repeated passes preserve grouping');
});

test('grouping crosses the restored/live boundary and continues for new arrivals', async () => {
    const first = harness({ content: message('m1') + message('m2') });
    await first.settle();
    const reload = harness({ database: first.database, content: message('m2') });
    await reload.settle();
    assert.deepEqual(grouping(reload).map(row => [row.id, row.consecutive]), [['m1', false], ['m2', true]]);
    reload.add('m3');
    reload.add('m4', 'Another sender', 'Друг Другов');
    reload.add('m5', 'Another from that sender', 'Друг Другов');
    await reload.settle();
    assert.deepEqual(grouping(reload).map(row => row.consecutive), [false, true, true, false, true]);
    assert.deepEqual((await stored(first.database)).messages.map(entry => entry.author),
        ['Руслан Эммм', 'Руслан Эммм', 'Руслан Эммм', 'Друг Другов', 'Друг Другов']);
});

test('clearing restored messages reveals the first live sender name again', async () => {
    const first = harness({ content: message('m1') + message('m2') });
    await first.settle();
    const reload = harness({ database: first.database, content: message('m2') });
    await reload.settle();
    assert.equal(grouping(reload)[1].consecutive, true);
    reload.clock.now += 100;
    reload.document.querySelector('.gowo-history-setting button').click();
    await reload.settle();
    assert.deepEqual(grouping(reload), [{ id: 'm2', consecutive: false, name: 'Руслан:' }]);
});

test('group leader changes preserve live name and crown nodes when history storage is unavailable', async () => {
    const withCrown = id => message(id).replace('<p>', '<app-icon-crown></app-icon-crown><p>');
    const h = harness({ database: null, content: withCrown('m1') + withCrown('m2') });
    await h.settle();
    const second = h.document.querySelector('#m2');
    const name = second.querySelector('.header-message p');
    const crown = second.querySelector('app-icon-crown');
    assert.equal(grouping(h)[1].consecutive, true);
    assert.ok(name);
    assert.ok(crown);
    h.document.querySelector('#m1').remove();
    await h.settle();
    assert.equal(grouping(h)[0].consecutive, false);
    assert.equal(second.querySelector('.header-message p'), name);
    assert.equal(second.querySelector('app-icon-crown'), crown);
});

test('system messages and replacement room transcripts start new sender groups', async () => {
    const h = harness({ content: message('m1') + '<div class="message">System notice</div>' + message('m2') });
    await h.settle();
    assert.deepEqual(grouping(h).map(row => row.consecutive), [false, false, false]);
    h.window.location.pathname = '/orooms/room-b';
    h.apply();
    h.document.body.innerHTML = chat(message('b1') + message('b2'));
    await h.settle();
    assert.deepEqual(grouping(h).map(row => row.consecutive), [false, true]);
});

const composerChat = content => `<app-chat-messages-room><div class="messages-wrapper"><div class="messages">${content}</div></div>
  <form class="form-message"><p class="writing-message">Полина Гончарова печатает сообщение</p>
    <div class="chat-footer"><div class="d-flex"><div class="textarea"><textarea></textarea></div></div></div>
  </form></app-chat-messages-room>${settings}`;

test('restored messages reply through a Gowo-style bar and queue the quote for the next send', async () => {
    const first = harness({ content: message('m1', 'Hello :pog:', 'Руслан Эммм') });
    await first.settle();
    const reload = harness({ database: first.database, html: composerChat('') });
    const input = reload.document.querySelector('textarea');
    input.setSelectionRange = () => {};
    const queued = [];
    reload.document.addEventListener('gowo-plus-history-reply', event => queued.push(event.detail));
    await reload.settle();
    reload.document.querySelector('[data-gowo-history-id="m1"] .actions button').click();
    const bar = reload.document.getElementById('gowo-history-reply');
    assert.ok(bar);
    assert.equal(bar.nextElementSibling, reload.document.querySelector('.chat-footer'));
    assert.equal(bar.querySelector('.name').textContent, 'Руслан');
    assert.equal(bar.querySelectorAll('.gowo-chat-emote').length, 1);
    assert.deepEqual(JSON.parse(queued.at(-1)), {
        from: { name: 'Руслан', surname: 'Эммм' },
        content: { id: 'm1', type: 'text', message: 'Hello :pog:' }
    });
    bar.querySelector('button').click();
    assert.equal(reload.document.getElementById('gowo-history-reply'), null);
    assert.equal(queued.at(-1), '');
});

test('the typing notice reads "<name> печатает..." and keeps it while sliding shut', async () => {
    const h = harness({ html: composerChat('') });
    await h.settle();
    const notice = h.document.querySelector('.writing-message');
    assert.equal(notice.dataset.gowoTyping, 'Полина Гончарова печатает...');
    assert.ok(notice.classList.contains('gowo-typing-active'));
    notice.textContent = '';
    h.apply();
    assert.equal(notice.classList.contains('gowo-typing-active'), false);
    assert.equal(notice.dataset.gowoTyping, 'Полина Гончарова печатает...');
});

test('the page hook adds a queued quote to the next socket message only', () => {
    const source = runtime.slice(runtime.indexOf('    function pageHistoryReplyBridge('),
        runtime.indexOf('    function installHistoryReplyBridge('));
    const document = new EventTarget();
    const sent = [];
    class WebSocket { send(data) { sent.push(data); } }
    const context = vm.createContext({ document, WebSocket, CustomEvent: class extends Event {
        constructor(type, options = {}) { super(type); this.detail = options.detail; }
    }, JSON });
    vm.runInContext(`${source}\npageHistoryReplyBridge('reply', 'sent');`, context);
    let sentEvents = 0;
    document.addEventListener('sent', () => sentEvents++);
    const reply = { from: { name: 'Руслан', surname: '' }, content: { id: 'm1', type: 'text', message: 'Hi' } };
    const socket = new WebSocket();
    socket.send('42["typing","room-a"]');
    document.dispatchEvent(new context.CustomEvent('reply', { detail: JSON.stringify(reply) }));
    socket.send('2');
    socket.send('4213["message",{"message":{"type":"text","message":"yo"},"alias":"room-a"}]');
    socket.send('42["message",{"message":{"type":"text","message":"again"},"alias":"room-a"}]');
    assert.equal(sent[0], '42["typing","room-a"]');
    assert.equal(sent[1], '2');
    assert.deepEqual(JSON.parse(sent[2].slice(4)), ['message', {
        message: { type: 'text', message: 'yo' }, alias: 'room-a', reply
    }]);
    assert.ok(sent[2].startsWith('4213['));
    assert.equal(JSON.parse(sent[3].slice(2))[1].reply, undefined);
    assert.equal(sentEvents, 1);
});

test('an emptied system notice between two messages neither shows nor splits the sender group', async () => {
    const system = '<div class="message" id="s1"><div><div class="text text-muted">Руслан Эммм присоединился</div></div></div>';
    const h = harness({ content: message('m1', 'агаа') + system + message('m2', 'интересно') });
    await h.settle();
    assert.ok(h.document.getElementById('s1').classList.contains('gowo-empty-message'));
    assert.ok(h.document.getElementById('m2').classList.contains('gowo-consecutive-message'));
    assert.equal(h.document.getElementById('m1').classList.contains('gowo-consecutive-message'), false);
});

test('owner and admin crowns are saved and drawn on restored messages, hidden when grouped', async () => {
    const crowned = (id, text, crown) => message(id, text, 'Полина Гончарова')
        .replace('<div class="text">', `<app-icon-crown${crown === 'admin' ? ' class="white-crown"' : ''}></app-icon-crown><div class="text">`);
    const first = harness({ content: crowned('m1', 'согласна', 'owner') + crowned('m2', 'ну она гг', 'owner') +
        message('m3', 'а вдруг)', 'Руслан Эммм') + crowned('m4', 'hi', 'admin') });
    await first.settle();
    const data = await stored(first.database);
    assert.deepEqual(data.messages.map(entry => entry.crown), ['owner', 'owner', undefined, 'admin']);
    const reload = harness({ database: first.database });
    await reload.settle();
    const restored = id => reload.document.querySelector(`[data-gowo-history-id="${id}"]`);
    assert.equal(restored('m1').querySelector('.gowo-history-crown path').getAttribute('fill'), '#FBC658');
    assert.ok(restored('m2').classList.contains('gowo-consecutive-message'));
    assert.equal(restored('m3').querySelector('.gowo-history-crown'), null);
    assert.equal(restored('m4').querySelector('.gowo-history-crown path').getAttribute('fill'), '#fff');
});
