package tools.ntk;

import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import tools.ntk.ui.EnrollActivity;
import tools.ntk.ui.StripView;

/**
 * What the Sign key does (TODO.md 3.6). Local checks first, then the sealed,
 * signed request runs in the background while typing is held. MATCH: the stamp
 * is checked against the pinned key and the typed text, then " [NTK <id>]" is
 * inserted and a new session starts. NO_MATCH, errors and timeouts insert nothing.
 * In an enrollment field the same key sends the session to `enroll`.
 */
public final class SignFlow {
    private SignFlow() {}

    /** In-process listeners for the results of the key (the enrollment screen, the robot typist test). */
    public interface Listener {
        /** op is "enroll" or "stamp". Called on the main thread. */
        void onResult(String op, NtkController.Result r);
    }

    private static final List<Listener> sListeners = new ArrayList<>();

    public static void addListener(Listener l) {
        if (!sListeners.contains(l)) sListeners.add(l);
    }

    public static void removeListener(Listener l) {
        sListeners.remove(l);
    }

    private static void publish(String op, NtkController.Result r) {
        for (Listener l : new ArrayList<>(sListeners)) l.onResult(op, r);
    }

    public static void onSignKey(final Context ctx, final StripView strip) {
        final AccountStore store = AccountStore.get(ctx);
        final AccountStore.Account account = store.current();
        final NtkController ctl = NtkController.get(ctx);
        final NtkCapture cap = NtkCapture.get();
        if (!Terms.accepted(ctx)) {
            // Until the terms are accepted the keyboard sends nothing: Sign and Enroll open them.
            refuse(strip, "Accept the terms first", StripView.MSG_INFO);
            Terms.open(ctx);
            return;
        }
        if (account == null) {
            StripView.openSetup(ctx);
            return;
        }
        if (ctl.isBusy()) {
            refuse(strip, "Still waiting for the enclave", StripView.MSG_INFO);
            return;
        }
        final TypingSession s = cap.session();
        if (s == null) {
            refuse(strip, cap.notRecordingReason() != null ? cap.notRecordingReason() : "Tap a text field first", StripView.MSG_INFO);
            return;
        }
        if (!cap.isPortrait()) {
            refuse(strip, "Stamps work in portrait only for now", StripView.MSG_INFO);
            return;
        }
        if (s.kind == TypingSession.Kind.ENROLL) {
            enroll(ctx, strip, s);
            return;
        }
        if (s.changedReason() != null) {
            refuse(strip, "Retype to sign: " + s.changedReason(), StripView.MSG_BAD);
            return;
        }
        if (s.taps() < Ntk.MIN_STAMP_TAPS) {
            refuse(strip, String.format(Locale.ROOT, "Type a little more: %d of %d key taps", s.taps(), Ntk.MIN_STAMP_TAPS), StripView.MSG_INFO);
            return;
        }
        final TypingSession.Replay r = s.replay();
        if (r.totalChars == 0) {
            refuse(strip, "Nothing to sign", StripView.MSG_INFO);
            return;
        }
        if (r.typedPct() < Ntk.MIN_TYPED_PCT) {
            refuse(strip, "Too much of this text was pasted, not typed (" + r.typedPct() + "% typed)", StripView.MSG_BAD);
            return;
        }
        if (!fieldMatches(cap, r.text)) {
            s.markChanged("the text in the field is not what was typed");
            refuse(strip, "Retype to sign: the text in the field is not what was typed", StripView.MSG_BAD);
            return;
        }
        if (store.enrollmentKnown() && !store.isReady()) {
            refuse(strip, "Enroll first: your fingerprint is not ready", StripView.MSG_INFO);
            openEnroll(ctx);
            return;
        }
        cap.setHolding(true);
        ctl.send("stamp", s, res -> {
            cap.setHolding(false);
            publish("stamp", res);
            if (cap.session() != s) {
                strip.flash(res.kind == NtkController.Result.Kind.MATCH
                        ? "Stamp " + res.stampId + " issued, but the field was closed: nothing inserted"
                        : "The field was closed: nothing inserted", StripView.MSG_INFO);
                return;
            }
            switch (res.kind) {
                case MATCH: {
                    if (!fieldMatches(cap, s.replay().text)) {
                        strip.flash("The field changed during the check: nothing inserted (stamp " + res.stampId + ")", StripView.MSG_BAD);
                        return;
                    }
                    cap.commitTag(res.stampId);
                    strip.flash("MATCH: " + TextRule.tag(res.stampId) + " inserted", StripView.MSG_GOOD);
                    break;
                }
                case NO_MATCH: {
                    final JSONObject o = res.output;
                    strip.flash("No match: " + res.message + " (score " + o.optInt("score_pct") + "%, "
                            + o.optInt("typed_pct") + "% typed, " + res.attemptsLeft + " tries left today)", StripView.MSG_BAD);
                    break;
                }
                default:
                    if ("E_NOT_ENROLLED".equals(res.code) || "E_NOT_READY".equals(res.code)) {
                        strip.flash("Enroll first: " + res.message, StripView.MSG_BAD);
                    } else {
                        strip.flash("Not signed: " + res.message, StripView.MSG_BAD);
                    }
            }
        });
    }

    /** A local check said no: show why, and tell listeners (nothing was sent). */
    private static void refuse(StripView strip, String why, int kind) {
        strip.flash(why, kind);
        publish("local", NtkController.Result.error(why, "LOCAL"));
    }

    private static boolean fieldMatches(NtkCapture cap, String replayed) {
        if (cap.hasSelection()) return false;
        final String before = cap.textBeforeCursor(Math.min(40_000, replayed.length() * 2 + 64));
        return before != null && TextRule.fieldEndsWith(before, replayed);
    }

    private static void enroll(final Context ctx, final StripView strip, final TypingSession s) {
        if (s.taps() < Ntk.MIN_ENROLL_TAPS) {
            refuse(strip, String.format(Locale.ROOT, "Type a little more: %d of %d key taps", s.taps(), Ntk.MIN_ENROLL_TAPS), StripView.MSG_INFO);
            return;
        }
        final NtkCapture cap = NtkCapture.get();
        cap.setHolding(true);
        NtkController.get(ctx).send("enroll", s, res -> {
            cap.setHolding(false);
            if (res.kind == NtkController.Result.Kind.OK) {
                final JSONObject o = res.output;
                strip.flash(String.format(Locale.ROOT, "Sealed into the enclave: %d sessions, %d taps%s",
                        o.optInt("sessions"), o.optLong("taps"), o.optBoolean("ready") ? ", fingerprint ready" : ""), StripView.MSG_GOOD);
                if (cap.session() == s) cap.newSession("enrolled");
            } else {
                strip.flash("Not enrolled: " + res.message, StripView.MSG_BAD);
            }
            publish("enroll", res);
        });
    }

    static void openEnroll(Context ctx) {
        final Intent i = new Intent(ctx, EnrollActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        ctx.startActivity(i);
    }
}
