// Gowo.io+ runtime v1
// Loaded by gowo.io-plus.user.js on every page load. Edit this file for feature updates.

(function() {
    'use strict';

    const cursorBridgeMarker = 'gowo-plus-cursor-bridge-v1';

    function isEditableElement(target) {
        if (!target) return false;
        const tagName = String(target.tagName || '').toLowerCase();
        return tagName === 'input' ||
            tagName === 'textarea' ||
            tagName === 'select' ||
            target.isContentEditable === true ||
            Boolean(target.closest?.('[contenteditable="true"]'));
    }

    function initPlayerCursorBridge() {
        let holding = false;

        const send = (type, point = null) => {
            window.parent.postMessage({
                source: cursorBridgeMarker,
                type,
                point
            }, 'https://gowo.io');
        };

        const pointFromEvent = event => {
            const width = window.innerWidth;
            const height = window.innerHeight;
            if (width <= 0 || height <= 0) return null;
            return {
                x: Math.max(0, Math.min(1, event.clientX / width)),
                y: Math.max(0, Math.min(1, event.clientY / height))
            };
        };

        document.addEventListener('mousemove', event => {
            if (!holding) return;
            const point = pointFromEvent(event);
            if (point) send('move', point);
        }, true);

        document.addEventListener('keydown', event => {
            if (event.code !== 'KeyX' || event.repeat || event.ctrlKey ||
                event.metaKey || event.altKey ||
                isEditableElement(event.target)) {
                return;
            }
            event.preventDefault();
            holding = true;
            // The last mousemove can predate the key press by several seconds.
            // Start an empty stroke and let the first live move set its origin.
            send('start');
        }, true);

        document.addEventListener('keyup', event => {
            if (event.code !== 'KeyX' || !holding) return;
            event.preventDefault();
            holding = false;
            send('stop');
        }, true);

        const stop = () => {
            if (!holding) return;
            holding = false;
            send('stop');
        };
        window.addEventListener('blur', stop);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') stop();
        });
    }

    if (window.top !== window.self) {
        const hostname = window.location.hostname.toLowerCase();
        if (hostname === 'alloha.gowo.tv' ||
            hostname.endsWith('.obrut.show')) {
            initPlayerCursorBridge();
        }
        return;
    }

    if (window.location.hostname !== 'gowo.io') return;

    function injectCSS(css) {
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
        return style;
    }

    function once(key, fn) {
        const attr = `data-gowo-${key}`;
        if (document.documentElement.hasAttribute(attr)) return;
        document.documentElement.setAttribute(attr, '1');
        fn();
    }

    function remove(selectors, root = document) {
        const sel = selectors.join(',');
        root.querySelectorAll(sel).forEach(el => el.remove());
    }

    function isBlockedAdUrl(value) {
        if (!value) return false;

        try {
            const url = new URL(value, window.location.href);
            const hostname = url.hostname.toLowerCase();

            return hostname === 'ads.digitalcaramel.com' ||
                hostname === 'vak345.com' ||
                hostname.endsWith('.vak345.com') ||
                (hostname === 'yandex.ru' && url.pathname.startsWith('/ads/'));
        } catch {
            return false;
        }
    }

    function isInjectedVideoAdOverlay(el) {
        if (!(el instanceof HTMLDivElement) || !el.id ||
            el.parentElement !== document.body) {
            return false;
        }

        const style = el.style;
        const fixedToBottomCorner = style.position === 'fixed' &&
            style.bottom === '0px' &&
            (style.left === '0px' || style.right === '0px');
        const videoAdSize = style.width === '400px' &&
            style.height === '225px' &&
            style.minWidth === '400px' &&
            style.minHeight === '225px';

        return fixedToBottomCorner && videoAdSize &&
            style.pointerEvents === 'none' &&
            style.display === 'flex' &&
            style.flexFlow === 'column' &&
            style.alignItems === 'center';
    }

    function removeInjectedAds() {
        document.querySelectorAll('script[src], iframe[src]').forEach(el => {
            if (isBlockedAdUrl(el.src)) el.remove();
        });

        document.querySelectorAll('body > div[id][style]').forEach(el => {
            if (isInjectedVideoAdOverlay(el)) el.remove();
        });
    }

    // Mirrors the fixed 7TV catalogue used by rakkateichou/JellyWatchParty.
    // Tokens remain ordinary chat text so rooms keep working without Gowo.io+.
    const sevenTvEmotes = Object.freeze([
        { token: ':pog:', label: 'Pog', id: '01EZTCN91800012PTN006Q50PR' },
        { token: ':kekw:', label: 'KEKW', id: '01F61B1440000991F7SWQNMVX7' },
        { token: ':sus:', label: 'Sus', id: '01HEKHE1MG0006REJ2K5EAP1N2' },
        { token: ':copium:', label: 'Copium', id: '01F6ME7ADR0000WDA7ERT9H30R' },
        { token: ':cry:', label: 'Cry', id: '01FC93557G000865A5YMK9D4S2' },
        { token: ':hype:', label: 'Hype', id: '01F6NMD520000AAS5FM9QEF9ZJ' },
        { token: ':booba:', label: 'BOOBA', id: '01F6N31ETR0004P7N4A9PKS5X9' },
        { token: ':dead:', label: 'Dead', id: '01F8YE5QNR00081476FRV8XDEZ' },
        { token: ':clown:', label: 'Clown', id: '01G9FX2GSG000B7F9Y9BJECXYV' },
        { token: ':aintnoway:', label: 'AINTNOWAY', id: '01GDDQVMH000038Q48APH8VE3Q' },
        { token: ':eyes:', label: 'Eyes', id: '01FSNNDJG80000JPZ36BHMFR5N' },
        { token: ':popcorn:', label: 'Popcorn', id: '01F86QDWK800018ZVH7PJSP4S5' },
        { token: ':salute:', label: 'Salute', id: '01F6Q8CVB000015Y8FNQBA5VBR' },
        { token: ':chef:', label: 'Chef', id: '01FFR5Q96R0007P57XYW0BJAXG' },
        { token: ':party:', label: 'Party', id: '01F6Q93YK8000EQZ7QARQERNWC' },
        { token: ':prayge:', label: 'Prayge', id: '01F6NACCD80006SZ7ZW5FMWKWK' },
        { token: ':peepolove:', label: 'peepoLove', id: '01F6NPP6YG00013ACMMJP3W06V' },
        { token: ':uhh:', label: 'uhh', id: '01H0405680000AJFXTYVX2PNJ7' },
        { token: ':petpet:', label: 'PETPET', id: '01FE3XY508000AA32JP519W2EW' },
        { token: ':ppl:', label: 'ppL', id: '01GGD5PJA8000FH13S498E9D8X' },
        { token: ':clap:', label: 'Clap', id: '01GAM8EFQ00004MXFXAJYKA859' },
        { token: ':aware:', label: 'Aware', id: '01FFWH9WV80000JT8GHDKHJNZC' },
        { token: ':peepohappy:', label: 'peepoHappy', id: '01GAZ199Z8000FEWHS6AT5QZV0' },
        { token: ':peeposad:', label: 'peepoSad', id: '01GAZ4SBX80007YCE2RXBT44B2' },
        { token: ':peeporun:', label: 'peepoRun', id: '01F6Q045KR0005589X3BDQHRAY' },
        { token: ':ragey:', label: 'RAGEY', id: '01GBFAYKGR000FWWN7MDZZ8XQN' },
        { token: ':hi:', label: 'hi', id: '01GX6M9TRR000DJJ63WGMEA4Z8' },
        { token: ':noooo:', label: 'NOOOO', id: '01F6MKTFTG0009C9ZSNZTFV2ZF' },
        { token: ':caught:', label: 'CAUGHT', id: '01H0SQNM9R0005HNCSM10SYJEQ' },
        { token: ':catjam:', label: 'catJAM', id: '01F6MQ33FG000FFJ97ZB8MWV52' },
        { token: ':peepopls:', label: 'peepoPls', id: '01HM524VE80004SKSHMCZWXH1T' },
        { token: ':teatime:', label: 'TeaTime', id: '01HM4P26CR000449DZBT4FVMA5' },
        { token: ':pianotime:', label: 'PianoTime', id: '01G98V81Q80000BRQD106P0ZEK' },
        { token: ':winetime:', label: 'WineTime', id: '01HM4PGHC80007635TAZG67FT5' },
        { token: ':peepocomfy:', label: 'peepoComfy', id: '01FAJRZBRR0002R979W3KES4A1' },
        { token: ':biblethump:', label: 'BibleThump', id: '01J8NMZ2HG0005G1FWF2H9Y615' },
        { token: ':glorp:', label: 'glorp', id: '01H16FA16G0005EZED5J0EY7KN' },
        { token: ':stare:', label: 'Stare', id: '01GG3YGWK8000DWE419062SG28' },
        { token: ':troll:', label: 'TROLL', id: '01F6P1E7QR0002RDNAW6FFQ1E0' },
        { token: ':ayaya:', label: 'AYAYA', id: '01GB32XE6R00018VJGJ4A9BNCV' },
        { token: ':vibe:', label: 'VIBE', id: '01FYQZVG280006SX8JX4TD7SJA' },
        { token: ':feelsweirdman:', label: 'FeelsWeirdMan', id: '01GB4FWTR8000DGEZ8VYY59RBN' },
        { token: ':ez:', label: 'EZ', id: '01GB4CK01800090V9B3D8CGEEX' },
        { token: ':feelsokayman:', label: 'FeelsOkayMan', id: '01GB46137R000BJ5HR8F6XV8J1' },
        { token: ':nerd:', label: 'Nerd', id: '01FEV00990000FCZBKX8KY8JRF' },
        { token: ':7cinema:', label: '7Cinema', id: '01GBFDVP18000CRDCG0DV7KEMY' },
        { token: ':xdx:', label: 'xdx', id: '01FZBTBQDG000DX0N9GHCRXYPH' },
        { token: ':aloo:', label: 'Aloo', id: '01F6PRA3N80003BH8AEY9DWKDQ' }
    ]);
    // Retired picker entries remain supported in existing chat history.
    const sevenTvLegacyEmotes = [
        { token: ':pepepls:', label: 'PepePls', id: '01GAFTZ9K80003DHH026MC7JW0' },
        { token: ':heart:', label: 'peepoLove', id: '01F6NPP6YG00013ACMMJP3W06V' },
        { token: ':trolldespair:', label: 'TrollDespair', id: '01EZPGMA6G00047EF100A1SBTF' },
        { token: ':rareparrot:', label: 'RareParrot', id: '01GB4XE3ZR000DKFRGM9Q1M7VS' },
        { token: ':bonk:', label: 'Bonk', id: '01FT4EHG1G0001M6SADSSJAA2D' },
        { token: ':raintime:', label: 'RainTime', id: '01FCY771D800007PQ2DF3GDTN6' },
        { token: ':feelsstrongman:', label: 'FeelsStrongMan', id: '01GB4EV0Q800090V9B3D8CGEHV' },
        { token: ':nanaayaya:', label: 'nanaAYAYA', id: '01FTEZEE900001E12995B12GR4' },
        { token: ':fire:', label: 'Fire', id: '01F7VQR9BR00012GPWP0G6X5NF' },
        { token: ':waytoodank:', label: 'WAYTOODANK', id: '01G98W833R0000BRQD106P0ZNT' },
        { token: ':partyparrot:', label: 'PartyParrot', id: '01FKSDK14G0008TM5NY9QEG0QV' },
        { token: ':feelsdankman:', label: 'FeelsDankMan', id: '01GB9W8JN80004CKF2H1TWA99H' },
        { token: ':billyapprove:', label: 'BillyApprove', id: '01GB2S7H7000018VJGJ4A9BMFS' },
        { token: ':forsenpls:', label: 'forsenPls', id: '01GB8EQNJ8000497KFBZWNSDFZ' },
        { token: ':aliendance:', label: 'AlienDance', id: '01GB2ZJFBG000DTBJYANG8XYFP' },
        { token: ':basedgod:', label: 'BasedGod', id: '01GB9W2CDG000BFSD141G0MGSA' },
        { token: ':acestare:', label: 'aceStare', id: '01JY2MX5BE5BVWWFV153ANMMHZ' },
        { token: ':nymncorn:', label: 'nymnCorn', id: '01HM6NJ2X000035ZKVAPWBNW26' },
    ];
    const sevenTvRenderableEmotes = [...sevenTvEmotes, ...sevenTvLegacyEmotes];
    const sevenTvEmoteByToken = new Map(
        sevenTvRenderableEmotes.map(emote => [emote.token, emote])
    );
    const sevenTvTokenSource = sevenTvRenderableEmotes
        .map(emote => emote.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('|');
    const sevenTvTokenTestPattern = new RegExp(
        `(?:${sevenTvTokenSource})`,
        'i'
    );
    const sevenTvImageUrl = id =>
        `https://cdn.7tv.app/emote/${id}/2x.webp`;
    const emoteToggleId = 'gowo-emote-toggle';
    const emotePickerId = 'gowo-emote-picker';
    const sendButtonId = 'gowo-send-button';

    function createSevenTvTokenPattern() {
        return new RegExp(`(${sevenTvTokenSource})`, 'gi');
    }

    function containsOnlySevenTvEmotes(value) {
        const text = String(value || '').trim();
        return Boolean(
            text && text.replace(createSevenTvTokenPattern(), '').trim() === ''
        );
    }

    function createSevenTvEmoteImage(emote, picker = false) {
        const image = document.createElement('img');
        image.className = picker ?
            'gowo-emote-picker-image' :
            'gowo-chat-emote';
        image.src = sevenTvImageUrl(emote.id);
        image.alt = picker ? '' : emote.label;
        image.title = emote.token;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.draggable = false;
        return image;
    }

    function renderSevenTvEmotes(root) {
        if (!root) return;

        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const textNodes = [];

        while (walker.nextNode()) {
            const textNode = walker.currentNode;
            const parent = textNode.parentElement;
            if (!textNode.nodeValue ||
                !sevenTvTokenTestPattern.test(textNode.nodeValue) ||
                parent?.closest(
                    'a, code, pre, script, style, .gowo-chat-emote'
                )) {
                continue;
            }
            textNodes.push(textNode);
        }

        textNodes.forEach(textNode => {
            const parts = textNode.nodeValue.split(createSevenTvTokenPattern());
            const fragment = document.createDocumentFragment();

            parts.forEach(part => {
                const emote = sevenTvEmoteByToken.get(part.toLowerCase());
                fragment.append(
                    emote ?
                        createSevenTvEmoteImage(emote) :
                        document.createTextNode(part)
                );
            });

            textNode.replaceWith(fragment);
        });
    }

    function renderMessageEmotes(message) {
        const body = message.querySelector('.text > .w-100');
        if (body && sevenTvTokenTestPattern.test(body.textContent || '')) {
            if (containsOnlySevenTvEmotes(body.textContent)) {
                body.classList.add('gowo-emote-only');
            }
            renderSevenTvEmotes(body);
        }

        message.querySelectorAll('.text__reply__text')
            .forEach(renderSevenTvEmotes);
    }

    function insertEmoteAtCaret(input, token) {
        if (!input || !sevenTvEmoteByToken.has(token.toLowerCase())) {
            return false;
        }

        const value = input.value || '';
        const start = Number.isInteger(input.selectionStart) ?
            input.selectionStart : value.length;
        const end = Number.isInteger(input.selectionEnd) ?
            input.selectionEnd : start;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const prefix = before && !/\s$/.test(before) ? ' ' : '';
        const suffix = after && !/^\s/.test(after) ? ' ' : '';
        const insertion = `${prefix}${token}${suffix}`;
        const nextValue = `${before}${insertion}${after}`;

        if (input.maxLength >= 0 && nextValue.length > input.maxLength) {
            return false;
        }

        const valueSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value'
        )?.set;
        if (valueSetter) {
            valueSetter.call(input, nextValue);
        } else {
            input.value = nextValue;
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));

        const caret = start + insertion.length;
        input.focus({ preventScroll: true });
        input.setSelectionRange(caret, caret);
        return true;
    }

    function closeEmotePicker() {
        const picker = document.getElementById(emotePickerId);
        const toggle = document.getElementById(emoteToggleId);
        if (!picker || !toggle) return;
        picker.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    }

    function sendMessageThroughGowo(input) {
        if (!input?.value.trim()) return;

        input.focus({ preventScroll: true });
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            bubbles: true,
            cancelable: true
        }));
        closeEmotePicker();
    }

    function focusChatComposer() {
        const input = document.querySelector(
            'app-chat-messages-room .form-message textarea'
        );
        if (!input || input.disabled) return;
        input.focus({ preventScroll: true });
        const caret = input.value.length;
        input.setSelectionRange(caret, caret);
    }

    function injectEmotePicker() {
        const form = document.querySelector(
            'app-chat-messages-room .form-message'
        );
        const input = form?.querySelector('textarea');
        const inputWrapper = input?.closest('.textarea');
        const footerRow = inputWrapper?.parentElement;
        if (!form || !input || !inputWrapper || !footerRow) return;

        const existingPicker = document.getElementById(emotePickerId);
        const existingToggle = document.getElementById(emoteToggleId);
        const existingSendButton = document.getElementById(sendButtonId);
        if (existingPicker && existingToggle && existingSendButton &&
            form.contains(existingPicker) &&
            form.contains(existingToggle) &&
            form.contains(existingSendButton)) {
            return;
        }
        existingPicker?.remove();
        existingToggle?.remove();
        existingSendButton?.remove();

        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.id = emoteToggleId;
        toggle.textContent = '☺';
        toggle.title = '7TV emotes';
        toggle.setAttribute('aria-label', '7TV emotes');
        toggle.setAttribute('aria-expanded', 'false');

        const sendButton = document.createElement('button');
        sendButton.type = 'button';
        sendButton.id = sendButtonId;
        sendButton.textContent = 'Send';
        sendButton.title = 'Send message';
        sendButton.setAttribute('aria-label', 'Send message');

        const picker = document.createElement('div');
        picker.id = emotePickerId;
        picker.hidden = true;
        picker.setAttribute('role', 'dialog');
        picker.setAttribute('aria-label', '7TV emotes');

        const title = document.createElement('div');
        title.className = 'gowo-emote-picker-title';
        title.textContent = '7TV emotes';
        picker.append(title);

        const grid = document.createElement('div');
        grid.className = 'gowo-emote-grid';
        sevenTvEmotes.forEach(emote => {
            const option = document.createElement('button');
            option.type = 'button';
            option.className = 'gowo-emote-option';
            option.dataset.emoteToken = emote.token;
            option.title = emote.token;
            option.setAttribute('aria-label', emote.label);

            const label = document.createElement('small');
            label.textContent = emote.label;
            option.append(createSevenTvEmoteImage(emote, true), label);
            grid.append(option);
        });
        picker.append(grid);

        const hint = document.createElement('div');
        hint.className = 'gowo-emote-picker-hint';
        hint.textContent = 'You can also type an emote token, like :pog:';
        picker.append(hint);

        toggle.addEventListener('mousedown', event => {
            event.preventDefault();
        });
        toggle.addEventListener('click', event => {
            event.stopPropagation();
            const willOpen = picker.hidden;
            picker.hidden = !willOpen;
            toggle.setAttribute('aria-expanded', String(willOpen));
            input.focus({ preventScroll: true });
        });
        picker.addEventListener('mousedown', event => {
            if (event.target.closest('.gowo-emote-option')) {
                event.preventDefault();
            }
        });
        picker.addEventListener('click', event => {
            event.stopPropagation();
            const option = event.target.closest('.gowo-emote-option');
            if (option?.dataset.emoteToken) {
                insertEmoteAtCaret(input, option.dataset.emoteToken);
            }
        });
        picker.addEventListener('wheel', event => {
            event.stopPropagation();
        }, { passive: true });
        sendButton.addEventListener('mousedown', event => {
            event.preventDefault();
        });
        sendButton.addEventListener('click', event => {
            event.stopPropagation();
            sendMessageThroughGowo(input);
        });

        footerRow.insertBefore(toggle, inputWrapper);
        footerRow.append(sendButton);
        form.append(picker);
    }

    document.addEventListener('click', event => {
        if (event.target.closest?.(
            '.message .actions app-icon-undo'
        )) {
            // Let Gowo select and render the quoted message first.
            requestAnimationFrame(focusChatComposer);
        }

        const picker = document.getElementById(emotePickerId);
        const toggle = document.getElementById(emoteToggleId);
        if (picker && toggle && !picker.hidden &&
            !picker.contains(event.target) &&
            !toggle.contains(event.target)) {
            closeEmotePicker();
        }
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') closeEmotePicker();
    });

    const hideCallButtonPreferenceKey = 'gowo-plus-hide-call-button';
    const hideCallButtonToggleId = 'gowo-plus-hide-call-button-toggle';
    let hideCallButton = true;

    function readHideCallButtonPreference() {
        try {
            const storedValue = localStorage.getItem(hideCallButtonPreferenceKey);
            return storedValue === null ? true : storedValue !== 'false';
        } catch {
            return true;
        }
    }

    function setCallButtonHidden(hidden, persist = false) {
        hideCallButton = Boolean(hidden);
        document.documentElement.setAttribute(
            'data-gowo-hide-call-button',
            String(hideCallButton)
        );

        if (persist) {
            try {
                localStorage.setItem(
                    hideCallButtonPreferenceKey,
                    String(hideCallButton)
                );
            } catch {
                // Keep the setting for this page when storage is unavailable.
            }
        }

        const toggle = document.getElementById(hideCallButtonToggleId);
        if (toggle && toggle.checked !== hideCallButton) {
            toggle.checked = hideCallButton;
        }
    }

    function injectCallButtonSetting() {
        const form = document.querySelector(
            'app-chat-settings-room .settings form'
        );
        if (!form) return;

        const existingToggle = document.getElementById(hideCallButtonToggleId);
        if (existingToggle) {
            existingToggle.checked = hideCallButton;
            return;
        }

        const header = form.firstElementChild;
        if (!header) return;

        const row = document.createElement('div');
        row.className = 'gowo-setting-row';
        row.innerHTML = `
            <label class="gowo-setting-label" for="${hideCallButtonToggleId}">
                <input type="checkbox" id="${hideCallButtonToggleId}">
                <span class="gowo-switch" aria-hidden="true"></span>
                <span>Скрывать кнопку звонка</span>
            </label>
        `;

        const divider = document.createElement('hr');
        divider.className = 'gowo-setting-divider';
        header.after(row, divider);

        const toggle = row.querySelector(`#${hideCallButtonToggleId}`);
        toggle.checked = hideCallButton;
        toggle.addEventListener('change', () => {
            setCallButtonHidden(toggle.checked, true);
        });
    }

    setCallButtonHidden(readHideCallButtonPreference());

    window.addEventListener('storage', event => {
        if (event.key === hideCallButtonPreferenceKey) {
            setCallButtonHidden(readHideCallButtonPreference());
        }
    });

    const scheduledPlayerScrolls = new WeakSet();
    const completedPlayerScrolls = new WeakSet();

    function scheduleInitialPlayerScroll() {
        const player = document.querySelector('.videoplayer');
        if (!player || scheduledPlayerScrolls.has(player) ||
            completedPlayerScrolls.has(player)) {
            return;
        }

        scheduledPlayerScrolls.add(player);
        let attempts = 0;
        let timer = null;
        const listeners = new AbortController();

        const finish = () => {
            if (timer !== null) clearTimeout(timer);
            listeners.abort();
            scheduledPlayerScrolls.delete(player);
            completedPlayerScrolls.add(player);
        };

        // Stop pinning as soon as the viewer deliberately tries to scroll up.
        player.addEventListener('wheel', event => {
            if (event.deltaY < 0) finish();
        }, {
            passive: true,
            signal: listeners.signal
        });
        player.addEventListener('touchstart', finish, {
            passive: true,
            once: true,
            signal: listeners.signal
        });
        window.addEventListener('keydown', event => {
            if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) finish();
        }, { capture: true, signal: listeners.signal });

        const scrollWhenReady = () => {
            if (!player.isConnected) {
                finish();
                return;
            }

            if (player.scrollHeight > player.clientHeight) {
                // Angular and the embedded player grow in several passes. Keep
                // following the bottom during startup so a later layout pass
                // cannot leave part of the header visible.
                player.scrollTop = player.scrollHeight;
            }

            attempts++;
            if (attempts < 100) {
                timer = setTimeout(scrollWhenReady, 100);
            } else {
                finish();
            }
        };

        scrollWhenReady();
    }

    function stringToColor(str) {
        // FNV-1a-ish hash
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
            hash ^= str.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        const hue = (hash >>> 0) % 360;
        return `hsl(${hue}, 85%, 70%)`; // bright for black bg
    }

    const cursorRelayUrl = 'wss://n8n.rkde.su/gowo-cursor';
    const cursorSendIntervalMs = 50;
    const cursorStaleAfterMs = 1600;
    const cursorMaxTrailPoints = 600;
    const cursorTrailCurveTension = 0.45;
    const cursorElements = new Map();
    const cursorTrails = new Map();
    const cursorStaleTimers = new Map();
    let cursorSocket = null;
    let cursorRoomKey = '';
    let cursorRelayStarted = false;
    let cursorRelayJoined = false;
    let cursorReconnectTimer = null;
    let cursorReconnectDelay = 1000;
    let cursorHolding = false;
    let cursorVisible = false;
    let cursorLastSentAt = 0;
    let cursorPendingPoint = null;
    let cursorSendTimer = null;
    let cursorRenderFrame = null;
    let cursorRenderPoint = null;
    let cursorCaptureOverlay = null;
    let cursorIdentityName = '';

    const cursorClientId = (() => {
        const storageKey = 'gowo-plus-cursor-client-id';
        try {
            let value = sessionStorage.getItem(storageKey);
            if (!/^[a-f0-9]{32}$/i.test(value || '')) {
                const bytes = crypto.getRandomValues(new Uint8Array(16));
                value = Array.from(bytes, byte =>
                    byte.toString(16).padStart(2, '0')
                ).join('');
                sessionStorage.setItem(storageKey, value);
            }
            return value;
        } catch {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            return Array.from(bytes, byte =>
                byte.toString(16).padStart(2, '0')
            ).join('');
        }
    })();

    function getGowoAuthToken() {
        try {
            const tokenCookie = document.cookie
                .split(';')
                .map(part => part.trim())
                .find(part => part.startsWith('token='));
            return tokenCookie ?
                decodeURIComponent(tokenCookie.slice('token='.length)) : '';
        } catch {
            return '';
        }
    }

    function cursorNameFromProfile(profile) {
        const candidates = [profile?.data, profile?.user, profile]
            .filter(candidate => candidate && typeof candidate === 'object');

        for (const candidate of candidates) {
            const fullName = [
                candidate.name || candidate.first_name || candidate.given_name,
                candidate.surname || candidate.last_name || candidate.family_name
            ].filter(Boolean).join(' ');
            const displayName = fullName || candidate.display_name ||
                candidate.displayName || candidate.username ||
                candidate.user_name;
            const normalized = String(displayName || '')
                .replace(/[\u0000-\u001f\u007f]/g, '')
                .trim();
            if (normalized) return normalized.slice(0, 40);
        }

        return '';
    }

    async function loadCursorIdentity() {
        const token = getGowoAuthToken();
        if (!token) return;
        try {
            const response = await fetch('https://api.gowo.io/api/current', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) return;
            cursorIdentityName = cursorNameFromProfile(await response.json());
        } catch {
            // Keep the anonymous fallback if Gowo's profile lookup is unavailable.
        }
    }

    function cursorNickname() {
        if (cursorIdentityName) return cursorIdentityName;
        return `Gowo user ${cursorClientId.slice(0, 4)}`;
    }

    function getRoomAlias() {
        const match = window.location.pathname.match(/^\/orooms\/([^/?#]+)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function hashCursorRoom(alias) {
        const bytes = new TextEncoder().encode(
            `gowo.io-plus-cursor-v1:${alias}`
        );
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(digest), byte =>
            byte.toString(16).padStart(2, '0')
        ).join('');
    }

    function getCursorSurface() {
        const player = document.querySelector('.videoplayer');
        if (!player) return null;
        const frames = Array.from(player.querySelectorAll('iframe'));
        const frame = frames.find(candidate => {
            if (isBlockedAdUrl(candidate.src)) return false;
            const rect = candidate.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        return frame || player;
    }

    function cursorPointFromClient(clientX, clientY) {
        const surface = getCursorSurface();
        if (!surface) return null;
        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0 ||
            clientX < rect.left || clientX > rect.right ||
            clientY < rect.top || clientY > rect.bottom) {
            return null;
        }
        return {
            x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
        };
    }

    function removeCursorTrail(clientId) {
        const trail = cursorTrails.get(clientId);
        trail?.element.remove();
        cursorTrails.delete(clientId);
    }

    function removeCursor(clientId) {
        cursorElements.get(clientId)?.remove();
        cursorElements.delete(clientId);
        removeCursorTrail(clientId);
        const timer = cursorStaleTimers.get(clientId);
        if (timer) clearTimeout(timer);
        cursorStaleTimers.delete(clientId);
    }

    function cursorTrailElement(clientId, username) {
        let trail = cursorTrails.get(clientId);
        if (!trail) {
            const element = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            );
            element.classList.add('gowo-shared-cursor-trail');
            element.setAttribute('aria-hidden', 'true');
            element.setAttribute(
                'viewBox',
                `0 0 ${window.innerWidth} ${window.innerHeight}`
            );
            element.setAttribute('preserveAspectRatio', 'none');
            const line = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'path'
            );
            line.classList.add('gowo-shared-cursor-trail-line');
            element.append(line);
            document.body.append(element);
            trail = { element, line, points: [] };
            cursorTrails.set(clientId, trail);
        }
        trail.element.style.setProperty(
            '--gowo-user-color',
            stringToColor(username)
        );
        return trail;
    }

    function cursorTrailPath(points) {
        if (!points.length) return '';
        const coordinate = point =>
            `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
        if (points.length === 1) return `M ${coordinate(points[0])}`;
        if (points.length === 2) {
            return `M ${coordinate(points[0])} L ${coordinate(points[1])}`;
        }

        let path = `M ${coordinate(points[0])}`;
        for (let index = 0; index < points.length - 1; index++) {
            const before = points[Math.max(0, index - 1)];
            const current = points[index];
            const next = points[index + 1];
            const after = points[Math.min(points.length - 1, index + 2)];
            const scale = cursorTrailCurveTension / 6;
            const controlOne = {
                x: current.x + ((next.x - before.x) * scale),
                y: current.y + ((next.y - before.y) * scale)
            };
            const controlTwo = {
                x: next.x - ((after.x - current.x) * scale),
                y: next.y - ((after.y - current.y) * scale)
            };
            path += ` C ${coordinate(controlOne)} ` +
                `${coordinate(controlTwo)} ${coordinate(next)}`;
        }
        return path;
    }

    function addCursorTrailPoint(clientId, username, x, y) {
        const trail = cursorTrailElement(clientId, username);
        const previous = trail.points[trail.points.length - 1];
        if (previous) {
            const distance = Math.hypot(x - previous.x, y - previous.y);
            if (distance < 1) return;
        }
        trail.points.push({ x, y });
        if (trail.points.length > cursorMaxTrailPoints) {
            trail.points.splice(
                0,
                trail.points.length - cursorMaxTrailPoints
            );
        }
        trail.line.setAttribute('d', cursorTrailPath(trail.points));
    }

    function clearCursorTrails() {
        Array.from(cursorTrails.keys()).forEach(removeCursorTrail);
    }

    function cursorElement(clientId, username) {
        let element = cursorElements.get(clientId);
        if (!element) {
            element = document.createElement('div');
            element.className = 'gowo-shared-cursor';
            element.setAttribute('aria-hidden', 'true');
            element.innerHTML = `
                <svg class="gowo-shared-cursor-arrow"
                    viewBox="0 0 20 28" focusable="false" aria-hidden="true">
                    <path d="M2 2v20l5.4-5 4.1 9 4-1.8-4.1-8.8H19z"></path>
                </svg>
                <span class="gowo-shared-cursor-name"></span>
            `;
            if (clientId === cursorClientId) element.classList.add('local');
            document.body.append(element);
            cursorElements.set(clientId, element);
        }
        const firstName = String(username || '').trim().split(/\s+/)[0];
        element.querySelector('.gowo-shared-cursor-name').textContent =
            firstName || 'Anonymous';
        element.style.setProperty(
            '--gowo-user-color',
            stringToColor(username)
        );
        return element;
    }

    function showCursor(clientId, username, point) {
        const surface = getCursorSurface();
        if (!surface || !point) {
            removeCursor(clientId);
            return;
        }
        const rect = surface.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        const x = rect.left + (point.x * rect.width);
        const y = rect.top + (point.y * rect.height);
        const element = cursorElement(clientId, username);
        addCursorTrailPoint(clientId, username, x, y);
        element.style.left = `${x}px`;
        element.style.top = `${y}px`;
        element.classList.add('visible');

        if (clientId === cursorClientId) return;
        const oldTimer = cursorStaleTimers.get(clientId);
        if (oldTimer) clearTimeout(oldTimer);
        cursorStaleTimers.set(clientId, setTimeout(() => {
            removeCursor(clientId);
        }, cursorStaleAfterMs));
    }

    function sendCursorPacket(point = null) {
        if (!cursorRelayJoined || cursorSocket?.readyState !== WebSocket.OPEN) {
            return;
        }
        const visible = Boolean(point);
        const packet = {
            type: 'cursor',
            visible,
            username: cursorNickname()
        };
        if (point) {
            packet.x = point.x;
            packet.y = point.y;
        }
        cursorSocket.send(JSON.stringify(packet));
        cursorVisible = visible;
        if (visible) cursorLastSentAt = Date.now();
    }

    function renderOwnCursor(point) {
        cursorRenderPoint = point;
        if (cursorRenderFrame !== null) return;
        cursorRenderFrame = requestAnimationFrame(() => {
            cursorRenderFrame = null;
            const nextPoint = cursorRenderPoint;
            cursorRenderPoint = null;
            if (cursorHolding && nextPoint) {
                showCursor(cursorClientId, cursorNickname(), nextPoint);
            }
        });
    }

    function flushPendingCursorPoint() {
        cursorSendTimer = null;
        if (!cursorHolding || !cursorPendingPoint) return;
        const point = cursorPendingPoint;
        cursorPendingPoint = null;
        sendCursorPacket(point);
    }

    function queueCursorPoint(point) {
        cursorPendingPoint = point;
        const remaining = cursorSendIntervalMs -
            (Date.now() - cursorLastSentAt);
        if (remaining <= 0) {
            if (cursorSendTimer) clearTimeout(cursorSendTimer);
            cursorSendTimer = null;
            flushPendingCursorPoint();
        } else if (!cursorSendTimer) {
            cursorSendTimer = setTimeout(flushPendingCursorPoint, remaining);
        }
    }

    function syncCursorCaptureOverlay() {
        if (!cursorCaptureOverlay) return;
        const surface = getCursorSurface();
        if (!surface) return;
        const rect = surface.getBoundingClientRect();
        Object.assign(cursorCaptureOverlay.style, {
            left: `${rect.left}px`,
            top: `${rect.top}px`,
            width: `${rect.width}px`,
            height: `${rect.height}px`
        });
    }

    function showCursorCaptureOverlay() {
        if (!cursorCaptureOverlay) {
            cursorCaptureOverlay = document.createElement('div');
            cursorCaptureOverlay.className = 'gowo-cursor-capture';
            cursorCaptureOverlay.setAttribute('aria-hidden', 'true');
            document.body.append(cursorCaptureOverlay);
        }
        syncCursorCaptureOverlay();
    }

    function pauseOwnCursor() {
        if (cursorSendTimer) clearTimeout(cursorSendTimer);
        cursorSendTimer = null;
        cursorPendingPoint = null;
        if (cursorRenderFrame !== null) {
            cancelAnimationFrame(cursorRenderFrame);
            cursorRenderFrame = null;
        }
        cursorRenderPoint = null;
        removeCursor(cursorClientId);
        if (cursorVisible) sendCursorPacket();
        cursorVisible = false;
    }

    function hideOwnCursor() {
        pauseOwnCursor();
        cursorCaptureOverlay?.remove();
        cursorCaptureOverlay = null;
    }

    function startCursorDrawing() {
        if (!getCursorSurface()) return;
        // A fresh key press always begins a fresh stroke, even if a previous
        // keyup was lost while focus moved between the page and player iframe.
        pauseOwnCursor();
        cursorHolding = true;
        showCursorCaptureOverlay();
    }

    function stopCursorDrawing() {
        if (!cursorHolding && !cursorVisible) return;
        cursorHolding = false;
        hideOwnCursor();
    }

    function handleCursorRelayMessage(event) {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }
        if (message?.type !== 'cursor' ||
            typeof message.client !== 'string' ||
            message.client === cursorClientId) {
            return;
        }
        if (message.visible === false) {
            removeCursor(message.client);
            return;
        }
        const x = Number(message.x);
        const y = Number(message.y);
        if (!Number.isFinite(x) || !Number.isFinite(y) ||
            x < 0 || x > 1 || y < 0 || y > 1) {
            return;
        }
        showCursor(
            message.client,
            String(message.username || 'Anonymous').slice(0, 40),
            { x, y }
        );
    }

    function scheduleCursorRelayReconnect() {
        if (cursorReconnectTimer || !cursorRelayStarted) return;
        cursorReconnectTimer = setTimeout(() => {
            cursorReconnectTimer = null;
            connectCursorRelay();
        }, cursorReconnectDelay);
        cursorReconnectDelay = Math.min(cursorReconnectDelay * 2, 30000);
    }

    function connectCursorRelay() {
        if (!cursorRoomKey ||
            cursorSocket?.readyState === WebSocket.OPEN ||
            cursorSocket?.readyState === WebSocket.CONNECTING) {
            return;
        }
        cursorRelayJoined = false;
        const socket = new WebSocket(cursorRelayUrl);
        cursorSocket = socket;

        socket.addEventListener('open', () => {
            if (cursorSocket !== socket) return;
            cursorReconnectDelay = 1000;
            socket.send(JSON.stringify({
                type: 'join',
                room: cursorRoomKey,
                client: cursorClientId,
                username: cursorNickname()
            }));
        });
        socket.addEventListener('message', event => {
            if (cursorSocket !== socket) return;
            let message;
            try {
                message = JSON.parse(event.data);
            } catch {
                return;
            }
            if (message?.type === 'joined') {
                cursorRelayJoined = true;
                return;
            }
            handleCursorRelayMessage(event);
        });
        socket.addEventListener('close', () => {
            if (cursorSocket !== socket) return;
            cursorRelayJoined = false;
            cursorSocket = null;
            Array.from(cursorElements.keys())
                .filter(clientId => clientId !== cursorClientId)
                .forEach(removeCursor);
            scheduleCursorRelayReconnect();
        });
        socket.addEventListener('error', () => {
            // The close handler performs a quiet retry.
        });
    }

    async function startCursorRelay() {
        if (cursorRelayStarted) return;
        cursorRelayStarted = true;
        const alias = getRoomAlias();
        if (!alias) return;
        try {
            const [roomKey] = await Promise.all([
                hashCursorRoom(alias),
                loadCursorIdentity()
            ]);
            cursorRoomKey = roomKey;
            connectCursorRelay();
        } catch {
            cursorRelayStarted = false;
        }
    }

    document.addEventListener('keydown', event => {
        if (event.code !== 'KeyX' || event.repeat || event.ctrlKey ||
            event.metaKey || event.altKey || isEditableElement(event.target)) {
            return;
        }
        event.preventDefault();
        // The capture layer's first live mousemove establishes the stroke.
        startCursorDrawing();
    }, true);

    document.addEventListener('keyup', event => {
        if (event.code !== 'KeyX' || !cursorHolding) return;
        event.preventDefault();
        stopCursorDrawing();
    }, true);

    document.addEventListener('mousemove', event => {
        if (!cursorHolding) return;
        const point = cursorPointFromClient(event.clientX, event.clientY);
        if (point) {
            renderOwnCursor(point);
            queueCursorPoint(point);
        } else {
            pauseOwnCursor();
        }
    }, true);

    window.addEventListener('message', event => {
        const message = event.data;
        if (message?.source !== cursorBridgeMarker ||
            !['https://alloha.gowo.tv'].includes(event.origin) &&
            !/^https:\/\/[^/]+\.obrut\.show$/.test(event.origin)) {
            return;
        }
        const surface = getCursorSurface();
        if (!(surface instanceof HTMLIFrameElement) ||
            event.source !== surface.contentWindow) {
            return;
        }
        if (message.type === 'stop') {
            stopCursorDrawing();
            return;
        }
        const point = message.point;
        const normalizedPoint = point &&
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y)) ? {
                x: Math.max(0, Math.min(1, Number(point.x))),
                y: Math.max(0, Math.min(1, Number(point.y)))
            } : null;
        if (message.type === 'start') {
            startCursorDrawing();
        } else if (message.type === 'move' && cursorHolding &&
            normalizedPoint) {
            renderOwnCursor(normalizedPoint);
            queueCursorPoint(normalizedPoint);
        }
    });

    window.addEventListener('blur', stopCursorDrawing);
    window.addEventListener('resize', () => {
        clearCursorTrails();
        syncCursorCaptureOverlay();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') stopCursorDrawing();
    });

    const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    let lastFullNickname = null;

    function formatMessage(el) {
        const isUserMessage = Boolean(
            el.id && el.querySelector(':scope > .user')
        );

        if (isUserMessage) {
            if (!el.dataset.gowoMessageTime) {
                el.dataset.gowoMessageTime = messageTimeFormatter.format(
                    new Date()
                );
            }

            el.classList.toggle(
                'gowo-message-has-reply',
                Boolean(el.querySelector('.text__reply'))
            );
            renderMessageEmotes(el);
        }

        if (el.dataset.formatted === '1') return;

        const nicknameEl = el.querySelector('.header-message > p');
        if (nicknameEl) {
            const fullNickname = nicknameEl.textContent.trim();
            const shortName = fullNickname.split(/\s+/)[0];

            nicknameEl.style.color = stringToColor(fullNickname);

            if (fullNickname === lastFullNickname) {
                const crown = el.querySelector('app-icon-crown');
                if (crown) crown.remove();
                nicknameEl.remove();
            } else {
                nicknameEl.textContent = shortName + ':';
                lastFullNickname = fullNickname;
            }
        }

        el.dataset.formatted = '1';
    }

    once('css', () => injectCSS(`
        body {  background: #000;  }
        .danger-message {  background: #000!important;  }

        .videoplayer {  height: 100%!important; padding-top: 10px; }
        iframe {  height: 100vh!important; margin-bottom: -50px; }
        *::-webkit-scrollbar { width: 0px!important; }

        .left-place { width: 85%!important; }
        .right-place { width: 15%!important; opacity: 0.5; }

        .chat { border-left: 0px!important; }
        .chat-header { justify-content: center!important; }

        app-icon-crown { position: relative!important; bottom: 3px; right: 3px; left: unset!important; top: unset!important}
        .message app-picture { display: none; }
        .message {
            position: relative!important;
            padding: 0 8px!important;
            margin-bottom: 5px!important;
        }
        .message .actions {
            position: absolute!important;
            top: 0;
            right: 8px;
            z-index: 4;
            padding-left: 4px!important;
            border-radius: 4px;
            background: #000;
        }
        .message .text { margin-left: 0px!important; }
        .message .text div { width: auto!important; }
        .message.gowo-message-has-reply .text {
            flex-direction: column!important;
            align-items: stretch!important;
        }
        .header-message { width: auto!important; }
        .header-message p { font-weight: bold; margin-right: 5px; }

        .message[data-gowo-message-time]::after {
            content: attr(data-gowo-message-time);
            position: absolute;
            right: 8px;
            bottom: calc(100% + 2px);
            z-index: 3;
            padding: 2px 5px;
            border-radius: 4px;
            background: #1e1e1e;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
            color: #aaa;
            font-size: 10px;
            line-height: 1.2;
            white-space: nowrap;
            pointer-events: none;
            opacity: 0;
            transform: translateY(2px);
            transition: opacity 120ms ease, transform 120ms ease;
        }
        .message[data-gowo-message-time]:hover::after {
            opacity: 1;
            transform: translateY(0);
        }

        .gowo-cursor-capture {
            position: fixed;
            z-index: 24998;
            cursor: none;
            pointer-events: auto;
            touch-action: none;
        }
        .gowo-shared-cursor {
            --gowo-user-color: #fff;
            position: fixed;
            z-index: 25000;
            width: 1px;
            height: 1px;
            opacity: 0;
            pointer-events: none;
            transform: translate(-2px, -2px);
            transition: left 45ms linear, top 45ms linear,
                opacity 100ms ease;
        }
        .gowo-shared-cursor.local {
            transition: opacity 100ms ease;
        }
        .gowo-shared-cursor.visible { opacity: 1; }
        .gowo-shared-cursor-trail {
            --gowo-user-color: #fff;
            position: fixed;
            inset: 0;
            z-index: 24999;
            width: 100vw;
            height: 100vh;
            overflow: visible;
            pointer-events: none;
        }
        .gowo-shared-cursor-trail-line {
            fill: none;
            stroke: var(--gowo-user-color);
            stroke-width: 3.5;
            stroke-linecap: round;
            stroke-linejoin: round;
            vector-effect: non-scaling-stroke;
            filter: drop-shadow(0 0 2px #000)
                drop-shadow(0 0 4px var(--gowo-user-color))
                drop-shadow(0 0 8px var(--gowo-user-color));
        }
        .gowo-shared-cursor-arrow {
            position: absolute;
            left: 0;
            top: 0;
            width: 20px;
            height: 28px;
            overflow: visible;
            filter: drop-shadow(0 0 2px #000)
                drop-shadow(0 0 4px var(--gowo-user-color))
                drop-shadow(0 0 9px var(--gowo-user-color));
        }
        .gowo-shared-cursor-arrow path {
            fill: #fff;
            stroke: #050505;
            stroke-width: 1.5;
            stroke-linejoin: round;
        }
        .gowo-shared-cursor-name {
            position: absolute;
            left: 17px;
            top: 19px;
            max-width: 10rem;
            padding: 0.16rem 0.42rem;
            overflow: hidden;
            border: 1px solid var(--gowo-user-color);
            border-radius: 999px;
            background: rgba(0, 0, 0, 0.78);
            box-shadow: 0 0 10px var(--gowo-user-color);
            color: var(--gowo-user-color);
            font: 700 0.65rem/1.25 system-ui, sans-serif;
            text-overflow: ellipsis;
            text-shadow: 0 1px 2px #000;
            white-space: nowrap;
        }

        .gowo-chat-emote {
            display: inline-block;
            width: auto!important;
            height: 1.8em!important;
            max-width: 5em!important;
            margin: 0 0.06em;
            object-fit: contain;
            vertical-align: -0.48em;
        }
        .gowo-emote-only .gowo-chat-emote {
            height: 3.25rem!important;
            max-width: 8rem!important;
            margin-right: 0.12em;
            vertical-align: middle;
        }

        app-chat-messages-room .form-message {
            position: relative!important;
        }
        app-chat-messages-room .chat-footer {
            --gowo-chat-control-height: 36px;
            --gowo-chat-control-radius: 7px;
            --gowo-chat-control-border: #555;
            --gowo-chat-control-bg: #000;
            --gowo-chat-control-text: #fff;
        }
        app-chat-messages-room .chat-footer > .d-flex {
            align-items: stretch!important;
        }
        app-chat-messages-room .chat-footer > .d-flex > .textarea {
            min-width: 0;
            width: auto!important;
            flex: 1 1 auto;
        }
        app-chat-messages-room .chat-footer textarea {
            height: var(--gowo-chat-control-height)!important;
            min-height: var(--gowo-chat-control-height)!important;
            border: 1px solid var(--gowo-chat-control-border)!important;
            border-radius: var(--gowo-chat-control-radius)!important;
            background: var(--gowo-chat-control-bg)!important;
            color: var(--gowo-chat-control-text)!important;
            transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        app-chat-messages-room .chat-footer textarea:focus {
            border-color: #fff!important;
            outline: none!important;
            box-shadow: 0 0 0 1px #fff;
        }
        app-chat-messages-room .chat-footer button.call,
        #${emoteToggleId},
        #${sendButtonId} {
            height: var(--gowo-chat-control-height);
            min-height: var(--gowo-chat-control-height);
            border: 1px solid var(--gowo-chat-control-border);
            border-radius: var(--gowo-chat-control-radius);
            background: var(--gowo-chat-control-bg);
            color: var(--gowo-chat-control-text);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: background 120ms ease, color 120ms ease,
                border-color 120ms ease, box-shadow 120ms ease;
        }
        app-chat-messages-room .chat-footer button.call {
            width: var(--gowo-chat-control-height)!important;
            min-width: var(--gowo-chat-control-height)!important;
            flex: 0 0 var(--gowo-chat-control-height)!important;
            margin: 0 5px 0 0!important;
            padding: 0!important;
            line-height: 1!important;
        }
        app-chat-messages-room .chat-footer button.call > img {
            width: 22px!important;
            height: 22px!important;
            opacity: 0.75;
            filter: invert(80%);
            transition: filter 120ms ease, opacity 120ms ease;
        }
        #${emoteToggleId} {
            width: var(--gowo-chat-control-height);
            flex: 0 0 var(--gowo-chat-control-height);
            margin-right: 5px;
            padding: 0;
            font-family: sans-serif;
            font-size: 20px!important;
            line-height: 1!important;
        }
        app-chat-messages-room .chat-footer button.call:hover,
        app-chat-messages-room .chat-footer button.call.active-call,
        #${emoteToggleId}:hover,
        #${emoteToggleId}[aria-expanded="true"],
        #${sendButtonId}:hover {
            border-color: #fff!important;
            background: #fff!important;
            color: #000!important;
        }
        app-chat-messages-room .chat-footer button.call:hover > img,
        app-chat-messages-room .chat-footer button.call.active-call > img {
            opacity: 1;
            filter: none;
        }
        app-chat-messages-room .chat-footer button.call:focus-visible,
        #${emoteToggleId}:focus-visible,
        #${sendButtonId}:focus-visible {
            border-color: #fff;
            outline: none;
            box-shadow: 0 0 0 1px #fff;
        }
        #${sendButtonId} {
            flex: 0 0 auto;
            margin-left: 5px;
            padding: 0 11px;
            font-size: 11px!important;
            font-weight: 700;
            line-height: 1!important;
        }
        #${emotePickerId} {
            box-sizing: border-box;
            min-width: 0;
            line-height: 1.35!important;
            position: absolute;
            left: 0;
            right: 0;
            bottom: calc(100% + 6px);
            z-index: 10;
            padding: 8px;
            border: 1px solid #555;
            border-radius: 9px;
            background: #111;
            box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.55);
        }
        #${emotePickerId} * { box-sizing: border-box; }
        #${emotePickerId}[hidden] { display: none!important; }
        .gowo-emote-picker-title {
            margin-bottom: 6px;
            color: #ddd;
            font-size: 11px;
            font-weight: 700;
        }
        .gowo-emote-grid {
            display: grid;
            /* Keep four columns in the 15% chat pane; images and labels below
               can shrink or wrap instead of forcing a wider minimum cell. */
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 4px;
            max-height: min(55vh, 420px);
            overflow-x: hidden;
            overflow-y: auto;
            scrollbar-width: thin;
            scrollbar-color: #555 transparent;
            overscroll-behavior: contain;
        }
        .gowo-emote-option {
            min-width: 0;
            padding: 5px 2px 4px;
            border: 1px solid transparent;
            border-radius: 6px;
            background: transparent;
            color: #999;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 2px;
            cursor: pointer;
            font: inherit;
            line-height: 1!important;
        }
        .gowo-emote-option:hover {
            border-color: #444;
            background: #242424;
            color: #fff;
        }
        .gowo-emote-picker-image {
            width: auto!important;
            height: 30px!important;
            max-width: min(54px, 100%)!important;
            flex-shrink: 0;
            object-fit: contain;
        }
        .gowo-emote-option small {
            max-width: 100%;
            color: inherit;
            font-size: 8px;
            line-height: 1.25!important;
            text-align: center;
            overflow-wrap: anywhere;
            white-space: normal;
        }
        .gowo-emote-picker-hint {
            margin-top: 6px;
            color: #777;
            font-size: 9px;
            line-height: 1.4!important;
            text-align: center;
        }

        textarea { background: #000; color: #fff; }

        html[data-gowo-hide-call-button="true"] button.call {
            display: none!important;
        }

        app-chat-settings-room .settings {
            font-size: 13px!important;
            line-height: 1.35!important;
        }
        app-chat-settings-room .settings h3 {
            font-size: 15px!important;
            line-height: 1.3!important;
        }
        app-chat-settings-room .settings label,
        app-chat-settings-room .settings label > span,
        app-chat-settings-room .settings p,
        app-chat-settings-room .settings input,
        app-chat-settings-room .settings button,
        app-chat-settings-room .settings .label {
            font-size: 13px!important;
            line-height: 1.35!important;
        }

        .gowo-setting-row { padding: 4px 0; }
        .gowo-setting-label {
            display: flex!important;
            align-items: center!important;
            gap: 10px;
            cursor: pointer;
        }
        .gowo-setting-label > input {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
        }
        .gowo-switch {
            position: relative;
            display: block;
            flex: 0 0 42px;
            width: 42px;
            height: 24px;
            border: 1px solid #7900d9;
            border-radius: 999px;
            background: transparent;
            transition: background 120ms ease;
        }
        .gowo-switch::after {
            content: '';
            position: absolute;
            top: 3px;
            left: 3px;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: #7900d9;
            transition: transform 120ms ease;
        }
        .gowo-setting-label > input:checked + .gowo-switch {
            background: #4c007d;
        }
        .gowo-setting-label > input:checked + .gowo-switch::after {
            transform: translateX(18px);
        }
        .gowo-setting-label > input:focus-visible + .gowo-switch {
            outline: 2px solid #b76cff;
            outline-offset: 2px;
        }
    `));

    function apply() {
        removeInjectedAds();
        scheduleInitialPlayerScroll();
        injectCallButtonSetting();
        injectEmotePicker();

        remove([
            '.wrap-head-room',
            '.button-under-chat',
            '.description-room',
            '.fold',
            '.expand',
            '.chat-header > h3',
            '.text-muted',
            '.ads',
            'iframe[src="ads.html"]'
        ]);

        const messages = document.querySelectorAll('.message');
        if (messages) messages.forEach(formatMessage);

        const textarea = document.querySelector('textarea');
        if (textarea) textarea.placeholder = 'Текст';
    }

    const obs = new MutationObserver(() => {
        apply();
    });

    obs.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    startCursorRelay();
    apply();
})();
// End Gowo.io+ runtime v1
