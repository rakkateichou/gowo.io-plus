import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const section = (start, end) => runtime.slice(runtime.indexOf(start), runtime.indexOf(end));
const code = section('    function isEditableElement(', '    function initPlayerCursorBridge(') +
    section('    const sevenTvEmotes =', '    function renderSevenTvEmotes(') +
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
    const context = vm.createContext({
        document, window, Event, HTMLTextAreaElement,
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
        document, input, context, key,
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
