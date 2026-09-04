// ==UserScript==
// @name         Gowo.io+
// @namespace    https://github.com/rakkateichou/gowo.io-plus
// @description  Gowo.io enhancer
// @version      2026.9.4.4
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

    let lastFullNickname = null;

    function formatMessage(el) {
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
        .header-message { width: auto!important; }
        .header-message p { font-weight: bold; margin-right: 5px; }

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
