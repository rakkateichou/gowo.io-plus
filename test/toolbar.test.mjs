import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const marker = 'gowo-plus-player-toolbar-v1';
const frameUrl = 'https://player.obrut.show/embed/example';
const parentHtml = `<div class="left-place"><div class="videoplayer">
  <div class="wrap-header"><div class="platforms"><button class="active">Плеер (turbo)</button><button>Плеер (alloha.tv)</button></div><app-icon-refresh-2></app-icon-refresh-2></div>
  <app-player-turbo><div class="danger-message">Администратор еще не начал просмотр</div><iframe src="${frameUrl}"></iframe></app-player-turbo>
</div></div>`;
const frameHtml = `<div id="oframeplayer">
  <pjsdiv id="player_playlist2"><pjsdiv>Episode 6</pjsdiv></pjsdiv>
  <pjsdiv id="player_playlist1"><pjsdiv>Audio language</pjsdiv></pjsdiv>
  <pjsdiv id="native-share"><pjsdiv><pjsdiv></pjsdiv></pjsdiv><pjsdiv><pjsdiv><svg><g><path d="M12.6,12.6 C11.979,12.618"></path></g></svg></pjsdiv></pjsdiv></pjsdiv>
</div>`;

function harness(frame = false, html = frame ? frameHtml : parentHtml, url = frameUrl) {
    const dom = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
    const { document } = dom;
    // Scripts the runtime injects into the page; linkedom does not run them.
    const injected = [];
    const createElement = document.createElement.bind(document);
    document.createElement = (name, ...rest) => {
        const element = createElement(name, ...rest);
        if (String(name).toLowerCase() === 'script') injected.push(element);
        return element;
    };
    const listeners = new Map();
    const observers = [];
    const raf = [];
    const timers = [];
    const messages = [];
    const computedStyles = new WeakMap();
    const frameWindow = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const parentWindow = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const window = {
        document, innerWidth: 1000, innerHeight: 700,
        location: new URL(frame ? url : 'https://gowo.io/orooms/fixture'),
        parent: parentWindow,
        getComputedStyle(element) {
            return {
                display: element.hidden ? 'none' : element.style.display || 'block',
                visibility: element.style.visibility || 'visible',
                opacity: element.style.opacity || '1',
                ...computedStyles.get(element)
            };
        },
        addEventListener(type, callback) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(callback);
        }
    };
    window.top = frame ? parentWindow : window;
    window.self = window;
    const iframe = document.querySelector('iframe');
    if (iframe) iframe.contentWindow = frameWindow;
    const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
    if (frame && document.querySelector('#oframeplayer')) {
        document.querySelector('#oframeplayer').getBoundingClientRect = () => rect(0, 0, 1000, 700);
        document.querySelector('#native-share').getBoundingClientRect = () => rect(967.5, 32.5, 0, 0);
        document.querySelector('#player_playlist2').firstElementChild.getBoundingClientRect = () => rect(12.5, 12.5, 110, 40);
        document.querySelector('#player_playlist1').firstElementChild.getBoundingClientRect = () => rect(135.5, 12.5, 290, 40);
    }
    const storage = { getItem: () => null, setItem() {} };
    const context = vm.createContext({
        window, document, URL, console, crypto: webcrypto,
        HTMLDivElement: dom.HTMLDivElement, HTMLIFrameElement: dom.HTMLIFrameElement,
        localStorage: storage, sessionStorage: storage, TextEncoder, Intl,
        requestAnimationFrame: callback => { raf.push(callback); return raf.length; },
        cancelAnimationFrame() {}, setInterval: () => 1, clearTimeout() {},
        setTimeout: callback => { timers.push(callback); return timers.length; },
        MutationObserver: class {
            constructor(callback) { this.callback = callback; observers.push(this); }
            observe() {}
            disconnect() { this.disconnected = true; }
        }
    });
    vm.runInContext(runtime, context);
    const flush = () => {
        let count = 0;
        while (raf.length) {
            if (++count > 20) throw new Error('Unbounded toolbar render loop');
            raf.shift()();
        }
    };
    return {
        document, iframe, window, messages, frameWindow, parentWindow, flush, injected,
        tick() { for (const callback of timers.splice(0)) callback(); flush(); },
        computedStyles,
        emit(type, event) { for (const listener of listeners.get(type) || []) listener(event); flush(); },
        receive(message, overrides = {}) {
            this.emit('message', {
                data: { source: marker, ...message },
                origin: frame ? 'https://gowo.io' : 'https://player.obrut.show',
                source: frame ? parentWindow : frameWindow, ...overrides
            });
        },
        mutate(target = document.body) {
            for (const observer of [...observers]) {
                if (!observer.disconnected) observer.callback([{ target }]);
            }
            flush();
        }
    };
}

const state = {
    type: 'state', platforms: [
        { label: 'Плеер (turbo)', active: true, disabled: false },
        { label: 'Плеер (alloha.tv)', active: false, disabled: false }
    ], warning: 'Администратор еще не начал просмотр', canRefresh: true
};

test('parent fits the iframe but keeps native controls until a trusted frame is ready', () => {
    const h = harness();
    const player = h.document.querySelector('.videoplayer');
    assert.ok(h.iframe.classList.contains('gowo-room-frame'));
    assert.ok(h.iframe.parentElement.classList.contains('gowo-player-host'));
    assert.equal(player.dataset.gowoToolbarReady, undefined);
    // Anyone may pause now, so the notices no longer name the administrator.
    assert.equal(h.messages[0].message.warning, 'Просмотр ещё не начат');
    assert.equal(h.messages[0].origin, 'https://player.obrut.show');
    h.receive({ type: 'ready', ready: true }, { origin: 'https://evil.example' });
    h.receive({ type: 'ready', ready: true }, { source: {} });
    assert.equal(player.dataset.gowoToolbarReady, undefined);
    h.receive({ type: 'ready', ready: true });
    assert.equal(player.dataset.gowoToolbarReady, 'true');
    h.iframe.dispatchEvent(new h.document.defaultView.Event('load'));
    assert.equal(player.dataset.gowoToolbarReady, undefined);
});

test('platform and refresh commands invoke only the original permitted controls', () => {
    const h = harness();
    let platformClicks = 0, refreshClicks = 0;
    const buttons = h.document.querySelectorAll('.platforms button');
    buttons[1].addEventListener('click', () => platformClicks++);
    h.document.querySelector('app-icon-refresh-2').addEventListener('click', () => refreshClicks++);
    h.receive({ type: 'platform', label: 'not a real platform' });
    h.receive({ type: 'platform', label: state.platforms[1].label }, { origin: 'https://evil.example' });
    buttons[1].disabled = true;
    h.receive({ type: 'platform', label: state.platforms[1].label });
    assert.equal(platformClicks, 0);
    buttons[1].disabled = false;
    h.receive({ type: 'platform', label: state.platforms[1].label });
    h.receive({ type: 'refresh' }, { source: {} });
    h.receive({ type: 'ready', ready: true });
    h.receive({ type: 'refresh' });
    assert.equal(platformClicks, 1);
    assert.equal(refreshClicks, 1);
    assert.equal(h.document.querySelector('.videoplayer').dataset.gowoToolbarReady, 'true');
});

test('native state changes propagate; no-frame and about:blank startup are safe', () => {
    const h = harness();
    h.document.querySelector('.danger-message').textContent = '';
    h.document.querySelectorAll('.platforms button')[1].disabled = true;
    h.mutate();
    assert.equal(h.messages.at(-1).message.warning, '');
    assert.equal(h.messages.at(-1).message.platforms[1].disabled, true);
    h.iframe.remove();
    h.mutate();
    h.receive({ type: 'ready', ready: true });
    assert.equal(h.document.querySelector('.videoplayer').dataset.gowoToolbarReady, undefined);
    assert.doesNotThrow(() => harness(false, parentHtml.replace(frameUrl, 'about:blank')));
});

test('frame hides native Share and keeps Refresh at the right without an empty button slot', () => {
    const h = harness(true);
    assert.equal(h.messages[0].message.type, 'request');
    h.receive(state, { origin: 'https://evil.example' });
    assert.equal(h.document.querySelector('#gowo-player-controls'), null);
    h.receive(state);
    const row = h.document.querySelector('.gowo-player-control-row');
    assert.equal(row.style.left, '433.5px');
    assert.equal(row.style.right, '60.5px');
    assert.equal(h.document.querySelector('.gowo-player-refresh').style.left, '947.5px');
    assert.equal(h.document.querySelector('select').children.length, 2);
    assert.equal(h.document.querySelector('.gowo-player-admin-notice').textContent, state.warning);
    assert.ok(h.document.querySelector('#native-share').classList.contains('gowo-native-share'));
    assert.match(h.document.querySelector('style').textContent,
        /\.gowo-native-share, \.gowo-native-share \*\s*\{\s*visibility: hidden!important; pointer-events: none!important;/);
    assert.equal(h.document.querySelector('#player_playlist1').parentElement.id, 'oframeplayer');
    assert.equal(h.messages.at(-1).message.ready, true);
    const beforeLoad = h.messages.length;
    h.receive(state); // Parent requests readiness again after iframe.onload.
    assert.equal(h.messages.length, beforeLoad + 1);
    assert.equal(h.messages.at(-1).message.ready, true);
    h.receive({ ...state, warning: '' });
    assert.ok(h.document.querySelector('.gowo-player-admin-notice').hidden);
    h.mutate();
    assert.equal(h.document.querySelectorAll('#gowo-player-controls').length, 1);
});

test('frame control events bridge actions, and missing native markup restores fallback', () => {
    const h = harness(true);
    h.receive(state);
    h.document.querySelector('.gowo-player-refresh').click();
    assert.equal(h.messages.at(-1).message.type, 'refresh');
    const select = h.document.querySelector('select');
    select.children[0].selected = false;
    select.children[1].selected = true;
    select.dispatchEvent(new h.document.defaultView.Event('change'));
    assert.equal(h.messages.at(-1).message.label, state.platforms[1].label);
    h.document.querySelector('#native-share').remove();
    h.mutate();
    assert.equal(h.document.querySelector('#gowo-player-controls'), null);
    assert.equal(h.messages.at(-1).message.ready, false);
    const unsupported = harness(true, '<div>Different player</div>');
    unsupported.receive(state);
    assert.equal(unsupported.document.querySelector('#gowo-player-controls'), null);
    assert.ok(!unsupported.messages.some(entry => entry.message.ready === true));
});

test('custom controls mirror native fading, hide without click or keyboard targets, and reappear', () => {
    const h = harness(true);
    h.receive(state);
    const controls = h.document.querySelector('#gowo-player-controls');
    const headers = [...h.document.querySelectorAll('#player_playlist1, #player_playlist2')];
    for (const opacity of ['0.6', '0', '0.4', '1']) {
        for (const header of headers) header.style.opacity = opacity;
        h.mutate(headers[0]);
        const hidden = opacity === '0';
        assert.equal(controls.style.opacity, opacity);
        assert.equal(controls.style.visibility, hidden ? 'hidden' : 'visible');
        assert.equal(controls.inert, hidden);
        assert.equal(controls.getAttribute('aria-hidden'), String(hidden));
        assert.equal(h.document.querySelector('.gowo-player-admin-notice').textContent, state.warning);
        assert.equal(h.messages.at(-1).message.ready, true);
    }
    assert.equal(h.document.querySelectorAll('#gowo-player-controls').length, 1);
});

test('native display/visibility hiding and CSS class styles are respected without moving the row', () => {
    const h = harness(true);
    h.receive(state);
    const controls = h.document.querySelector('#gowo-player-controls');
    const row = controls.querySelector('.gowo-player-control-row');
    const headers = [...h.document.querySelectorAll('#player_playlist1, #player_playlist2')];
    const left = row.style.left;
    for (const style of [{ display: 'none' }, { visibility: 'hidden' }, { opacity: '0' }]) {
        for (const header of headers) h.computedStyles.set(header, style);
        h.mutate(headers[0]);
        assert.equal(controls.style.visibility, 'hidden');
    }
    for (const header of headers) {
        h.computedStyles.delete(header);
        header.hidden = true;
        header.firstElementChild.getBoundingClientRect = () => ({ width: 0, height: 0 });
    }
    h.mutate();
    assert.equal(controls.style.visibility, 'hidden');
    assert.equal(row.style.left, left);
    headers[0].hidden = false;
    h.mutate();
    assert.equal(controls.style.visibility, 'visible');
});

test('native ancestor and header-child opacity are mirrored, excluding the shared player root', () => {
    const h = harness(true);
    h.receive(state);
    const root = h.document.querySelector('#oframeplayer');
    const wrapper = h.document.createElement('div');
    root.append(wrapper);
    for (const header of root.querySelectorAll('#player_playlist1, #player_playlist2')) {
        wrapper.append(header);
        header.firstElementChild.style.opacity = '0.5';
    }
    root.style.opacity = '0.5';
    wrapper.style.opacity = '0.5';
    h.mutate(wrapper);
    const controls = h.document.querySelector('#gowo-player-controls');
    assert.equal(controls.style.opacity, '0.25');
    wrapper.style.visibility = 'hidden';
    h.mutate(wrapper);
    assert.equal(controls.style.visibility, 'hidden');
});

test('CSS fades are sampled to completion without an endless animation loop', () => {
    const h = harness(true);
    h.receive(state);
    const headers = [...h.document.querySelectorAll('#player_playlist1, #player_playlist2')];
    let samples = 0;
    const getComputedStyle = h.window.getComputedStyle;
    h.window.getComputedStyle = element => {
        if (element === headers[0]) {
            samples++;
            for (const header of headers) h.computedStyles.set(header, { opacity: samples < 3 ? '0.5' : '0' });
        }
        return getComputedStyle(element);
    };
    headers[0].getAnimations = () => samples < 3 ? [{ playState: 'running' }] : [];
    h.mutate(headers[0]);
    assert.equal(samples, 3);
    assert.equal(h.document.querySelector('#gowo-player-controls').style.visibility, 'hidden');
    h.flush();
    assert.equal(samples, 3);
});

test('players without native episode/audio dropdowns keep the custom controls available', () => {
    const h = harness(true);
    h.document.querySelectorAll('#player_playlist1, #player_playlist2').forEach(header => header.remove());
    h.receive(state);
    const controls = h.document.querySelector('#gowo-player-controls');
    assert.equal(controls.style.opacity, '1');
    assert.equal(controls.inert, false);
});

test('a fullscreen player frame repaints the cursors forwarded by the room page', () => {
    const h = harness(true);
    const paint = (message, overrides) => h.receive({ source: 'gowo-plus-cursor-paint-v1', ...message }, overrides);
    const show = { type: 'show', client: 'abc', username: 'Руслан Эммм', point: { x: 0.5, y: 0.25 } };
    const cursors = () => [...h.document.querySelectorAll('.gowo-shared-cursor')];
    paint(show);
    assert.equal(cursors().length, 0, 'the room page paints while the frame is not fullscreen');
    const player = h.document.querySelector('#oframeplayer');
    h.document.fullscreenElement = player;
    paint(show, { origin: 'https://evil.example' });
    paint(show, { source: {} });
    assert.equal(cursors().length, 0, 'only the Gowo parent may paint');
    paint(show);
    paint({ ...show, point: { x: 0.6, y: 0.25 } });
    assert.equal(cursors().length, 1);
    assert.equal(cursors()[0].parentNode, player, 'only fullscreen descendants are visible');
    assert.equal(cursors()[0].style.left, '600px');
    assert.equal(cursors()[0].style.top, '175px');
    assert.equal(cursors()[0].querySelector('.gowo-shared-cursor-name').textContent, 'Руслан');
    assert.match(player.querySelector('.gowo-shared-cursor-trail-line').getAttribute('d'), /^M 500\.0,175\.0 L 600\.0,175\.0$/);
    assert.match([...h.document.querySelectorAll('style')].map(style => style.textContent).join(''), /\.gowo-shared-cursor \{/);
    // A long drawing keeps its beginning: it continues in further paths.
    for (let step = 1; step <= 1000; step++) {
        paint({ ...show, point: { x: 0.6 - (step % 2) * 0.2, y: 0.25 + step / 2000 } });
    }
    const lines = [...player.querySelectorAll('.gowo-shared-cursor-trail-line')];
    assert.equal(lines.length, 4);
    assert.match(lines[0].getAttribute('d'), /^M 500\.0,175\.0 /);
    assert.ok(lines.every(line => line.getAttribute('d').split(' C ').length <= 300));
    const end = path => path.getAttribute('d').split(' ').at(-1);
    assert.ok(lines[1].getAttribute('d').includes(end(lines[0])), 'each path picks up where the last one ended');
    assert.equal(end(lines[3]), '600.0,525.0');
    paint({ type: 'remove', client: 'abc' });
    assert.equal(cursors().length, 0);
    assert.equal(player.querySelector('.gowo-shared-cursor-trail'), null);
});

test('the room page forwards cursors to the player frame only while that frame is fullscreen', () => {
    const h = harness();
    const fire = (type, props) => {
        const event = new h.window.document.defaultView.Event(type, { bubbles: true, cancelable: true });
        h.document.dispatchEvent(Object.assign(event, props));
        h.flush();
    };
    h.iframe.getBoundingClientRect = () => ({ left: 100, top: 50, width: 800, height: 400, right: 900, bottom: 450 });
    const painted = () => h.messages.filter(({ message }) => message.source === 'gowo-plus-cursor-paint-v1');
    fire('keydown', { key: 'Control', code: 'ControlLeft', ctrlKey: true });
    fire('mousemove', { clientX: 300, clientY: 150 });
    assert.equal(painted().length, 0);
    assert.equal(h.document.querySelectorAll('.gowo-shared-cursor.local').length, 1);
    h.document.fullscreenElement = h.iframe;
    fire('mousemove', { clientX: 500, clientY: 250 });
    const show = painted().at(-1);
    assert.equal(show.origin, 'https://player.obrut.show');
    assert.equal(show.message.type, 'show');
    assert.equal(show.message.local, true);
    assert.deepEqual({ ...show.message.point }, { x: 0.5, y: 0.5 });
    fire('keyup', { key: 'Control', code: 'ControlLeft', ctrlKey: false });
    assert.equal(painted().at(-1).message.type, 'remove');
});

test('a viewer\'s click on the player timeline is reported instead of pausing; an owner\'s is left alone', () => {
    const html = `${frameHtml}<pjsdiv id="bar"></pjsdiv><pjsdiv id="played"></pjsdiv><pjsdiv id="tall"></pjsdiv>`;
    const run = url => {
        const h = harness(true, html, url);
        const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
        h.document.querySelector('#bar').getBoundingClientRect = () => rect(10, 640, 980, 4);
        h.document.querySelector('#played').getBoundingClientRect = () => rect(10, 640, 300, 4);
        h.document.querySelector('#tall').getBoundingClientRect = () => rect(0, 600, 1000, 100);
        h.messages.length = 0;
        const fire = (type, clientX, clientY) => {
            const event = new (h.document.defaultView?.Event || Event)(type, { bubbles: true, cancelable: true });
            Object.assign(event, { clientX, clientY, button: 0 });
            h.document.querySelector('#oframeplayer').dispatchEvent(event);
            h.flush();
            return event.defaultPrevented;
        };
        const click = (clientX, clientY) => fire('click', clientX, clientY);
        const move = (clientX, clientY) => fire('pointermove', clientX, clientY);
        return { h, click, move, seeks: () => JSON.parse(JSON.stringify(h.messages.splice(0).filter(item => item.message.type === 'seek'))) };
    };
    const viewer = run(`${frameUrl}?api=1&readonly=1`);
    assert.equal(viewer.click(500, 300), false, 'a click on the video is the player\'s own');
    assert.equal(viewer.click(255, 645), true);
    assert.equal(viewer.click(990, 636), true);
    assert.deepEqual(viewer.seeks(), [
        { message: { source: 'gowo-plus-seek-bridge-v1', type: 'seek', fraction: 0.25 }, origin: 'https://gowo.io' },
        { message: { source: 'gowo-plus-seek-bridge-v1', type: 'seek', fraction: 1 }, origin: 'https://gowo.io' }
    ]);
    assert.equal(viewer.h.document.getElementById('gowo-seek-hint')?.hidden ?? true, true, 'no length known, no time to show');
    const owner = run(`${frameUrl}?api=1&readonly=0`);
    assert.equal(owner.click(255, 645), false);
    assert.deepEqual(owner.seeks(), []);
});

test('a viewer sees a pointer and the time on the timeline, then whether the room moved there', () => {
    const html = `${frameHtml}<pjsdiv id="bar"></pjsdiv><video id="ad"></video><video id="episode"></video>`;
    const h = harness(true, html, `${frameUrl}?api=1&readonly=1`);
    h.document.querySelector('#bar').getBoundingClientRect = () => ({ left: 10, top: 640, width: 980, height: 4, right: 990, bottom: 644 });
    const media = (id, duration) => {
        const element = h.document.getElementById(id);
        Object.defineProperty(element, 'duration', { value: duration });
        Object.defineProperty(element, 'currentTime', { value: 0, writable: true });
        return element;
    };
    media('ad', 15);
    const episode = media('episode', 2704);
    const fire = (type, clientX, clientY) => {
        const event = new (h.document.defaultView?.Event || Event)(type, { bubbles: true, cancelable: true });
        Object.assign(event, { clientX, clientY, button: 0 });
        h.document.querySelector('#oframeplayer').dispatchEvent(event);
        h.flush();
    };
    const root = h.document.documentElement;
    const hint = () => h.document.getElementById('gowo-seek-hint');
    const label = () => hint().querySelector('.gowo-seek-label').textContent;

    fire('pointermove', 500, 300);
    assert.equal(root.classList.contains('gowo-seek-hover'), false);
    fire('pointermove', 255, 642);
    assert.equal(root.classList.contains('gowo-seek-hover'), true, 'a pointer over the timeline');
    assert.deepEqual([hint().hidden, hint().dataset.state, label(), hint().style.left], [false, 'hover', '11:16', '255px']);
    fire('pointermove', 990, 642);
    assert.equal(label(), '45:04');
    assert.equal(hint().querySelector('.gowo-seek-label').style.left, '-50px', 'kept inside the player');
    fire('pointermove', 500, 300);
    assert.deepEqual([root.classList.contains('gowo-seek-hover'), hint().hidden], [false, true]);

    // Clicked: waiting for the room, then confirmed once the video is there.
    fire('click', 255, 642);
    assert.deepEqual([hint().hidden, hint().dataset.state, label()], [false, 'pending', '→ 11:16']);
    fire('pointermove', 500, 300);
    assert.equal(hint().hidden, false, 'the status stays while waiting');
    h.tick();
    assert.equal(hint().dataset.state, 'pending');
    episode.currentTime = 675.5;
    h.tick();
    assert.deepEqual([hint().dataset.state, label()], ['done', '✓ 11:16']);
    h.tick();
    assert.equal(hint().hidden, true);

    // Nobody who controls the room took it up.
    fire('click', 500, 642);
    for (let check = 1; check < 40; check++) h.tick();
    assert.equal(hint().dataset.state, 'pending');
    h.tick();
    assert.deepEqual([hint().dataset.state, label()], ['failed', 'Не получилось перемотать']);
    h.tick();
    assert.equal(hint().hidden, true);
    assert.match([...h.document.querySelectorAll('style')].map(style => style.textContent).join(''), /html\.gowo-seek-hover/);
});

test('before playback the timeline still shows times, from the length the room page learned', () => {
    const html = `${frameHtml}<pjsdiv id="bar"></pjsdiv><video id="episode"></video>`;
    const h = harness(true, html, `${frameUrl}?api=1&readonly=1`);
    h.document.querySelector('#bar').getBoundingClientRect = () => ({ left: 10, top: 640, width: 980, height: 4, right: 990, bottom: 644 });
    // Not loaded yet: no length, a stale position.
    const video = h.document.getElementById('episode');
    Object.defineProperty(video, 'duration', { value: NaN });
    Object.defineProperty(video, 'currentTime', { value: 600 });
    const fire = (type, clientX, clientY) => {
        const event = new (h.document.defaultView?.Event || Event)(type, { bubbles: true, cancelable: true });
        Object.assign(event, { clientX, clientY, button: 0 });
        h.document.querySelector('#oframeplayer').dispatchEvent(event);
        h.flush();
    };
    const hint = () => h.document.getElementById('gowo-seek-hint');
    const label = () => hint().querySelector('.gowo-seek-label');
    const tell = (details, overrides = {}) => h.receive({ source: 'gowo-plus-seek-bridge-v1', type: 'player', ...details }, overrides);

    fire('pointermove', 255, 642);
    assert.deepEqual([hint().hidden, label().hidden], [false, true], 'a marker, but no time to show yet');
    tell({ duration: 2704 }, { origin: 'https://evil.example' });
    tell({ duration: 2704 }, { source: {} });
    fire('pointermove', 256, 642);
    assert.equal(label().hidden, true);
    tell({ duration: 2704 });
    fire('pointermove', 255, 642);
    assert.equal(label().textContent, '11:16');

    fire('click', 255, 642);
    assert.equal(label().textContent, '→ 11:16');
    // A position from before the click does not count, one after it does.
    h.tick();
    assert.equal(hint().dataset.state, 'pending');
    tell({ time: 676 });
    h.tick();
    assert.deepEqual([hint().dataset.state, label().textContent], ['done', '✓ 11:16']);
});

test('the player page answers every ad request as if no ad were available', () => {
    const h = harness(true);
    const [script] = h.injected.filter(element => element.textContent.includes('VAST'));
    assert.ok(script, 'injected into the player page');

    // A stand-in for the browser's XMLHttpRequest, with its text getters
    // refusing binary responses just as the real ones do.
    class FakeXhr {
        constructor(body, responseType = '', xml = null) {
            Object.assign(this, { body, responseType, xml });
        }
    }
    const binary = xhr => !['', 'text'].includes(xhr.responseType);
    Object.defineProperties(FakeXhr.prototype, {
        responseText: { configurable: true, get() { if (binary(this)) throw new Error('InvalidStateError'); return this.body; } },
        responseXML: { configurable: true, get() { if (!['', 'document'].includes(this.responseType)) throw new Error('InvalidStateError'); return this.xml; } },
        response: { configurable: true, get() { return this.responseType === 'document' ? this.xml : this.body; } }
    });
    class FakeParser {
        parseFromString(text) { return { documentElement: { localName: /<VAST/.test(text) ? 'VAST' : 'parsererror' }, text }; }
    }
    const page = vm.createContext({ XMLHttpRequest: FakeXhr, DOMParser: FakeParser });
    vm.runInContext(script.textContent, page);
    const make = (...args) => new page.XMLHttpRequest(...args);

    const vast = '<?xml version="1.0"?><VAST version="4.0"><Ad id="1"><InLine><AdSystem>X</AdSystem></InLine></Ad></VAST>';
    const vmap = '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap" version="1.0"><vmap:AdBreak/></vmap:VMAP>';
    assert.equal(make(vast).responseText, '<VAST version="3.0"></VAST>');
    assert.equal(make(vmap).responseText, '<VAST version="3.0"></VAST>');
    assert.equal(make(vast, 'text').response, '<VAST version="3.0"></VAST>');
    const doc = make(vast, '', { documentElement: { localName: 'VAST' } }).responseXML;
    assert.equal(doc.text, '<VAST version="3.0"></VAST>', 'an empty ad document');
    assert.equal(make(vast).responseXML.text, '<VAST version="3.0"></VAST>', 'also when served as plain text');
    assert.equal(make('', 'document', { documentElement: { localName: 'VMAP' } }).response.text, '<VAST version="3.0"></VAST>');

    // Everything else is left exactly as it was.
    const playlist = '#EXTM3U\n#EXT-X-VERSION:3\nsegment.ts';
    assert.equal(make(playlist).responseText, playlist);
    assert.equal(make(playlist).responseXML, null);
    const subtitles = { documentElement: { localName: 'tt' } };
    assert.equal(make('', 'document', subtitles).responseXML, subtitles);
    const segment = new ArrayBuffer(8);
    assert.equal(make(segment, 'arraybuffer').response, segment, 'video data is never read as text');
    assert.equal(make('{"title":"VAST guide"}').responseText, '{"title":"VAST guide"}');
});

test('Gowo pages refuse the floating video ad\'s scripts and frames as they are added', () => {
    const h = harness();
    const [script] = h.injected.filter(element => element.textContent.includes('vak345.com'));
    assert.ok(script, 'injected into the Gowo page');

    // Stand-ins for the page's DOM classes, so the hook has something to patch.
    class FakeNode {
        constructor() { this.children = []; }
        appendChild(node) { this.children.push(node); return node; }
        insertBefore(node) { this.children.unshift(node); return node; }
    }
    class FakeScript extends FakeNode { constructor(src = '') { super(); this.src = src; } }
    class FakeFrame extends FakeNode { constructor(src = '') { super(); this.src = src; } }
    const page = vm.createContext({
        Node: FakeNode, HTMLScriptElement: FakeScript, HTMLIFrameElement: FakeFrame, URL,
        location: { href: 'https://gowo.io/orooms/fixture' }
    });
    vm.runInContext(script.textContent, page);
    const body = new FakeNode();
    const add = (node, method = 'appendChild') => body[method](node) === node && body.children.includes(node);

    // Gowo's call for the ad's loader, and what the loader would pull in.
    assert.equal(add(new FakeScript('https://vak345.com/s.js?v=c945a95179a9bcb215c27948451092c1')), false);
    assert.equal(add(new FakeScript('https://code.moviead55.ru/toronto.js'), 'insertBefore'), false);
    assert.equal(add(new FakeFrame('https://ads.digitalcaramel.com/player.html')), false);

    // Everything else goes in as usual.
    assert.equal(add(new FakeScript('https://gowo.io/chunk-B5LL5LMC.js')), true);
    assert.equal(add(new FakeScript('https://notvak345.com/s.js'), 'insertBefore'), true);
    assert.equal(add(new FakeScript()), true, 'inline scripts');
    assert.equal(add(new FakeFrame('https://dcee7d24.obrut.show/embed/abc')), true, 'the player');
    assert.equal(add(new FakeNode()), true);
});
