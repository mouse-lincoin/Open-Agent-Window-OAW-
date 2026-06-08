import { createEnvelope, decodeEnvelope } from '@oaw/acp-client';
import type { Envelope } from '@oaw/shared-types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3002/ws';

export type WsHandler = (envelope: Envelope) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<WsHandler>();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(WS_URL);
      this.ws.onopen = () => {
        this.send(
          createEnvelope('initialize', {
            clientName: 'open-agent-window',
            clientVersion: '0.1.0',
            protocolVersion: '0.1',
          }),
        );
        resolve();
      };
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
      this.ws.onmessage = (event) => {
        try {
          const envelope = decodeEnvelope(String(event.data));
          for (const handler of this.handlers) handler(envelope);
        } catch {
          // ignore malformed frames
        }
      };
    });
  }

  onMessage(handler: WsHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  send(envelope: Parameters<typeof createEnvelope>[0] extends infer T ? Envelope : never): void;
  send<T>(envelope: Envelope<T>): void;
  send<T>(envelope: Envelope<T>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(envelope));
  }

  sendRaw(envelope: Envelope): void {
    this.send(envelope);
  }

  close(): void {
    this.ws?.close();
    this.ws = null;
  }
}
