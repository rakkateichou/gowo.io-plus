// ==UserScript==
// @name         Gowo.io+
// @namespace    https://github.com/rakkateichou/gowo.io-plus
// @description  Gowo.io enhancer
// @version      2026.9.4.8
// @author       rakkateichou
// @match        *://gowo.io/orooms/*
// @run-at       document-start
// @grant        none
// @homepageURL  https://github.com/rakkateichou/gowo.io-plus
// @supportURL   https://github.com/rakkateichou/gowo.io-plus/issues
// @updateURL    https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/gowo.io-plus.user.js
// @downloadURL  https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/gowo.io-plus.user.js
// ==/UserScript==

(function() {
    'use strict';

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
        { token: ':bonk:', label: 'Bonk', id: '01FT4EHG1G0001M6SADSSJAA2D' },
        { token: ':dead:', label: 'Dead', id: '01F8YE5QNR00081476FRV8XDEZ' },
        { token: ':clown:', label: 'Clown', id: '01G9FX2GSG000B7F9Y9BJECXYV' },
        { token: ':fire:', label: 'Fire', id: '01F7VQR9BR00012GPWP0G6X5NF' },
        { token: ':eyes:', label: 'Eyes', id: '01FSNNDJG80000JPZ36BHMFR5N' },
        { token: ':popcorn:', label: 'Popcorn', id: '01F86QDWK800018ZVH7PJSP4S5' },
        { token: ':salute:', label: 'Salute', id: '01F6Q8CVB000015Y8FNQBA5VBR' },
        { token: ':chef:', label: 'Chef', id: '01FFR5Q96R0007P57XYW0BJAXG' },
        { token: ':party:', label: 'Party', id: '01F6Q93YK8000EQZ7QARQERNWC' },
        { token: ':heart:', label: 'Heart', id: '01F6NPP6YG00013ACMMJP3W06V' },
        { token: ':raintime:', label: 'RainTime', id: '01FCY771D800007PQ2DF3GDTN6' },
        { token: ':petpet:', label: 'PETPET', id: '01FE3XY508000AA32JP519W2EW' },
        { token: ':ppl:', label: 'ppL', id: '01GGD5PJA8000FH13S498E9D8X' },
        { token: ':clap:', label: 'Clap', id: '01GAM8EFQ00004MXFXAJYKA859' },
        { token: ':pepepls:', label: 'PepePls', id: '01GAFTZ9K80003DHH026MC7JW0' },
        { token: ':peepohappy:', label: 'peepoHappy', id: '01GAZ199Z8000FEWHS6AT5QZV0' },
        { token: ':peeposad:', label: 'peepoSad', id: '01GAZ4SBX80007YCE2RXBT44B2' },
        { token: ':feelsdankman:', label: 'FeelsDankMan', id: '01GB9W8JN80004CKF2H1TWA99H' },
        { token: ':billyapprove:', label: 'BillyApprove', id: '01GB2S7H7000018VJGJ4A9BMFS' },
        { token: ':forsenpls:', label: 'forsenPls', id: '01GB8EQNJ8000497KFBZWNSDFZ' },
        { token: ':aliendance:', label: 'AlienDance', id: '01GB2ZJFBG000DTBJYANG8XYFP' },
        { token: ':basedgod:', label: 'BasedGod', id: '01GB9W2CDG000BFSD141G0MGSA' },
        { token: ':peepopls:', label: 'peepoPls', id: '01HM524VE80004SKSHMCZWXH1T' },
        { token: ':teatime:', label: 'TeaTime', id: '01HM4P26CR000449DZBT4FVMA5' },
        { token: ':pianotime:', label: 'PianoTime', id: '01G98V81Q80000BRQD106P0ZEK' },
        { token: ':nymncorn:', label: 'nymnCorn', id: '01HM6NJ2X000035ZKVAPWBNW26' },
        { token: ':seventv:', label: 'sevenTV', id: '01J107C3E8000DX4MZBQSYGRXS' },
        { token: ':nanaayaya:', label: 'nanaAYAYA', id: '01FTEZEE900001E12995B12GR4' },
        { token: ':biblethump:', label: 'BibleThump', id: '01J8NMZ2HG0005G1FWF2H9Y615' },
        { token: ':glorp:', label: 'glorp', id: '01H16FA16G0005EZED5J0EY7KN' },
        { token: ':stare:', label: 'Stare', id: '01GG3YGWK8000DWE419062SG28' },
        { token: ':acestare:', label: 'aceStare', id: '01JY2MX5BE5BVWWFV153ANMMHZ' },
        { token: ':ayaya:', label: 'AYAYA', id: '01GB32XE6R00018VJGJ4A9BNCV' },
        { token: ':rareparrot:', label: 'RareParrot', id: '01GB4XE3ZR000DKFRGM9Q1M7VS' },
        { token: ':feelsweirdman:', label: 'FeelsWeirdMan', id: '01GB4FWTR8000DGEZ8VYY59RBN' },
        { token: ':ez:', label: 'EZ', id: '01GB4CK01800090V9B3D8CGEEX' },
        { token: ':feelsokayman:', label: 'FeelsOkayMan', id: '01GB46137R000BJ5HR8F6XV8J1' },
        { token: ':feelsstrongman:', label: 'FeelsStrongMan', id: '01GB4EV0Q800090V9B3D8CGEHV' },
        { token: ':7cinema:', label: '7Cinema', id: '01GBFDVP18000CRDCG0DV7KEMY' },
        { token: ':xdx:', label: 'xdx', id: '01FZBTBQDG000DX0N9GHCRXYPH' }
    ]);
    const sevenTvEmoteByToken = new Map(
        sevenTvEmotes.map(emote => [emote.token, emote])
    );
    const sevenTvTokenSource = sevenTvEmotes
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

        const scrollWhenReady = () => {
            if (!player.isConnected) {
                scheduledPlayerScrolls.delete(player);
                return;
            }

            if (player.scrollHeight > player.clientHeight) {
                // Let the Angular player finish its current layout before scrolling.
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (!player.isConnected) return;
                    player.scrollTop = player.scrollHeight - player.clientHeight;
                    completedPlayerScrolls.add(player);
                }));
                return;
            }

            attempts++;
            if (attempts < 50) {
                setTimeout(scrollWhenReady, 100);
            } else {
                scheduledPlayerScrolls.delete(player);
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

        const actions = el.querySelector('.actions');
        const innerDiv = el.querySelector('div');
        if (actions && innerDiv) {
            innerDiv.append(actions);
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
        .message { padding: 0 8px!important; margin-bottom: 5px!important; }
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
        #${emoteToggleId} {
            width: var(--gowo-chat-control-height);
            flex: 0 0 var(--gowo-chat-control-height);
            margin-right: 5px;
            padding: 0;
            font-family: sans-serif;
            font-size: 20px!important;
            line-height: 1!important;
        }
        #${emoteToggleId}:hover,
        #${emoteToggleId}[aria-expanded="true"],
        #${sendButtonId}:hover {
            border-color: #fff;
            background: #fff;
            color: #000;
        }
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
        #${emotePickerId}[hidden] { display: none!important; }
        .gowo-emote-picker-title {
            margin-bottom: 6px;
            color: #ddd;
            font-size: 11px;
            font-weight: 700;
        }
        .gowo-emote-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 4px;
            max-height: min(55vh, 420px);
            overflow-y: auto;
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
            max-width: 54px!important;
            object-fit: contain;
        }
        .gowo-emote-option small {
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            color: inherit;
            font-size: 8px;
            white-space: nowrap;
        }
        .gowo-emote-picker-hint {
            margin-top: 6px;
            color: #777;
            font-size: 9px;
            text-align: center;
        }

        textarea { background: #000; color: #fff; }
        .call { background: #000!important; }
        .call > img { filter: invert(80%); }

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

    apply();
})();
