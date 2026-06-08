import type { AgentAdapter } from '@oaw/shared-types';
import type { AgentInfo } from '@oaw/shared-types';
import { MockAgentAdapter } from './mock-agent.js';

export type AgentFactory = () => AgentAdapter;

const factories = new Map<string, AgentFactory>();

export function registerAgent(id: string, factory: AgentFactory, info: AgentInfo): void {
  factories.set(id, factory);
  agentInfos.set(id, info);
}

const agentInfos = new Map<string, AgentInfo>();

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
}

registerBuiltinAgents();
