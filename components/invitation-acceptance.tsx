"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, ShieldCheck, UserPlus, X } from "lucide-react";
import { sharePermissionLabels, shareRelationshipLabels, type SharePermissionCode, type ShareRelationship } from "@/lib/sharing";

type Preview = {
  inviteeName: string;
  ownerName: string;
  relationship: ShareRelationship;
  expiresAt: string;
  permissions: SharePermissionCode[];
  canAccept: boolean;
};

export function InvitationAcceptance({ token, onClose, onAccepted }: { token: string; onClose: () => void; onAccepted: (ownerName: string) => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/sharing/invitations/preview?token=${encodeURIComponent(token)}`).then(async (response) => {
      const data = await response.json() as Preview & { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not open this invitation.");
      if (!cancelled) setPreview(data);
    }).catch((requestError: unknown) => {
      if (!cancelled) setError(requestError instanceof Error ? requestError.message : "Could not open this invitation.");
    });
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    if (!preview) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sharing/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message ?? "Could not accept this invitation.");
      onAccepted(preview.ownerName);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not accept this invitation.");
      setBusy(false);
    }
  };

  return <div className="modal-backdrop invitation-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="invitation-sheet" role="dialog" aria-modal="true" aria-labelledby="invitation-title" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sheet-handle" />
      <header><span className="icon-badge green"><UserPlus size={22} /></span><div><span className="eyebrow">Private invitation</span><h2 id="invitation-title">Share nutrition progress</h2></div><button className="icon-button" aria-label="Close invitation" onClick={onClose}><X size={20} /></button></header>
      {!preview && !error && <div className="invitation-loading"><LoaderCircle className="spin" size={22} /> Loading invitation…</div>}
      {preview && <>
        <div className="invite-hero"><span className="icon-badge green"><ShieldCheck /></span><div><strong>{preview.ownerName} invited you</strong><p>You’ll be connected as their {shareRelationshipLabels[preview.relationship].toLowerCase()}. Only the selected information below will be visible.</p></div></div>
        <div className="invitation-permissions">{preview.permissions.map((permission) => <span key={permission}><Check size={15} /> {sharePermissionLabels[permission]}</span>)}</div>
        {!preview.canAccept && <p className="food-picker-error">Open this link in the other person’s browser. An owner cannot accept their own invitation.</p>}
        <div className="invitation-actions"><button className="dialog-cancel" onClick={onClose}>Not now</button><button className="primary-button" disabled={busy || !preview.canAccept} onClick={() => void accept()}>{busy ? <><LoaderCircle className="spin" size={17} /> Connecting…</> : "Accept invitation"}</button></div>
      </>}
      {error && <><p className="food-picker-error" role="alert">{error}</p><button className="secondary-button" onClick={onClose}>Close</button></>}
    </section>
  </div>;
}
