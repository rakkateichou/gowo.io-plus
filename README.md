# Gowo.io+

A userscript for Tampermonkey and Safari Userscripts that enhances Gowo.io rooms.

## Features

- Streamlined room and chat layout
- Consistent nickname colours and compact consecutive messages
- Local receive/send time shown when hovering over a live chat message
- Reply text always starts below its quoted message
- A responsive 48-emote 7TV picker with `:token:` insertion and inline animated rendering
- A dedicated Send button to the right of the chat field
- Shared coloured cursors and smooth trails while holding `X` over the player
- Best-effort removal of Gowo.io ad loaders and injected video-ad overlays
- Starts the video pane below the room controls, which remain available by scrolling up
- Compact settings typography and a saved, default-on option to hide the call button

## 7TV emotes

Use the **☺** button beside the chat box, or type a token such as `:pog:`.
The token stays ordinary Gowo.io chat text and is rendered as an emote for
people running Gowo.io+. The fixed 48-emote catalogue matches the one in the
[JellyWatchParty fork](https://github.com/rakkateichou/JellyWatchParty).
The picker uses fewer columns in narrow chat panels and scrolls vertically.
The catalogue includes hi, NOOOO, catJAM, CAUGHT, peepoRun, TrollDespair, Prayge, RAGEY and Aloo;
retired tokens still render in existing messages.

## Shared cursor drawing

Hold `X` and move the pointer over the video to draw. Release `X`, switch tabs,
or move away from the player to clear the cursor and its trail. The shortcut is
ignored while typing in a text field.

Cursor packets use a small, stateless relay so they never appear as chat
messages. The relay receives only a one-way hash of the Gowo room alias, a
display name, a random per-tab client ID, and normalized pointer coordinates.
It does not receive the Gowo login token and stores no cursor history. Other
viewers need Gowo.io+ installed to see the drawing.

## Install

[Install Gowo.io+](https://raw.githubusercontent.com/rakkateichou/gowo.io-plus/main/gowo.io-plus.user.js)

Tampermonkey will open its installation screen. Install the loader once and
allow its connection to `raw.githubusercontent.com`. It loads the enhancer
automatically when you open a room, including the supported player frames.

### Safari (Userscripts)

Open the install link in Safari, then open the Userscripts extension popup and
install or update **Gowo.io+**. Enable Userscripts and allow access to `gowo.io`
and the supported player sites (`*.obrut.show` and `alloha.gowo.tv`). Allow access
to `raw.githubusercontent.com` if requested for the runtime download.

**Existing Safari installs need a one-time loader update** for this fix, then a
Gowo page reload. Updating only the runtime cannot repair the old loader.
The loader supports Userscripts' asynchronous `GM.getValue` / `GM.setValue`
storage and its `responseURL` network response field, while retaining the
Tampermonkey APIs. It explicitly selects the content injection context.
See the [Userscripts API documentation](https://github.com/quoid/userscripts/tree/release/4.x.x#api).

## Automatic updates

`gowo.io-plus.user.js` is now a small loader. On every page load it fetches
`gowo.io-plus.js` from this repository's `main` branch, bypassing the browser's
cache. Future feature changes arrive when you open or refresh Gowo, without
clicking an update link or waiting for Tampermonkey's script update schedule.
GitHub's CDN can take a little time to propagate a push.

The last runtime that started successfully is saved in the userscript manager's private
storage. If GitHub is unavailable, returns an invalid response, or takes longer
than 2.5 seconds, the loader uses that saved copy for the page. A first install
has no offline copy and waits up to 10 seconds. An already running page keeps
its version until refreshed, avoiding duplicate chat handlers or interrupted
drawing. A runtime startup error is logged and does not overwrite the old cache;
the loader will not start a second runtime over partially initialized code.

**Existing users:** versions before this loader need one final Tampermonkey
update to receive it. The install URL, name, and namespace remain the same, so
the normal update check can migrate existing installations. Tampermonkey may
ask you to approve the new network/storage permissions once. If automatic
installation is disabled, install/update the loader from the link above once.
After migration, routine feature updates need only a page refresh.

The loader itself still has `@updateURL`, `@downloadURL`, and an automatically
bumped `@version` for occasional loader or permission changes.

## Development

Edit **`gowo.io-plus.js`** for layout, emotes, cursors, or other feature changes.
Keep its runtime start/end marker comments. Push it to `main` after validation:

```sh
node --check gowo.io-plus.user.js
node --check gowo.io-plus.js
node --test test/*.test.mjs
```

No userscript version bump is needed for runtime changes. Only edit the loader
when changing its loading behavior, match rules, or permissions; those changes
still need a normal Tampermonkey update. The runtime is executable code trusted
from this repository, so users who install the loader opt into its future code
updates. Requests to GitHub are anonymous and contain no Gowo login token.

Loader API details: [Tampermonkey requests](https://www.tampermonkey.net/documentation.php?locale=en&q=GM_xmlhttpRequest),
[permissions](https://www.tampermonkey.net/documentation.php?locale=en&q=grant).
