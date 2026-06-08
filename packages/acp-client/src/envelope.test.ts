import { describe, expect, it } from 'vitest';
import {
  createEnvelope,
  decodeEnvelope,
  encodeEnvelope,
  EnvelopeDecodeError,
} from './envelope.js';

describe('acp-client envelope', () => {
  it('round-trips encode/decode', () => {
    const envelope = createEnvelope('initialize', {
      clientName: 'test',
      clientVersion: '0.1.0',
      protocolVersion: '0.1',
    });
    const decoded = decodeEnvelope(encodeEnvelope(envelope));
    expect(decoded).toEqual(envelope);
  });

  it('rejects invalid JSON', () => {
    expect(() => decodeEnvelope('not-json')).toThrow(EnvelopeDecodeError);
  });

  it('rejects unknown message type', () => {
    expect(() =>
      decodeEnvelope(
        JSON.stringify({
          id: '1',
          type: 'unknown',
          ts: Date.now(),
          payload: {},
        }),
      ),
    ).toThrow(EnvelopeDecodeError);
  });
});
