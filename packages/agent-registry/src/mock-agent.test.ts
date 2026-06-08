import { describe, expect, it } from 'vitest';
import { MockAgentAdapter } from './mock-agent.js';
import type { Envelope } from '@oaw/shared-types';

describe('MockAgentAdapter', () => {
  it('streams text and requests permission on prompt', async () => {
    const agent = new MockAgentAdapter({ targetFile: 'test.txt' });
    const received: Envelope[] = [];
    agent.onMessage((msg) => received.push(msg));
    await agent.start();

    agent.send({
      id: '1',
      type: 'initialize',
      ts: Date.now(),
      payload: {
        clientName: 'test',
        clientVersion: '0.1',
        protocolVersion: '0.1',
      },
    });

    expect(received.some((m) => m.type === 'initialized')).toBe(true);

    agent.send({
      id: '2',
      type: 'session/prompt',
      sessionId: 'session-1',
      ts: Date.now(),
      payload: { text: 'fix bug' },
    });

    await new Promise((r) => setTimeout(r, 300));

    expect(received.some((m) => m.type === 'session/update')).toBe(true);
    expect(received.some((m) => m.type === 'permission/request')).toBe(true);
    expect(
      received.some(
        (m) =>
          m.type === 'permission/request' &&
          (m.payload as { scope: string }).scope === 'file_write',
      ),
    ).toBe(true);
  });
});
