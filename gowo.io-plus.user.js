// ==UserScript==
// @name         Gowo.io+
// @namespace    https://github.com/rakkateichou/gowo.io-plus
// @description  Gowo.io enhancer — loads the latest features on each page load
// @version      2026.9.4.19
// @author       rakkateichou
// @match        *://gowo.io/orooms/*
// @match        *://*.obrut.show/embed/*
// @match        *://alloha.gowo.tv/*
// @run-at       document-start
// @sandbox      DOM
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      raw.githubusercontent.com
// @homepageURL  https://github.com/rakkateichou/gowo.io-plus
// @supportURL   https://github.com/rakkateichou/gowo.io-plus/issues
// @updateURL    https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/gowo.io-plus.user.js
// @downloadURL  https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/gowo.io-plus.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Keep the installer stable; normal updates belong in gowo.io-plus.js.
    if (window.__gowoPlusLoaderV1) return;
    window.__gowoPlusLoaderV1 = true;

    const runtimeUrl = 'https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/gowo.io-plus.js';
    const cacheKey = 'gowo-plus-last-working-runtime-v1';
    const logPrefix = '[Gowo.io+ loader]';

    function compile(source) {
        if (typeof source !== 'string' || source.length > 1024 * 1024 ||
            !source.startsWith('// Gowo.io+ runtime v1\n') ||
            !source.trimEnd().endsWith('// End Gowo.io+ runtime v1')) {
            throw new Error('Invalid or incomplete Gowo.io+ runtime');
        }
        // Compile before executing: an HTML error page or syntax error must not
        // replace the cached copy or partially initialize the enhancer.
        return new Function('window', 'document',
            `${source}\n//# sourceURL=${runtimeUrl}`);
    }

    function fetchRuntime(timeoutMs) {
        return new Promise((resolve, reject) => {
            let settled = false;
            let request;
            const finish = (error, source) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (error) reject(error);
                else resolve(source);
            };
            // Anonymous requests use fetch mode, whose timeout option does not
            // work in Chrome. Own the deadline and abort the request explicitly.
            const timer = setTimeout(() => {
                finish(new Error('GitHub request timed out'));
                request?.abort();
            }, timeoutMs);
            try {
                request = GM_xmlhttpRequest({
                    method: 'GET',
                    url: `${runtimeUrl}?t=${Date.now()}`,
                    anonymous: true,
                    nocache: true,
                    onload(response) {
                        if (settled) return;
                        try {
                            const finalUrl = new URL(response.finalUrl);
                            const expectedUrl = new URL(runtimeUrl);
                            if (response.status !== 200 ||
                                finalUrl.origin !== expectedUrl.origin ||
                                finalUrl.pathname !== expectedUrl.pathname) {
                                throw new Error(`Unexpected runtime response (${response.status})`);
                            }
                            finish(null, response.responseText.replace(/\r\n/g, '\n'));
                        } catch (error) {
                            finish(error);
                        }
                    },
                    onerror: () => finish(new Error('Cannot reach GitHub')),
                    onabort: () => finish(new Error('GitHub request aborted')),
                    ontimeout: () => finish(new Error('GitHub request timed out'))
                });
            } catch (error) {
                finish(error);
            }
        });
    }

    function documentReady() {
        if (document.documentElement) return Promise.resolve();
        return new Promise(resolve => {
            const observer = new MutationObserver(() => {
                if (!document.documentElement) return;
                observer.disconnect();
                resolve();
            });
            observer.observe(document, { childList: true });
        });
    }

    async function boot() {
        let cached = '';
        try {
            cached = GM_getValue(cacheKey, '');
        } catch (error) {
            console.warn(logPrefix, 'Could not read the offline copy.', error);
        }

        let source;
        let run;
        try {
            source = await fetchRuntime(cached ? 2500 : 10000);
            run = compile(source);
        } catch (error) {
            if (!cached) throw error;
            console.warn(logPrefix, 'Using the last working copy for this page.', error);
            source = cached;
            run = compile(source);
        }

        await documentReady();
        // Run just once per document, including player frames. Never hot-swap a
        // running copy: duplicate observers and cursor connections cause bugs.
        // If startup throws, keep the prior cache and do not run a second copy
        // over any side effects the failed startup may already have produced.
        run(window, document);
        if (source !== cached) {
            try {
                GM_setValue(cacheKey, source);
            } catch (error) {
                console.warn(logPrefix, 'Could not save the offline copy.', error);
            }
        }
    }

    boot().catch(error => {
        console.error(logPrefix, 'Could not start Gowo.io+. Reload the page to retry.', error);
    });
})();
