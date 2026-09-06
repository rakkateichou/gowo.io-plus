import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const runtime = readFileSync(new URL('../gowo.io-plus.js', import.meta.url), 'utf8');
const helper = runtime.slice(runtime.indexOf('    function fitEmotePickerLabels('),
    runtime.indexOf('    let emotePickerResizeObserver'));

// Model proportional text layout: tests vary the actual trailing line length,
// independently of label length, and check that fitting never widens the cell.
function harness(trailing) {
    const style = { removeProperty(name) { delete this[name === 'font-size' ? 'fontSize' : 'whiteSpace']; } };
    const label = { textContent: 'peepoRun', firstChild: { length: 8 }, clientWidth: 32, style };
    const picker = { hidden: false, isConnected: true, querySelectorAll: () => [label] };
    let start = null;
    const range = {
        selectNodeContents() { start = null; },
        setStart(node, offset) { start = offset; }, setEnd() {},
        getClientRects: () => trailing ? [{ top: 0 }, { top: 10 }] : [{ top: 0 }],
        getBoundingClientRect: () => ({ top: start === null || trailing < 3 ? 0 : 10, width: 40 })
    };
    const context = vm.createContext({
        document: { createRange: () => range },
        window: { getComputedStyle: () => ({ fontSize: '8px' }) }
    });
    vm.runInContext(helper, context);
    return { picker, label, fit: () => context.fitEmotePickerLabels(picker) };
}

for (const trailing of [1, 2]) {
    test(`fits a label with ${trailing} trailing characters on one line within its cell`, () => {
        const h = harness(trailing);
        h.fit();
        assert.equal(h.label.style.whiteSpace, 'nowrap');
        const size = parseFloat(h.label.style.fontSize);
        assert.ok(size > 0 && size < 8);
        assert.ok(40 * size / 8 <= h.label.clientWidth);
        h.fit();
        assert.equal(parseFloat(h.label.style.fontSize), size, 'repeated opens do not keep shrinking');
    });
}

for (const trailing of [0, 3, 4]) {
    test(`keeps normal typography with ${trailing} trailing characters`, () => {
        const h = harness(trailing);
        h.label.style.fontSize = '6px';
        h.label.style.whiteSpace = 'nowrap';
        h.fit();
        assert.equal(h.label.style.fontSize, undefined);
        assert.equal(h.label.style.whiteSpace, undefined);
    });
}

test('does not measure hidden or detached pickers', () => {
    const h = harness(1);
    h.picker.hidden = true;
    h.fit();
    assert.equal(h.label.style.fontSize, undefined);
    h.picker.hidden = false;
    h.picker.isConnected = false;
    h.fit();
    assert.equal(h.label.style.fontSize, undefined);
});
