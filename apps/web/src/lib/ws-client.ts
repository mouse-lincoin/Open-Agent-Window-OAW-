import { createEnvelope, decodeEnvelope } from '@oaw/acp-client';
import type { Envelope } from '@oaw/shared-types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3002/ws';

export type WsHandler = (envelope: Envelope) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<WsHandler>();
  private reconnectHandlers = new Set<() => void>();
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
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

      this.ws.onclose = () => {
        this.ws = null;
        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

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

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 30_000);
    this.reconnectAttempts += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect()
        .then(() => {
          for (const handler of this.reconnectHandlers) handler();
        })
        .catch(() => {
          this.scheduleReconnect();
        });
    }, delay);
  }

  onMessage(handler: WsHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onReconnect(handler: () => void): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  send<T>(envelope: Envelope<T>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(envelope));
  }

  sendRaw(envelope: Envelope): void {
    this.send(envelope);
  }

  close(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }
}
