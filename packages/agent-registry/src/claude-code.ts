import { resolveSpawnConfig, StdioAcpAdapter } from './stdio-acp-agent.js';
import type { StdioAcpAdapterOptions } from './stdio-acp-agent.js';

export type ClaudeCodeAdapterOptions = StdioAcpAdapterOptions;

export function resolveClaudeAgentAcpBin(): string {
  const spawn = resolveSpawnConfig('claude-code');
  if (!spawn?.args[0]) {
    throw new Error('claude-code spawn config missing');
  }
  return spawn.args[0];
}

/** Claude Code ACP 适配器。 */
export class ClaudeCodeAdapter extends StdioAcpAdapter {
  constructor(options: ClaudeCodeAdapterOptions = {}) {
    const spawn = resolveSpawnConfig('claude-code');
    if (!spawn) throw new Error('claude-code spawn config missing');
    super(spawn, options);
  }
}
