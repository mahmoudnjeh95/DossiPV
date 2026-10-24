import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ mockFindValid: vi.fn() }));

vi.mock('@dossipv/auth', () => ({ findValidPasswordResetToken: m.mockFindValid, MIN_PASSWORD_LENGTH: 8 }));
// The form's server action is not exercised here (see password-reset-actions.test.ts).
vi.mock('../app/reinitialiser-mot-de-passe/actions', () => ({ resetPasswordAction: vi.fn() }));

import ResetPasswordPage from '../app/reinitialiser-mot-de-passe/page';

async function render(token?: string): Promise<string> {
  const element = await ResetPasswordPage({ searchParams: Promise.resolve(token === undefined ? {} : { token }) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  m.mockFindValid.mockReset();
});

describe('/reinitialiser-mot-de-passe', () => {
  it('says the link is no longer valid and offers a new one when the token is unknown, used or expired', async () => {
    m.mockFindValid.mockResolvedValue(null);

    const html = await render('old-token');

    expect(m.mockFindValid).toHaveBeenCalledWith('old-token');
    expect(html).toContain('Ce lien n’est plus valide.');
    expect(html).toContain('href="/mot-de-passe-oublie"');
    expect(html).not.toContain('name="password"');
  });

  it('does not look up an absent token', async () => {
    const html = await render();

    expect(m.mockFindValid).not.toHaveBeenCalled();
    expect(html).toContain('Ce lien n’est plus valide.');
  });

  it('shows the account email read-only and the two password fields for a valid link, without a lifetime', async () => {
    m.mockFindValid.mockResolvedValue({ companyUserId: 'u1', email: 'ali@solaire.tn' });

    const html = await render('good-token');

    expect(html).toContain('value="ali@solaire.tn"');
    expect(html).toMatch(/value="ali@solaire\.tn"[^>]*readOnly|readOnly[^>]*value="ali@solaire\.tn"/i);
    expect(html).toContain('name="password"');
    expect(html).toContain('name="confirmation"');
    expect(html).toContain('value="good-token"');
    expect(html).not.toMatch(/heure|jours/);
  });
});
