/**
 * Agent Adapter 接口。
 * 新增 Agent 时实现该接口，由 agent-registry 注册。
 */

import type { Envelope } from './protocol.js';

export interface AgentAdapter {
  /** Agent 标识，对应 agent-registry 中的 id。 */
  readonly name: string;

  /** 启动 Agent 进程并完成握手。 */
  start(): Promise<void>;

  /** 停止 Agent 进程，释放资源。 */
  stop(): Promise<void>;

  /** 向 Agent 发送一条消息。 */
  send(message: Envelope): void;

  /** 注册 Agent 消息回调。 */
  onMessage(callback: (message: Envelope) => void): void;
}
