/**
 * Tests for utils/url.ts
 */
import { describe, it, expect } from 'vitest';
import { fixUrl, normalizeUrl, getDomain } from './url';

describe('fixUrl', () => {
  it('should return empty string for empty input', () => {
    expect(fixUrl('')).toBe('');
  });

  it('should return null for null input', () => {
    expect(fixUrl(null as unknown as string)).toBeNull();
  });

  it('should add www. to domains that require it', () => {
    expect(fixUrl('https://heyjom.com/events')).toBe('https://www.heyjom.com/events');
  });

  it('should not modify URLs that already have www', () => {
    expect(fixUrl('https://www.heyjom.com/events')).toBe('https://www.heyjom.com/events');
  });

  it('should not modify URLs for domains that do not require www', () => {
    expect(fixUrl('https://example.com/page')).toBe('https://example.com/page');
  });

  it('should handle URLs with query params', () => {
    expect(fixUrl('https://heyjom.com/events?page=1')).toBe('https://www.heyjom.com/events?page=1');
  });

  it('should handle URLs with fragments', () => {
    expect(fixUrl('https://heyjom.com/events#section')).toBe('https://www.heyjom.com/events#section');
  });

  it('should return original string for invalid URLs', () => {
    expect(fixUrl('not-a-url')).toBe('not-a-url');
  });

  it('should handle http protocol', () => {
    expect(fixUrl('http://heyjom.com')).toBe('http://www.heyjom.com/');
  });
});

describe('normalizeUrl', () => {
  it('should strip protocol and www', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe('example.com/page');
  });

  it('should strip trailing slashes', () => {
    expect(normalizeUrl('https://example.com/page/')).toBe('example.com/page');
  });

  it('should handle URLs without www', () => {
    expect(normalizeUrl('https://example.com/page')).toBe('example.com/page');
  });

  it('should normalize case to lowercase', () => {
    expect(normalizeUrl('https://EXAMPLE.COM/Page')).toBe('example.com/Page');
  });

  it('should strip query params', () => {
    expect(normalizeUrl('https://example.com/page?foo=bar')).toBe('example.com/page');
  });

  it('should strip fragments', () => {
    expect(normalizeUrl('https://example.com/page#section')).toBe('example.com/page');
  });

  it('should handle root URLs', () => {
    expect(normalizeUrl('https://example.com/')).toBe('example.com');
  });

  it('should handle root URLs without trailing slash', () => {
    expect(normalizeUrl('https://example.com')).toBe('example.com');
  });

  it('should return lowercase for invalid URLs', () => {
    expect(normalizeUrl('invalid-url')).toBe('invalid-url');
  });

  it('should handle complex paths', () => {
    expect(normalizeUrl('https://www.example.com/path/to/page')).toBe('example.com/path/to/page');
  });
});

describe('getDomain', () => {
  it('should extract domain from URL', () => {
    expect(getDomain('https://example.com/page')).toBe('example.com');
  });

  it('should include www in domain', () => {
    expect(getDomain('https://www.example.com/page')).toBe('www.example.com');
  });

  it('should handle subdomains', () => {
    expect(getDomain('https://sub.example.com/page')).toBe('sub.example.com');
  });

  it('should handle ports (hostname excludes port)', () => {
    expect(getDomain('https://example.com:8080/page')).toBe('example.com');
  });

  it('should return original string for invalid URLs', () => {
    expect(getDomain('not-a-url')).toBe('not-a-url');
  });

  it('should handle http protocol', () => {
    expect(getDomain('http://example.com/page')).toBe('example.com');
  });

  it('should handle localhost (hostname excludes port)', () => {
    expect(getDomain('http://localhost:3000/api')).toBe('localhost');
  });
});
