/**
 * 获取 Token 有效期（秒）
 *
 * 当前固定为 24 小时，如需按环境区分可改为读取环境变量。
 */
export function getTokenExpirationSeconds(): number {
  return 60 * 60 * 24;
}
