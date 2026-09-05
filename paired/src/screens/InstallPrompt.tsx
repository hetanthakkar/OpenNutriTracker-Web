import { useEffect, useState } from "react";
import { Share, Plus, X, HeartHandshake } from "lucide-react";
import { canPrompt, isIOS, isInstalled, isSnoozed, onInstallChange, promptInstall, snooze } from "../install";

/**
 * Invites a browser visitor to install the app.
 *
 * On Chromium it's a one-tap install. On iOS there is no install API at all, so
 * the sheet spells out Share → Add to Home Screen — the only route Apple gives.
 * Either way it's dismissible, and staying dismissed for a fortnight matters
 * more than the install does: this sits on top of the app someone is already
 * using.
 */
export default function InstallPrompt() {
  const ios = isIOS();
  const [ready, setReady] = useState(canPrompt());
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => onInstallChange(() => setReady(canPrompt())), []);

  // Already on the home screen, told us to go away, or (on Chromium) the
  // browser hasn't offered an install — nothing to say.
  if (isInstalled() || dismissed || isSnoozed() || (!ios && !ready)) return null;

  const close = () => {
    snooze();
    setDismissed(true);
  };

  const install = async () => {
    const accepted = await promptInstall();
    if (accepted) setDismissed(true);
  };

  return (
    <div className="shrink-0 border-t border-rose-100 bg-surface px-4 pt-3 pb-2">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
          <HeartHandshake className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold leading-tight text-stone-800">Install Together</div>
          <p className="text-xs text-stone-400">Full screen, and notifications when your partner answers.</p>
        </div>
        {ios ? (
          <button
            onClick={() => setExpanded((o) => !o)}
            className="shrink-0 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-onaccent active:scale-95 transition"
          >
            How
          </button>
        ) : (
          <button
            onClick={install}
            className="shrink-0 rounded-full bg-rose-500 px-4 py-2 text-sm font-semibold text-onaccent active:scale-95 transition"
          >
            Install
          </button>
        )}
        <button onClick={close} aria-label="Not now" className="shrink-0 p-1 text-stone-400">
          <X className="h-4 w-4" />
        </button>
      </div>

      {ios && expanded && (
        <ol className="mx-auto mt-3 max-w-xl space-y-2 rounded-2xl bg-rose-50 p-3 text-sm text-stone-600">
          <li className="flex items-center gap-2">
            <span className="font-semibold text-rose-600">1.</span>
            Tap <Share className="h-4 w-4 text-rose-500" /> in Safari's toolbar
          </li>
          <li className="flex items-center gap-2">
            <span className="font-semibold text-rose-600">2.</span>
            Choose <Plus className="h-4 w-4 text-rose-500" /> Add to Home Screen
          </li>
        </ol>
      )}
    </div>
  );
}
