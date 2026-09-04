# Gowo.io+

A Tampermonkey userscript that enhances Gowo.io rooms.

## Features

- Streamlined room and chat layout
- Consistent nickname colours and compact consecutive messages
- Local receive/send time shown when hovering over a live chat message
- Reply text always starts below its quoted message
- A 46-emote 7TV picker with `:token:` insertion and inline animated rendering
- A dedicated Send button to the right of the chat field
- Shared coloured cursors and smooth trails while holding `X` over the player
- Best-effort removal of Gowo.io ad loaders and injected video-ad overlays
- Starts the video pane below the room controls, which remain available by scrolling up
- Compact settings typography and a saved, default-on option to hide the call button

## 7TV emotes

Use the **7TV** button beside the chat box, or type a token such as `:pog:`.
The token stays ordinary Gowo.io chat text and is rendered as an emote for
people running Gowo.io+. The fixed 46-emote catalogue matches the one in the
[JellyWatchParty fork](https://github.com/rakkateichou/JellyWatchParty).

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

Tampermonkey will open its installation screen. After installation, it checks the
URLs embedded in the userscript for newer versions.

## Automatic updates

Every change pushed to `gowo.io-plus.user.js` on `main` automatically receives a
higher `@version`. Tampermonkey uses that version together with `@updateURL` and
`@downloadURL` to detect and install updates.

Tampermonkey controls the update interval and whether detected updates are
installed automatically. For zero-click updates, keep Tampermonkey's
**Automatic installation** setting enabled. A userscript cannot override a
user's Tampermonkey update preferences.
