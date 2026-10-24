// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import { CopyButton } from '../components/copy-button';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('CopyButton', () => {
  it('puts the value, not the displayed text, in the clipboard and says so for a moment', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    vi.stubGlobal('isSecureContext', true);
    render(<CopyButton value="20123456" label="le numéro Flouci" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copier le numéro Flouci' }));
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledWith('20123456');
    expect(screen.getByRole('button').textContent).toBe('Copié ✓');
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole('button').textContent).toBe('Copier');
  });

  it('falls back to the selection trick without the clipboard API, and reports a failure', async () => {
    vi.stubGlobal('navigator', {});
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true });
    render(<CopyButton value="DPV-ABC123" label="la référence" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
    });
    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(screen.getByRole('button').textContent).toBe('Copié ✓');

    execCommand.mockReturnValue(false);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
      await Promise.resolve();
    });
    expect(screen.getByRole('button').textContent).toBe('Copie impossible');
  });
});
