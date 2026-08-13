import { Logger } from '@nestjs/common';
import { traceIdStorage } from '../middleware/trace-id.middleware';

const logger = new Logger('AI-CALL');

/**
 * 装饰器：自动记录 AI 调用
 * 使用方法：
 * @LogAICall('generateResumeQuiz')
 * async generateResumeQuiz(input) { ... }
 */
export function LogAICall(methodName: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const traceId = traceIdStorage.getStore();
      const startTime = Date.now();

      try {
        logger.log(`[${traceId}] 开始 AI 调用: ${methodName}`);

        const result = await originalMethod.apply(this, args);
        const duration = Date.now() - startTime;

        // 假设 result 包含 usage 信息
        const tokenInfo = result.usage
          ? `，Token: 输入=${result.usage.promptTokens}, 输出=${result.usage.completionTokens}`
          : '';

        logger.log(
          `[${traceId}] AI 调用成功: ${methodName}，耗时=${duration}ms${tokenInfo}`,
        );

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;

        logger.error(
          `[${traceId}] AI 调用失败: ${methodName}，耗时=${duration}ms，错误=${error.message}`,
        );

        throw error;
      }
    };

    return descriptor;
  };
}
