import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import { parseHTML } from 'linkedom';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const section = (start, end) => runtime.slice(runtime.indexOf(start), runtime.indexOf(end));
const code = section('    const sevenTvEmotes =', '    function renderSevenTvEmotes(') +
    section('    function insertEmoteAtCaret(', '    function fitEmotePickerLabels(');

function harness() {
    const dom = parseHTML('<html><body><form><textarea></textarea><div id="gowo-emote-picker" hidden></div><button id="gowo-emote-toggle"></button></form></body></html>');
    const { document, Event, HTMLTextAreaElement } = dom;
    const input = document.querySelector('textarea');
    const form = document.querySelector('form');
    const prepareInput = field => {
        field.selectionStart = field.selectionEnd = 0;
        field.maxLength = 500;
        field.focus = () => { document.activeElement = field; };
        field.setSelectionRange = (start, end) => { field.selectionStart = start; field.selectionEnd = end; };
    };
    prepareInput(input);
    const context = vm.createContext({ document, Event, HTMLTextAreaElement,
        KeyboardEvent: class extends Event {
            constructor(type, options) { super(type, options); this.key = options.key; }
        }
    });
    vm.runInContext(code, context);
    context.initEmoteAutocomplete(input, form);
    input.focus();
    const fire = (target, name, options = {}) => {
        const event = new Event(name, { bubbles: true, cancelable: true });
        Object.assign(event, options);
        target.dispatchEvent(event);
        return event;
    };
    return {
        document, input, form, context, fire, prepareInput,
        get list() { return document.getElementById('gowo-emote-autocomplete'); },
        type(value, caret = value.length, end = caret) {
            input.value = value;
            input.setSelectionRange(caret, end);
            fire(input, 'input');
        },
        key(key, options) { return fire(input, 'keydown', { key, ...options }); }
    };
}

const tokens = h => [...h.list.children].map(option => option.textContent);

test('matches names and tokens case-insensitively, with prefixes first and at most eight previews', () => {
    const h = harness();
    h.type(':PE');
    assert.equal(h.list.hidden, false);
    assert.equal(tokens(h)[0], ':peepolove:');
    assert.ok(tokens(h).includes(':peeporun:'));
    assert.ok(h.list.children.length <= 8);
    assert.equal(h.list.querySelectorAll('img').length, h.list.children.length);
    h.type(':run');
    assert.deepEqual(tokens(h), [':peeporun:']);
    assert.equal(h.input.getAttribute('aria-activedescendant'), h.list.firstElementChild.id);
});

for (const value of [':', 'plain text', 'https://pog', '12:30', 'word:pe', ':pog:', ':pog:pe', ':missing']) {
    test(`does not suggest for ${JSON.stringify(value)}`, () => {
        const h = harness();
        h.type(value);
        assert.equal(h.list.hidden, true);
        assert.equal(h.key('Enter').defaultPrevented, false);
    });
}

test('arrows cycle and Enter completes without reaching the native send handler', () => {
    const h = harness();
    let sends = 0;
    let changes = 0;
    h.input.addEventListener('keydown', event => { if (event.key === 'Enter') sends++; });
    h.input.addEventListener('input', () => changes++);
    h.type('hello :pe');
    const options = tokens(h);
    h.key('ArrowUp');
    assert.equal(h.list.lastElementChild.getAttribute('aria-selected'), 'true');
    h.key('ArrowDown');
    h.key('ArrowDown');
    assert.equal(h.key('Enter').defaultPrevented, true);
    assert.equal(h.input.value, `hello ${options[1]} `);
    assert.equal(h.input.selectionStart, h.input.value.length);
    assert.equal(changes, 2, 'one native input notification on completion');
    assert.equal(sends, 0);
    assert.equal(h.list.hidden, true);
    assert.equal(h.input.hasAttribute('aria-activedescendant'), false);
    h.key('Enter');
    assert.equal(sends, 1, 'ordinary Enter works after completion');
});

test('Tab replaces the whole token at the caret and preserves surrounding punctuation and text', () => {
    const h = harness();
    h.type('before (:peeporun:) after', 'before (:pe'.length);
    h.key('Tab');
    assert.equal(h.input.value, 'before (:peepolove:) after');
    assert.equal(h.input.selectionStart, 'before (:peepolove:'.length);
});

test('clicking a preview inserts its token without sending or losing the input focus', () => {
    const h = harness();
    h.type(':run');
    const image = h.list.querySelector('img');
    assert.equal(h.fire(image, 'mousedown').defaultPrevented, true);
    h.fire(image, 'click');
    assert.equal(h.input.value, ':peeporun: ');
    assert.equal(h.document.activeElement, h.input);
    assert.equal(h.list.hidden, true);
});

test('Escape stays dismissed through selectionchange and typing a new query opens again', () => {
    const h = harness();
    h.type(':pe');
    h.key('Escape');
    h.fire(h.document, 'selectionchange');
    assert.equal(h.list.hidden, true);
    assert.equal(h.input.value, ':pe');
    h.type(':pee');
    assert.equal(h.list.hidden, false);
});

test('selections, moving the caret away, blur and opening the picker hide suggestions', () => {
    const h = harness();
    h.type(':pe', 0, 3);
    assert.equal(h.list.hidden, true);
    h.type(':pe');
    h.input.setSelectionRange(0, 0);
    h.fire(h.document, 'selectionchange');
    assert.equal(h.list.hidden, true);
    h.type(':pee');
    h.fire(h.input, 'blur');
    assert.equal(h.list.hidden, true);
    h.document.getElementById('gowo-emote-picker').hidden = false;
    h.type(':run');
    assert.equal(h.list.hidden, true);
});

test('IME composition and modified keys retain native behavior', () => {
    const h = harness();
    h.type(':pe');
    for (const options of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) {
        assert.equal(h.key('Enter', options).defaultPrevented, false);
        assert.equal(h.input.value, ':pe');
    }
    h.fire(h.input, 'compositionstart');
    h.type(':run');
    assert.equal(h.list.hidden, true);
    assert.equal(h.key('Enter').defaultPrevented, false);
    h.fire(h.input, 'compositionend');
    assert.equal(h.list.hidden, false);
});

test('maxlength refuses completion safely instead of sending a partial query', () => {
    const h = harness();
    h.input.maxLength = 5;
    h.type(':run');
    assert.equal(h.key('Enter').defaultPrevented, true);
    assert.equal(h.input.value, ':run');
    assert.equal(h.input.selectionStart, 4);
    assert.equal(h.list.hidden, true);
});

test('stale suggestions never replace text after the caret has moved', () => {
    const h = harness();
    h.type(':run');
    h.input.setSelectionRange(0, 0);
    h.key('Tab');
    assert.equal(h.input.value, ':run');
    assert.equal(h.list.hidden, true);
});

test('repeated setup is idempotent and replacing the textarea removes old handlers', () => {
    const h = harness();
    const original = h.list;
    h.context.initEmoteAutocomplete(h.input, h.form);
    assert.equal(h.list, original);
    const replacement = h.document.createElement('textarea');
    h.prepareInput(replacement);
    replacement.setAttribute('aria-controls', 'native-help');
    h.input.replaceWith(replacement);
    h.context.initEmoteAutocomplete(replacement, h.form);
    h.type(':run');
    assert.equal(h.list.hidden, true, 'old input no longer controls the list');
    replacement.focus();
    replacement.value = ':run';
    replacement.setSelectionRange(4, 4);
    h.fire(replacement, 'input');
    assert.equal(h.list.hidden, false);
    assert.equal(replacement.getAttribute('aria-controls'), 'native-help gowo-emote-autocomplete');
    assert.equal(h.document.querySelectorAll('#gowo-emote-autocomplete').length, 1);
});


test('explicit Send bypasses suggestions and preserves the typed message', () => {
    const h = harness();
    let sends = 0;
    h.input.addEventListener('keydown', event => { if (event.key === 'Enter') sends++; });
    h.type(':run');
    h.context.sendMessageThroughGowo(h.input);
    assert.equal(sends, 1);
    assert.equal(h.input.value, ':run');
    assert.equal(h.list.hidden, true);
});

test('emote images load from the repository and fall back to 7TV once', async () => {
    const { existsSync } = await import('node:fs');
    const h = harness();
    const emotes = vm.runInContext('sevenTvRenderableEmotes', h.context);
    for (const emote of emotes) {
        assert.ok(existsSync(new URL(`../emotes/${emote.id}.webp`, import.meta.url)), emote.token);
    }
    const image = h.context.createSevenTvEmoteImage(emotes[0]);
    assert.equal(image.src, `https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/emotes/${emotes[0].id}.webp`);
    h.fire(image, 'error');
    assert.equal(image.src, `https://cdn.7tv.app/emote/${emotes[0].id}/2x.webp`);
    image.src = 'broken';
    h.fire(image, 'error');
    assert.equal(image.src, 'broken');
});
