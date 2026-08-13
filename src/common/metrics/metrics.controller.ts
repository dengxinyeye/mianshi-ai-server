import { Controller, Get } from '@nestjs/common';
import { MetricsService } from './metrics.service';

/**
 * Metrics Controller
 *
 * 这个 Controller 暴露 /metrics 端点，Prometheus 会定期来拉取数据
 *
 * 比如，Prometheus 每 15 秒会发送一个 GET /metrics 请求，这个方法就会被调用
 * 然后返回所有指标的 Prometheus 格式数据
 */
@Controller('metrics')
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  /**
   * GET /metrics
   *
   * Prometheus 会得到这样的响应：
   * ```
   * # HELP http_requests_total HTTP 请求总数
   * # TYPE http_requests_total counter
   * http_requests_total{method="GET",route="/users",status="200"} 42
   * http_requests_total{method="POST",route="/users",status="201"} 5
   * ...
   * ```
   *
   * 这个格式是 Prometheus 的标准格式，任何 Prometheus 都能理解
   */
  @Get()
  async getMetrics(): Promise<string> {
    return await this.metricsService.getMetrics();
  }
}
