package tools.ntk;

import java.util.ArrayList;
import java.util.List;

/**
 * One typing session: the key taps and insertions in one text field, in
 * key-down order, as the keyboard seals them for the enclave (docs/protocol.md,
 * "Session"). Lives in memory only; cleared after it is sent.
 */
public final class TypingSession {
    public static final int MAX_EVENTS = 20_000;

    /** What the session is for: a stamp in any app, or enrollment on our own screen. */
    public enum Kind { STAMP, ENROLL }

    /** One event: a timed tap, an untimed key output (a repeat), or inserted text. */
    public static final class Event {
        public final String k;
        public final String ins;
        /** Touch down and up, uptime ms (absolute); -1 when the event has no timing. */
        public final long d;
        public final long u;
        /** Touch-down point minus key centre, as a fraction of the key's width and height. */
        public final float x;
        public final float y;

        private Event(String k, String ins, long d, long u, float x, float y) {
            this.k = k;
            this.ins = ins;
            this.d = d;
            this.u = u;
            this.x = x;
            this.y = y;
        }

        public static Event tap(String k, long d, long u, float x, float y) {
            return new Event(k, null, d, u, x, y);
        }

        public static Event bare(String k) {
            return new Event(k, null, -1, -1, Float.NaN, Float.NaN);
        }

        public static Event inserted(String text) {
            return new Event(null, text, -1, -1, Float.NaN, Float.NaN);
        }

        public boolean isTap() {
            return k != null && d >= 0 && u >= d;
        }
    }

    /** The text the events leave in the field, and how much of it came from key taps. */
    public static final class Replay {
        public final String text;
        public final int typedChars;
        public final int totalChars;

        Replay(String text, int typedChars, int totalChars) {
            this.text = text;
            this.typedChars = typedChars;
            this.totalChars = totalChars;
        }

        public int typedPct() {
            return totalChars == 0 ? 0 : (int) Math.round(100.0 * typedChars / totalChars);
        }
    }

    public final Kind kind;
    /** "compose" or "copy" on enrollment sessions, else null. */
    public final String mode;
    public final String layout;
    public final long createdAt = System.currentTimeMillis();

    private final List<Event> mEvents = new ArrayList<>();
    private int mTaps;
    private String mChangedReason;

    public TypingSession(Kind kind, String mode, String layout) {
        this.kind = kind;
        this.mode = mode;
        this.layout = layout;
    }

    public synchronized int size() {
        return mEvents.size();
    }

    public synchronized int taps() {
        return mTaps;
    }

    public synchronized boolean isEmpty() {
        return mEvents.isEmpty();
    }

    /** Why this session can no longer be signed, or null. */
    public synchronized String changedReason() {
        return mChangedReason;
    }

    public synchronized void markChanged(String reason) {
        if (mChangedReason == null) mChangedReason = reason;
    }

    public synchronized boolean isFull() {
        return mEvents.size() >= MAX_EVENTS;
    }

    /** Adds a timed tap in key-down order (two thumbs can overlap). */
    public synchronized void addTap(Event e) {
        if (!checkRoom()) return;
        int i = mEvents.size();
        while (i > 0) {
            final Event prev = mEvents.get(i - 1);
            if (prev.d < 0 || prev.d <= e.d) break;
            i--;
        }
        mEvents.add(i, e);
        if (e.isTap()) mTaps++;
    }

    public synchronized void addUntimed(Event e) {
        if (!checkRoom()) return;
        mEvents.add(e);
    }

    private boolean checkRoom() {
        if (mEvents.size() >= MAX_EVENTS) {
            markChanged("this text is longer than one session may be (20,000 key events)");
            return false;
        }
        return true;
    }

    public synchronized List<Event> events() {
        return new ArrayList<>(mEvents);
    }

    private static boolean isControl(String k) {
        return k.length() > 2 && k.startsWith("<") && k.endsWith(">");
    }

    /** Replays taps, backspaces and insertions exactly as the enclave does. */
    public synchronized Replay replay() {
        return replay(mEvents);
    }

    public static Replay replay(List<Event> events) {
        final StringBuilder chars = new StringBuilder();
        final List<Boolean> typed = new ArrayList<>();
        // One entry per Unicode scalar: start index in `chars` is tracked by a parallel list.
        final List<Integer> starts = new ArrayList<>();
        int n = 0;
        for (Event e : events) {
            if (n++ >= MAX_EVENTS) break;
            if (e.ins != null) {
                append(chars, typed, starts, e.ins, false);
                continue;
            }
            if (e.k == null) continue;
            if (e.k.equals("<bksp>")) {
                if (!starts.isEmpty()) {
                    final int last = starts.size() - 1;
                    chars.setLength(starts.get(last));
                    starts.remove(last);
                    typed.remove(last);
                }
            } else if (!isControl(e.k)) {
                append(chars, typed, starts, e.k, true);
            }
        }
        // Remove CR, then trim Unicode White_Space at both ends.
        final List<Integer> cps = new ArrayList<>();
        final List<Boolean> flags = new ArrayList<>();
        for (int i = 0; i < starts.size(); i++) {
            final int cp = chars.codePointAt(starts.get(i));
            if (cp == '\r') continue;
            cps.add(cp);
            flags.add(typed.get(i));
        }
        int a = 0;
        int b = cps.size();
        while (a < b && TextRule.isWhitespace(cps.get(a))) a++;
        while (b > a && TextRule.isWhitespace(cps.get(b - 1))) b--;
        final StringBuilder text = new StringBuilder();
        int typedCount = 0;
        for (int i = a; i < b; i++) {
            text.appendCodePoint(cps.get(i));
            if (flags.get(i)) typedCount++;
        }
        return new Replay(text.toString(), typedCount, b - a);
    }

    private static void append(StringBuilder chars, List<Boolean> typed, List<Integer> starts,
            String s, boolean isTyped) {
        for (int i = 0; i < s.length(); ) {
            final int cp = s.codePointAt(i);
            starts.add(chars.length());
            chars.appendCodePoint(cp);
            typed.add(isTyped);
            i += Character.charCount(cp);
        }
    }

    /** The session JSON that is sealed: times in ms since the first touch-down. */
    public synchronized String toJson() {
        long base = -1;
        for (Event e : mEvents) {
            if (e.d >= 0) {
                base = e.d;
                break;
            }
        }
        final StringBuilder b = new StringBuilder(64 + mEvents.size() * 48);
        b.append("{\"v\":1,\"layout\":").append(Json.quote(layout));
        if (mode != null) b.append(",\"mode\":").append(Json.quote(mode));
        b.append(",\"events\":[");
        boolean first = true;
        for (Event e : mEvents) {
            if (!first) b.append(',');
            first = false;
            if (e.ins != null) {
                b.append("{\"ins\":").append(Json.quote(e.ins)).append('}');
                continue;
            }
            b.append("{\"k\":").append(Json.quote(e.k));
            if (e.d >= 0) {
                b.append(",\"d\":").append(e.d - base).append(",\"u\":").append(e.u - base);
                if (!Float.isNaN(e.x) && !Float.isNaN(e.y)) {
                    b.append(",\"x\":").append(Json.fraction(e.x)).append(",\"y\":").append(Json.fraction(e.y));
                }
            }
            b.append('}');
        }
        return b.append("]}").toString();
    }
}
