import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const section = (start, end) => runtime.slice(runtime.indexOf(start), runtime.indexOf(end));
const code = section('    function isEditableElement(', '    function initPlayerCursorBridge(') +
    section('    const sevenTvEmoteGroups =', '    function renderSevenTvEmotes(') +
    section('    function insertEmoteAtCaret(', '    const hideCallButtonPreferenceKey');

function harness() {
    const dom = parseHTML(`<html><body><app-chat-messages-room><form class="form-message">
        <div class="row"><div class="textarea"><textarea></textarea></div></div>
    </form></app-chat-messages-room><p>outside</p></body></html>`);
    const { document, Event, HTMLTextAreaElement } = dom;
    const input = document.querySelector('textarea');
    input.selectionStart = input.selectionEnd = 0;
    input.maxLength = 500;
    input.setSelectionRange = (start, end) => { input.selectionStart = start; input.selectionEnd = end; };
    let selection = '';
    let stops = 0;
    // linkedom has no focus model; track it for every element.
    dom.HTMLElement.prototype.focus = function() { document.activeElement = this; };
    document.activeElement = document.body;
    const window = {
        getComputedStyle: () => ({ gridTemplateColumns: '50px 50px 50px 50px', fontSize: '8px' }),
        getSelection: () => ({ toString: () => selection })
    };
    const stored = new Map();
    const localStorage = { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, String(value)) };
    const context = vm.createContext({
        document, window, Event, HTMLTextAreaElement, localStorage,
        KeyboardEvent: class extends Event {
            constructor(type, options) { super(type, options); this.key = options.key; }
        },
        requestAnimationFrame() {},
        cursorHolding: true,
        stopCursorDrawing() { stops++; context.cursorHolding = false; }
    });
    vm.runInContext(code + '\ninjectEmotePicker();', context);
    const key = (target, options) => {
        const event = new Event('keydown', { bubbles: true, cancelable: true });
        Object.assign(event, options);
        target.dispatchEvent(event);
        return event;
    };
    return {
        document, input, context, key, stored,
        get stops() { return stops; },
        set selection(value) { selection = value; },
        get picker() { return document.getElementById('gowo-emote-picker'); },
        get options() { return [...document.querySelectorAll('.gowo-emote-option')]; }
    };
}

test('Ctrl+C focuses the chat input unless text is selected', () => {
    const h = harness();
    const body = h.document.body;
    h.selection = 'some text';
    assert.equal(h.key(body, { ctrlKey: true, code: 'KeyC', key: 'c' }).defaultPrevented, false);
    assert.notEqual(h.document.activeElement, h.input);
    h.selection = '';
    // Physical key match keeps it working on a Russian layout.
    assert.equal(h.key(body, { ctrlKey: true, code: 'KeyC', key: 'с' }).defaultPrevented, true);
    assert.equal(h.document.activeElement, h.input);
    assert.equal(h.stops, 1);
});

test('Ctrl+E opens the picker on the first emote and toggles it closed', () => {
    const h = harness();
    assert.equal(h.key(h.document.body, { ctrlKey: true, code: 'KeyE', key: 'e' }).defaultPrevented, true);
    assert.equal(h.picker.hidden, false);
    assert.equal(h.document.activeElement, h.options[0]);
    h.key(h.document.activeElement, { ctrlKey: true, code: 'KeyE', key: 'e' });
    assert.equal(h.picker.hidden, true);
    assert.equal(h.document.activeElement, h.input);
});

test('arrows move through the grid and Enter inserts the emote and closes', () => {
    const h = harness();
    h.key(h.document.body, { ctrlKey: true, code: 'KeyE' });
    const press = k => h.key(h.document.activeElement, { key: k });
    press('ArrowRight');
    assert.equal(h.document.activeElement, h.options[1]);
    press('ArrowDown');
    assert.equal(h.document.activeElement, h.options[5]);
    press('ArrowUp');
    press('ArrowLeft');
    press('ArrowLeft');
    assert.equal(h.document.activeElement, h.options[0]);
    press('End');
    assert.equal(h.document.activeElement, h.options.at(-1));
    press('Home');
    press('ArrowRight');
    const token = h.options[1].dataset.emoteToken;
    assert.equal(press('Enter').defaultPrevented, true);
    assert.equal(h.picker.hidden, true);
    assert.ok(h.input.value.includes(token));
    assert.equal(h.document.activeElement, h.input);
});

test('Shift+Enter inserts and keeps the picker open; Escape returns to the input', () => {
    const h = harness();
    h.key(h.document.body, { ctrlKey: true, code: 'KeyE' });
    const token = h.options[0].dataset.emoteToken;
    h.key(h.document.activeElement, { key: 'Enter', shiftKey: true });
    assert.equal(h.picker.hidden, false);
    assert.equal(h.document.activeElement, h.options[0]);
    assert.ok(h.input.value.includes(token));
    h.key(h.document.activeElement, { key: 'Escape' });
    assert.equal(h.picker.hidden, true);
    assert.equal(h.document.activeElement, h.input);
});

test('hovering hands the highlight to the pointer until the next arrow key', () => {
    const h = harness();
    h.key(h.document.body, { ctrlKey: true, code: 'KeyE' });
    const move = new h.context.Event('mousemove', { bubbles: true });
    h.options[2].dispatchEvent(move);
    assert.ok(h.picker.classList.contains('gowo-emote-pointer'));
    assert.equal(h.document.activeElement, h.options[2]);
    h.key(h.document.activeElement, { key: 'ArrowRight' });
    assert.equal(h.picker.classList.contains('gowo-emote-pointer'), false);
    assert.equal(h.document.activeElement, h.options[3]);
});

test('opening with the mouse focuses the grid quietly; arrows work and typing returns to chat', () => {
    const h = harness();
    h.input.focus();
    h.document.getElementById('gowo-emote-toggle').click();
    assert.equal(h.picker.hidden, false);
    assert.equal(h.document.activeElement, h.options[0]);
    assert.ok(h.picker.classList.contains('gowo-emote-pointer'));
    h.key(h.document.activeElement, { key: 'ArrowRight' });
    assert.equal(h.document.activeElement, h.options[1]);
    assert.equal(h.picker.classList.contains('gowo-emote-pointer'), false);
    assert.equal(h.key(h.document.activeElement, { key: 'a' }).defaultPrevented, false);
    assert.equal(h.document.activeElement, h.input);
    assert.equal(h.picker.hidden, false);
});

test('clicking an emote inserts it and keeps arrow navigation in the grid', () => {
    const h = harness();
    h.document.getElementById('gowo-emote-toggle').click();
    h.options[2].click();
    assert.ok(h.input.value.includes(h.options[2].dataset.emoteToken));
    assert.equal(h.document.activeElement, h.options[2]);
    h.key(h.document.activeElement, { key: 'ArrowLeft' });
    assert.equal(h.document.activeElement, h.options[1]);
});

test('after clicking emotes, Enter sends instead of inserting the focused one again', () => {
    const h = harness();
    const sent = [];
    h.input.addEventListener('keydown', event => { if (event.key === 'Enter') sent.push(h.input.value); });
    h.document.getElementById('gowo-emote-toggle').click();
    h.options[2].click();
    const value = h.input.value;
    assert.equal(h.key(h.document.activeElement, { key: 'Enter' }).defaultPrevented, true);
    assert.equal(h.input.value, value, 'not inserted twice');
    assert.deepEqual(sent, [value]);
    assert.equal(h.picker.hidden, true);
    assert.equal(h.document.activeElement, h.input);
});

const shown = h => ({
    title: h.document.querySelector('.gowo-emote-picker-title').textContent,
    tokens: h.options.map(option => option.dataset.emoteToken)
});

test('the picker shows one mood at a time; tabs and PageUp/PageDown turn the page', () => {
    const h = harness();
    h.document.getElementById('gowo-emote-toggle').click();
    const tabs = [...h.document.querySelectorAll('.gowo-emote-tab')];
    assert.deepEqual(tabs.map(tab => tab.title),
        ['Частые', 'Смех', 'Радость', 'Праздник', 'Грусть', 'Удивление', 'Реакции', 'Кино и уют']);
    assert.equal(tabs[0].hidden, true, 'nothing used yet');
    assert.equal(shown(h).title, 'Смех');
    assert.ok(shown(h).tokens.length <= 16);
    assert.equal(tabs[1].getAttribute('aria-selected'), 'true');

    tabs[4].click();
    assert.equal(shown(h).title, 'Грусть');
    assert.ok(shown(h).tokens.includes(':sadge:'));
    assert.equal(h.document.activeElement, h.options[0], 'still ready for the arrow keys');
    h.key(h.document.activeElement, { key: 'PageDown' });
    assert.equal(shown(h).title, 'Удивление');
    tabs[1].click();
    h.key(h.document.activeElement, { key: 'PageUp' });
    assert.equal(shown(h).title, 'Кино и уют', 'wraps around, past the empty page');

    // Every emote is on exactly one page.
    const all = [];
    for (const tab of tabs.slice(1)) {
        tab.click();
        all.push(...shown(h).tokens);
    }
    assert.equal(new Set(all).size, all.length);
    assert.equal(all.length, vm.runInContext('sevenTvEmotes.length', h.context));
});

test('the picker opens on what you pick and what the room uses most', () => {
    const h = harness();
    h.document.querySelector('app-chat-messages-room').insertAdjacentHTML('afterbegin', `
        <div class="message"><img class="gowo-chat-emote" title=":sadge:"><img class="gowo-chat-emote" title=":sadge:"></div>
        <div class="message"><img class="gowo-chat-emote" title=":pepepls:"></div>`);
    const toggle = h.document.getElementById('gowo-emote-toggle');
    toggle.click();
    h.document.querySelectorAll('.gowo-emote-tab')[1].click();
    h.options.find(option => option.dataset.emoteToken === ':hehe:').click();
    toggle.click();
    toggle.click();
    const frequentTab = h.document.querySelector('.gowo-emote-tab');
    assert.equal(frequentTab.hidden, false);
    assert.equal(frequentTab.getAttribute('aria-selected'), 'true');
    assert.deepEqual(shown(h), { title: 'Частые', tokens: [':sadge:', ':hehe:'] },
        'most used first; retired emotes are not offered');
});
