'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatSide, ChatSnapshot } from '../../lib/payments/chat';

export interface ChatPanelProps {
  /** The conversation as the server rendered it. */
  initial: ChatSnapshot;
  /** Which side this panel belongs to: its messages are on the right. */
  mine: ChatSide;
  /** Sends one message; null when this viewer may only read (support session, non-owner). */
  send: ((body: string) => Promise<{ error?: string }>) | null;
  /** Reads the conversation again (the polling route in the app, a stub in tests). */
  fetchSnapshot: () => Promise<ChatSnapshot>;
  /** Why the viewer cannot write, when send is null. */
  readOnlyHint?: string | undefined;
  pollMs?: number;
}

/** Polling delay of the open conversation. */
export const CHAT_POLL_MS = 8000;

/**
 * The chat of a payment: bubbles, a text area and « Envoyer ». It refreshes every few seconds,
 * but only while the tab is visible (no websockets), and flags a new message that arrived while
 * the tab was hidden. Messages are plain text, rendered escaped.
 */
export function ChatPanel({ initial, mine, send, fetchSnapshot, readOnlyHint, pollMs = CHAT_POLL_MS }: ChatPanelProps): React.JSX.Element {
  const [snapshot, setSnapshot] = useState<ChatSnapshot>(initial);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [fresh, setFresh] = useState(false);
  const knownFromOthers = useRef(initial.messages.filter((m) => m.author !== mine).length);
  const wasHidden = useRef(false);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchSnapshot();
      const fromOthers = next.messages.filter((m) => m.author !== mine).length;
      // New for the viewer: it arrived while the tab was hidden or just before it came back.
      if (fromOthers > knownFromOthers.current && (document.visibilityState === 'hidden' || wasHidden.current)) setFresh(true);
      knownFromOthers.current = fromOthers;
      setSnapshot(next);
    } catch {
      // A failed poll is silent: the next one tries again.
    }
  }, [fetchSnapshot, mine]);

  useEffect(() => {
    if (!snapshot.open) return undefined;
    const tick = (): void => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') {
        wasHidden.current = true;
        return;
      }
      void refresh().then(() => {
        wasHidden.current = false;
      });
    };
    const timer = setInterval(tick, pollMs);
    document.addEventListener('visibilitychange', onVisibility);
    return (): void => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [snapshot.open, pollMs, refresh]);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!send || sending || draft.trim().length === 0) return;
    setSending(true);
    setError(null);
    try {
      const result = await send(draft);
      if (result.error) {
        setError(result.error);
      } else {
        setDraft('');
        await refresh();
      }
    } catch {
      setError('Envoi impossible, réessayez.');
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="card" aria-label="Messages">
      <h2>
        Messages
        {fresh && (
          <button type="button" className="badge badge-warn" style={{ marginLeft: 8 }} onClick={() => setFresh(false)}>
            Nouveau message
          </button>
        )}
      </h2>
      {snapshot.messages.length === 0 ? (
        <p className="muted">Aucun message. Écrivez ici pour toute question sur ce paiement.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {snapshot.messages.map((message) => (
            <Bubble key={message.id} message={message} own={message.author === mine} />
          ))}
        </ul>
      )}
      {!snapshot.open ? (
        <p className="hint">Conversation terminée.</p>
      ) : send ? (
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Votre message
            <textarea name="body" rows={3} maxLength={1000} value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={() => setFresh(false)} />
          </label>
          <button type="submit" disabled={sending || draft.trim().length === 0}>
            {sending ? 'Envoi…' : 'Envoyer'}
          </button>
          {error && <p role="alert">{error}</p>}
        </form>
      ) : (
        <p className="hint">{readOnlyHint ?? 'Lecture seule.'}</p>
      )}
    </section>
  );
}

function Bubble({ message, own }: { message: ChatMessage; own: boolean }): React.JSX.Element {
  return (
    <li
      style={{
        alignSelf: own ? 'flex-end' : 'flex-start',
        maxWidth: '85%',
        padding: '8px 12px',
        borderRadius: 10,
        background: own ? 'var(--color-primary-soft, #dbe8fb)' : 'var(--color-surface-alt, #f1f1f1)',
      }}
    >
      <div className="hint" style={{ margin: 0 }}>
        {own ? 'Vous' : message.authorName} ·{' '}
        <time dateTime={message.createdAt} suppressHydrationWarning>
          {new Date(message.createdAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
        </time>
      </div>
      {/* Plain text: React escapes it, pre-wrap keeps the line breaks. */}
      <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</div>
    </li>
  );
}
