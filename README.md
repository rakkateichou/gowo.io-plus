# Gowo.io+

A userscript for Tampermonkey and Safari Userscripts that enhances Gowo.io rooms.

## Features

- Streamlined room and chat layout
- Consistent nickname colours and compact consecutive messages
- Local receive/send time shown when hovering over a live chat message
- Up to 1,000 locally saved messages per room, restored at the newest message after reload
- Messages sent while you were away, caught up from the Gowo.io+ relay when you return
- Editing your own messages, for everyone in the room who runs Gowo.io+
- Pausing, resuming and seeking for everyone, not only the room owner
- An automatic pause, with the reason on the player, when someone drops out
- The number of unread chat messages in the tab title (and taskbar) while you look away
- Reply text always starts below its quoted message
- First-name-only quoted authors, using their chat nickname colour
- Simple, uncircled chat-header icons with the original controls and tooltips
- A responsive 48-emote 7TV picker with `:token:` autocomplete and inline animated rendering
- A dedicated Send button to the right of the chat field
- Shared coloured cursors and smooth trails while holding `Ctrl` over the player
- Best-effort removal of Gowo.io ad loaders and injected video-ad overlays
- A scroll-free video pane with player selection, admin notice and Refresh in the native player toolbar
- Compact settings typography and a saved, default-on option to hide the call button

## 7TV emotes

Use the **☺** button beside the chat box, or type a token such as `:pog:`.
Type a colon and part of a name, such as `:pe`, to see up to eight matching
emotes. Use **↑/↓** to choose, **Enter** or **Tab** to insert, or click a preview.
**Escape** dismisses suggestions. Enter selects the emote while the list is
open; press Enter again to send the completed message. Matching ignores case
and also finds parts of names, such as `:run` for `:peeporun:`.

Press `Ctrl+E` to open the picker from the keyboard (press it again to close).
Move between emotes with the arrow keys, **Home** and **End**; **Enter** or
**Space** inserts the emote and closes the picker, **Shift+Enter** inserts it and
keeps the picker open, and **Escape** or **Tab** returns to the chat box.
`Ctrl+C` jumps to the chat box when no text is selected; with a selection it
copies as usual.

The token stays ordinary Gowo.io chat text and is rendered as an emote for
people running Gowo.io+. The fixed 48-emote catalogue matches the one in the
[JellyWatchParty fork](https://github.com/rakkateichou/JellyWatchParty).
The picker keeps four columns in the 15% chat pane, with images that shrink and
labels that wrap to fit narrow panels. It scrolls vertically as needed.
The catalogue includes hi, NOOOO, catJAM, CAUGHT, peepoRun, peepoLove, TROLL, Aware, Prayge, RAGEY and Aloo;
retired tokens still render in existing messages.

Emote images are served from this repository's `emotes/` folder, so they also
load where the 7TV CDN is unreachable; 7TV is only used as a fallback.

## Shared cursor drawing

Hold `Ctrl` and move the pointer over the video to draw. Release `Ctrl`, switch tabs,
or move away from the player to clear the cursor and its trail. It also works
while the chat box is focused; pressing another key with `Ctrl` (such as
`Ctrl+C` or `Ctrl+V`) is treated as a shortcut and ends the stroke.
Cursors also show while the player is fullscreen: the room page forwards them
into the player frame, which repaints them there.

Cursor packets use a small relay (`relay/`, served at
`wss://ru.rkde.su/gowo-plugin`; the systemd unit and Caddy site are in
`relay/deploy/`) so they never appear as chat
messages. For cursors the relay receives only a one-way hash of the Gowo room
alias, a display name, a random per-tab client ID, and normalized pointer
coordinates. It does not receive the Gowo login token and stores no cursor
history. Other viewers need Gowo.io+ installed to see the drawing. The same
relay keeps the shared chat history described below.

## Player toolbar

In the supported PlayerJS layout, the player dropdown follows the episode/audio
controls, and the admin notice shares the same row. Share is hidden completely;
Refresh stays at the right edge. The dropdown and Refresh call
Gowo's original controls, and the notice stays synchronized with the room.
The new controls fade out and reappear with the native episode/audio controls;
while hidden, they cannot intercept clicks or keyboard focus.
The iframe fills the available pane height without startup scrolling.

The original Gowo controls remain available until the embedded toolbar is ready,
and stay visible for an unsupported player layout. No player-selection or
refresh command is accepted from a different frame or origin.

## Saved chat history

Messages you see are saved automatically in this browser's IndexedDB, separately
for each room (switching players does not create another history). The newest
1,000 messages per room survive reloads, including names, quotes, 7TV tokens,
safe links, and Gowo's Giphy GIFs. Matching native message IDs are not duplicated.
Restored messages are a read-only local archive, not messages sent back to Gowo.

## Shared playback control

Gowo lets only the room owner and admins pause or seek for everyone; a viewer's
pause stays on their own screen and their seek snaps back. With Gowo.io+, a
viewer's pause, resume or seek is passed through the relay to the owner's
browser, which repeats it as its own, so Gowo moves the whole room as usual.

- It needs Gowo.io+ on both sides, the owner (or an admin) in the room, and the
  turbo player.
- The owner can switch it off with **Разрешить всем ставить на паузу и
  перематывать** in the room settings. It is on by default and remembered per
  browser.
- Changing the episode stays with the owner.
- The player notices no longer name the administrator: a paused room just says
  **Пауза**.

### Automatic pause

When someone running Gowo.io+ drops out of the room and is not back within
about four seconds, the owner's browser pauses the room and everyone's player
says why, for example **Пауза: Аня покинула комнату**. When they return it reads
**Пауза: Аня вернулась**; playback resumes when someone presses play. The
wording follows the gender each person set in their Gowo profile (shared through
the relay with their name); without it the notice reads **покинул(а)**.

- The relay notices a connection that went silent within about ten seconds, and
  a closed or reloaded tab at once. A reload that is back within the four
  seconds does not pause.
- Closing one of several tabs of the same person does not count.
- It needs the owner (or an admin) in the room with Gowo.io+, and only notices
  people who run Gowo.io+.
- The owner can switch it off with **Ставить на паузу, если кто-то отключился**
  in the room settings. It is on by default.

## Shared chat history

Gowo itself only replays a room's most recent messages. To fill the gap, every
Gowo.io+ user in a room reports the chat messages it sees to the relay, which
keeps the newest 2,000 per room. When you open the room again, your browser
asks for everything since its last visit and adds it to the saved history
above. Sending still goes through Gowo only.

- **Times.** The relay stamps a message when the first participant reports it,
  so everyone sees the same hover time. A message nobody running Gowo.io+
  witnessed live has no known time; it is placed in chat order and its hover
  time is marked `≈`.
- **Edits.** Gowo has no message editing, so an edit is kept by the relay and
  shown by Gowo.io+ in place of the original, marked `(изм.)`. Hover one of
  your messages and click the pencil, or press **Up** in an empty chat box to
  edit your last one; **Enter** saves and **Escape** cancels. Anyone without
  Gowo.io+ keeps seeing the original text. A message can only be edited from
  the browser that sent it (while Gowo.io+ was running): that browser holds a
  random key, saved in Gowo's site data, and the relay stores its hash.
  GIF messages cannot be edited.
- **Deletions.** A message deleted in Gowo while a Gowo.io+ user is watching is
  also removed from the relay and from other users' saved history.
- **What is stored.** For each message: Gowo's message ID, the author's display
  name and crown, the text (as plain text, links and Giphy images, never
  markup) and the quoted message. Rooms are identified only by a one-way hash
  of the room alias. No login token and no account ID is sent.
- **Who can read it.** The relay has no accounts: anyone who knows a room's
  link can read that room's stored history, as they could read the room's chat
  by opening it. Whoever reports a message first decides the stored copy, so
  treat the shared history as a convenience among people you trust, not as
  a record.
- **Without the relay** nothing else changes: messages are still saved locally
  as before, with this browser's own first-seen times.

Chat opens at the newest messages after reload and stays there as images and
layout finish loading. Scrolling up stops that behaviour; reaching the bottom
again resumes following new content.

In room settings, **История чата этой комнаты → Очистить сохранённую историю**
clears that room's saved copy after confirmation. It does not delete native live
messages or anybody else's chat. Existing visible messages are not immediately
re-saved after clearing; newly arriving messages start a fresh history.

The saved archive lives in this browser profile and Gowo origin. Clearing it
there does not clear the relay's copy or anyone else's, and messages you cleared
are not downloaded again. Clearing Gowo's site data also clears it; private
browsing or unavailable/full storage can prevent persistence, which is reported
in the settings panel. Messages from before this feature was installed are not
recovered. Messages sent while the room was closed are caught up from the relay
if another Gowo.io+ user was in the room, or if Gowo still replays them.

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

The loader runs on every Gowo page, because Gowo moves between pages without
reloading: entering a room from the feed or "My rooms" would otherwise leave it
unenhanced until a refresh. The runtime changes nothing outside rooms and
switches its room features on and off as you move between pages.

## Development

Edit **`gowo.io-plus.js`** for layout, emotes, cursors, or other feature changes.
Keep its runtime start/end marker comments. Push it to `main` after validation:

```sh
npm ci --ignore-scripts
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
