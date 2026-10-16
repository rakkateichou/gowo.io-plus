import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const fixture = `
  <app-chat-messages-room><div class="h-100 d-flex flex-column">
    <div class="messages-wrapper"><div class="messages"></div></div>
    <div class="form-message w-100"><div class="chat-footer"><div class="d-flex w-100">
      <div class="textarea w-100 m-0 position-relative"><label class="w-100">
        <textarea class="w-100" rows="1" maxlength="1500"></textarea>
      </label></div>
    </div></div></div>
  </div></app-chat-messages-room>`;

// Linkedom has no layout: a line holds 25 characters per 200px of width, 23px
// tall, inside 5px of padding above and below and a 1px border.
function harness() {
    const dom = parseHTML(`<!doctype html><html><head></head><body>${fixture}</body></html>`);
    const { document } = dom;
    const lines = (text, width) => text.split('\n')
        .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / (25 * width / 200))), 0);
    const createElement = document.createElement.bind(document);
    document.createElement = (name, ...rest) => {
        const element = createElement(name, ...rest);
        if (String(name).toLowerCase() === 'textarea') {
            Object.defineProperty(element, 'scrollHeight', {
                get() { return lines(this.value, parseFloat(this.style.width)) * 23 + 10; }
            });
        }
        return element;
    };
    const input = document.querySelector('textarea');
    let width = 200;
    Object.defineProperty(input, 'offsetWidth', { get: () => width });
    const metrics = {
        fontFamily: 'Open Sans', fontSize: '13px', fontWeight: '400', fontStyle: 'normal', lineHeight: '23px',
        letterSpacing: 'normal', wordSpacing: '0px', textTransform: 'none', textIndent: '0px', tabSize: '8',
        boxSizing: 'border-box', paddingTop: '5px', paddingRight: '8px', paddingBottom: '5px', paddingLeft: '8px',
        borderTopWidth: '1px', borderRightWidth: '1px', borderBottomWidth: '1px', borderLeftWidth: '1px',
        minHeight: '36px'
    };
    const frames = [];
    const resizers = [];
    const observers = [];
    const window = {
        document, location: new URL('https://gowo.io/orooms/fixture'), addEventListener() {},
        getComputedStyle: () => metrics,
        ResizeObserver: class {
            constructor(callback) { this.callback = callback; resizers.push(this); }
            observe(target) { this.target = target; }
            disconnect() {}
        }
    };
    window.self = window.top = window;
    const storage = { getItem: () => null, setItem() {} };
    const context = vm.createContext({
        window, document, URL, console, crypto: webcrypto, TextEncoder, Intl,
        HTMLDivElement: dom.HTMLDivElement, HTMLIFrameElement: dom.HTMLIFrameElement,
        NodeFilter: { SHOW_TEXT: 4 }, localStorage: storage, sessionStorage: storage,
        requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
        cancelAnimationFrame() {}, setTimeout: () => 1, setInterval: () => 1, clearTimeout() {},
        MutationObserver: class {
            constructor(callback) { observers.push(callback); }
            observe() {}
        }
    });
    vm.runInContext(runtime, context);
    const Event = document.defaultView?.Event || globalThis.Event;
    return {
        document, input,
        apply: () => observers.forEach(callback => callback([])),
        type(value) {
            input.value = value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        },
        key(key) { input.dispatchEvent(Object.assign(new Event('keydown', { bubbles: true }), { key })); },
        frame() { for (const callback of frames.splice(0)) callback(); },
        resize(next) {
            width = next;
            for (const observer of resizers) if (observer.target === input) observer.callback([]);
        },
        height: () => input.style.height,
        scrolls: () => input.classList.contains('gowo-composer-scrolls')
    };
}

test('the message field grows with its text up to six lines, then scrolls', () => {
    const h = harness();
    h.apply();
    assert.equal(h.height(), '36px', 'one line keeps the usual height');

    h.type('first line\nsecond line\nthird');
    assert.deepEqual([h.height(), h.scrolls()], ['81px', false]);
    // One long line wraps the same way at this width.
    h.type('x'.repeat(60));
    assert.equal(h.height(), '81px');
    h.type(Array.from({ length: 9 }, (_, i) => `line ${i}`).join('\n'));
    assert.deepEqual([h.height(), h.scrolls()], ['150px', true], 'six lines at most');
    h.type('short');
    assert.deepEqual([h.height(), h.scrolls()], ['36px', false]);
});

test('the field shrinks back when Gowo empties it after sending, and rewraps when narrower', () => {
    const h = harness();
    h.type('first line\nsecond line');
    assert.equal(h.height(), '58px');
    // Gowo clears the value itself on Enter, without an input event.
    h.input.value = '';
    h.key('Enter');
    h.frame();
    assert.equal(h.height(), '36px');

    h.type('x'.repeat(40));
    assert.equal(h.height(), '58px');
    h.resize(100);
    assert.equal(h.height(), '104px', 'the same text on four narrower lines');
});

test('the buttons stay on the bottom line and the field only scrolls at its tallest', () => {
    const h = harness();
    const css = [...h.document.querySelectorAll('style')].map(style => style.textContent).join('\n');
    assert.match(css, /\.chat-footer > \.d-flex \{\s*align-items: flex-end!important/);
    assert.match(css, /\.textarea > label \{\s*display: block!important;\s*height: auto!important/, 'Gowo fixes it at one row');
    assert.match(css, /\.chat-footer textarea \{[^}]*overflow-y: hidden!important/);
    assert.match(css, /textarea\.gowo-composer-scrolls \{\s*overflow-y: auto!important/);
    assert.match(css, /#search-gifts-button \{[^}]*top: auto!important;\s*bottom: 8px!important/);
});
