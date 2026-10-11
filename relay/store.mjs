import { DatabaseSync } from 'node:sqlite';

const maxMessagesPerRoom = 2000;
const maxRooms = 500;
const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
const idleRoomMs = 180 * 24 * 60 * 60 * 1000;
const pageRows = 100;
const pageBytes = 256 * 1024;

// One row per chat message, holding its latest state. Every change bumps the
// room's revision and stamps the row with it, so a client that remembers the
// last revision it saw catches up with "everything after N".
export function createMessageStore(path = ':memory:') {
    const db = new DatabaseSync(path);
    db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        CREATE TABLE IF NOT EXISTS rooms (
            room TEXT PRIMARY KEY,
            rev INTEGER NOT NULL,
            touched INTEGER NOT NULL
        ) WITHOUT ROWID;
        CREATE TABLE IF NOT EXISTS messages (
            room TEXT NOT NULL,
            id TEXT NOT NULL,
            rev INTEGER NOT NULL,
            at INTEGER NOT NULL,
            approx INTEGER NOT NULL,
            deleted INTEGER NOT NULL DEFAULT 0,
            body TEXT NOT NULL,
            PRIMARY KEY (room, id)
        ) WITHOUT ROWID;
        CREATE INDEX IF NOT EXISTS messages_by_rev ON messages (room, rev);
        CREATE INDEX IF NOT EXISTS messages_by_time ON messages (room, at);
    `);
    const idleBefore = Date.now() - idleRoomMs;
    db.prepare('DELETE FROM messages WHERE room IN (SELECT room FROM rooms WHERE touched < ?)').run(idleBefore);
    db.prepare('DELETE FROM rooms WHERE touched < ?').run(idleBefore);

    const selectRoom = db.prepare('SELECT rev FROM rooms WHERE room = ?');
    const countRooms = db.prepare('SELECT COUNT(*) AS count FROM rooms');
    const upsertRoom = db.prepare(`
        INSERT INTO rooms (room, rev, touched) VALUES (?, ?, ?)
        ON CONFLICT (room) DO UPDATE SET rev = excluded.rev, touched = excluded.touched
    `);
    const selectMessage = db.prepare('SELECT id, rev, at, approx, deleted, body FROM messages WHERE room = ? AND id = ?');
    const insertMessage = db.prepare('INSERT INTO messages (room, id, rev, at, approx, body) VALUES (?, ?, ?, ?, ?, ?)');
    const deleteMessage = db.prepare("UPDATE messages SET deleted = 1, body = '{}', rev = ? WHERE room = ? AND id = ?");
    const selectAfter = db.prepare('SELECT id, rev, at, approx, deleted, body FROM messages WHERE room = ? AND rev > ? ORDER BY rev LIMIT ?');
    const countMessages = db.prepare('SELECT COUNT(*) AS count FROM messages WHERE room = ?');
    const pruneMessages = db.prepare(`
        DELETE FROM messages WHERE room = ?1 AND id IN (
            SELECT id FROM messages WHERE room = ?1 ORDER BY at, rev LIMIT ?2
        )
    `);

    const toRow = record => ({
        id: record.id,
        rev: record.rev,
        at: record.at,
        approx: record.approx === 1,
        deleted: record.deleted === 1,
        ...JSON.parse(record.body)
    });

    function transaction(work) {
        db.exec('BEGIN IMMEDIATE');
        try {
            const result = work();
            db.exec('COMMIT');
            return result;
        } catch (error) {
            db.exec('ROLLBACK');
            throw error;
        }
    }

    return {
        // Stores a message the first time any client reports it. A live report
        // is timed exactly, by this server's clock less the reporter's own delay.
        // A message that was only replayed to the reporter has no known time: it
        // is placed just before the message that followed it in the chat.
        record(room, message, { live = false, age = 0, next = '', now = Date.now() } = {}) {
            return transaction(() => {
                const existing = selectMessage.get(room, message.id);
                if (existing) return { row: toRow(existing), created: false };
                const known = selectRoom.get(room);
                if (!known && countRooms.get().count >= maxRooms) return null;

                const delay = Number.isFinite(age) ? Math.min(Math.max(age, 0), maxAgeMs) : 0;
                let at = Math.round(now - delay);
                if (!live) {
                    const anchor = next ? selectMessage.get(room, next) : null;
                    if (anchor && at >= anchor.at) at = anchor.at - 1;
                }
                const rev = (known?.rev || 0) + 1;
                const { id, ...body } = message;
                upsertRoom.run(room, rev, now);
                insertMessage.run(room, id, rev, at, live ? 0 : 1, JSON.stringify(body));
                const excess = countMessages.get(room).count - maxMessagesPerRoom;
                if (excess > 0) pruneMessages.run(room, excess);
                return { row: toRow(selectMessage.get(room, id)), created: true };
            });
        },

        // Leaves a tombstone so absent clients drop their copy as well.
        remove(room, id, now = Date.now()) {
            return transaction(() => {
                const existing = selectMessage.get(room, id);
                if (!existing || existing.deleted) return null;
                const rev = selectRoom.get(room).rev + 1;
                upsertRoom.run(room, rev, now);
                deleteMessage.run(rev, room, id);
                return toRow(selectMessage.get(room, id));
            });
        },

        since(room, after = 0) {
            const records = selectAfter.all(room, after, pageRows + 1);
            const messages = [];
            let bytes = 0;
            for (const record of records.slice(0, pageRows)) {
                bytes += record.body.length + record.id.length;
                if (messages.length && bytes > pageBytes) break;
                messages.push(toRow(record));
            }
            return {
                messages,
                // A client ahead of the room revision knows a store that no longer exists.
                rev: selectRoom.get(room)?.rev || 0,
                through: messages.length ? messages.at(-1).rev : after,
                more: messages.length < records.length
            };
        },

        close: () => db.close()
    };
}
