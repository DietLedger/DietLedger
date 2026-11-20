import { describe, expect, it } from 'vitest';
import config from '../next.config';

describe('Next response security policy', () => {
  it('stages CSP without blocking export iframes or assuming HTTPS', async () => {
    expect(config.headers).toBeTypeOf('function');
    const rules = await config.headers!();
    const global = rules.find((rule) => rule.source === '/:path*')!;
    expect(global).toBeDefined();
    const headers = new Map(global.headers.map(({ key, value }) => [key.toLowerCase(), value]));
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('x-frame-options')).toBe('SAMEORIGIN');
    expect(headers.get('referrer-policy')).toBe('no-referrer');
    expect(headers.get('content-security-policy-report-only')).toContain("object-src 'none'");
    expect(headers.has('content-security-policy')).toBe(false);
    expect(headers.has('strict-transport-security')).toBe(false);
  });

  it('does not cache private API responses, including local admission errors', async () => {
    const rules = await config.headers!();
    const api = rules.find((rule) => rule.source === '/api/:path*')!;
    expect(api.headers).toContainEqual({ key: 'Cache-Control', value: 'no-store' });
  });
});
