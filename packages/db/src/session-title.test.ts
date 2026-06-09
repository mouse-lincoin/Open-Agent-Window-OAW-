import { describe, expect, it } from 'vitest';
import { deriveSessionTitle } from './session-title.js';

describe('deriveSessionTitle', () => {
  it('uses first non-empty line', () => {
    expect(deriveSessionTitle('\n  fix login bug  \nsecond line')).toBe('fix login bug');
  });

  it('truncates long titles', () => {
    const long = 'a'.repeat(80);
    expect(deriveSessionTitle(long).length).toBe(60);
    expect(deriveSessionTitle(long).endsWith('…')).toBe(true);
  });

  it('falls back for empty prompt', () => {
    expect(deriveSessionTitle('   \n  ')).toBe('新会话');
  });
});
