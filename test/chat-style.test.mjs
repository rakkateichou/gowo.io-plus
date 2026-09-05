import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const fixture = `
  <div class="chat-header"><div class="actions">
    <img alt="settings room" src="/assets/images/settings.svg">
    <img alt="list room" src="/assets/images/playlist_room.svg">
    <img alt="users in chat" src="/assets/images/users_in_chat.svg">
  </div></div>
  <app-chat-messages-room>
    <div class="message" id="original"><div class="user">
      <div class="header-message"><p>Руслан Эммм</p></div>
      <div class="text"><div class="w-100">Original message</div></div>
    </div></div>
    <div class="message" id="response"><div class="user">
      <div class="header-message"><p>Друг Другов</p></div><div class="text">
        <div class="text__reply"><p class="text__reply__name">Руслан Эммм</p>
          <p class="text__reply__text">Quoted message from Руслан Эммм</p></div>
        <div class="w-100">Reply text</div>
      </div>
    </div></div>
    <div class="reply__content"><p class="name">Руслан Эммм</p><p class="text">Composer quote</p></div>
  </app-chat-messages-room>`;

function harness() {
    const dom = parseHTML(`<!doctype html><html><head></head><body>${fixture}</body></html>`);
    const { document } = dom;
    // Linkedom does not implement CSS declaration priorities. Model this small
    // browser API explicitly so tests also exercise !important restoration.
    for (const author of document.querySelectorAll('.text__reply__name, .reply__content .name')) {
        const style = author.style;
        const priorities = new Map();
        const nativeSet = style.setProperty.bind(style);
        const wrapper = new Proxy(style, {
            get(target, property) {
                if (property === 'setProperty') return (name, value, priority = '') => {
                    priorities.set(name, priority);
                    nativeSet(name, value);
                };
                if (property === 'getPropertyPriority') return name => priorities.get(name) || '';
                return target[property];
            }
        });
        Object.defineProperty(author, 'style', { value: wrapper });
    }
    const observers = [];
    const window = { document, location: new URL('https://gowo.io/fixture'), addEventListener() {} };
    window.self = window.top = window;
    const storage = { getItem: () => null, setItem() {} };
    const originalIcons = [...document.querySelectorAll('.chat-header img')];
    const context = vm.createContext({
        window, document, URL, console, crypto: webcrypto, TextEncoder, Intl,
        HTMLDivElement: dom.HTMLDivElement, HTMLIFrameElement: dom.HTMLIFrameElement,
        NodeFilter: { SHOW_TEXT: 4 }, localStorage: storage, sessionStorage: storage,
        requestAnimationFrame: () => 1, cancelAnimationFrame() {}, setTimeout: () => 1, clearTimeout() {},
        MutationObserver: class {
            constructor(callback) { observers.push(callback); }
            observe() {}
        }
    });
    vm.runInContext(runtime, context);
    return { document, originalIcons, apply: () => observers.forEach(callback => callback([])) };
}

test('quotes and composer previews use the first name and the same full-name color as chat', () => {
    const { document } = harness();
    const header = document.querySelector('#original .header-message p');
    assert.equal(header.textContent, 'Руслан:');
    for (const author of document.querySelectorAll('.text__reply__name, .reply__content .name')) {
        assert.equal(author.textContent, 'Руслан');
        assert.equal(author.style.color, header.style.color);
        assert.equal(author.style.getPropertyPriority('color'), 'important');
    }
    assert.equal(document.querySelector('.text__reply__text').textContent, 'Quoted message from Руслан Эммм');
    assert.equal(document.querySelector('#response .w-100').textContent, 'Reply text');
});

test('repeat passes retain the full-name color without rewriting shortened names', () => {
    const { document, apply } = harness();
    const before = document.body.innerHTML;
    apply();
    apply();
    assert.equal(document.body.innerHTML, before);
    const author = document.querySelector('.text__reply__name');
    const correctColor = author.style.color;
    author.style.setProperty('color', correctColor); // Native rerender dropped priority.
    apply();
    assert.equal(author.style.getPropertyPriority('color'), 'important');
    author.style.setProperty('color', 'white', 'important');
    apply();
    assert.equal(author.style.color, correctColor);
});

test('a reused quote node picks up a different author, including the same first name', () => {
    const { document, apply } = harness();
    const author = document.querySelector('.text__reply__name');
    const originalColor = author.style.color;
    author.textContent = 'Руслан Другой';
    apply();
    assert.equal(author.textContent, 'Руслан');
    assert.notEqual(author.style.color, originalColor);
    const updatedColor = author.style.color;
    apply();
    assert.equal(author.style.color, updatedColor);
    author.textContent = '';
    apply();
    assert.equal(author.textContent, '');
    author.textContent = 'Руслан Эммм';
    apply();
    assert.equal(author.style.color, originalColor);
});

test('ring masking preserves native header images and click handlers', () => {
    const { document, originalIcons } = harness();
    assert.deepEqual([...document.querySelectorAll('.chat-header img')], originalIcons);
    let clicks = 0;
    for (const icon of originalIcons) {
        icon.addEventListener('click', () => clicks++);
        icon.click();
    }
    assert.equal(clicks, 3);
    const css = document.querySelector('style').textContent;
    assert.match(css, /\.chat-header \.actions > img\[alt="settings room"\]/);
    assert.match(css, /mask-image: radial-gradient\(circle closest-side, #000 75%, transparent 76%\)/);
});
