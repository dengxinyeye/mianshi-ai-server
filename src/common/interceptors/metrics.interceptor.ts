import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { MetricsService } from '../metrics/metrics.service';

/**
 * HTTP 请求指标拦截器
 *
 * 这个拦截器会：
 * 1. 记录请求开始的时间
 * 2. 等待响应
 * 3. 计算响应时间
 * 4. 记录到指标服务
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private metricsService: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const { method, url } = request;

    // 提取路由（去掉参数和 ID）
    const route = this.extractRoute(url);

    // 记录开始时间
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        // 成功的情况
        next: () => {
          const duration = Date.now() - startTime;
          const statusCode = ctx.getResponse().statusCode || 200;

          // 记录指标
          this.metricsService.httpRequestsTotal.inc({
            method,
            route,
            status: statusCode,
          });

          this.metricsService.httpRequestDurationMs.observe(
            { method, route },
            duration,
          );
        },
        // 发生错误的情况
        error: () => {
          const duration = Date.now() - startTime;

          this.metricsService.httpRequestsTotal.inc({
            method,
            route,
            status: 500,
          });

          this.metricsService.httpRequestDurationMs.observe(
            { method, route },
            duration,
          );

          // 同时记录到错误计数器
          this.metricsService.errorsTotal.inc({
            type: 'http_error',
            service: 'api',
          });
        },
      }),
    );
  }

  /**
   * 提取路由并标准化
   *
   * 为什么要做这个？
   *
   * 假设用户访问 /interview/123/answer 和 /interview/456/answer
   * 如果我们直接用 URL 作为标签，Prometheus 就会生成两个不同的指标：
   * - http_requests_total{route="/interview/123/answer"}
   * - http_requests_total{route="/interview/456/answer"}
   *
   * 这样会产生高基数标签（太多不同的值），导致 Prometheus 时间序列数爆炸。
   *
   * 所以我们要把 ID 替换成 :id，这样就只有一个指标：
   * - http_requests_total{route="/interview/:id/answer"}
   *
   * 这样更简洁，也更容易分析。
   */
  private extractRoute(url: string): string {
    return url
      .split('?')[0] // 去掉查询参数，比如 /users?page=1 变成 /users
      .replace(/\/\d+/g, '/:id'); // 把数字 ID 替换成 :id
  }
}
