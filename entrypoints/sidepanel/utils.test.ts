/**
 * Tests for entrypoints/sidepanel/utils.ts
 */
import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  escapeRegex,
  escapeHtml,
  generateId,
  normalizeUrl,
  getDomain,
  fixUrl,
} from './utils';

describe('formatBytes', () => {
  it('should return "0 B" for 0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B');
  });

  it('should format kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1 KB');
  });

  it('should format kilobytes with decimals', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('should format megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
  });

  it('should format megabytes with decimals', () => {
    expect(formatBytes(1572864)).toBe('1.5 MB');
  });

  it('should round decimals appropriately', () => {
    expect(formatBytes(1234)).toBe('1.2 KB');
  });
});

describe('escapeRegex', () => {
  it('should escape dot', () => {
    expect(escapeRegex('test.com')).toBe('test\\.com');
  });

  it('should escape asterisk', () => {
    expect(escapeRegex('test*')).toBe('test\\*');
  });

  it('should escape question mark', () => {
    expect(escapeRegex('test?')).toBe('test\\?');
  });

  it('should escape plus', () => {
    expect(escapeRegex('test+')).toBe('test\\+');
  });

  it('should escape caret', () => {
    expect(escapeRegex('^test')).toBe('\\^test');
  });

  it('should escape dollar', () => {
    expect(escapeRegex('test$')).toBe('test\\$');
  });

  it('should escape curly braces', () => {
    expect(escapeRegex('test{1,2}')).toBe('test\\{1,2\\}');
  });

  it('should escape parentheses', () => {
    expect(escapeRegex('test()')).toBe('test\\(\\)');
  });

  it('should escape pipe', () => {
    expect(escapeRegex('a|b')).toBe('a\\|b');
  });

  it('should escape square brackets', () => {
    expect(escapeRegex('[test]')).toBe('\\[test\\]');
  });

  it('should escape backslash', () => {
    expect(escapeRegex('test\\path')).toBe('test\\\\path');
  });

  it('should handle strings with no special chars', () => {
    expect(escapeRegex('teststring')).toBe('teststring');
  });

  it('should handle multiple special chars', () => {
    expect(escapeRegex('test.com?page=1')).toBe('test\\.com\\?page=1');
  });
});

describe('escapeHtml', () => {
  it('should return empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('should return empty string for null input', () => {
    expect(escapeHtml(null as unknown as string)).toBe('');
  });

  it('should escape less than sign', () => {
    expect(escapeHtml('<test>')).toBe('&lt;test&gt;');
  });

  it('should escape ampersand', () => {
    expect(escapeHtml('test&value')).toBe('test&amp;value');
  });

  it('should escape quotes', () => {
    expect(escapeHtml('"test"')).toBe('&quot;test&quot;'); // quotes escaped for HTML safety
  });

  it('should handle plain text', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });

  it('should handle script tags', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });
});

describe('generateId', () => {
  it('should return a string', () => {
    expect(typeof generateId()).toBe('string');
  });

  it('should return unique values', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should have reasonable length', () => {
    const id = generateId();
    expect(id.length).toBeGreaterThan(5);
    expect(id.length).toBeLessThan(30);
  });

  it('should only contain alphanumeric chars', () => {
    const id = generateId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe('re-exported URL utilities', () => {
  it('should export normalizeUrl', () => {
    expect(normalizeUrl('https://www.example.com/page')).toBe('example.com/page');
  });

  it('should export getDomain', () => {
    expect(getDomain('https://example.com/page')).toBe('example.com');
  });

  it('should export fixUrl', () => {
    expect(fixUrl('https://heyjom.com/events')).toBe('https://www.heyjom.com/events');
  });
});
