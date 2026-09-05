import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const loader = readFileSync(new URL('../gowo.io-plus.user.js', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const runtimeUrl = 'https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/gowo.io-plus.js';
const cacheKey = 'gowo-plus-last-working-runtime-v1';
const source = body => `// Gowo.io+ runtime v1\n${body}\n// End Gowo.io+ runtime v1`;
const oldSource = source('window.runs.push("old");');
const newSource = source('window.runs.push("new");');
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness({ cached = '', root = true, frame = false, storageFails = false, safari = false } = {}) {
    const store = new Map(cached ? [[cacheKey, cached]] : []);
    const timers = new Map();
    const requests = [];
    const errors = [];
    const warnings = [];
    const observers = [];
    const messages = [];
    const events = new Map();
    let nextTimer = 0;
    let aborts = 0;
    const document = {
        documentElement: root ? { appendChild() {} } : null,
        createElement: () => ({}),
        addEventListener: (name, callback) => events.set(name, callback)
    };
    const window = {
        runs: [], document, innerWidth: 1000, innerHeight: 500,
        location: { hostname: frame ? 'player.obrut.show' : 'gowo.io' },
        addEventListener() {},
        parent: { postMessage: (...args) => messages.push(args) }
    };
    window.self = window;
    window.top = frame ? {} : window;
    const context = vm.createContext({
        window, document, URL,
        console: { warn: (...args) => warnings.push(args), error: (...args) => errors.push(args) },
        setTimeout: (callback, ms) => {
            const id = ++nextTimer;
            timers.set(id, { callback, ms });
            return id;
        },
        clearTimeout: id => timers.delete(id),
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe() {}
            disconnect() { this.disconnected = true; }
        },
        GM_getValue: (key, fallback) => {
            if (storageFails) throw new Error('Storage unavailable');
            return store.get(key) ?? fallback;
        },
        GM_setValue: (key, value) => {
            if (storageFails) throw new Error('Storage unavailable');
            store.set(key, value);
        },
        GM_xmlhttpRequest: options => {
            requests.push(options);
            return { abort() { aborts++; options.onabort(); } };
        }
    });
    if (safari) {
        context.GM = {
            getValue: async (...args) => context.readValue(...args),
            setValue: async (...args) => context.writeValue(...args)
        };
        context.readValue = context.GM_getValue;
        context.writeValue = context.GM_setValue;
        delete context.GM_getValue;
        delete context.GM_setValue;
    }
    const inject = () => vm.runInContext(loader, context);
    inject();
    return {
        window, document, store, timers, requests, errors, warnings,
        observers, events, messages, inject, get aborts() { return aborts; },
        respond(body = newSource, overrides = {}) {
            requests[0].onload({ status: 200, finalUrl: runtimeUrl, responseText: body, ...overrides });
        }
    };
}

test('fetches latest code on every new document and refreshes the private cache', async () => {
    const first = harness({ cached: oldSource });
    assert.equal(first.requests[0].anonymous, true);
    assert.equal(first.requests[0].nocache, true);
    assert.ok(first.requests[0].url.startsWith(`${runtimeUrl}?t=`));
    first.respond();
    await flush();
    assert.deepEqual(first.window.runs, ['new']);
    assert.equal(first.store.get(cacheKey), newSource);
    const second = harness({ cached: first.store.get(cacheKey) });
    const newer = source('window.runs.push("newer");');
    second.respond(newer);
    await flush();
    assert.deepEqual(second.window.runs, ['newer']);
    assert.equal(first.timers.size, 0);
});

for (const [name, body, overrides] of [
    ['HTTP error', newSource, { status: 503 }],
    ['unexpected host', newSource, { finalUrl: 'https://example.com/gowo.io-plus.js' }],
    ['unexpected path', newSource, { finalUrl: runtimeUrl.replace('/main/', '/other/') }],
    ['HTML response', '<html>upstream error</html>', {}],
    ['truncated code', '// Gowo.io+ runtime v1\nwindow.runs.push("broken");', {}],
    ['syntax error', source('function {'), {}],
    ['oversized response', source(' '.repeat(1024 * 1024)), {}]
]) {
    test(`falls back to the working copy after ${name}`, async () => {
        const h = harness({ cached: oldSource });
        h.respond(body, overrides);
        await flush();
        assert.deepEqual(h.window.runs, ['old']);
        assert.equal(h.store.get(cacheKey), oldSource);
        assert.equal(h.errors.length, 0);
    });
}

test('network failure uses cache; first installation without a cache fails clearly', async () => {
    for (const cached of ['', oldSource]) {
        const h = harness({ cached });
        h.requests[0].onerror();
        await flush();
        assert.deepEqual(h.window.runs, cached ? ['old'] : []);
        assert.equal(h.errors.length, cached ? 0 : 1);
    }
});

test('manual deadline aborts a stalled request and ignores its late response', async () => {
    const h = harness({ cached: oldSource });
    const timer = [...h.timers.values()][0];
    assert.equal(timer.ms, 2500);
    timer.callback();
    await flush();
    h.respond();
    await flush();
    assert.equal(h.aborts, 1);
    assert.deepEqual(h.window.runs, ['old']);
    assert.equal(h.store.get(cacheKey), oldSource);
});

test('duplicate injection starts only one request and one runtime', async () => {
    const h = harness();
    h.inject();
    h.respond();
    h.respond();
    await flush();
    assert.equal(h.requests.length, 1);
    assert.deepEqual(h.window.runs, ['new']);
});

test('waits for the root element before executing document-start code', async () => {
    const h = harness({ root: false });
    h.respond();
    await flush();
    assert.deepEqual(h.window.runs, []);
    h.document.documentElement = {};
    h.observers[0].callback();
    await flush();
    assert.deepEqual(h.window.runs, ['new']);
    assert.equal(h.observers[0].disconnected, true);
});

test('runtime exceptions keep the prior cache without executing a second runtime', async () => {
    const h = harness({ cached: oldSource });
    h.respond(source('window.runs.push("partial"); throw new Error("startup failed");'));
    await flush();
    assert.deepEqual(h.window.runs, ['partial']);
    assert.equal(h.store.get(cacheKey), oldSource);
    assert.equal(h.errors.length, 1);
});

test('storage failures do not prevent a successful online start', async () => {
    const h = harness({ storageFails: true });
    h.respond();
    await flush();
    assert.deepEqual(h.window.runs, ['new']);
    assert.equal(h.errors.length, 0);
    assert.equal(h.warnings.length, 2);
});

test('the actual runtime loads the player bridge and still sends fresh cursor positions', async () => {
    const h = harness({ frame: true });
    h.respond(runtime);
    await flush();
    assert.equal(h.errors.length, 0);
    h.events.get('keydown')({ code: 'KeyX', preventDefault() {} });
    h.events.get('mousemove')({ clientX: 250, clientY: 125 });
    const cursorMessages = h.messages.filter(([message]) => message.source === 'gowo-plus-cursor-bridge-v1');
    assert.equal(cursorMessages[0][0].type, 'start');
    assert.equal(cursorMessages[0][0].point, null);
    assert.equal(cursorMessages[1][0].point.x, 0.25);
    assert.equal(cursorMessages[1][0].point.y, 0.25);
    assert.equal(cursorMessages[1][1], 'https://gowo.io');
});

for (const cached of ['', oldSource]) {
    test(`Safari responseURL and async storage start and cache the runtime (${cached ? 'upgrade' : 'install'})`, async () => {
        const h = harness({ safari: true, cached });
        await flush();
        assert.equal(h.requests[0].responseType, 'text');
        h.respond(newSource, { finalUrl: undefined, responseURL: runtimeUrl });
        await flush();
        assert.deepEqual(h.window.runs, ['new']);
        assert.equal(h.store.get(cacheKey), newSource);
        assert.equal(h.errors.length, 0);
        assert.equal(h.warnings.length, 0);
    });
}

test('Safari uses its async offline cache on timeout and aborts the request', async () => {
    const h = harness({ safari: true, cached: oldSource });
    await flush();
    const timer = [...h.timers.values()][0];
    assert.equal(timer.ms, 2500);
    timer.callback();
    await flush();
    h.respond(newSource, { finalUrl: undefined, responseURL: runtimeUrl });
    await flush();
    assert.deepEqual(h.window.runs, ['old']);
    assert.equal(h.aborts, 1);
});

test('Safari storage rejections do not prevent online startup', async () => {
    const h = harness({ safari: true, storageFails: true });
    await flush();
    h.respond(newSource, { finalUrl: undefined, responseURL: runtimeUrl });
    await flush();
    assert.deepEqual(h.window.runs, ['new']);
    assert.equal(h.warnings.length, 2);
    assert.equal(h.errors.length, 0);
});

test('Safari rejects redirects outside the trusted runtime URL', async () => {
    const h = harness({ safari: true, cached: oldSource });
    await flush();
    h.respond(newSource, { finalUrl: undefined, responseURL: 'https://example.com/runtime.js' });
    await flush();
    assert.deepEqual(h.window.runs, ['old']);
    assert.equal(h.store.get(cacheKey), oldSource);
});
