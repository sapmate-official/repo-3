import { afterEach, describe, expect, it, vi } from 'vitest';
import { EmailService, escapeHtml } from '../../src/services/email.service.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('EmailService', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'quoted'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39;'
    );
  });

  it('escapes public demo request values before rendering email HTML', async () => {
    vi.stubEnv('BREVO_API_KEY', 'test-key');
    vi.stubEnv('CLIENT_URL', 'http://localhost:5174');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({})
    });
    vi.stubGlobal('fetch', fetchMock);

    await EmailService.sendDemoRequestEmails({
      name: '<img src=x onerror=alert(1)>',
      company: 'Acme & Sons\r\nBcc: attacker@example.test',
      phoneNumber: '<b>123</b>',
      email: 'user@example.test'
    });

    const bodies = fetchMock.mock.calls.map((call) => {
      const init = call[1] as RequestInit;
      return JSON.parse(init.body as string) as {
        subject: string;
        htmlContent: string;
      };
    });

    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.htmlContent).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(bodies[0]?.htmlContent).not.toContain('<img src=x onerror=alert(1)>');
    expect(bodies[0]?.htmlContent).toContain('Acme &amp; Sons');
    expect(bodies[0]?.subject).not.toContain('\r');
    expect(bodies[0]?.subject).not.toContain('\n');
  });
});
