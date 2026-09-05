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

function harness(frame = false, html = frame ? frameHtml : parentHtml) {
    const dom = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
    const { document } = dom;
    const listeners = new Map();
    const observers = [];
    const raf = [];
    const messages = [];
    const computedStyles = new WeakMap();
    const frameWindow = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const parentWindow = { postMessage: (message, origin) => messages.push({ message, origin }) };
    const window = {
        document, innerWidth: 1000, innerHeight: 700,
        location: new URL(frame ? frameUrl : 'https://gowo.io/fixture'),
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
        cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
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
        document, iframe, window, messages, frameWindow, parentWindow, flush,
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
    assert.equal(h.messages[0].message.warning, state.warning);
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
