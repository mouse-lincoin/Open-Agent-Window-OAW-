import type { Envelope, MessageType } from '@oaw/shared-types';

const MESSAGE_TYPES: ReadonlySet<string> = new Set<MessageType>([
  'initialize',
  'initialized',
  'session/new',
  'session/created',
  'session/prompt',
  'session/update',
  'session/end',
  'session/ended',
  'tool/call',
  'permission/request',
  'permission/response',
  'diff',
  'diff/decision',
  'error',
]);

export function encodeEnvelope<T>(envelope: Envelope<T>): string {
  return JSON.stringify(envelope);
}

export function decodeEnvelope(raw: string): Envelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new EnvelopeDecodeError('INVALID_JSON', 'Failed to parse JSON');
  }
  return validateEnvelope(parsed);
}

export class EnvelopeDecodeError extends Error {
  constructor(
    public readonly code: 'INVALID_JSON' | 'INVALID_ENVELOPE',
    message: string,
  ) {
    super(message);
    this.name = 'EnvelopeDecodeError';
  }
}

export function validateEnvelope(value: unknown): Envelope {
  if (!isRecord(value)) {
    throw new EnvelopeDecodeError('INVALID_ENVELOPE', 'Envelope must be an object');
  }

  const { id, type, ts, payload } = value;

  if (typeof id !== 'string' || id.length === 0) {
    throw new EnvelopeDecodeError('INVALID_ENVELOPE', 'Missing or invalid id');
  }
  if (typeof type !== 'string' || !MESSAGE_TYPES.has(type)) {
    throw new EnvelopeDecodeError('INVALID_ENVELOPE', 'Missing or invalid type');
  }
  if (typeof ts !== 'number' || !Number.isFinite(ts)) {
    throw new EnvelopeDecodeError('INVALID_ENVELOPE', 'Missing or invalid ts');
  }
  if (payload === undefined) {
    throw new EnvelopeDecodeError('INVALID_ENVELOPE', 'Missing payload');
  }

  const sessionId = value.sessionId;
  if (sessionId !== undefined && typeof sessionId !== 'string') {
    throw new EnvelopeDecodeError('INVALID_ENVELOPE', 'Invalid sessionId');
  }

  return {
    id,
    type: type as MessageType,
    ts,
    payload,
    ...(sessionId !== undefined ? { sessionId } : {}),
  };
}

export function createEnvelope<T>(
  type: MessageType,
  payload: T,
  options?: { id?: string; sessionId?: string; ts?: number },
): Envelope<T> {
  return {
    id: options?.id ?? crypto.randomUUID(),
    type,
    sessionId: options?.sessionId,
    ts: options?.ts ?? Date.now(),
    payload,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
