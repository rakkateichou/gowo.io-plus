// ==UserScript==
// @name         Gowo.io+
// @namespace    https://github.com/rakkateichou/gowo.io-plus
// @description  Gowo.io enhancer
// @version      2026.9.4.1
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
    `));

    function apply() {
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
})();
