import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { ChatPanel } from '../components/payments/chat-panel';
import type { ChatSnapshot } from '../lib/payments/chat';

const mine = { id: 'm1', author: 'COMPANY', authorName: 'Sami', body: 'Bonjour', createdAt: '2026-10-24T10:00:00.000Z' } as const;
const theirs = { id: 'm2', author: 'ADMIN', authorName: 'SolarixPro', body: 'Quel montant ?', createdAt: '2026-10-24T10:01:00.000Z' } as const;

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const snapshot = (messages: ChatSnapshot['messages'], open = true): ChatSnapshot => ({ messages, open });

describe('ChatPanel', () => {
  it('shows messages as text: markup in a message is escaped, line breaks kept by CSS', () => {
    const evil = { ...theirs, body: '<b>x</b>\nligne 2' };
    const { container } = render(<ChatPanel initial={snapshot([mine, evil])} mine="COMPANY" send={vi.fn()} fetchSnapshot={vi.fn()} />);
    expect(screen.getByText(/<b>x<\/b>/)).toBeTruthy();
    expect(container.querySelector('b')).toBeNull();
    const body = screen.getByText(/<b>x<\/b>/);
    expect(body.style.whiteSpace).toBe('pre-wrap');
    expect(screen.getByText('Vous', { exact: false })).toBeTruthy();
    expect(screen.getByText('SolarixPro', { exact: false })).toBeTruthy();
  });

  it('sends the typed text, empties the box and refreshes', async () => {
    const send = vi.fn().mockResolvedValue({});
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot([mine]));
    render(<ChatPanel initial={snapshot([])} mine="COMPANY" send={send} fetchSnapshot={fetchSnapshot} />);
    fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: 'Bonjour' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(send).toHaveBeenCalledWith('Bonjour');
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Votre message').value).toBe('');
    expect(screen.getByText('Bonjour')).toBeTruthy();
  });

  it('shows the refusal and keeps the text', async () => {
    const send = vi.fn().mockResolvedValue({ error: 'Conversation terminée.' });
    render(<ChatPanel initial={snapshot([])} mine="COMPANY" send={send} fetchSnapshot={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Votre message'), { target: { value: 'Bonjour' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Envoyer' }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('alert').textContent).toBe('Conversation terminée.');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Votre message').value).toBe('Bonjour');
  });

  it('polls every 8 seconds while the tab is visible and shows the new messages', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot([mine, theirs]));
    render(<ChatPanel initial={snapshot([mine])} mine="COMPANY" send={vi.fn()} fetchSnapshot={fetchSnapshot} />);
    expect(fetchSnapshot).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Quel montant ?')).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16000);
    });
    expect(fetchSnapshot).toHaveBeenCalledTimes(3);
  });

  it('does not poll while the tab is hidden, and catches up with a "Nouveau message" flag when it is back', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot([mine, theirs]));
    render(<ChatPanel initial={snapshot([mine])} mine="COMPANY" send={vi.fn()} fetchSnapshot={fetchSnapshot} />);
    await act(async () => {
      setVisibility('hidden');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(40000);
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(screen.queryByText('Nouveau message')).toBeNull();
    await act(async () => {
      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Nouveau message')).toBeTruthy();
    fireEvent.click(screen.getByText('Nouveau message'));
    expect(screen.queryByText('Nouveau message')).toBeNull();
  });

  it('flags a message that arrives while the tab has just been hidden', async () => {
    let resolve: (value: ChatSnapshot) => void = () => undefined;
    const fetchSnapshot = vi.fn().mockReturnValue(new Promise<ChatSnapshot>((r) => (resolve = r)));
    render(<ChatPanel initial={snapshot([mine])} mine="COMPANY" send={vi.fn()} fetchSnapshot={fetchSnapshot} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    await act(async () => {
      setVisibility('hidden');
      resolve(snapshot([mine, theirs]));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Nouveau message')).toBeTruthy();
  });

  it('does not flag the viewer own messages', async () => {
    const fetchSnapshot = vi.fn().mockResolvedValue(snapshot([mine, { ...mine, id: 'm3' }]));
    render(<ChatPanel initial={snapshot([mine])} mine="COMPANY" send={vi.fn()} fetchSnapshot={fetchSnapshot} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });
    expect(screen.queryByText('Nouveau message')).toBeNull();
  });

  it('shows "Conversation terminée" without a form and stops polling when closed', async () => {
    const fetchSnapshot = vi.fn();
    render(<ChatPanel initial={snapshot([mine], false)} mine="COMPANY" send={vi.fn()} fetchSnapshot={fetchSnapshot} />);
    expect(screen.getByText('Conversation terminée.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
  });

  it('is read-only without a send function', () => {
    render(<ChatPanel initial={snapshot([mine])} mine="COMPANY" send={null} fetchSnapshot={vi.fn()} readOnlyHint="Mode support : lecture seule." />);
    expect(screen.getByText('Mode support : lecture seule.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Envoyer' })).toBeNull();
  });
});
