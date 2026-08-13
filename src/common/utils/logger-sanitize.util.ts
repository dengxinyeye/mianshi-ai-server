/**
 * 日志脱敏工具
 * 移除敏感信息
 */
export class LoggerSanitizer {
  // 需要脱敏的字段列表
  private static readonly SENSITIVE_FIELDS = [
    'password',
    'apiKey',
    'token',
    'secret',
    'privateKey',
    'phone',
    'email',
    'id_card',
    'ssn',
    'creditCard',
    'wxOpenId',
    'wxUnionId',
  ];

  /**
   * 递归脱敏对象中的敏感字段
   */
  static sanitize(data: any): any {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitize(item));
    }

    const sanitized = { ...data };

    for (const key in sanitized) {
      if (
        this.SENSITIVE_FIELDS.some((field) =>
          key.toLowerCase().includes(field.toLowerCase()),
        )
      ) {
        // 保留前 3 个字符，其他用 * 代替
        const value = sanitized[key];
        if (typeof value === 'string' && value.length > 3) {
          sanitized[key] = value.substring(0, 3) + '*'.repeat(value.length - 3);
        } else {
          sanitized[key] = '***';
        }
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }

    return sanitized;
  }
}
