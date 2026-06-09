/** 从首条用户 prompt 生成会话标题（单行、截断）。 */
export function deriveSessionTitle(prompt: string, maxLength = 60): string {
  const line = prompt
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find((s) => s.length > 0);

  if (!line) return '新会话';

  const collapsed = line.replace(/\s+/g, ' ');
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 1)}…`;
}
