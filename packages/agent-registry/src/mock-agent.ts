import { createEnvelope } from '@oaw/acp-client';
import type { AgentAdapter } from '@oaw/shared-types';
import type { Envelope } from '@oaw/shared-types';

export interface MockAgentOptions {
  /** 要编辑的相对路径，默认 README.md */
  targetFile?: string;
  /** 写入内容，默认在文件末尾追加一行 */
  appendLine?: string;
}

type MessageHandler = (message: Envelope) => void;

/**
 * 内存 Mock Agent：无需外部 API Key，按 MILESTONE_0 约定驱动端到端联调。
 */
export class MockAgentAdapter implements AgentAdapter {
  readonly name = 'mock-agent';

  private handler: MessageHandler | null = null;
  private running = false;
  private readonly targetFile: string;
  private readonly appendLine: string;

  constructor(options: MockAgentOptions = {}) {
    this.targetFile = options.targetFile ?? 'README.md';
    this.appendLine = options.appendLine ?? '\n<!-- edited by mock-agent -->\n';
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.handler = null;
  }

  send(message: Envelope): void {
    if (!this.running || !this.handler) return;

    if (message.type === 'initialize') {
      this.emit(
        createEnvelope('initialized', {
          agentName: 'Mock Agent',
          capabilities: {
            streaming: true,
            tools: ['edit_file'],
            diff: true,
          },
        }),
      );
      return;
    }

    if (message.type === 'session/prompt') {
      void this.handlePrompt(message.sessionId);
    }
  }

  onMessage(callback: (message: Envelope) => void): void {
    this.handler = callback;
  }

  private emit(message: Envelope): void {
    this.handler?.(message);
  }

  private async handlePrompt(sessionId?: string): Promise<void> {
    if (!sessionId) return;

    const chunks = ['正在分析你的请求…', ' 准备修改文件。'];
    for (const delta of chunks) {
      await delay(80);
      this.emit(
        createEnvelope(
          'session/update',
          { kind: 'text', delta },
          { sessionId },
        ),
      );
    }

    const toolCallId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    await delay(50);
    this.emit(
      createEnvelope(
        'tool/call',
        {
          toolCallId,
          tool: 'edit_file',
          input: { path: this.targetFile },
          status: 'running',
        },
        { sessionId },
      ),
    );

    this.emit(
      createEnvelope(
        'session/update',
        {
          kind: 'tool_call',
          toolCall: {
            toolCallId,
            tool: 'edit_file',
            input: { path: this.targetFile },
            status: 'running',
          },
        },
        { sessionId },
      ),
    );

    this.emit(
      createEnvelope(
        'permission/request',
        {
          requestId,
          scope: 'file_write',
          detail: `修改文件: ${this.targetFile}`,
          toolCallId,
        },
        { sessionId },
      ),
    );

    // Gateway 在授权通过后会通知 mock-agent 继续；此处用内部事件模拟
    this.pendingEdit = { sessionId, toolCallId, requestId };
  }

  private pendingEdit: {
    sessionId: string;
    toolCallId: string;
    requestId: string;
  } | null = null;

  /** Gateway 在权限被拒绝或超时后清理挂起的编辑 */
  cancelPendingEdit(): void {
    this.pendingEdit = null;
  }

  /** Gateway 在 permission/response allow 后调用 */
  async completePendingEdit(afterContent: string): Promise<void> {
    const pending = this.pendingEdit;
    if (!pending) return;
    this.pendingEdit = null;

    const { sessionId, toolCallId } = pending;
    const diffId = crypto.randomUUID();

    await delay(30);
    this.emit(
      createEnvelope(
        'diff',
        {
          diffId,
          path: this.targetFile,
          before: '',
          after: afterContent,
          toolCallId,
        },
        { sessionId },
      ),
    );

    this.emit(
      createEnvelope(
        'tool/call',
        {
          toolCallId,
          tool: 'edit_file',
          input: { path: this.targetFile },
          status: 'success',
        },
        { sessionId },
      ),
    );

    this.emit(
      createEnvelope(
        'session/update',
        {
          kind: 'tool_result',
          toolCallId,
          result: 'File edit proposed',
        },
        { sessionId },
      ),
    );

    this.emit(
      createEnvelope(
        'session/update',
        { kind: 'done', messageId: crypto.randomUUID() },
        { sessionId },
      ),
    );
  }

  /** 根据工作区现有内容生成 after 文本 */
  buildAfterContent(before: string): string {
    if (before.includes('<!-- edited by mock-agent -->')) {
      return before;
    }
    return before + this.appendLine;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
