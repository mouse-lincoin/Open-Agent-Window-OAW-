import { describe, expect, it } from 'vitest';
import { resolveSpawnConfig } from './stdio-acp-agent.js';

describe('resolveSpawnConfig', () => {
  it('resolves all stdio ACP agents', () => {
    for (const id of ['claude-code', 'codex', 'gemini-cli', 'cursor-cli'] as const) {
      const config = resolveSpawnConfig(id);
      expect(config?.id).toBe(id);
      expect(config?.command).toBeTruthy();
      expect(config?.args.length).toBeGreaterThan(0);
    }
  });

  it('returns null for unknown agent', () => {
    expect(resolveSpawnConfig('unknown')).toBeNull();
  });

  it('gemini-cli uses experimental-acp flag', () => {
    const config = resolveSpawnConfig('gemini-cli');
    expect(config?.args).toContain('--experimental-acp');
  });
});
