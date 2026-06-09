import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION } from './protocol.js';
import type { Envelope, MessageType } from './index.js';

describe('shared-types protocol', () => {
  it('exposes the protocol version', () => {
    expect(PROTOCOL_VERSION).toBe('0.1');
  });

  it('allows constructing a well-formed envelope', () => {
    const ping: Envelope<Record<string, never>> = {
      id: 'id-1',
      type: 'ping',
      ts: 1,
      payload: {},
    };
    const type: MessageType = ping.type;
    expect(type).toBe('ping');
  });
});
