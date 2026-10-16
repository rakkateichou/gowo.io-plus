// Gowo.io+ runtime v1
// Loaded by gowo.io-plus.user.js on every page load. Edit this file for feature updates.

(function() {
    'use strict';

    const cursorBridgeMarker = 'gowo-plus-cursor-bridge-v1';
    const seekBridgeMarker = 'gowo-plus-seek-bridge-v1';
    const isCursorDrawKey = event => event.key === 'Control' ||
        event.code === 'ControlLeft' || event.code === 'ControlRight';
    const toolbarBridgeMarker = 'gowo-plus-player-toolbar-v1';

    const cursorPaintMarker = 'gowo-plus-cursor-paint-v1';
    const sharedCursorCSS = `
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
    `;

    // Paints named cursors and their smoothed trails. Used by the room page
    // and, while the player is fullscreen, by the bridge inside its frame.
    function createCursorPainter() {
        // A stroke is drawn as a chain of short paths, so a long drawing never
        // has to rebuild (or give up) its beginning.
        const trailSegmentPoints = 300;
        const maxTrailSegments = 200;
        const curveTension = 0.45;
        const elements = new Map();
        const trails = new Map();
        // Only descendants of the fullscreen element are visible.
        const host = () => {
            const fullscreen = document.fullscreenElement;
            return fullscreen && !['IFRAME', 'VIDEO'].includes(fullscreen.tagName) ?
                fullscreen : document.body;
        };

        function trailPath(points) {
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
                const scale = curveTension / 6;
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

        function trailFor(clientId, username) {
            let trail = trails.get(clientId);
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
                host().append(element);
                trail = { element, line, points: [] };
                trails.set(clientId, trail);
            }
            trail.element.style.setProperty(
                '--gowo-user-color',
                stringToColor(username)
            );
            return trail;
        }

        function addTrailPoint(clientId, username, x, y) {
            const trail = trailFor(clientId, username);
            const previous = trail.points[trail.points.length - 1];
            if (previous) {
                const distance = Math.hypot(x - previous.x, y - previous.y);
                if (distance < 1) return;
            }
            if (trail.points.length >= trailSegmentPoints) {
                // Leave the finished path as it is and continue in a new one,
                // overlapping by a point so the line has no gap.
                trail.line = trail.line.cloneNode(false);
                trail.line.removeAttribute('d');
                trail.element.append(trail.line);
                trail.points = trail.points.slice(-2);
                if (trail.element.childElementCount > maxTrailSegments) trail.element.firstElementChild.remove();
            }
            trail.points.push({ x, y });
            trail.line.setAttribute('d', trailPath(trail.points));
        }

        function elementFor(clientId, username, local) {
            let element = elements.get(clientId);
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
                if (local) element.classList.add('local');
                host().append(element);
                elements.set(clientId, element);
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

        function removeTrail(clientId) {
            trails.get(clientId)?.element.remove();
            trails.delete(clientId);
        }

        function remove(clientId) {
            elements.get(clientId)?.remove();
            elements.delete(clientId);
            removeTrail(clientId);
        }

        return {
            host,
            remove,
            clients: () => Array.from(elements.keys()),
            clearTrails: () => Array.from(trails.keys()).forEach(removeTrail),
            clear: () => [...elements.keys(), ...trails.keys()].forEach(remove),
            paint(clientId, username, x, y, local = false) {
                const element = elementFor(clientId, username, local);
                addTrailPoint(clientId, username, x, y);
                element.style.left = `${x}px`;
                element.style.top = `${y}px`;
                element.classList.add('visible');
            }
        };
    }

    function initPlayerToolbarBridge() {
        let state = null;
        let controls = null;
        let nativeShare = null;
        let ready = false;
        let acknowledgeState = false;
        let scheduled = false;
        const send = (type, extra = {}) => window.parent.postMessage({
            source: toolbarBridgeMarker, type, ...extra
        }, 'https://gowo.io');
        const setReady = value => {
            if (ready === value && !acknowledgeState) return;
            acknowledgeState = false;
            ready = value;
            send('ready', { ready });
        };
        const setStyle = (element, property, value) => {
            if (element.style[property] !== value) element.style[property] = value;
        };

        function syncVisibility(root, nativeHeaders) {
            // Follow the native toolbar, not playback itself: PlayerJS also
            // reveals these controls on mouse movement while video is playing.
            let opacity = nativeHeaders.length ? 0 : 1;
            let animating = false;
            for (const header of nativeHeaders) {
                let headerOpacity = 1;
                for (let element = header.firstElementChild || header;
                    element && element !== root; element = element.parentElement) {
                    const style = window.getComputedStyle(element);
                    if (style.display === 'none' || style.visibility === 'hidden' ||
                        style.visibility === 'collapse') headerOpacity = 0;
                    const value = parseFloat(style.opacity);
                    if (Number.isFinite(value)) headerOpacity *= value;
                    // CSS transitions don't emit a mutation for every frame.
                    // Sample only while a native animation is actually running.
                    if (element.getAnimations?.().some(animation => animation.playState === 'running')) {
                        animating = true;
                    }
                }
                opacity = Math.max(opacity, headerOpacity);
            }
            const hidden = opacity <= 0;
            setStyle(controls, 'opacity', String(opacity));
            setStyle(controls, 'visibility', hidden ? 'hidden' : 'visible');
            if (controls.inert !== hidden) controls.inert = hidden;
            if (controls.getAttribute('aria-hidden') !== String(hidden)) {
                controls.setAttribute('aria-hidden', String(hidden));
            }
            if (animating) schedule();
        }

        function layout() {
            scheduled = false;
            const root = document.querySelector('#oframeplayer');
            // PlayerJS has no semantic selector for Share. Match its native SVG,
            // and keep its layout box as the anchor for our Refresh button.
            const shareSvg = root?.querySelector('path[d^="M12.6,12.6"]')?.closest('svg');
            const share = shareSvg?.parentElement?.parentElement?.parentElement;
            const background = share?.firstElementChild?.firstElementChild;
            if (!state || !root || !share || !background) {
                if (nativeShare) nativeShare.classList.remove('gowo-native-share');
                nativeShare = null;
                controls?.remove();
                controls = null;
                setReady(false);
                return;
            }

            if (!controls || controls.parentElement !== root) {
                controls?.remove();
                controls = document.createElement('div');
                controls.id = 'gowo-player-controls';
                controls.innerHTML = `
                    <div class="gowo-player-control-row">
                        <select aria-label="Плеер" title="Выбрать плеер"></select>
                        <span class="gowo-player-admin-notice" role="status"></span>
                    </div>
                    <button type="button" class="gowo-player-refresh" title="Обновить плеер" aria-label="Обновить плеер">
                        <svg viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M23.8346 13C23.8346 18.98 18.9813 23.8333 13.0013 23.8333C7.0213 23.8333 3.37047 17.81 3.37047 17.81M3.37047 17.81H8.26714M3.37047 17.81V23.2266M2.16797 13C2.16797 7.01996 6.97797 2.16663 13.0013 2.16663C20.2271 2.16663 23.8346 8.18996 23.8346 8.18996M23.8346 8.18996V2.77329M23.8346 8.18996H19.0246" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>`;
                controls.querySelector('select').addEventListener('change', event => {
                    send('platform', { label: event.target.value });
                });
                controls.querySelector('button').addEventListener('click', () => send('refresh'));
                // These controls are not video-surface clicks or shortcuts.
                ['click', 'mousedown', 'keydown', 'keyup'].forEach(type => {
                    controls.addEventListener(type, event => event.stopPropagation());
                });
                root.append(controls);
            }
            nativeShare = share;
            if (!share.classList.contains('gowo-native-share')) share.classList.add('gowo-native-share');

            const select = controls.querySelector('select');
            const optionsKey = JSON.stringify(state.platforms);
            if (select.dataset.options !== optionsKey) {
                select.replaceChildren(...state.platforms.map(platform => {
                    const option = document.createElement('option');
                    option.textContent = option.value = platform.label;
                    option.disabled = platform.disabled;
                    option.selected = platform.active;
                    return option;
                }));
                select.dataset.options = optionsKey;
            }
            const notice = controls.querySelector('.gowo-player-admin-notice');
            if (notice.textContent !== state.warning) notice.textContent = state.warning;
            if (notice.title !== state.warning) notice.title = state.warning;
            notice.hidden = !state.warning;
            controls.querySelector('button').disabled = !state.canRefresh;

            const rootRect = root.getBoundingClientRect();
            const shareRect = share.getBoundingClientRect();
            const nativeHeaders = Array.from(root.querySelectorAll(
                '#player_playlist1, #player_playlist2, #player_playlist3, #player_playlist4, #player_playlist5'
            ));
            const headers = nativeHeaders.map(element => element.firstElementChild?.getBoundingClientRect())
                .filter(rect => rect?.width > 0 && rect.height > 0);
            const left = Math.max(rootRect.left + 4, ...headers.map(rect => rect.right)) - rootRect.left + 8;
            const row = controls.querySelector('.gowo-player-control-row');
            const top = Math.max(0, shareRect.top - rootRect.top - 20);
            // Keep the last position if auto-hide removes the native layout boxes.
            if (headers.length || !nativeHeaders.length || !row.style.left) setStyle(row, 'left', `${left}px`);
            setStyle(row, 'right', `${Math.max(0, rootRect.right - shareRect.left + 28)}px`);
            setStyle(row, 'top', `${top}px`);
            const refresh = controls.querySelector('button');
            setStyle(refresh, 'left', `${shareRect.left - rootRect.left - 20}px`);
            setStyle(refresh, 'top', `${top}px`);
            syncVisibility(root, nativeHeaders);
            setReady(true);
        }

        const schedule = () => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(layout);
        };
        window.addEventListener('message', event => {
            const message = event.data;
            if (event.source !== window.parent || event.origin !== 'https://gowo.io' ||
                message?.source !== toolbarBridgeMarker || message.type !== 'state' ||
                !Array.isArray(message.platforms) || !message.platforms.length ||
                message.platforms.length > 20 || message.platforms.some(platform =>
                    typeof platform?.label !== 'string' || platform.label.length > 100) ||
                typeof message.warning !== 'string' || message.warning.length > 2000) return;
            state = message;
            // The parent can receive iframe.onload after our first ready event.
            // A fresh state message must acknowledge readiness even if unchanged.
            acknowledgeState = true;
            schedule();
        });
        const observer = new MutationObserver(records => {
            if (records.some(record => !controls?.contains(record.target))) schedule();
        });
        observer.observe(document.documentElement, {
            childList: true, subtree: true, characterData: true,
            attributes: true, attributeFilter: ['style', 'class', 'hidden']
        });
        window.addEventListener('resize', schedule);
        injectCSS(`
            /* Keep the anchor measurable, but hide the entire native control
               and disable its descendants' explicit pointer-events: auto. */
            .gowo-native-share, .gowo-native-share * {
                visibility: hidden!important; pointer-events: none!important;
            }
            #gowo-player-controls { position: absolute; inset: 0; pointer-events: none; z-index: 1001; }
            #gowo-player-controls * { box-sizing: border-box; }
            .gowo-player-control-row { position: absolute; height: 40px; display: flex; align-items: center; gap: 12px; }
            .gowo-player-control-row select {
                pointer-events: auto; color-scheme: dark; appearance: auto;
                flex: 0 1 164px; width: 164px; min-width: 96px; max-width: 100%; height: 40px;
                margin: 0; padding: 0 10px; border: 0; border-radius: 10px;
                background: #191a1c; color: #fff; font: 15px Arial, sans-serif; cursor: pointer;
            }
            .gowo-player-admin-notice {
                min-width: 0; flex: 1; max-height: 40px; overflow: hidden;
                color: #ff7379; font: 13px/18px Arial, sans-serif;
                display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
                pointer-events: auto;
            }
            .gowo-player-admin-notice[hidden] { display: none!important; }
            .gowo-player-refresh {
                position: absolute; pointer-events: auto; display: grid; place-items: center;
                width: 40px; height: 40px; margin: 0; padding: 7px; border: 0;
                background: transparent; color: #fff; border-radius: 10px; cursor: pointer;
            }
            .gowo-player-refresh svg { width: 26px; height: 26px; }
            .gowo-player-refresh:hover { color: #bbb; }
            .gowo-player-refresh:disabled { opacity: .4; cursor: default; }
            .gowo-player-refresh:focus-visible, .gowo-player-control-row select:focus-visible {
                outline: 1px solid #fff; outline-offset: 2px;
            }
        `);
        send('request');
    }

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
            if (!isCursorDrawKey(event)) {
                // Ctrl+C, Ctrl+V and other shortcuts are not drawing.
                if (event.ctrlKey && holding) stop();
                return;
            }
            if (event.repeat || holding || event.metaKey || event.altKey) return;
            // Text fields keep the key, where it only begins a shortcut.
            if (!isEditableElement(event.target)) event.preventDefault();
            holding = true;
            // The last mousemove can predate the key press by several seconds.
            // Start an empty stroke and let the first live move set its origin.
            send('start');
        }, true);

        document.addEventListener('keyup', event => {
            if (!isCursorDrawKey(event) || event.ctrlKey || !holding) return;
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

        // The room page draws the cursors over this frame. Fullscreen hides
        // everything outside the frame, so repaint them here meanwhile.
        const painter = createCursorPainter();
        let painterStyled = false;
        window.addEventListener('message', event => {
            const message = event.data;
            if (event.origin !== 'https://gowo.io' || event.source !== window.parent ||
                message?.source !== cursorPaintMarker) return;
            const client = String(message.client || '').slice(0, 64);
            if (message.type === 'clear') return painter.clear();
            if (message.type === 'remove') return painter.remove(client);
            const x = Number(message.point?.x);
            const y = Number(message.point?.y);
            if (message.type !== 'show' || !client || !document.fullscreenElement ||
                !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
            if (!painterStyled) {
                painterStyled = true;
                injectCSS(sharedCursorCSS);
            }
            painter.paint(
                client,
                String(message.username || 'Anonymous').slice(0, 40),
                x * window.innerWidth,
                y * window.innerHeight,
                message.local === true
            );
        });
        document.addEventListener('fullscreenchange', () => painter.clear());
        window.addEventListener('resize', () => painter.clearTrails());
    }

    // A viewer's turbo player ignores its own timeline: a click there only
    // pauses. Catch that click and report where on the timeline it landed, so
    // the room page can ask for a seek.
    function initPlayerSeekBridge() {
        const timeline = () => {
            let best = null;
            for (const element of document.querySelectorAll('pjsdiv')) {
                const rect = element.getBoundingClientRect();
                if (rect.width < window.innerWidth * 0.6 || rect.height < 1 || rect.height > 14 ||
                    rect.bottom < window.innerHeight - 140 || rect.width <= (best?.width || 0)) continue;
                const style = window.getComputedStyle(element);
                if (style.visibility === 'hidden' || style.display === 'none') continue;
                best = rect;
            }
            return best;
        };
        const inBand = (event, rect) => Boolean(rect) &&
            event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8 &&
            event.clientX >= rect.left && event.clientX <= rect.right;
        const fractionAt = (event, rect) => Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
        // The episode itself, not an ad: the longest video with a known length.
        const video = () => [...document.querySelectorAll('video')].reduce((best, candidate) =>
            Number.isFinite(candidate.duration) && candidate.duration > (best?.duration || 0) ? candidate : best, null);
        const formatTime = value => {
            const total = Math.max(0, Math.round(value));
            const hours = Math.floor(total / 3600);
            const minutes = Math.floor(total / 60) % 60;
            const seconds = String(total % 60).padStart(2, '0');
            return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}` : `${minutes}:${seconds}`;
        };

        // A marker on the timeline with the time under the pointer, and after
        // a click, whether the room has moved there yet.
        let hint = null;
        let pending = null;
        let lastMove = null;
        let moveFrame = 0;
        const showHint = (x, rect, text, state) => {
            if (!hint?.isConnected) {
                hint = document.createElement('div');
                hint.id = 'gowo-seek-hint';
                hint.setAttribute('aria-hidden', 'true');
                hint.innerHTML = '<span class="gowo-seek-mark"></span><span class="gowo-seek-label"></span>';
                (document.body || document.documentElement).append(hint);
            }
            hint.hidden = false;
            hint.dataset.state = state;
            hint.style.left = `${x}px`;
            hint.style.top = `${rect.top + rect.height / 2}px`;
            const label = hint.querySelector('.gowo-seek-label');
            label.textContent = text;
            label.hidden = !text;
            // Keep the label inside the player near its edges.
            const edge = Math.min(Math.max(x, 60), window.innerWidth - 60);
            label.style.left = `${edge - x}px`;
        };
        const hideHint = () => { if (hint && !pending) hint.hidden = true; };
        const hover = () => {
            moveFrame = 0;
            const event = lastMove;
            const rect = timeline();
            const over = inBand(event, rect);
            document.documentElement.classList.toggle('gowo-seek-hover', over);
            if (pending) return;
            if (!over) return hideHint();
            const media = video();
            showHint(event.clientX, rect, media ? formatTime(fractionAt(event, rect) * media.duration) : '', 'hover');
        };
        document.addEventListener('pointermove', event => {
            lastMove = { clientX: event.clientX, clientY: event.clientY };
            if (!moveFrame) moveFrame = requestAnimationFrame(hover);
        }, { capture: true, passive: true });
        document.documentElement.addEventListener('pointerleave', () => {
            document.documentElement.classList.remove('gowo-seek-hover');
            hideHint();
        });

        const settle = (state, text, ms) => {
            pending.state = state;
            showHint(pending.x, pending.rect, text, state);
            setTimeout(() => {
                pending = null;
                if (hint) hint.hidden = true;
            }, ms);
        };
        const watchSeek = () => {
            if (!pending || pending.state !== 'pending') return;
            const media = video();
            if (media && Math.abs(media.currentTime - pending.time) < 2) {
                return settle('done', `✓ ${formatTime(pending.time)}`, 900);
            }
            // Nobody who controls the room took it up within about five
            // seconds: owner away, or turned off.
            if (++pending.checks >= 20) return settle('failed', 'Не получилось перемотать', 2500);
            setTimeout(watchSeek, 250);
        };

        const handle = event => {
            if (event.button || !event.isTrusted && event.type !== 'click') return;
            const rect = timeline();
            if (!inBand(event, rect)) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.type !== 'click') return;
            const fraction = fractionAt(event, rect);
            window.parent.postMessage({ source: seekBridgeMarker, type: 'seek', fraction }, 'https://gowo.io');
            const media = video();
            if (!media) return;
            pending = { time: fraction * media.duration, x: event.clientX, rect, checks: 0, state: 'pending' };
            showHint(pending.x, rect, `→ ${formatTime(pending.time)}`, 'pending');
            setTimeout(watchSeek, 250);
        };
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
            document.addEventListener(type, handle, true);
        }

        injectCSS(`
            html.gowo-seek-hover, html.gowo-seek-hover * { cursor: pointer!important; }
            #gowo-seek-hint { position: fixed; z-index: 2147483000; width: 0; height: 0; pointer-events: none; }
            #gowo-seek-hint[hidden] { display: none!important; }
            #gowo-seek-hint .gowo-seek-mark {
                position: absolute; left: -1.5px; top: -7px; width: 3px; height: 14px;
                border-radius: 2px; background: #fff; box-shadow: 0 0 3px rgba(0, 0, 0, .8);
            }
            #gowo-seek-hint .gowo-seek-label {
                position: absolute; bottom: 12px; transform: translateX(-50%); white-space: nowrap;
                padding: 3px 7px; border-radius: 6px; background: rgba(25, 26, 28, .92);
                color: #fff; font: 12px/16px Arial, sans-serif;
            }
            #gowo-seek-hint .gowo-seek-label[hidden] { display: none; }
            #gowo-seek-hint[data-state="pending"] .gowo-seek-mark { background: #b76cff; }
            #gowo-seek-hint[data-state="failed"] .gowo-seek-label { color: #ff7379; }
        `);
    }

    if (window.top !== window.self) {
        const hostname = window.location.hostname.toLowerCase();
        if (hostname === 'alloha.gowo.tv' ||
            hostname.endsWith('.obrut.show')) {
            initPlayerCursorBridge();
            initPlayerToolbarBridge();
            if (/[?&]readonly=1(?:&|$)/.test(window.location.search || '')) initPlayerSeekBridge();
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
    // The 7TV CDN is unreachable for some viewers, so serve the repository's
    // copies (the same host as this runtime) and keep 7TV as the fallback.
    const sevenTvImageUrl = id =>
        `https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/emotes/${id}.webp`;
    const sevenTvFallbackImageUrl = id =>
        `https://cdn.7tv.app/emote/${id}/2x.webp`;
    const emoteToggleId = 'gowo-emote-toggle';
    const emotePickerId = 'gowo-emote-picker';
    const sendButtonId = 'gowo-send-button';
    const emoteAutocompleteId = 'gowo-emote-autocomplete';

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
        image.addEventListener('error', () => {
            image.src = sevenTvFallbackImageUrl(emote.id);
        }, { once: true });
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

    function insertEmoteAtCaret(input, token, replacement = null) {
        if (!input || !sevenTvEmoteByToken.has(token.toLowerCase())) {
            return false;
        }

        const value = input.value || '';
        const start = replacement?.start ?? (Number.isInteger(input.selectionStart) ?
            input.selectionStart : value.length);
        const end = replacement?.end ?? (Number.isInteger(input.selectionEnd) ?
            input.selectionEnd : start);
        const before = value.slice(0, start);
        const after = value.slice(end);
        const prefix = !replacement && before && !/\s$/.test(before) ? ' ' : '';
        const suffix = replacement ? (!after || !/^[\s.,!?;:)\]}]/.test(after) ? ' ' : '') :
            (after && !/^\s/.test(after) ? ' ' : '');
        const insertion = `${prefix}${token}${suffix}`;
        const nextValue = `${before}${insertion}${after}`;

        if (input.maxLength >= 0 && nextValue.length > input.maxLength) {
            return false;
        }

        setComposerValue(input, nextValue, start + insertion.length);
        return true;
    }

    // Angular only notices a value written through the native setter.
    function setComposerValue(input, value, caret = value.length) {
        const valueSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype,
            'value'
        )?.set;
        if (valueSetter) {
            valueSetter.call(input, value);
        } else {
            input.value = value;
        }
        input.focus({ preventScroll: true });
        input.setSelectionRange(caret, caret);
        input.dispatchEvent(new Event('input', { bubbles: true }));
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

        emoteAutocomplete?.close(true);
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

    function getEmoteCompletion(input) {
        const caret = input.selectionStart;
        if (!Number.isInteger(caret) || caret !== input.selectionEnd) return null;
        const value = input.value;
        // A token begins at a word boundary, not inside a URL, time or another token.
        const match = value.slice(0, caret).match(/(?:^|[\s([{]):([a-z0-9]+)$/i);
        if (!match) return null;
        const query = match[1].toLowerCase();
        const start = caret - query.length - 1;
        const end = caret + value.slice(caret).match(/^[a-z0-9]*:?/i)[0].length;
        const matches = sevenTvEmotes.filter(emote =>
            emote.token.includes(query) || emote.label.toLowerCase().includes(query)
        ).sort((a, b) => Number(b.token.slice(1).startsWith(query)) -
            Number(a.token.slice(1).startsWith(query))).slice(0, 8);
        return matches.length ? { start, end, matches, key: JSON.stringify([value, caret]) } : null;
    }

    let emoteAutocomplete = null;

    function initEmoteAutocomplete(input, form) {
        if (emoteAutocomplete?.input === input && emoteAutocomplete.list.isConnected) return;
        emoteAutocomplete?.destroy();
        const list = document.createElement('div');
        list.id = emoteAutocompleteId;
        list.hidden = true;
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', 'Emote suggestions');
        form.append(list);
        const previousAutocomplete = input.getAttribute('aria-autocomplete');
        const previousControls = input.getAttribute('aria-controls');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-controls', [previousControls, list.id].filter(Boolean).join(' '));
        let current = null;
        let selected = 0;
        let dismissed = '';
        let composing = false;
        let accepting = false;
        const listeners = [];
        const listen = (target, name, fn, capture = false) => {
            target.addEventListener(name, fn, capture);
            listeners.push(() => target.removeEventListener(name, fn, capture));
        };
        const close = (dismiss = false) => {
            if (dismiss) dismissed = JSON.stringify([input.value, input.selectionStart]);
            current = null;
            list.hidden = true;
            input.removeAttribute('aria-activedescendant');
        };
        const highlight = () => {
            [...list.children].forEach((option, index) => {
                option.setAttribute('aria-selected', String(index === selected));
            });
            const option = list.children[selected];
            input.setAttribute('aria-activedescendant', option.id);
            // Scroll only the suggestion list, never the room or video pane.
            if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
            else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) {
                list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
            }
        };
        const update = () => {
            if (accepting) return;
            if (composing || document.activeElement !== input || !input.isConnected ||
                !document.getElementById(emotePickerId)?.hidden) return close();
            const next = getEmoteCompletion(input);
            if (!next || next.key === dismissed) return close();
            if (next.key === current?.key) return;
            current = next;
            selected = 0;
            list.replaceChildren(...next.matches.map((emote, index) => {
                const option = document.createElement('button');
                option.type = 'button';
                option.tabIndex = -1;
                option.id = `${list.id}-${index}`;
                option.dataset.index = String(index);
                option.setAttribute('role', 'option');
                option.setAttribute('aria-label', `${emote.label} ${emote.token}`);
                option.title = emote.token;
                const image = createSevenTvEmoteImage(emote, true);
                image.setAttribute('aria-hidden', 'true');
                const label = document.createElement('span');
                label.textContent = emote.token;
                option.append(image, label);
                return option;
            }));
            list.hidden = false;
            highlight();
        };
        const accept = index => {
            if (!current || getEmoteCompletion(input)?.key !== current.key) return close();
            const emote = current.matches[index];
            if (!emote) return;
            accepting = true;
            try { insertEmoteAtCaret(input, emote.token, current); }
            finally { accepting = false; close(true); }
        };
        listen(input, 'input', update);
        listen(input, 'click', update);
        listen(input, 'focus', update);
        listen(input, 'compositionstart', () => { composing = true; close(); });
        listen(input, 'compositionend', () => { composing = false; update(); });
        listen(input, 'blur', event => { if (!list.contains(event.relatedTarget)) close(true); });
        listen(document, 'selectionchange', () => { if (document.activeElement === input) update(); });
        listen(document, 'click', event => {
            if (event.target !== input && !list.contains(event.target)) close(true);
        });
        listen(input, 'keydown', event => {
            if (composing || event.isComposing || event.keyCode === 229 || event.ctrlKey ||
                event.metaKey || event.altKey || event.shiftKey) return;
            if (!current || list.hidden) return;
            if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(event.key)) return;
            // Capture before Gowo's Enter handler so choosing an emote cannot send chat.
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.key === 'Escape') close(true);
            else if (event.key === 'Enter' || event.key === 'Tab') accept(selected);
            else {
                selected = (selected + (event.key === 'ArrowDown' ? 1 : -1) +
                    current.matches.length) % current.matches.length;
                highlight();
            }
        }, true);
        listen(list, 'mousedown', event => event.preventDefault());
        listen(list, 'click', event => {
            const option = event.target.closest('button[data-index]');
            if (option && list.contains(option)) accept(Number(option.dataset.index));
        });
        emoteAutocomplete = { input, list, update, close, destroy() {
            close();
            listeners.forEach(remove => remove());
            list.remove();
            for (const [name, value] of [['aria-autocomplete', previousAutocomplete], ['aria-controls', previousControls]]) {
                if (value === null) input.removeAttribute(name);
                else input.setAttribute(name, value);
            }
        } };
    }

    function fitEmotePickerLabels(picker) {
        if (picker.hidden || !picker.isConnected) return;
        for (const label of picker.querySelectorAll('.gowo-emote-option small')) {
            // Re-measure at the normal size whenever the picker width changes.
            label.style.removeProperty('font-size');
            label.style.removeProperty('white-space');
            const text = label.firstChild;
            if (!text || text.length < 3 || !label.clientWidth) continue;
            const range = document.createRange();
            range.selectNodeContents(label);
            const lines = [...range.getClientRects()];
            if (lines.length !== 2) continue;
            // If the third character from the end is still on the first line,
            // only one or two characters were stranded on the second line.
            range.setStart(text, text.length - 3);
            range.setEnd(text, text.length - 2);
            if (Math.abs(range.getBoundingClientRect().top - lines[0].top) > 1) continue;
            const fontSize = parseFloat(window.getComputedStyle(label).fontSize);
            label.style.whiteSpace = 'nowrap';
            range.selectNodeContents(label);
            const naturalWidth = range.getBoundingClientRect().width;
            if (naturalWidth > label.clientWidth) {
                label.style.fontSize = `${fontSize * label.clientWidth / naturalWidth * 0.98}px`;
            }
        }
    }

    function focusEmoteOption(grid, option) {
        if (!option) return;
        option.focus({ preventScroll: true });
        // Scroll only the emote grid, never the room or video pane.
        if (option.offsetTop < grid.scrollTop) grid.scrollTop = option.offsetTop;
        else if (option.offsetTop + option.offsetHeight > grid.scrollTop + grid.clientHeight) {
            grid.scrollTop = option.offsetTop + option.offsetHeight - grid.clientHeight;
        }
    }

    function hasSelectedText() {
        const active = document.activeElement;
        if (isEditableElement(active) && Number.isInteger(active.selectionStart) &&
            active.selectionStart !== active.selectionEnd) return true;
        return Boolean(window.getSelection?.()?.toString());
    }

    let emotePickerResizeObserver = null;

    function injectEmotePicker() {
        const form = document.querySelector(
            'app-chat-messages-room .form-message'
        );
        const input = form?.querySelector('textarea');
        const inputWrapper = input?.closest('.textarea');
        const footerRow = inputWrapper?.parentElement;
        if (!form || !input || !inputWrapper || !footerRow) return;

        initEmoteAutocomplete(input, form);
        const existingPicker = document.getElementById(emotePickerId);
        const existingToggle = document.getElementById(emoteToggleId);
        const existingSendButton = document.getElementById(sendButtonId);
        if (existingPicker && existingToggle && existingSendButton &&
            form.contains(existingPicker) &&
            form.contains(existingToggle) &&
            form.contains(existingSendButton)) {
            return;
        }
        emotePickerResizeObserver?.disconnect();
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
        const sendIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        sendIcon.setAttribute('viewBox', '0 0 24 24');
        sendIcon.setAttribute('aria-hidden', 'true');
        sendIcon.setAttribute('focusable', 'false');
        const sendPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        sendPath.setAttribute('d', 'M22 2 9 15M22 2l-7 20-6-7-7-6Z');
        sendIcon.append(sendPath);
        sendButton.append(sendIcon);
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

        let fitScheduled = false;
        const scheduleLabelFit = () => {
            if (fitScheduled || picker.hidden || !picker.isConnected) return;
            fitScheduled = true;
            requestAnimationFrame(() => {
                fitScheduled = false;
                fitEmotePickerLabels(picker);
            });
        };
        if (typeof window.ResizeObserver === 'function') {
            let lastWidth = -1;
            emotePickerResizeObserver = new window.ResizeObserver(entries => {
                const width = entries[0].contentRect.width;
                if (width === lastWidth) return;
                lastWidth = width;
                scheduleLabelFit();
            });
            emotePickerResizeObserver.observe(grid);
        }
        document.fonts?.ready.then(scheduleLabelFit);

        toggle.addEventListener('mousedown', event => {
            event.preventDefault();
        });
        toggle.addEventListener('click', event => {
            event.stopPropagation();
            emoteAutocomplete?.close(true);
            const willOpen = picker.hidden;
            picker.hidden = !willOpen;
            toggle.setAttribute('aria-expanded', String(willOpen));
            if (!willOpen) {
                input.focus({ preventScroll: true });
                return;
            }
            scheduleLabelFit();
            // Focus the grid so arrows work at once, without a keyboard outline
            // until one is pressed. Typing returns to the chat box.
            picker.classList.add('gowo-emote-pointer');
            focusEmoteOption(grid, grid.querySelector('.gowo-emote-option'));
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
                // Stay in the grid so the arrows keep working after a click.
                option.focus({ preventScroll: true });
            }
        });
        // The pointer takes over from the keyboard highlight; arrows continue
        // from the hovered emote and bring the highlight back.
        picker.addEventListener('mousemove', event => {
            const option = event.target.closest?.('.gowo-emote-option');
            picker.classList.add('gowo-emote-pointer');
            if (option && picker.contains(document.activeElement) &&
                document.activeElement !== option) {
                option.focus({ preventScroll: true });
            }
        });
        picker.addEventListener('keydown', event => {
            const option = event.target.closest?.('.gowo-emote-option');
            if (!option || event.ctrlKey || event.metaKey || event.altKey) return;
            picker.classList.remove('gowo-emote-pointer');
            const options = [...grid.querySelectorAll('.gowo-emote-option')];
            const index = options.indexOf(option);
            const columns = window.getComputedStyle(grid).gridTemplateColumns
                .split(' ').filter(Boolean).length || 4;
            const moves = {
                ArrowLeft: index - 1,
                ArrowRight: index + 1,
                ArrowUp: index - columns,
                ArrowDown: index + columns,
                Home: 0,
                End: options.length - 1
            };
            if (event.key in moves) {
                event.preventDefault();
                event.stopPropagation();
                focusEmoteOption(grid, options[
                    Math.max(0, Math.min(options.length - 1, moves[event.key]))
                ]);
            } else if (event.key === 'Enter' || event.key === ' ') {
                // Handle Enter here so the button's synthetic click cannot insert twice.
                event.preventDefault();
                event.stopPropagation();
                if (event.shiftKey) {
                    insertEmoteAtCaret(input, option.dataset.emoteToken);
                    focusEmoteOption(grid, option);
                } else {
                    closeEmotePicker();
                    insertEmoteAtCaret(input, option.dataset.emoteToken);
                }
            } else if (event.key === 'Escape' || event.key === 'Tab') {
                event.preventDefault();
                event.stopPropagation();
                closeEmotePicker();
                input.focus({ preventScroll: true });
            } else if (event.key.length === 1 || event.key === 'Backspace' || event.key === 'Delete') {
                // Moving focus during keydown lets the key land in the chat box.
                input.focus({ preventScroll: true });
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
            clearHistoryReply();
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

    // Ctrl+C focuses chat (when nothing is selected to copy); Ctrl+E toggles emotes.
    // Match physical keys so the shortcuts also work on non-Latin layouts.
    document.addEventListener('keydown', event => {
        if (!event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
            event.isComposing || (event.code !== 'KeyC' && event.code !== 'KeyE')) return;
        const input = document.querySelector(
            'app-chat-messages-room .form-message textarea'
        );
        if (!input || input.disabled) return;
        if (event.code === 'KeyC') {
            if (hasSelectedText() || document.activeElement === input) return;
            event.preventDefault();
            if (cursorHolding) stopCursorDrawing();
            focusChatComposer();
            return;
        }
        event.preventDefault();
        if (event.repeat) return;
        const picker = document.getElementById(emotePickerId);
        const toggle = document.getElementById(emoteToggleId);
        if (!picker || !toggle) return;
        if (cursorHolding) stopCursorDrawing();
        const opening = picker.hidden;
        toggle.click();
        if (opening) {
            picker.classList.remove('gowo-emote-pointer');
            focusEmoteOption(
                picker.querySelector('.gowo-emote-grid'),
                picker.querySelector('.gowo-emote-option')
            );
        }
    }, true);

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

    let roomToolbar = null;

    // With shared pausing it is not only the administrator who pauses.
    const playerNotices = new Map([
        ['Администратор поставил фильм на паузу', 'Пауза'],
        ['Администратор еще не начал просмотр', 'Просмотр ещё не начат']
    ]);
    const playerNotice = text => playerNotices.get(text) ?? text;

    // Shared playback control. Gowo only announces a pause, resume or seek that
    // comes from the owner's (or an admin's) player. Everyone else asks through
    // the relay, and the owner's browser repeats the action as if its own player
    // had done it.
    const sharedPausePreferenceKey = 'gowo-plus-shared-pause';
    const sharedPauseToggleId = 'gowo-plus-shared-pause-toggle';
    const playbackEvent = 'gowo-plus-playback';
    let playbackBridgeInstalled = false;
    let playbackFrame = null;
    let playbackPlaying = false;
    let playbackTime = 0;
    let playbackDuration = 0;

    function readSharedPausePreference() {
        try { return localStorage.getItem(sharedPausePreferenceKey) !== 'false'; } catch { return true; }
    }

    // The turbo player is told whether it may control the room.
    function playbackRole() {
        const frame = roomToolbar?.frame;
        if (!frame?.isConnected) return '';
        try {
            const url = new URL(frame.src);
            if (!/^[^.]+\.obrut\.show$/.test(url.hostname)) return '';
            const readonly = url.searchParams.get('readonly');
            return readonly === '0' ? 'controller' : readonly === '1' ? 'viewer' : '';
        } catch { return ''; }
    }

    // Gowo's player component listens for the player's messages in the page.
    function pagePlaybackBridge(eventName) {
        document.addEventListener(eventName, event => {
            let data;
            try { data = JSON.parse(event.detail); } catch { return; }
            window.dispatchEvent(new MessageEvent('message', { data }));
        });
    }

    function installPlaybackBridge() {
        if (playbackBridgeInstalled) return;
        playbackBridgeInstalled = true;
        const script = document.createElement('script');
        script.textContent = `(${pagePlaybackBridge})(${JSON.stringify(playbackEvent)});`;
        (document.head || document.documentElement).append(script);
        script.remove();
    }

    function handlePlaybackRequest(action, time) {
        if (!readSharedPausePreference()) return;
        commandRoomPlayback(action, time);
    }

    // Acts for the room from the owner's browser; false if it could not.
    function commandRoomPlayback(action, time) {
        const frame = roomToolbar?.frame;
        if (!['pause', 'play', 'seek'].includes(action) || playbackRole() !== 'controller' ||
            playbackFrame !== frame) return false;
        const seek = action === 'seek';
        if (seek ? !Number.isFinite(time) || time < 0 :
            // Someone else may already have done it.
            (action === 'play') === playbackPlaying) return false;
        installPlaybackBridge();
        // Our own player follows directly; Gowo tells everyone else.
        frame.contentWindow?.postMessage(seek ? { api: 'seek', set: time } : { api: action }, new URL(frame.src).origin);
        document.dispatchEvent(new CustomEvent(playbackEvent, {
            detail: JSON.stringify(seek ? { event: 'userseek', time, data: time } :
                { event: action === 'play' ? 'userplay' : 'userpause', time: playbackTime })
        }));
        return true;
    }

    // Auto-pause. The relay reports who else runs Gowo.io+ here; when someone
    // drops out and does not come back within a few seconds, the owner's browser
    // pauses the room and everyone is told why.
    const autoPausePreferenceKey = 'gowo-plus-auto-pause';
    const autoPauseToggleId = 'gowo-plus-auto-pause-toggle';
    const autoPauseGraceMs = 4000;
    const roomPeers = new Map();
    const autoPauseTimers = new Map();
    let autoPausedFor = '';
    let playbackNoticeText = '';

    function readAutoPausePreference() {
        try { return localStorage.getItem(autoPausePreferenceKey) !== 'false'; } catch { return true; }
    }

    const peerFirstName = name => String(name || '').trim().split(/\s+/)[0] || 'Кто-то';
    const peerPresent = username => [...roomPeers.values()].some(peer => peer.username === username);

    function sendRelayPacket(packet) {
        if (!cursorJoinSent || cursorSocket?.readyState !== WebSocket.OPEN) return;
        cursorSocket.send(JSON.stringify(packet));
    }

    // Replaces Gowo's own notice on the player while the room stays paused.
    function setPlaybackNotice(text) {
        if (playbackNoticeText === text) return;
        playbackNoticeText = text;
        syncRoomToolbar();
    }

    // Worded by the gender each person set in their Gowo profile, if known.
    const peerVerb = (gender, female, male, either) => gender === 'f' ? female : gender === 'm' ? male : either;
    const peerGender = value => value === 'f' || value === 'm' ? value : '';

    function showAutoPause(username, gender) {
        autoPausedFor = username;
        setPlaybackNotice(`Пауза: ${peerFirstName(username)} ${peerVerb(gender, 'покинула', 'покинул', 'покинул(а)')} комнату`);
    }

    function clearAutoPause() {
        autoPausedFor = '';
        setPlaybackNotice('');
    }

    function resetRoomPeers(peers = []) {
        roomPeers.clear();
        autoPauseTimers.forEach(clearTimeout);
        autoPauseTimers.clear();
        for (const peer of Array.isArray(peers) ? peers : []) {
            if (typeof peer?.client === 'string') {
                roomPeers.set(peer.client, { username: String(peer.username || '').slice(0, 40), gender: peerGender(peer.gender) });
            }
        }
    }

    function handleRoomPeer(message) {
        if (typeof message.client !== 'string') return;
        const username = String(message.username || '').slice(0, 40);
        const gender = peerGender(message.gender);
        if (message.present === true) {
            roomPeers.set(message.client, { username, gender });
            clearTimeout(autoPauseTimers.get(username));
            autoPauseTimers.delete(username);
            if (autoPausedFor === username && playbackNoticeText) {
                setPlaybackNotice(`Пауза: ${peerFirstName(username)} ${peerVerb(gender, 'вернулась', 'вернулся', 'вернулся(ась)')}`);
            }
            return;
        }
        roomPeers.delete(message.client);
        // Still here in another tab, or one of our own other tabs closing.
        if (peerPresent(username) || username === cursorNickname() || autoPauseTimers.has(username)) return;
        if (autoPausedFor === username && playbackNoticeText) showAutoPause(username, gender);
        if (playbackRole() !== 'controller' || !readAutoPausePreference() || !playbackPlaying) return;
        autoPauseTimers.set(username, setTimeout(() => {
            autoPauseTimers.delete(username);
            if (peerPresent(username) || !readAutoPausePreference() || !commandRoomPlayback('pause')) return;
            showAutoPause(username, gender);
            sendRelayPacket({ type: 'autopause', client: message.client, username, ...(gender ? { gender } : {}) });
        }, autoPauseGraceMs));
    }

    window.addEventListener('message', event => {
        const frame = roomToolbar?.frame;
        const data = event.data;
        if (!frame || event.source !== frame.contentWindow || !data ||
            !/^https:\/\/[^/]+\.obrut\.show$/.test(event.origin)) return;
        if (playbackFrame !== frame) {
            playbackFrame = frame;
            playbackPlaying = false;
            playbackTime = 0;
            playbackDuration = 0;
        }
        const requestPlayback = (action, time) => {
            if (playbackRole() !== 'viewer' || !cursorJoinSent || cursorSocket?.readyState !== WebSocket.OPEN) return;
            cursorSocket.send(JSON.stringify({ type: 'control', action, ...(action === 'seek' ? { time } : {}) }));
        };
        // A click on the viewer's timeline, reported by the script in the player.
        if (data.source === seekBridgeMarker) {
            const fraction = Number(data.fraction);
            if (data.type === 'seek' && playbackDuration > 0 && fraction >= 0 && fraction <= 1) {
                requestPlayback('seek', Math.round(fraction * playbackDuration * 10) / 10);
            }
            return;
        }
        if (typeof data.event !== 'string') return;
        if (data.event === 'duration' && Number(data.duration) > 0) playbackDuration = Number(data.duration);
        if (data.event === 'time' && Number.isFinite(Number(data.data))) playbackTime = Number(data.data);
        if (data.event === 'play') {
            playbackPlaying = true;
            clearAutoPause();
        }
        if (['pause', 'end', 'stop'].includes(data.event)) playbackPlaying = false;
        const action = { userpause: 'pause', userplay: 'play', userseek: 'seek' }[data.event];
        if (!action) return;
        const time = Number(data.data);
        if (action === 'seek' && (!Number.isFinite(time) || time < 0)) return;
        requestPlayback(action, time);
    });

    // An owner-only switch, on unless turned off, remembered per browser.
    function syncOwnerToggle(form, id, key, label, anchor) {
        const existing = document.getElementById(id);
        // Only whoever controls the room has something to allow.
        if (!form || playbackRole() !== 'controller') {
            existing?.closest('.gowo-setting-row')?.remove();
            return;
        }
        let enabled = true;
        try { enabled = localStorage.getItem(key) !== 'false'; } catch {}
        if (existing) {
            if (existing.checked !== enabled) existing.checked = enabled;
            return;
        }
        if (!anchor) return;
        const row = document.createElement('div');
        row.className = 'gowo-setting-row';
        row.innerHTML = `
            <label class="gowo-setting-label" for="${id}">
                <input type="checkbox" id="${id}">
                <span class="gowo-switch" aria-hidden="true"></span>
                <span></span>
            </label>
        `;
        row.querySelector('span:last-child').textContent = label;
        anchor.after(row);
        const toggle = row.querySelector('input');
        toggle.checked = enabled;
        toggle.addEventListener('change', () => {
            try { localStorage.setItem(key, String(toggle.checked)); } catch {}
        });
    }

    function injectPlaybackSettings() {
        const form = document.querySelector('app-chat-settings-room .settings form');
        syncOwnerToggle(form, sharedPauseToggleId, sharedPausePreferenceKey,
            'Разрешить всем ставить на паузу и перематывать',
            document.getElementById(hideCallButtonToggleId)?.closest('.gowo-setting-row') || form?.firstElementChild);
        syncOwnerToggle(form, autoPauseToggleId, autoPausePreferenceKey,
            'Ставить на паузу, если кто-то отключился',
            document.getElementById(sharedPauseToggleId)?.closest('.gowo-setting-row'));
    }

    function syncRoomToolbar(force = false) {
        const player = document.querySelector('.videoplayer');
        const frame = player && Array.from(player.querySelectorAll('iframe[src]'))
            .find(candidate => {
                try {
                    return /^https?:$/.test(new URL(candidate.src).protocol) && !isBlockedAdUrl(candidate.src);
                } catch { return false; }
            });
        if (!frame || roomToolbar?.frame !== frame || roomToolbar.url !== frame.src) {
            if (roomToolbar) {
                roomToolbar.observer.disconnect();
                roomToolbar.frame.removeEventListener('load', roomToolbar.onLoad);
                delete roomToolbar.player.dataset.gowoToolbarReady;
                roomToolbar = null;
            }
            if (!frame) return;
            const host = Array.from(player.children).find(child => child.contains(frame));
            if (!host) return;
            host.classList.add('gowo-player-host');
            frame.classList.add('gowo-room-frame');
            const current = { player, frame, url: frame.src, signature: '' };
            current.onLoad = () => {
                if (roomToolbar !== current) return;
                delete player.dataset.gowoToolbarReady;
                syncRoomToolbar(true);
            };
            current.observer = new MutationObserver(() => syncRoomToolbar());
            current.observer.observe(player, {
                childList: true, subtree: true, characterData: true,
                attributes: true, attributeFilter: ['class', 'disabled', 'src']
            });
            frame.addEventListener('load', current.onLoad);
            roomToolbar = current;
        }
        const platforms = Array.from(player.querySelectorAll('.platforms button')).map(button => ({
            label: button.textContent.trim(), active: button.classList.contains('active'), disabled: button.disabled
        }));
        const message = {
            source: toolbarBridgeMarker, type: 'state', platforms,
            warning: playbackNoticeText || playerNotice(player.querySelector('.danger-message')?.textContent.trim() || ''),
            canRefresh: Boolean(player.querySelector('app-icon-refresh-2'))
        };
        const signature = JSON.stringify(message);
        if (force || signature !== roomToolbar.signature) {
            roomToolbar.signature = signature;
            frame.contentWindow?.postMessage(message, new URL(frame.src).origin);
        }
    }

    window.addEventListener('message', event => {
        const message = event.data;
        if (message?.source !== toolbarBridgeMarker) return;
        syncRoomToolbar();
        const current = roomToolbar;
        if (!current || event.source !== current.frame.contentWindow ||
            event.origin !== new URL(current.url).origin ||
            event.origin !== 'https://alloha.gowo.tv' && !/^https:\/\/[^/]+\.obrut\.show$/.test(event.origin)) return;
        if (message.type === 'request') syncRoomToolbar(true);
        if (message.type === 'ready') {
            if (message.ready === true) current.player.dataset.gowoToolbarReady = 'true';
            else delete current.player.dataset.gowoToolbarReady;
        }
        if (message.type === 'platform' && typeof message.label === 'string') {
            const button = Array.from(current.player.querySelectorAll('.platforms button'))
                .find(candidate => candidate.textContent.trim() === message.label);
            if (button && !button.disabled && !button.classList.contains('active')) {
                delete current.player.dataset.gowoToolbarReady;
                button.click();
            }
        }
        if (message.type === 'refresh') {
            // Gowo can resynchronize in place rather than reload the iframe.
            // Only the actual load event should reset toolbar readiness.
            current.player.querySelector('app-icon-refresh-2')?.click();
        }
    });

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

    const cursorRelayUrl = 'wss://ru.rkde.su/gowo-plugin';
    const cursorSendIntervalMs = 50;
    const cursorStaleAfterMs = 1600;
    const cursorStaleTimers = new Map();
    let cursorSocket = null;
    let cursorRoomKey = '';
    let cursorRelayStarted = false;
    let cursorRelayJoined = false;
    let cursorJoinSent = false;
    let cursorRoomAlias = '';
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
    let cursorIdentityGender = '';

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

    // Gowo asks for it at sign-up: 1 is female, 2 is male.
    function genderFromProfile(profile) {
        const gender = Number((profile?.data || profile?.user || profile)?.gender);
        return gender === 1 ? 'f' : gender === 2 ? 'm' : '';
    }

    async function loadCursorIdentity() {
        const token = getGowoAuthToken();
        if (!token) return;
        try {
            const response = await fetch('https://api.gowo.io/api/current', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) return;
            const profile = await response.json();
            cursorIdentityName = cursorNameFromProfile(profile);
            cursorIdentityGender = genderFromProfile(profile);
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

    const cursorPainter = createCursorPainter();

    // A fullscreen player shows only its own frame, so the frame's bridge
    // repaints the cursors there from these messages.
    function forwardCursorToFrame(message) {
        const frame = document.fullscreenElement;
        if (!(frame instanceof HTMLIFrameElement) || frame !== getCursorSurface()) return;
        let origin = '';
        try { origin = new URL(frame.src).origin; } catch { return; }
        if (origin !== 'https://alloha.gowo.tv' &&
            !/^https:\/\/[^/]+\.obrut\.show$/.test(origin)) return;
        frame.contentWindow?.postMessage({ source: cursorPaintMarker, ...message }, origin);
    }

    function removeCursor(clientId) {
        cursorPainter.remove(clientId);
        forwardCursorToFrame({ type: 'remove', client: clientId });
        const timer = cursorStaleTimers.get(clientId);
        if (timer) clearTimeout(timer);
        cursorStaleTimers.delete(clientId);
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
        const local = clientId === cursorClientId;
        cursorPainter.paint(clientId, username, x, y, local);
        forwardCursorToFrame({ type: 'show', client: clientId, username, point, local });

        if (local) return;
        const oldTimer = cursorStaleTimers.get(clientId);
        if (oldTimer) clearTimeout(oldTimer);
        cursorStaleTimers.set(clientId, setTimeout(() => {
            removeCursor(clientId);
        }, cursorStaleAfterMs));
    }

    function sendCursorPacket(point = null) {
        // The join is sent as soon as the socket opens and the relay handles
        // messages in order, so do not wait for its "joined" reply to arrive.
        if (!cursorJoinSent || cursorSocket?.readyState !== WebSocket.OPEN) {
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
            cursorPainter.host().append(cursorCaptureOverlay);
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
        cursorJoinSent = false;
        resetChatSync();
        const socket = new WebSocket(cursorRelayUrl);
        cursorSocket = socket;

        socket.addEventListener('open', () => {
            if (cursorSocket !== socket) return;
            cursorReconnectDelay = 1000;
            socket.send(JSON.stringify({
                type: 'join',
                room: cursorRoomKey,
                client: cursorClientId,
                username: cursorNickname(),
                ...(cursorIdentityGender ? { gender: cursorIdentityGender } : {})
            }));
            cursorJoinSent = true;
            requestChatSync();
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
                resetRoomPeers(message.peers);
                return;
            }
            if (message?.type === 'peer') {
                handleRoomPeer(message);
                return;
            }
            if (message?.type === 'autopause') {
                if (typeof message.username === 'string') showAutoPause(message.username.slice(0, 40), peerGender(message.gender));
                return;
            }
            if (message?.type === 'history') {
                applyChatSyncRows(message);
                return;
            }
            if (message?.type === 'control') {
                handlePlaybackRequest(message.action, message.time);
                return;
            }
            if (message?.type === 'edit-refused') {
                showChatEditNotice('Не удалось изменить сообщение');
                return;
            }
            handleCursorRelayMessage(event);
        });
        socket.addEventListener('close', () => {
            if (cursorSocket !== socket) return;
            cursorRelayJoined = false;
            cursorSocket = null;
            cursorPainter.clients()
                .filter(clientId => clientId !== cursorClientId)
                .forEach(removeCursor);
            scheduleCursorRelayReconnect();
        });
        socket.addEventListener('error', () => {
            // The close handler performs a quiet retry.
        });
    }

    // Leaves the relay room of the previous Gowo room and joins the new one
    // (none, outside a room).
    let cursorRoomSwitch = 0;
    async function switchCursorRoom(alias) {
        const switchId = ++cursorRoomSwitch;
        const socket = cursorSocket;
        cursorSocket = null;
        cursorRelayJoined = false;
        cursorJoinSent = false;
        clearTimeout(cursorReconnectTimer);
        cursorReconnectTimer = null;
        socket?.close();
        stopCursorDrawing();
        cursorPainter.clear();
        resetRoomPeers();
        clearAutoPause();
        clearTimeout(chatSync.timer);
        chatSync.timer = null;
        chatSync.requested = chatSync.ready = false;
        for (const set of [chatSync.known, chatSync.queue, chatSync.sent, chatSync.gone, chatSync.goneSeen]) set.clear();
        cursorRoomKey = '';
        cursorRoomAlias = '';
        cursorRelayStarted = Boolean(alias);
        if (!alias) return;
        try {
            const [roomKey] = await Promise.all([
                hashCursorRoom(alias),
                cursorIdentityName ? null : loadCursorIdentity()
            ]);
            if (switchId !== cursorRoomSwitch) return;
            cursorRoomKey = roomKey;
            cursorRoomAlias = alias;
            cursorReconnectDelay = 1000;
            connectCursorRelay();
        } catch {
            if (switchId === cursorRoomSwitch) cursorRelayStarted = false;
        }
    }

    document.addEventListener('keydown', event => {
        if (!enhancedRoom) return;
        if (!isCursorDrawKey(event)) {
            // Ctrl+C, Ctrl+V and other shortcuts are not drawing.
            if (event.ctrlKey && cursorHolding) stopCursorDrawing();
            return;
        }
        if (event.repeat || cursorHolding || event.metaKey || event.altKey) return;
        // Text fields keep the key, where it only begins a shortcut.
        if (!isEditableElement(event.target)) event.preventDefault();
        // The capture layer's first live mousemove establishes the stroke.
        startCursorDrawing();
    }, true);

    document.addEventListener('keyup', event => {
        if (!isCursorDrawKey(event) || event.ctrlKey || !cursorHolding) return;
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
        cursorPainter.clearTrails();
        syncCursorCaptureOverlay();
    });
    // Elements live inside the fullscreen element; start afresh when it changes.
    document.addEventListener('fullscreenchange', () => {
        cursorPainter.clear();
        forwardCursorToFrame({ type: 'clear' });
        cursorCaptureOverlay?.remove();
        cursorCaptureOverlay = null;
        if (cursorHolding) showCursorCaptureOverlay();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible') stopCursorDrawing();
    });

    const messageTimeFormatter = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });

    const messageAuthors = new WeakMap();

    const replyAuthorNames = new WeakMap();

    // Local, bounded archives; never store or replay arbitrary message HTML.
    const chatHistoryLimit = 1000;
    // Native IDs are opaque and can exceed 200 characters. Keep them intact:
    // truncating would merge distinct messages and break clear/replay tracking.
    const chatHistoryMessageIdLimit = 32768;
    const chatHistoryNodes = new WeakMap();
    let chatHistoryDatabase;
    let chatHistoryRoom = null;
    let chatScroll = null;
    const chatHistoryChannel = typeof window.BroadcastChannel === 'function' ?
        new window.BroadcastChannel('gowo-plus-chat-history-v1') : null;

    function isHistoryMessageId(value) {
        return typeof value === 'string' && value.length > 0 && value.length <= chatHistoryMessageIdLimit;
    }

    function historyUrl(value, image = false) {
        try {
            const url = new URL(value, 'https://gowo.io');
            if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || value.length > 2048) return '';
            // Gowo's native GIF picker uses Giphy. Do not reload arbitrary images
            // or tracking pixels from untrusted stored content.
            if (image && (url.protocol !== 'https:' ||
                !(url.hostname === 'giphy.com' || url.hostname.endsWith('.giphy.com')))) return '';
            return url.href;
        } catch { return ''; }
    }

    function historyParts(element) {
        const parts = [];
        let remaining = 4000;
        const text = value => {
            if (!value || remaining <= 0 || parts.length >= 128) return;
            const clipped = value.slice(0, remaining);
            remaining -= clipped.length;
            if (parts.at(-1)?.type === 'text') parts.at(-1).text += clipped;
            else parts.push({ type: 'text', text: clipped });
        };
        const walk = node => {
            if (parts.length >= 128 || remaining <= 0) return;
            if (node.nodeType === 3) return text(node.nodeValue || '');
            const tag = node.tagName?.toLowerCase();
            if (['script', 'style', 'iframe', 'object', 'svg'].includes(tag)) return;
            if (tag === 'br') return text('\n');
            if (tag === 'img') {
                if (node.classList.contains('gowo-chat-emote')) return text(node.title);
                const url = historyUrl(node.getAttribute('src') || '', true);
                if (url) parts.push({ type: 'image', url, text: (node.getAttribute('alt') || 'GIF').slice(0, 100) });
                else text(node.getAttribute('alt') || '');
                return;
            }
            if (tag === 'a') {
                const url = historyUrl(node.getAttribute('href') || '');
                if (url) {
                    const label = (node.textContent || url).slice(0, remaining);
                    remaining -= label.length;
                    parts.push({ type: 'link', url, text: label });
                    return;
                }
            }
            for (const child of node.childNodes || []) walk(child);
        };
        if (element) walk(element);
        return parts;
    }

    function cleanHistoryParts(parts) {
        if (!Array.isArray(parts)) return [];
        let remaining = 4000;
        return parts.slice(0, 128).flatMap(part => {
            if (!part || typeof part.text !== 'string' || remaining <= 0) return [];
            const text = part.text.slice(0, remaining);
            remaining -= text.length;
            if (part.type === 'text') return [{ type: 'text', text }];
            if (!['link', 'image'].includes(part.type) || typeof part.url !== 'string') return [];
            const url = historyUrl(part.url, part.type === 'image');
            return url ? [{ type: part.type, text, url }] : [{ type: 'text', text }];
        });
    }

    function cleanHistoryRoom(value, room) {
        const messages = new Map();
        if (value?.room === room && Array.isArray(value.messages)) {
            for (const entry of value.messages.slice(-chatHistoryLimit)) {
                if (!entry || !isHistoryMessageId(entry.id) ||
                    typeof entry.author !== 'string' || !entry.author.trim() ||
                    !Number.isFinite(entry.receivedAt) || entry.receivedAt < 0 || entry.receivedAt > 8640000000000000) continue;
                messages.set(entry.id, {
                    id: entry.id, author: entry.author.slice(0, 200), receivedAt: entry.receivedAt,
                    // Set once the relay has the message: its revision, and
                    // whether its shared time is only an estimate.
                    ...(Number.isSafeInteger(entry.rev) && entry.rev > 0 ? { rev: entry.rev } : {}),
                    ...(entry.approx === true ? { approx: true } : {}),
                    ...(['owner', 'admin'].includes(entry.crown) ? { crown: entry.crown } : {}),
                    parts: cleanHistoryParts(entry.parts),
                    reply: entry.reply && typeof entry.reply.author === 'string' ? {
                        author: entry.reply.author.slice(0, 200), parts: cleanHistoryParts(entry.reply.parts)
                    } : null,
                    // Sent from this browser, so it may be edited from here.
                    ...(entry.mine === true ? { mine: true } : {}),
                    // When its author last edited it through the relay.
                    ...(Number.isFinite(entry.edited) && entry.edited > 0 ? { edited: entry.edited } : {})
                });
            }
        }
        const serverRev = value?.room === room && Number.isSafeInteger(value.serverRev) && value.serverRev > 0 ?
            value.serverRev : 0;
        return {
            room, messages: [...messages.values()],
            // The last relay revision this browser has caught up to.
            ...(serverRev ? { serverRev } : {}),
            clearedAt: value?.room === room && Number.isFinite(value.clearedAt) ? value.clearedAt : 0,
            ignoredIds: value?.room === room && Array.isArray(value.ignoredIds) ?
                value.ignoredIds.filter(isHistoryMessageId).slice(-2000) : []
        };
    }

    function openChatHistory() {
        if (chatHistoryDatabase) return chatHistoryDatabase;
        chatHistoryDatabase = new Promise((resolve, reject) => {
            if (!window.indexedDB) return reject(new Error('History storage unavailable'));
            const request = window.indexedDB.open('gowo-plus-chat-history', 1);
            request.onupgradeneeded = () => request.result.createObjectStore('rooms', { keyPath: 'room' });
            request.onsuccess = () => {
                request.result.onversionchange = () => request.result.close();
                resolve(request.result);
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('History storage blocked'));
        });
        return chatHistoryDatabase;
    }

    async function historyTransaction(alias, update) {
        const database = await openChatHistory();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction('rooms', update ? 'readwrite' : 'readonly');
            const store = transaction.objectStore('rooms');
            const request = store.get(alias);
            let result;
            request.onsuccess = () => {
                result = cleanHistoryRoom(request.result, alias);
                if (update) {
                    result = update(result);
                    store.put(result);
                }
            };
            transaction.oncomplete = () => resolve(result);
            transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error('History storage failed'));
        });
    }

    function scheduleChatBottom() {
        const current = chatScroll;
        if (!current || !current.follow || current.scheduled) return;
        current.scheduled = true;
        requestAnimationFrame(() => {
            current.scheduled = false;
            if (chatScroll !== current || !current.follow || !current.wrapper.isConnected) return;
            current.wrapper.scrollTop = current.wrapper.scrollHeight;
            current.lastTop = current.wrapper.scrollTop;
        });
    }

    function syncChatScroll(wrapper, list) {
        if (chatScroll?.wrapper === wrapper) return;
        chatScroll?.resize?.disconnect();
        const current = { wrapper, follow: true, lastTop: wrapper.scrollTop, scheduled: false };
        chatScroll = current;
        const stop = () => { if (chatScroll === current) current.follow = false; };
        wrapper.addEventListener('wheel', event => { if (event.deltaY < 0) stop(); }, { passive: true });
        wrapper.addEventListener('touchstart', stop, { passive: true });
        wrapper.addEventListener('pointerdown', stop);
        wrapper.addEventListener('keydown', event => {
            if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) stop();
        });
        wrapper.addEventListener('scroll', () => {
            if (chatScroll !== current) return;
            if (wrapper.scrollTop < current.lastTop - 1) current.follow = false;
            if (wrapper.scrollHeight - wrapper.clientHeight - wrapper.scrollTop <= 2) current.follow = true;
            current.lastTop = wrapper.scrollTop;
        }, { passive: true });
        wrapper.addEventListener('load', scheduleChatBottom, true);
        if (typeof window.ResizeObserver === 'function') {
            current.resize = new window.ResizeObserver(scheduleChatBottom);
            current.resize.observe(wrapper);
            current.resize.observe(list);
        }
        scheduleChatBottom();
    }

    function appendHistoryParts(element, parts) {
        for (const part of parts) {
            if (part.type === 'text') element.append(document.createTextNode(part.text));
            else if (part.type === 'link') {
                const link = document.createElement('a');
                link.textContent = part.text;
                link.href = part.url;
                link.target = '_blank';
                link.rel = 'nofollow noopener noreferrer';
                element.append(link);
            } else {
                const image = document.createElement('img');
                image.src = part.url;
                image.alt = part.text;
                image.loading = 'lazy';
                image.referrerPolicy = 'no-referrer';
                element.append(image);
            }
        }
    }

    const historyReplyEvent = 'gowo-plus-history-reply';
    const historyReplySentEvent = 'gowo-plus-history-reply-sent';
    const historyReplyBarId = 'gowo-history-reply';
    let historyReplyBridgeInstalled = false;

    // Gowo replies by sending the quoted message object with the socket
    // "message" packet, but restored messages have no Angular object behind
    // them. A page-world hook adds the quote to the next outgoing message.
    function pageHistoryReplyBridge(replyEvent, sentEvent) {
        let pending = null;
        document.addEventListener(replyEvent, event => {
            try { pending = event.detail ? JSON.parse(event.detail) : null; } catch { pending = null; }
        });
        const nativeSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function(data) {
            const match = pending && typeof data === 'string' &&
                data.match(/^42(\/[^,[]*,)?(\d*)(\[[\s\S]*)$/);
            if (match) {
                try {
                    const packet = JSON.parse(match[3]);
                    if (packet[0] === 'message' && packet[1] && typeof packet[1] === 'object') {
                        packet[1].reply = pending;
                        pending = null;
                        data = `42${match[1] || ''}${match[2]}${JSON.stringify(packet)}`;
                        document.dispatchEvent(new CustomEvent(sentEvent));
                    }
                } catch {}
            }
            return nativeSend.call(this, data);
        };
    }

    function installHistoryReplyBridge() {
        if (historyReplyBridgeInstalled) return;
        historyReplyBridgeInstalled = true;
        const script = document.createElement('script');
        script.textContent = `(${pageHistoryReplyBridge})(${JSON.stringify(historyReplyEvent)}, ${JSON.stringify(historyReplySentEvent)});`;
        (document.head || document.documentElement).append(script);
        script.remove();
        document.addEventListener(historyReplySentEvent, () => clearHistoryReply(false));
    }

    function historyReplyPayload(entry) {
        const [name = '', ...surname] = entry.author.trim().split(/\s+/);
        const text = entry.parts.filter(part => part.type !== 'image')
            .map(part => part.text).join('').trim();
        const image = entry.parts.find(part => part.type === 'image');
        const content = !text && image ?
            { id: entry.id, type: 'gif', message: `<img class="w-100 mt-2" src="${image.url.replace(/"/g, '%22')}" alt="gif">` } :
            { id: entry.id, type: 'text', message: text };
        return { from: { name, surname: surname.join(' ') }, content };
    }

    function historyIcon(paths, viewBox, stroke) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('aria-hidden', 'true');
        for (const d of paths) {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            path.setAttribute('stroke', stroke);
            path.setAttribute('stroke-width', '1.5');
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            svg.append(path);
        }
        return svg;
    }

    // Gowo's own undo and close-square icons.
    const historyUndoIcon = stroke => historyIcon([
        'M7.12988 18.8096H15.1299C17.8899 18.8096 20.1299 16.5696 20.1299 13.8096C20.1299 11.0496 17.8899 8.80957 15.1299 8.80957H4.12988',
        'M6.43012 11.3104L3.87012 8.75043L6.43012 6.19043'
    ], '0 0 24 25', stroke);
    const historyCloseIcon = () => historyIcon([
        'M9.17 14.8299L14.83 9.16992',
        'M14.83 14.8299L9.17 9.16992',
        'M9 22H15C20 22 22 20 22 15V9C22 4 20 2 15 2L9 2C4 2 2 4 2 9L2 15C2 20 4 22 9 22Z'
    ], '0 0 24 24', '#fff');

    const historyEditIcon = stroke => historyIcon([
        'M4 20H8L19 9L15 5L4 16V20Z',
        'M13 7L17 11'
    ], '0 0 24 24', stroke);

    // Gowo's crown: gold for the room owner, white for admins.
    function historyCrownIcon(kind) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'gowo-history-crown');
        svg.setAttribute('viewBox', '0 0 24 20');
        svg.setAttribute('aria-hidden', 'true');
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M11.944 4.97667C10.5754 4.97667 9.45568 3.85692 9.45568 2.48834C9.45568 1.08865 10.5754 0 11.944 0C13.3126 0 14.4323 1.08865 14.4323 2.48834C14.4323 3.85692 13.3126 4.97667 11.944 4.97667ZM2.02177 3.95023C3.11042 3.95023 3.98134 4.85226 3.98134 5.9409C3.98134 7.06065 3.11042 7.93157 2.02177 7.93157C0.902022 7.93157 0 7.06065 0 5.9409C0 4.85226 0.902022 3.95023 2.02177 3.95023ZM21.9285 3.95023C23.0171 3.95023 23.888 4.85226 23.888 5.9409C23.888 7.06065 23.0171 7.93157 21.9285 7.93157C20.8087 7.93157 19.9067 7.06065 19.9067 5.9409C19.9067 4.85226 20.8087 3.95023 21.9285 3.95023ZM4.19907 17.6983L2.55054 8.67807C3.04821 8.58476 3.51477 8.30482 3.88803 7.99378C4.91446 8.92691 6.22084 9.82893 7.46501 9.82893C8.95801 9.82893 10.1711 7.52722 11.0109 5.59876C11.2908 5.69207 11.633 5.78538 11.944 5.78538C12.2551 5.78538 12.5972 5.69207 12.8771 5.59876C13.717 7.52722 14.93 9.82893 16.423 9.82893C17.6672 9.82893 18.9736 8.92691 20 7.99378C20.3733 8.30482 20.8398 8.58476 21.3375 8.67807L19.689 17.6983H4.19907ZM3.85692 18.4759H20.0311V20H3.85692V18.4759Z');
        path.setAttribute('fill', kind === 'admin' ? '#fff' : '#FBC658');
        svg.append(path);
        return svg;
    }

    function clearHistoryReply(notify = true) {
        const bar = document.getElementById(historyReplyBarId);
        if (!bar) return;
        bar.remove();
        if (notify) document.dispatchEvent(new CustomEvent(historyReplyEvent, { detail: '' }));
    }

    function startHistoryReply(entry) {
        const form = document.querySelector('app-chat-messages-room .form-message');
        const footer = form?.querySelector(':scope > .chat-footer') || form?.querySelector('.chat-footer');
        if (!form || !footer) return;
        installHistoryReplyBridge();
        // Only one quote can be sent; drop Gowo's own pending reply.
        form.querySelector(`.reply:not(#${historyReplyBarId}) app-icon-close-square`)?.click();
        clearHistoryReply(false);

        const bar = document.createElement('div');
        bar.id = historyReplyBarId;
        bar.className = 'reply';
        const content = document.createElement('div');
        content.className = 'reply__content';
        const name = document.createElement('p');
        name.className = 'name';
        name.textContent = entry.author;
        const text = document.createElement('p');
        text.className = 'text';
        text.textContent = entry.parts.map(part => part.text).join('');
        renderSevenTvEmotes(text);
        content.append(name, text);
        const close = document.createElement('button');
        close.type = 'button';
        close.title = 'Cancel reply';
        close.setAttribute('aria-label', 'Cancel reply');
        close.append(historyCloseIcon());
        close.addEventListener('mousedown', event => event.preventDefault());
        close.addEventListener('click', event => {
            event.stopPropagation();
            clearHistoryReply();
        });
        bar.append(historyUndoIcon('#fff'), content, close);
        footer.parentNode.insertBefore(bar, footer);
        formatReplyAuthors();
        document.dispatchEvent(new CustomEvent(historyReplyEvent, {
            detail: JSON.stringify(historyReplyPayload(entry))
        }));
        focusChatComposer();
    }

    // "≈" marks a time nobody witnessed: the relay only knows the message's place.
    const historyTimeLabel = entry =>
        `${entry.approx ? '≈ ' : ''}${new Date(entry.receivedAt).toLocaleString()}`;

    function renderChatHistory(room) {
        if (chatHistoryRoom !== room || !room.list?.isConnected || !room.loaded) return;
        const savedById = new Map(room.data.messages.map(entry => [entry.id, entry]));
        const nativeIds = new Set([...room.list.querySelectorAll('.message[id]')].map(element => {
            const saved = savedById.get(element.id);
            if (saved) {
                element.dataset.gowoMessageTime = historyTimeLabel(saved);
                showMessageEdit(element, saved);
                syncEditAction(element, saved);
            }
            return element.id;
        }));
        const missing = room.data.messages.filter(entry => !nativeIds.has(entry.id) && !room.deleted.has(entry.id));
        const signature = JSON.stringify(missing);
        if (room.archive?.isConnected && room.rendered === signature) return;
        const wrapper = room.list.closest('.messages-wrapper');
        const bottomOffset = wrapper.scrollHeight - wrapper.scrollTop;
        room.archive?.remove();
        const archive = document.createElement('div');
        archive.className = 'gowo-chat-history';
        room.archive = archive;
        room.rendered = signature;
        for (const entry of missing) {
            const message = document.createElement('div');
            message.className = 'message gowo-history-message';
            message.dataset.formatted = '1';
            message.dataset.gowoHistoryId = entry.id;
            messageAuthors.set(message, { id: message.id, author: entry.author });
            message.dataset.gowoMessageTime = historyTimeLabel(entry);
            if (entry.edited) message.classList.add('gowo-edited-message');
            const user = document.createElement('div');
            user.className = 'user';
            const text = document.createElement('div');
            text.className = 'text';
            const header = document.createElement('div');
            header.className = 'header-message';
            const name = document.createElement('p');
            name.textContent = entry.author.split(/\s+/)[0] + ':';
            name.style.color = stringToColor(entry.author);
            header.append(name);
            if (entry.crown) text.append(historyCrownIcon(entry.crown));
            text.append(header);
            if (entry.reply) {
                message.classList.add('gowo-message-has-reply');
                const reply = document.createElement('div');
                reply.className = 'text__reply';
                const author = document.createElement('p');
                author.className = 'text__reply__name';
                author.textContent = entry.reply.author;
                const quote = document.createElement('p');
                quote.className = 'text__reply__text';
                appendHistoryParts(quote, entry.reply.parts);
                reply.append(author, quote);
                text.append(reply);
            }
            const body = document.createElement('div');
            body.className = 'w-100';
            appendHistoryParts(body, entry.parts);
            text.append(body);
            user.append(text);
            const actions = document.createElement('ul');
            actions.className = 'list-unstyled actions gowo-history-actions';
            const item = document.createElement('li');
            const replyButton = document.createElement('button');
            replyButton.type = 'button';
            replyButton.title = 'Reply';
            replyButton.setAttribute('aria-label', 'Reply');
            replyButton.append(historyUndoIcon('#A5A5A5'));
            replyButton.addEventListener('mousedown', event => event.preventDefault());
            replyButton.addEventListener('click', event => {
                event.stopPropagation();
                startHistoryReply(entry);
            });
            item.append(replyButton);
            actions.append(item);
            if (isEditableEntry(entry)) actions.prepend(editActionItem(entry.id));
            message.append(user, actions);
            renderMessageEmotes(message);
            archive.append(message);
        }
        // Leave Gowo's welcome notice first. Insert before its live repeater,
        // including the empty-list comment anchor used by Angular at startup.
        const firstLive = room.list.querySelector(':scope > .message[id]');
        const repeatAnchor = [...room.list.childNodes].reverse().find(node => node.nodeType === 8);
        room.list.insertBefore(archive, firstLive || repeatAnchor || null);
        syncMessageGrouping();
        if (chatScroll?.follow) scheduleChatBottom();
        else wrapper.scrollTop = wrapper.scrollHeight - bottomOffset;
    }

    async function flushChatHistory(room) {
        if (!room.loaded || room.saving || room.failed || (!room.pending.size && !room.deleted.size)) return;
        const pending = [...room.pending.values()];
        const deleted = [...room.deleted];
        room.pending.clear();
        room.deleted.clear();
        room.saving = true;
        try {
            room.data = await historyTransaction(room.alias, stored => {
                const messages = new Map(stored.messages.map(entry => [entry.id, entry]));
                const ignored = new Set([...stored.ignoredIds, ...deleted]);
                for (const id of deleted) messages.delete(id);
                for (const entry of pending) {
                    if (ignored.has(entry.id) || entry.receivedAt <= stored.clearedAt) continue;
                    const previous = messages.get(entry.id);
                    messages.set(entry.id, {
                        ...entry, receivedAt: previous?.receivedAt ?? entry.receivedAt,
                        ...(previous?.rev ? { rev: previous.rev } : {}),
                        ...(previous?.approx ? { approx: true } : {}),
                        ...(previous?.mine ? { mine: true } : {}),
                        // Gowo still shows the original text; the edit wins.
                        ...(previous?.edited ? { parts: previous.parts, edited: previous.edited } : {})
                    });
                }
                stored.messages = [...messages.values()].sort((a, b) => a.receivedAt - b.receivedAt).slice(-chatHistoryLimit);
                stored.ignoredIds = [...ignored].slice(-2000);
                return stored;
            });
            chatHistoryChannel?.postMessage({ room: room.alias });
        } catch {
            room.failed = true;
        } finally {
            room.saving = false;
            if (chatHistoryRoom === room) {
                renderChatHistory(room);
                injectChatHistorySetting();
            }
            if ((room.pending.size || room.deleted.size) && !room.failed) flushChatHistory(room);
        }
    }

    function captureChatMessages(room) {
        const fresh = [];
        for (const element of room.list.querySelectorAll('.message[id]')) {
            const body = element.querySelector('.text > .w-100');
            if (!element.querySelector(':scope > .user') || !body || !isHistoryMessageId(element.id)) continue;
            const previous = chatHistoryNodes.get(element);
            const nickname = element.querySelector('.header-message > p, .text > p');
            // Formatting shortens/removes the visible name; the native avatar
            // still carries the full author even on consecutive messages.
            const nativeAuthor = element.dataset.formatted === '1' ?
                element.querySelector('app-picture img[alt]')?.getAttribute('alt')?.trim() ||
                    nickname?.textContent.trim().replace(/:$/, '').trim() : nickname?.textContent.trim();
            const author = previous?.id === element.id ? previous.author : nativeAuthor;
            if (!author) continue;
            const replyName = element.querySelector('.text__reply__name');
            const crown = element.querySelector('app-icon-crown');
            const entry = {
                id: element.id, author: author.slice(0, 200),
                receivedAt: previous?.id === element.id ? previous.receivedAt : Date.now(),
                ...(crown ? { crown: crown.classList.contains('white-crown') ? 'admin' : 'owner' } : {}),
                parts: historyParts(body),
                reply: replyName ? {
                    author: (replyAuthorNames.get(replyName)?.fullName || replyName.textContent.trim()).slice(0, 200),
                    parts: historyParts(element.querySelector('.text__reply__text'))
                } : null,
                ...(previous?.id === element.id && previous.mine ? { mine: true } : {})
            };
            if (JSON.stringify(previous) === JSON.stringify(entry)) continue;
            if (previous?.id !== element.id) fresh.push({ element, entry });
            chatHistoryNodes.set(element, entry);
            room.pending.set(entry.id, entry);
            if (room.pending.size > chatHistoryLimit) room.pending.delete(room.pending.keys().next().value);
        }
        if (!fresh.length) return;
        // Not the replay a freshly shown chat starts with, nor our own.
        if (room.captured) noteUnread(fresh.filter(({ entry }) => !isOwnAuthor(entry.author)).length);
        // Gowo replays recent messages in one burst after joining. Later
        // arrivals, a few at a time, were witnessed as they were sent.
        const live = room.captured ? fresh.length <= 3 :
            fresh.length === 1 && Date.now() - room.listSeenAt >= 5000;
        room.captured = true;
        for (const { element, entry } of fresh) {
            // A message of ours that just appeared was sent from this browser.
            if (live && isOwnAuthor(entry.author)) entry.mine = true;
            queueChatSyncReport(room, element, entry, live);
        }
    }

    async function loadChatHistory(room) {
        try {
            room.data = await historyTransaction(room.alias);
            room.loaded = true;
            if (chatHistoryRoom !== room) return;
            renderChatHistory(room);
            flushChatHistory(room);
            requestChatSync();
        } catch { room.failed = true; }
        if (chatHistoryRoom === room) injectChatHistorySetting();
    }

    function captureChatDeletions(records) {
        const room = chatHistoryRoom;
        if (!room?.list) return;
        const removed = new Set();
        let deletedNotices = 0;
        const isDeleted = element => !element.querySelector?.('.user') &&
            /сообщение удалено|message (?:was )?deleted/i.test(element.textContent || '');
        for (const record of records) {
            if (record.target === room.list) {
                for (const element of record.removedNodes || []) {
                    const entry = chatHistoryNodes.get(element);
                    if (entry) removed.add(entry.id);
                }
                for (const element of record.addedNodes || []) {
                    if (element.matches?.('.message') && isDeleted(element)) deletedNotices++;
                }
            }
            const message = record.target.closest?.('.message') || record.target.parentElement?.closest('.message');
            const previous = message && chatHistoryNodes.get(message);
            if (previous && isDeleted(message)) room.deleted.add(previous.id);
        }
        // Angular replaces a deleted message with an ID-less system notice.
        // A plain removal (its 50-message limit or navigation) is not deletion.
        if (deletedNotices && removed.size === deletedNotices) {
            for (const id of removed) room.deleted.add(id);
        }
        for (const id of room.deleted) {
            room.pending.delete(id);
            queueChatSyncGone(room, id);
        }
        if (room.data && room.deleted.size) {
            room.data.messages = room.data.messages.filter(entry => !room.deleted.has(entry.id));
        }
    }

    // Shared history: the relay keeps each room's messages. Every participant
    // reports what it sees, and whoever was away asks for everything after the
    // last revision it has. Gowo remains the only way a message is sent.
    const chatSyncIdLimit = 1024;
    const chatSyncSendIntervalMs = 120;
    const chatSync = {
        requested: false, ready: false, timer: null,
        known: new Set(), queue: new Map(), sent: new Map(), gone: new Map(), goneSeen: new Set()
    };

    function chatSyncRoom() {
        const room = chatHistoryRoom;
        return cursorJoinSent && room?.loaded && !room.failed && room.alias === cursorRoomAlias &&
            cursorSocket?.readyState === WebSocket.OPEN ? room : null;
    }

    // A new connection starts over; reports the relay never answered go again.
    function resetChatSync() {
        chatSync.requested = false;
        chatSync.ready = false;
        for (const [id, item] of chatSync.sent) {
            if (!chatSync.known.has(id)) chatSync.queue.set(id, item);
        }
        chatSync.sent.clear();
    }

    function requestChatSync() {
        const room = chatSyncRoom();
        if (!room || chatSync.requested) return;
        chatSync.requested = true;
        for (const entry of room.data.messages) {
            if (entry.rev) chatSync.known.add(entry.id);
        }
        cursorSocket.send(JSON.stringify({ type: 'sync', after: room.data.serverRev || 0 }));
    }

    function queueChatSyncReport(room, element, entry, live) {
        // Our own message is reported even if the relay has it: that claims it.
        if (entry.id.length > chatSyncIdLimit || (chatSync.known.has(entry.id) && !entry.mine) ||
            chatSync.queue.has(entry.id) || chatSync.sent.has(entry.id)) return;
        chatSync.queue.set(entry.id, { alias: room.alias, element, entry, live });
        // Bounded while the relay is unreachable.
        if (chatSync.queue.size > 300) chatSync.queue.delete(chatSync.queue.keys().next().value);
        pumpChatSync();
    }

    function queueChatSyncGone(room, id) {
        if (id.length > chatSyncIdLimit || chatSync.goneSeen.has(id)) return;
        chatSync.goneSeen.add(id);
        chatSync.gone.set(id, room.alias);
        if (chatSync.gone.size > 300) chatSync.gone.delete(chatSync.gone.keys().next().value);
        pumpChatSync();
    }

    function nextChatSyncPacket(room) {
        for (const [id, alias] of chatSync.gone) {
            chatSync.gone.delete(id);
            if (alias === room.alias) return { type: 'gone', id };
        }
        while (chatSync.queue.size) {
            const items = [...chatSync.queue.values()];
            // Replayed messages go newest first, so the relay can place each
            // one just before a successor it already knows.
            const item = items.findLast(candidate => !candidate.live) || items[0];
            chatSync.queue.delete(item.entry.id);
            if (item.alias !== room.alias || (chatSync.known.has(item.entry.id) && !item.entry.mine)) continue;
            chatSync.sent.set(item.entry.id, item);
            const saved = room.data.messages.find(entry => entry.id === item.entry.id);
            let next = item.element.nextElementSibling;
            while (next && chatHistoryNodes.get(next)?.id !== next.id) next = next.nextElementSibling;
            const { receivedAt, mine, ...message } = item.entry;
            return {
                type: 'seen', live: item.live,
                ...(mine ? { key: getChatEditKey() } : {}),
                // How long ago this browser first saw it, free of clock differences.
                age: Math.max(0, Date.now() - (saved?.receivedAt ?? receivedAt)),
                ...(next ? { next: next.id } : {}),
                message
            };
        }
        return null;
    }

    function pumpChatSync() {
        if (chatSync.timer || !chatSync.ready) return;
        const room = chatSyncRoom();
        const packet = room && nextChatSyncPacket(room);
        if (!packet) return;
        cursorSocket.send(JSON.stringify(packet));
        // Stay far below the relay's rate limit, which cursor packets share.
        chatSync.timer = setTimeout(() => {
            chatSync.timer = null;
            pumpChatSync();
        }, chatSyncSendIntervalMs);
    }

    async function applyChatSyncRows(message) {
        const room = chatHistoryRoom;
        if (!room?.loaded || room.failed || room.alias !== cursorRoomAlias ||
            !Array.isArray(message.messages)) return;
        const rows = message.messages.slice(0, 200).filter(row => row && isHistoryMessageId(row.id) &&
            Number.isSafeInteger(row.rev) && row.rev > 0 && Number.isFinite(row.at));
        const page = message.page === true;
        const through = page && Number.isSafeInteger(message.through) ? message.through : 0;
        // A relay whose numbering is behind ours has lost its store: start over.
        const reset = page && Number.isSafeInteger(message.rev) && message.rev < (room.data.serverRev || 0);
        if (reset) chatSync.known.clear();
        for (const row of rows) {
            chatSync.known.add(row.id);
            if (!chatSync.queue.get(row.id)?.entry.mine) chatSync.queue.delete(row.id);
            chatSync.sent.delete(row.id);
        }
        // Until the first catch-up ends, single rows may run ahead of it.
        const inOrder = chatSync.ready && !page;
        try {
            room.data = await historyTransaction(room.alias, stored => {
                const messages = new Map(stored.messages.map(entry => [entry.id, entry]));
                const ignored = new Set(stored.ignoredIds);
                let serverRev = reset ? 0 : stored.serverRev || 0;
                if (reset) messages.forEach(entry => delete entry.rev);
                for (const row of rows) {
                    if (inOrder) serverRev = Math.max(serverRev, row.rev);
                    if (row.deleted === true) {
                        messages.delete(row.id);
                        continue;
                    }
                    const local = messages.get(row.id);
                    if (!local && (ignored.has(row.id) || row.at <= stored.clearedAt)) continue;
                    // This browser's own first sight beats a time the relay guessed.
                    const keepLocalTime = Boolean(local) && row.approx === true;
                    const edited = Number.isFinite(row.edited) && row.edited > 0 ? row.edited : 0;
                    messages.set(row.id, {
                        ...(local || { id: row.id, author: row.author, crown: row.crown, parts: row.parts, reply: row.reply }),
                        ...(edited ? { parts: row.parts, edited } : {}),
                        receivedAt: keepLocalTime ? local.receivedAt : row.at,
                        approx: keepLocalTime ? local.approx : row.approx === true,
                        rev: row.rev
                    });
                }
                if (page && !reset) serverRev = Math.max(serverRev, through);
                stored.messages = [...messages.values()].sort((a, b) => a.receivedAt - b.receivedAt).slice(-chatHistoryLimit);
                stored.serverRev = serverRev;
                return cleanHistoryRoom(stored, room.alias);
            });
            chatHistoryChannel?.postMessage({ room: room.alias });
        } catch {
            room.failed = true;
        }
        if (chatHistoryRoom !== room) return;
        renderChatHistory(room);
        injectChatHistorySetting();
        if (!page || !chatSyncRoom()) return;
        if (reset || message.more === true) {
            cursorSocket.send(JSON.stringify({ type: 'sync', after: room.data.serverRev || 0 }));
        } else {
            chatSync.ready = true;
            pumpChatSync();
        }
    }

    // Message edits. Gowo has none, so an edit goes to the relay, which hands
    // the new text to everyone running Gowo.io+; others keep seeing the original.
    // Only the browser that sent a message holds the key to edit it.
    const chatEditKeyName = 'gowo-plus-edit-key-v1';
    const chatEditBarId = 'gowo-chat-edit';
    let chatEditKey = '';
    let chatEdit = null;

    function getChatEditKey() {
        if (chatEditKey) return chatEditKey;
        try { chatEditKey = localStorage.getItem(chatEditKeyName) || ''; } catch {}
        if (!/^[a-f0-9]{64}$/.test(chatEditKey)) {
            chatEditKey = [...crypto.getRandomValues(new Uint8Array(32))]
                .map(value => value.toString(16).padStart(2, '0')).join('');
            try { localStorage.setItem(chatEditKeyName, chatEditKey); } catch {}
        }
        return chatEditKey;
    }

    function isOwnAuthor(author) {
        const normalize = value => value.replace(/\s+/g, ' ').trim().slice(0, 40);
        return Boolean(cursorIdentityName) && normalize(author) === normalize(cursorIdentityName);
    }

    const isEditableEntry = entry => entry.mine === true && entry.parts.length > 0 &&
        entry.parts.every(part => part.type !== 'image');

    const editableText = entry => entry.parts
        .map(part => part.type === 'link' && !/^https?:\/\//.test(part.text) ? part.url : part.text).join('');

    function editParts(text) {
        const parts = [];
        let last = 0;
        for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
            const url = historyUrl(match[0]);
            if (!url) continue;
            if (match.index > last) parts.push({ type: 'text', text: text.slice(last, match.index) });
            parts.push({ type: 'link', text: match[0], url });
            last = match.index + match[0].length;
        }
        if (last < text.length) parts.push({ type: 'text', text: text.slice(last) });
        return parts;
    }

    // Gowo renders the original; show the edited text in its place.
    function showMessageEdit(element, entry) {
        const body = element.querySelector('.text > .w-100');
        const shown = entry.edited ? `${entry.id}:${entry.edited}` : '';
        if (!body || !shown || element.dataset.gowoEdited === shown) return;
        element.dataset.gowoEdited = shown;
        element.classList.add('gowo-edited-message');
        body.classList.remove('gowo-emote-only');
        body.replaceChildren();
        appendHistoryParts(body, entry.parts);
        renderMessageEmotes(element);
    }

    function editActionItem(id) {
        const item = document.createElement('li');
        item.className = 'gowo-edit-action';
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Edit';
        button.setAttribute('aria-label', 'Edit');
        button.append(historyEditIcon('#A5A5A5'));
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', event => {
            event.stopPropagation();
            const entry = chatHistoryRoom?.data?.messages.find(candidate => candidate.id === id);
            if (entry) startChatEdit(entry);
        });
        item.append(button);
        return item;
    }

    function syncEditAction(element, entry) {
        const actions = element.querySelector(':scope > .user .actions, :scope > .actions');
        const existing = actions?.querySelector('.gowo-edit-action');
        const wanted = isEditableEntry(entry) ? entry.id : '';
        if (!actions || (existing?.dataset.gowoEditId || '') === wanted) return;
        existing?.remove();
        if (!wanted) return;
        const item = editActionItem(entry.id);
        item.dataset.gowoEditId = entry.id;
        actions.prepend(item);
    }

    function chatEditBar(title, text) {
        const form = document.querySelector('app-chat-messages-room .form-message');
        const footer = form?.querySelector(':scope > .chat-footer') || form?.querySelector('.chat-footer');
        if (!form || !footer) return null;
        document.getElementById(chatEditBarId)?.remove();
        const bar = document.createElement('div');
        bar.id = chatEditBarId;
        bar.className = 'reply';
        const content = document.createElement('div');
        content.className = 'reply__content';
        const name = document.createElement('p');
        name.className = 'name';
        name.textContent = title;
        content.append(name);
        if (text) {
            const original = document.createElement('p');
            original.className = 'text';
            original.textContent = text;
            renderSevenTvEmotes(original);
            content.append(original);
        }
        bar.append(historyEditIcon('#fff'), content);
        footer.parentNode.insertBefore(bar, footer);
        return bar;
    }

    function showChatEditNotice(text) {
        if (chatEdit) return;
        const bar = chatEditBar(text, '');
        if (!bar) return;
        bar.classList.add('gowo-chat-edit-notice');
        setTimeout(() => { if (bar.isConnected && !chatEdit) bar.remove(); }, 4000);
    }

    function cancelChatEdit(restore = true) {
        const edit = chatEdit;
        chatEdit = null;
        document.getElementById(chatEditBarId)?.remove();
        const input = document.querySelector('app-chat-messages-room .form-message textarea');
        if (edit && restore && input) setComposerValue(input, edit.draft);
    }

    function startChatEdit(entry) {
        const input = document.querySelector('app-chat-messages-room .form-message textarea');
        if (!input || input.disabled || !isEditableEntry(entry)) return;
        // Editing replaces replying.
        document.querySelector(`app-chat-messages-room .form-message .reply:not(#${historyReplyBarId}):not(#${chatEditBarId}) app-icon-close-square`)?.click();
        clearHistoryReply();
        const draft = chatEdit ? chatEdit.draft : input.value;
        const text = editableText(entry);
        const bar = chatEditBar('Редактирование', text);
        if (!bar) return;
        const close = document.createElement('button');
        close.type = 'button';
        close.title = 'Cancel edit';
        close.setAttribute('aria-label', 'Cancel edit');
        close.append(historyCloseIcon());
        close.addEventListener('mousedown', event => event.preventDefault());
        close.addEventListener('click', event => {
            event.stopPropagation();
            cancelChatEdit();
        });
        bar.append(close);
        chatEdit = { id: entry.id, text, draft };
        emoteAutocomplete?.close(true);
        setComposerValue(input, text.slice(0, input.maxLength >= 0 ? input.maxLength : undefined));
    }

    function submitChatEdit(input) {
        const edit = chatEdit;
        const text = input.value.trim();
        if (!edit || !text) return;
        if (text === edit.text.trim()) return cancelChatEdit();
        if (!chatSyncRoom()) {
            cancelChatEdit();
            showChatEditNotice('Нет связи с сервером Gowo.io+');
            return;
        }
        cursorSocket.send(JSON.stringify({ type: 'edit', id: edit.id, key: getChatEditKey(), parts: editParts(text) }));
        cancelChatEdit();
    }

    // Capture phase: these must run before Gowo's own Enter handler sends chat.
    document.addEventListener('keydown', event => {
        const input = event.target;
        if (!input?.matches?.('app-chat-messages-room .form-message textarea') ||
            event.isComposing || event.keyCode === 229) return;
        const completing = emoteAutocomplete && !emoteAutocomplete.list.hidden;
        const plain = !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;
        if (chatEdit) {
            if (completing || !plain || (event.key !== 'Enter' && event.key !== 'Escape')) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.key === 'Enter') submitChatEdit(input);
            else cancelChatEdit();
            return;
        }
        // Up in an empty composer edits the last message sent from here.
        if (event.key !== 'ArrowUp' || !plain || input.value) return;
        const entry = chatHistoryRoom?.data?.messages.findLast(isEditableEntry);
        if (!entry) return;
        event.preventDefault();
        startChatEdit(entry);
    }, true);

    // Messages that arrived while this tab was not being looked at, counted in
    // the page title so the taskbar shows them.
    const unreadTitlePrefix = /^\(\d+\+?\) /;
    let unreadCount = 0;
    const attendingChat = () => document.visibilityState === 'visible' && document.hasFocus();

    function syncUnreadTitle() {
        if (unreadCount && attendingChat()) unreadCount = 0;
        const base = document.title.replace(unreadTitlePrefix, '');
        const wanted = unreadCount ? `(${unreadCount > 99 ? '99+' : unreadCount}) ${base}` : base;
        if (document.title !== wanted) document.title = wanted;
    }

    function noteUnread(count) {
        if (!count || attendingChat()) return;
        unreadCount += count;
        syncUnreadTitle();
    }

    function clearUnread() {
        if (!unreadCount) return;
        unreadCount = 0;
        syncUnreadTitle();
    }

    window.addEventListener('focus', () => { if (attendingChat()) clearUnread(); });
    document.addEventListener('visibilitychange', () => { if (attendingChat()) clearUnread(); });
    // Focus can also return through the player, which the page does not hear.
    setInterval(() => { if (unreadCount && attendingChat()) clearUnread(); }, 1000);

    function syncChatHistory() {
        if (chatEdit && !document.getElementById(chatEditBarId)) chatEdit = null;
        let alias;
        try { alias = getRoomAlias(); } catch { return; }
        const list = document.querySelector('app-chat-messages-room .messages-wrapper > .messages');
        if (!alias || alias.length > 200 || !list) return;
        const wrapper = list.parentElement;
        if (chatHistoryRoom?.alias !== alias) {
            // A route can change before Angular replaces the old room's DOM.
            // Do not archive that outgoing transcript under the new room key.
            const previousList = chatHistoryRoom?.list;
            chatHistoryRoom?.archive?.remove();
            chatHistoryRoom = { alias, pending: new Map(), deleted: new Set(), loaded: false, failed: false, previousList };
        }
        const room = chatHistoryRoom;
        if (room.previousList === list) return;
        if (room.list !== list) {
            room.archive?.remove();
            room.list = list;
            room.listSeenAt = Date.now();
            room.captured = false;
            room.archive = null;
            syncChatScroll(wrapper, list);
        }
        captureChatMessages(room); // Before name shortening and emote substitution.
        if (!room.loading) {
            room.loading = true;
            loadChatHistory(room);
        }
        if (room.loaded) {
            renderChatHistory(room);
            flushChatHistory(room);
        }
        scheduleChatBottom();
    }

    function injectChatHistorySetting() {
        const room = chatHistoryRoom;
        const form = document.querySelector('app-chat-settings-room .settings form');
        if (!room || !form?.firstElementChild) return;
        let section = form.querySelector('.gowo-history-setting');
        if (!section) {
            section = document.createElement('div');
            section.className = 'gowo-history-setting gowo-setting-row';
            const title = document.createElement('p');
            title.textContent = 'История чата этой комнаты';
            const status = document.createElement('p');
            status.className = 'gowo-history-status';
            status.setAttribute('role', 'status');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Очистить сохранённую историю';
            button.addEventListener('click', async () => {
                const current = chatHistoryRoom;
                if (!current?.loaded || current.clearing || !window.confirm(
                    'Удалить сохранённую историю этой комнаты в этом браузере? Сообщения других участников не будут удалены.')) return;
                current.clearing = true;
                injectChatHistorySetting();
                try {
                    const visibleIds = [...current.list.querySelectorAll('.message[id]')].map(element => element.id);
                    current.data = await historyTransaction(current.alias, stored => ({
                        room: current.alias, messages: [], clearedAt: Date.now(),
                        ...(stored.serverRev ? { serverRev: stored.serverRev } : {}),
                        ignoredIds: [...new Set([...stored.ignoredIds, ...stored.messages.map(entry => entry.id), ...visibleIds])].slice(-2000)
                    }));
                    current.pending.clear();
                    current.failed = false;
                    renderChatHistory(current);
                    chatHistoryChannel?.postMessage({ room: current.alias });
                } catch { current.failed = true; }
                current.clearing = false;
                injectChatHistorySetting();
            });
            section.append(title, status, button);
            form.firstElementChild.after(section);
        }
        const count = room.data?.messages.length || 0;
        const text = room.failed ? 'Хранилище недоступно — история не сохраняется.' :
            room.clearing ? 'Удаление…' : !room.loaded ? 'Загрузка истории…' :
                `Сохранено: ${count} / ${chatHistoryLimit} в этом браузере. Новые сообщения также хранит сервер Gowo.io+.`;
        const status = section.querySelector('.gowo-history-status');
        if (status.textContent !== text) status.textContent = text;
        section.querySelector('button').disabled = !room.loaded || room.clearing || !count;
    }

    if (chatHistoryChannel) chatHistoryChannel.onmessage = event => {
        if (event.data?.room === chatHistoryRoom?.alias) loadChatHistory(chatHistoryRoom);
    };
    window.addEventListener('focus', () => {
        if (chatHistoryRoom?.loaded) loadChatHistory(chatHistoryRoom);
    });
    window.addEventListener('resize', scheduleChatBottom);

    // Show "<name> печатает..." through a pseudo-element that keeps the last
    // text while the notice slides out after Gowo empties it.
    function syncTypingNotice() {
        const notice = document.querySelector('app-chat-messages-room .writing-message');
        if (!notice) return;
        const text = notice.textContent.replace(/\s+/g, ' ').trim();
        if (text) {
            // First names only, as in the chat itself; several typers stay listed.
            const short = text.replace(/^(.*?)\s*(печата(?:ет|ют))[\s\S]*$/, (match, names, verb) =>
                `${names.split(/\s*,\s*|\s+и\s+/).map(name => name.trim().split(' ')[0])
                    .filter(Boolean).join(', ')} ${verb}...`.trim());
            if (notice.dataset.gowoTyping !== short) notice.dataset.gowoTyping = short;
            if (!notice.classList.contains('gowo-typing-active')) {
                // Commit the collapsed style first so a fresh node also slides in.
                void notice.offsetHeight;
                notice.classList.add('gowo-typing-active');
            }
        } else {
            notice.classList.remove('gowo-typing-active');
        }
    }

    function formatReplyAuthors() {
        document.querySelectorAll(
            '.message .text__reply__name, app-chat-messages-room .reply__content .name'
        ).forEach(author => {
            const currentName = author.textContent.trim();
            if (!currentName) {
                replyAuthorNames.delete(author);
                return;
            }
            const previous = replyAuthorNames.get(author);
            // Keep hashing the original full name, just like the chat header.
            // Angular can also reuse this node for a different quoted author.
            const fullName = previous && currentName === previous.shortName ?
                previous.fullName : currentName;
            const shortName = fullName.split(/\s+/)[0];
            if (author.textContent !== shortName) author.textContent = shortName;
            if (previous?.fullName === fullName &&
                author.style.color === previous.appliedColor &&
                author.style.getPropertyPriority('color') === 'important') return;
            // Gowo marks quoted names white with !important in its stylesheet.
            author.style.setProperty('color', stringToColor(fullName), 'important');
            replyAuthorNames.set(author, { fullName, shortName, appliedColor: author.style.color });
        });
    }

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

        const remembered = messageAuthors.get(el);
        if (isUserMessage && (!remembered || remembered.id !== el.id)) {
            const captured = chatHistoryNodes.get(el);
            const author = (captured?.id === el.id && captured.author) ||
                el.querySelector('app-picture img[alt]')?.getAttribute('alt')?.trim() ||
                el.querySelector('.header-message > p')?.textContent.trim();
            if (author) messageAuthors.set(el, { id: el.id, author });
        }
        if (el.dataset.formatted === '1') return;

        const nicknameEl = el.querySelector('.header-message > p');
        if (nicknameEl) {
            const fullNickname = messageAuthors.get(el)?.author || nicknameEl.textContent.trim();
            nicknameEl.style.color = stringToColor(fullNickname);
            nicknameEl.textContent = fullNickname.split(/\s+/)[0] + ':';
        }

        el.dataset.formatted = '1';
    }

    function syncMessageGrouping() {
        for (const chat of document.querySelectorAll('app-chat-messages-room')) {
            let previousAuthor = null;
            // querySelectorAll includes saved and live messages in visual order,
            // crossing the archive wrapper. System notices start a new group.
            for (const message of chat.querySelectorAll('.message')) {
                // System notices lose their only line with .text-muted. Hide the
                // empty shell and let it neither split nor start a sender group.
                const empty = !message.querySelector('.user, img') && !message.textContent.trim();
                message.classList.toggle('gowo-empty-message', empty);
                if (empty) continue;
                const record = messageAuthors.get(message);
                const author = record?.id === message.id ? record.author : null;
                const consecutive = Boolean(author && author === previousAuthor);
                message.classList.toggle('gowo-consecutive-message', consecutive);
                previousAuthor = author;
            }
        }
    }

    // Room styles; switched off on Gowo's other pages.
    let roomStyle = null;
    once('css', () => { roomStyle = injectCSS(`
        body {  background: #000;  }
        .danger-message {  background: #000!important;  }

        .left-place { min-height: 0; overflow: hidden; }
        .videoplayer {
            display: flex!important; flex-direction: column;
            height: 100%!important; min-height: 0; overflow: hidden!important; padding: 0!important;
        }
        .videoplayer > .wrap-header { flex: 0 0 auto; }
        .videoplayer > .gowo-player-host {
            display: flex!important; flex-direction: column; flex: 1 1 0%; min-height: 0;
        }
        .videoplayer .gowo-room-frame {
            display: block; flex: 1 1 0%; width: 100%; height: 100%!important;
            min-height: 0; margin: 0!important; border: 0;
        }
        .videoplayer .danger-message { flex: 0 0 auto; }
        .videoplayer > app-footer-room { display: none!important; }
        .videoplayer[data-gowo-toolbar-ready="true"] > .wrap-header,
        .videoplayer[data-gowo-toolbar-ready="true"] .danger-message { display: none!important; }
        *::-webkit-scrollbar { width: 0px!important; }

        /* Constrain the columns before the chat controls acquire their styles.
           Safari can retain their initial intrinsic overflow until a resize. */
        .left-place, .right-place { min-width: 0; box-sizing: border-box; }
        .left-place { width: 85%!important; }
        .right-place { width: 15%!important; opacity: 0.5; }

        /* The native custom element defaults to inline. Its block chat child
           leaves stale horizontal overflow in Safari after the composer shrinks.
           Give the host its own block box so overflow updates during startup. */
        .right-place > app-chat-layout-room {
            display: block; width: 100%; min-width: 0;
        }
        .right-place .chat {
            box-sizing: border-box; width: 100%; max-width: 100%; min-width: 0;
        }
        .chat { border-left: 0px!important; padding: 5px!important; }
        .chat-header { justify-content: center!important; }
        .chat-header .actions > img[alt="settings room"],
        .chat-header .actions > img[alt="list room"],
        .chat-header .actions > img[alt="users in chat"] {
            /* These SVGs have a separate outer ring. Mask only that rim, keeping
               the native glyph, tooltip, click handler and full image hit area. */
            -webkit-mask-image: radial-gradient(circle closest-side, #000 75%, transparent 76%);
            mask-image: radial-gradient(circle closest-side, #000 75%, transparent 76%);
        }

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
        .message.gowo-empty-message { display: none!important; }
        /* Gowo's global stylesheet makes .text a wrapping flex row beside the
           avatar column, so a long message wrapped under the name but indented
           past the crown. Flow crown, name and text inline like restored ones. */
        app-chat-messages-room .message .user > .d-flex { display: block!important; }
        app-chat-messages-room .message .user > .d-flex > a { display: inline; }
        app-chat-messages-room .message .user > .d-flex > a > .position-relative { display: inline-block; }
        app-chat-messages-room .message .text,
        app-chat-messages-room .message .text > .header-message,
        app-chat-messages-room .message .text > .w-100 { display: inline!important; }
        /* Never override the hidden name on a grouped follow-up message. */
        app-chat-messages-room .message:not(.gowo-consecutive-message) .text > .header-message > p {
            display: inline!important;
        }
        app-chat-messages-room .message.gowo-message-has-reply .text > .w-100 { display: block!important; }
        .message .text div { width: auto!important; }
        .message.gowo-message-has-reply .text {
            flex-direction: column!important;
            align-items: stretch!important;
        }
        /* Retain the nodes so a new group leader can show its name and crown. */
        .message.gowo-consecutive-message .header-message > p,
        .message.gowo-consecutive-message app-icon-crown,
        .message.gowo-consecutive-message .gowo-history-crown { display: none!important; }
        /* With the crown and name hidden, the avatar link is all that is left
           on the first line: it would hold an empty line above a quoted reply. */
        app-chat-messages-room .message.gowo-consecutive-message .user > .d-flex > a { display: none; }
        .gowo-history-crown {
            width: 18px; height: 15px; margin-right: 4px;
            vertical-align: -1px;
        }
        .header-message { width: auto!important; }
        .header-message p { font-weight: bold; margin-right: 5px; }

        /* Restored nodes do not carry Angular's scoped attributes. Match the
           native chat typography instead of inheriting the larger page font. */
        .gowo-history-message { font-size: 13px; }
        .gowo-history-message .user { display: block; min-width: 0; width: 100%; }
        .gowo-history-message .text { display: block!important; overflow-wrap: anywhere; }
        .gowo-history-message .text p { line-height: 1.3; }
        .gowo-history-message .header-message, .gowo-history-message .header-message p { display: inline; }
        .gowo-history-message .header-message p { margin-top: 0; margin-bottom: 0; }
        .gowo-history-message .text > .w-100 { display: inline; white-space: pre-wrap; }
        .gowo-history-message.gowo-message-has-reply .text > .w-100 { display: block; }
        .gowo-history-message .text__reply { border-left: 1px solid #777; padding-left: 8px; margin: 4px 0; }
        .gowo-history-message .text__reply p { margin: 0; white-space: pre-wrap; }
        .gowo-history-message .text__reply__name { font-size: 10px; margin-bottom: 2px; }
        .gowo-history-message .text__reply__text { font-size: 9px; color: #fff!important; }
        .gowo-history-message img:not(.gowo-chat-emote) { display: block; max-width: 100%; height: auto; }
        /* Gowo's hover rule is scoped to its own nodes, so restored messages
           need their own. Without a composer (logged out) there is no reply. */
        .gowo-history-message .gowo-history-actions { display: none; margin: 0; }
        .gowo-history-message:hover .gowo-history-actions { display: flex; align-items: center; }
        app-chat-messages-room:not(:has(.form-message textarea)) .gowo-history-actions { display: none!important; }
        .gowo-history-actions button, .gowo-edit-action button,
        #${historyReplyBarId} > button, #${chatEditBarId} > button {
            display: flex; padding: 0; border: 0; background: transparent; cursor: pointer;
        }
        .gowo-history-actions svg { width: 18px; height: 18px; }
                .message .actions .gowo-edit-action { display: flex; align-items: center; margin-right: 4px; }
        .message .actions.gowo-history-actions .gowo-edit-action svg { width: 16px; height: 16px; }
        .message .actions .gowo-edit-action svg { width: 16px; height: 16px; }
        .gowo-edited-message .text > .w-100::after {
            content: '(изм.)'; margin-left: 5px; font-size: 10px; color: #8a8a8a; white-space: nowrap;
        }
        .gowo-chat-edit-notice .name { font-weight: 400!important; color: #ffb4b4!important; }
        #${historyReplyBarId}, #${chatEditBarId} {
            display: flex; align-items: center; justify-content: space-between;
            gap: 10px; padding: 5px 0; border-top: 1px solid #5F666D;
        }
        #${historyReplyBarId} > svg, #${historyReplyBarId} > button svg,
        #${chatEditBarId} > svg, #${chatEditBarId} > button svg {
            flex: 0 0 24px; width: 24px; height: 24px;
        }
        #${historyReplyBarId} .reply__content, #${chatEditBarId} .reply__content { width: 100%; min-width: 0; white-space: nowrap; overflow: hidden; }
        #${historyReplyBarId} .reply__content p, #${chatEditBarId} .reply__content p {
            margin: 0; text-align: left; font-size: 12px; line-height: 16px; color: #fff;
        }
        #${historyReplyBarId} .reply__content .name, #${chatEditBarId} .reply__content .name { font-weight: 600; margin-bottom: 2px; }
        #${historyReplyBarId} .reply__content .text, #${chatEditBarId} .reply__content .text { overflow: hidden; text-overflow: ellipsis; }
        #${historyReplyBarId} .gowo-chat-emote, #${chatEditBarId} .gowo-chat-emote { height: 16px!important; vertical-align: middle; }
        .gowo-history-setting { margin: 8px 0; }
        .gowo-history-setting p { margin: 0 0 6px; }
        .gowo-history-status { color: #999; }
        .gowo-history-setting button {
            width: 100%; padding: 8px; border: 1px solid #444; border-radius: 8px;
            background: #111; color: #ddd; white-space: normal; cursor: pointer;
        }
        .gowo-history-setting button:disabled { opacity: .5; cursor: default; }

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
        ${sharedCursorCSS}

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
        /* Gowo floats the typing notice 24px above the form and pads the message
           list by 24px to make room for it, leaving a gap when nobody types.
           Keep it in flow instead and slide it open and shut; the chat's
           bottom-follow scroll keeps the last message in view as it resizes. */
        app-chat-messages-room .messages-wrapper {
            padding-top: 0!important;
            padding-bottom: 4px!important;
        }
        /* Let the message list start right at the header separator. */
        .chat:has(app-chat-messages-room) .chat-header {
            margin-bottom: 0!important;
        }
        app-chat-messages-room .form-message .writing-message {
            position: static!important;
            box-sizing: border-box!important;
            max-height: 0!important;
            margin: 0!important;
            padding: 0 8px!important;
            background: transparent!important;
            opacity: 0;
            /* Gowo's own text is drawn by ::before from data-gowo-typing. */
            font-size: 0!important;
            line-height: 16px!important;
            overflow: hidden!important;
            text-overflow: ellipsis!important;
            white-space: nowrap!important;
        }
        app-chat-messages-room .form-message .writing-message::before {
            content: attr(data-gowo-typing);
            font-size: 12px;
        }
        app-chat-messages-room .form-message .writing-message.gowo-typing-active {
            max-height: 16px!important;
            margin: 0 0 3px!important;
            opacity: 1;
        }
        @media (prefers-reduced-motion: no-preference) {
            app-chat-messages-room .form-message .writing-message {
                transition: max-height 180ms ease, margin 180ms ease, opacity 180ms ease;
            }
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
            /* Use the space left after buttons, not the textarea's intrinsic width. */
            flex: 1 1 0%;
        }
        app-chat-messages-room .chat-footer textarea {
            box-sizing: border-box!important;
            width: 100%!important;
            min-width: 0!important;
            /* Native CSS reserves 45px for a GIF icon, even when absent. */
            padding: 5px 8px!important;
            height: var(--gowo-chat-control-height)!important;
            min-height: var(--gowo-chat-control-height)!important;
            border: 1px solid var(--gowo-chat-control-border)!important;
            border-radius: var(--gowo-chat-control-radius)!important;
            background: var(--gowo-chat-control-bg)!important;
            color: var(--gowo-chat-control-text)!important;
            transition: border-color 120ms ease, box-shadow 120ms ease;
        }
        app-chat-messages-room .chat-footer .textarea:has(#search-gifts-button:not([hidden])) textarea {
            padding-right: 32px!important;
        }
        app-chat-messages-room .chat-footer #search-gifts-button {
            right: 6px!important;
            top: 8px!important;
            width: 20px;
            height: 20px;
            line-height: 0;
            /* The native black SVG otherwise disappears on our black input. */
            filter: invert(1);
        }
        app-chat-messages-room .chat-footer #search-gifts-button svg {
            width: 100%;
            height: 100%;
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
            box-sizing: border-box;
            width: var(--gowo-chat-control-height);
            flex: 0 0 var(--gowo-chat-control-height);
            margin-left: 5px;
            padding: 0;
            line-height: 1!important;
        }
        #${sendButtonId} svg {
            width: 18px;
            height: 18px;
            fill: none;
            stroke: currentColor;
            stroke-width: 1.8;
            stroke-linecap: round;
            stroke-linejoin: round;
            pointer-events: none;
        }
        #${emoteAutocompleteId} {
            position: absolute;
            left: 0; right: 0; bottom: calc(100% + 6px);
            z-index: 11;
            box-sizing: border-box;
            max-height: min(45vh, 300px);
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 4px;
            border: 1px solid #555;
            border-radius: 9px;
            background: #111;
            box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.55);
        }
        #${emoteAutocompleteId}[hidden] { display: none!important; }
        #${emoteAutocompleteId} button {
            display: flex; align-items: center; gap: 8px;
            box-sizing: border-box; width: 100%; min-width: 0;
            padding: 5px; border: 0; border-radius: 5px;
            background: transparent; color: #ddd;
            font: 12px/1.3 sans-serif; text-align: left; cursor: pointer;
        }
        #${emoteAutocompleteId} button[aria-selected="true"],
        #${emoteAutocompleteId} button:hover { background: #333; color: #fff; }
        #${emoteAutocompleteId} img {
            width: 26px!important; height: 26px!important;
            flex: 0 0 26px; object-fit: contain;
        }
        #${emoteAutocompleteId} span {
            min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
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
        #${emotePickerId}:not(.gowo-emote-pointer) .gowo-emote-option:focus-visible {
            outline: 1px solid #888;
            outline-offset: -1px;
        }
        #${emotePickerId}.gowo-emote-pointer .gowo-emote-option:focus-visible {
            outline: none;
        }
        .gowo-emote-option:hover,
        #${emotePickerId}:not(.gowo-emote-pointer) .gowo-emote-option:focus-visible {
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
    `); });
    if (roomStyle) roomStyle.media = 'not all';

    // Gowo is a single-page app: it can move into, out of and between rooms
    // without loading a page. Only a room is enhanced.
    let enhancedRoom = '';
    function syncRoute() {
        let alias = '';
        try { alias = getRoomAlias(); } catch {}
        if (alias !== enhancedRoom) {
            enhancedRoom = alias;
            if (roomStyle) roomStyle.media = alias ? 'all' : 'not all';
            unreadCount = 0;
            syncUnreadTitle();
            switchCursorRoom(alias);
        }
        return Boolean(alias);
    }

    function apply(records = []) {
        if (!syncRoute()) return;
        captureChatDeletions(records);
        removeInjectedAds();
        syncRoomToolbar();
        injectCallButtonSetting();
        injectPlaybackSettings();
        injectEmotePicker();
        syncChatHistory();
        injectChatHistorySetting();
        formatReplyAuthors();
        syncTypingNotice();

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
        syncMessageGrouping();

        const textarea = document.querySelector('textarea');
        if (textarea) textarea.placeholder = 'Текст';
        if (unreadCount) syncUnreadTitle();
    }

    const obs = new MutationObserver(apply);

    obs.observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['src']
    });

    apply();
})();
// End Gowo.io+ runtime v1
