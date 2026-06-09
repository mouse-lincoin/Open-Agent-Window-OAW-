import type { AgentAdapter, AgentInfo } from '@oaw/shared-types';
import { ClaudeCodeAdapter } from './claude-code.js';
import { MockAgentAdapter } from './mock-agent.js';
import { resolveSpawnConfig, StdioAcpAdapter } from './stdio-acp-agent.js';

export type AgentFactory = () => AgentAdapter;

const factories = new Map<string, AgentFactory>();
const agentInfos = new Map<string, AgentInfo>();

const STDIO_ACP_CAPABILITIES: AgentInfo['capabilities'] = {
  streaming: true,
  tools: ['read_file', 'edit_file', 'run_command', 'search'],
  diff: true,
};

export function registerAgent(id: string, factory: AgentFactory, info: AgentInfo): void {
  factories.set(id, factory);
  agentInfos.set(id, info);
}

export function listAgents(): AgentInfo[] {
  return Array.from(agentInfos.values());
}

export function createAgent(id: string): AgentAdapter {
  const factory = factories.get(id);
  if (!factory) {
    throw new Error(`Unknown agent: ${id}`);
  }
  return factory();
}

function registerStdioAcpAgent(id: string, name: string): void {
  registerAgent(
    id,
    () => {
      const spawn = resolveSpawnConfig(id);
      if (!spawn) throw new Error(`Spawn config missing for ${id}`);
      return new StdioAcpAdapter(spawn);
    },
    { id, name, capabilities: STDIO_ACP_CAPABILITIES },
  );
}

export function registerBuiltinAgents(): void {
  registerAgent(
    'mock-agent',
    () => new MockAgentAdapter(),
    {
      id: 'mock-agent',
      name: 'Mock Agent',
      capabilities: {
        streaming: true,
        tools: ['edit_file'],
        diff: true,
      },
    },
  );

  registerAgent('claude-code', () => new ClaudeCodeAdapter(), {
    id: 'claude-code',
    name: 'Claude Code',
    capabilities: STDIO_ACP_CAPABILITIES,
  });

  registerStdioAcpAgent('codex', 'Codex');
  registerStdioAcpAgent('gemini-cli', 'Gemini CLI');
  registerStdioAcpAgent('cursor-cli', 'Cursor CLI');
}

registerBuiltinAgents();
