import { createEnvelope, decodeEnvelope } from '@oaw/acp-client';
import { PROTOCOL_VERSION } from '@oaw/shared-types';
import type { Envelope } from '@oaw/shared-types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3002/ws';
const HEARTBEAT_MS = 25_000;
const PONG_TIMEOUT_MS = 10_000;

export type WsHandler = (envelope: Envelope) => void;
export type WsConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Set<WsHandler>();
  private reconnectHandlers = new Set<() => void>();
  private stateHandlers = new Set<(state: WsConnectionState) => void>();
  private intentionalClose = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private state: WsConnectionState = 'disconnected';

  connect(): Promise<void> {
    this.setState(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    return new Promise((resolve, reject) => {
      this.intentionalClose = false;
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setState('connected');
        this.send(
          createEnvelope('initialize', {
            clientName: 'open-agent-window',
            clientVersion: '0.1.0',
            protocolVersion: PROTOCOL_VERSION,
          }),
        );
        this.startHeartbeat();
        resolve();
      };

      this.ws.onerror = () => {
        if (this.state === 'connecting') {
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.ws = null;
        if (!this.intentionalClose) {
          this.setState('reconnecting');
          this.scheduleReconnect();
        } else {
          this.setState('disconnected');
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const envelope = decodeEnvelope(String(event.data));
          if (envelope.type === 'pong') {
            this.clearPongTimer();
            return;
          }
          for (const handler of this.handlers) handler(envelope);
        } catch {
          // ignore malformed frames
        }
      };
    });
  }

  /**
   * 应用层心跳：浏览器 WebSocket 无法主动发送协议级 ping 帧，因此用应用层 ping/pong
   * 在客户端检测半开（half-open）连接——若发出 ping 后在超时内未收到 pong，则主动关闭
   * 连接以触发自动重连。
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
      this.send(createEnvelope('ping', {}));
      this.clearPongTimer();
      this.pongTimer = setTimeout(() => {
        // 未在超时内收到 pong，认为连接已失效，关闭以触发重连。
        this.ws?.close();
      }, PONG_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.clearPongTimer();
  }

  private clearPongTimer(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private setState(state: WsConnectionState): void {
    this.state = state;
    for (const handler of this.stateHandlers) handler(state);
  }

  getConnectionState(): WsConnectionState {
    return this.state;
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

  onConnectionStateChange(handler: (state: WsConnectionState) => void): () => void {
    this.stateHandlers.add(handler);
    handler(this.state);
    return () => this.stateHandlers.delete(handler);
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
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.setState('disconnected');
  }
}
