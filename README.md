# Gowo.io+

A Tampermonkey userscript that enhances Gowo.io rooms.

## Features

- Streamlined room and chat layout
- Consistent nickname colours and compact consecutive messages
- Local receive/send time shown when hovering over a live chat message
- Reply text always starts below its quoted message
- Best-effort removal of Gowo.io ad loaders and injected video-ad overlays
- Starts the video pane below the room controls, which remain available by scrolling up
- Compact settings typography and a saved, default-on option to hide the call button

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
