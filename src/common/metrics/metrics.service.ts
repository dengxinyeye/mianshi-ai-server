import { Injectable } from '@nestjs/common';
import { register, Counter, Histogram, Gauge } from 'prom-client';

/**
 * Metrics 服务
 * 负责记录和管理应用的各种指标
 *
 * prom-client 会自动把这些指标转换成 Prometheus 格式
 */
@Injectable()
export class MetricsService {
  // ========== HTTP 请求相关 ==========

  /**
   * HTTP 请求计数器
   *
   * 为什么用 Counter？因为请求数只会增加，不会减少。
   * labelNames: ['method', 'route', 'status'] 表示我们会根据请求方法、路由、状态码来分类统计
   *
   * 比如：
   * http_requests_total{method="GET", route="/users", status="200"} 100
   * 这表示 GET /users 返回 200 的请求有 100 个
   */
  httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'HTTP 请求总数',
    labelNames: ['method', 'route', 'status'],
    registers: [register],
  });

  /**
   * HTTP 响应时间（毫秒）
   *
   * 为什么用 Histogram？因为我们关心的不只是平均响应时间，还要知道分布情况。
   *
   * buckets: [10, 50, 100, 500, 1000, 2000, 5000, 10000] 表示我们会统计：
   * - 有多少请求在 10ms 内完成
   * - 有多少请求在 50ms 内完成
   * - ...依此类推
   *
   * 这样 Prometheus 就能计算 P50、P95、P99 等百分位数
   */
  httpRequestDurationMs = new Histogram({
    name: 'http_request_duration_ms',
    help: '请求响应时间（毫秒）',
    labelNames: ['method', 'route'],
    buckets: [10, 50, 100, 500, 1000, 2000, 5000, 10000],
    registers: [register],
  });

  // ========== 数据库相关 ==========

  /**
   * MongoDB 查询时间
   * 我们用 Histogram 统计数据库查询性能
   */
  dbQueryDurationMs = new Histogram({
    name: 'db_query_duration_ms',
    help: '数据库查询时间（毫秒）',
    labelNames: ['operation', 'collection'],
    buckets: [10, 50, 100, 500, 1000],
    registers: [register],
  });

  /**
   * MongoDB 活跃连接数
   *
   * 为什么用 Gauge？因为连接数会增加也会减少。
   * 这个指标帮我们监控数据库连接池是否接近上限。
   */
  dbActiveConnections = new Gauge({
    name: 'db_active_connections',
    help: '活跃数据库连接数',
    registers: [register],
  });

  // ========== AI 调用相关 ==========

  /**
   * AI 调用计数器
   * 这个指标帮我们统计有多少次 AI 调用，以及成功率
   */
  aiCallsTotal = new Counter({
    name: 'ai_calls_total',
    help: 'AI 调用总数',
    labelNames: ['service', 'model', 'status'],
    registers: [register],
  });

  /**
   * AI 调用延迟
   * 因为 AI 调用往往很慢，我们需要关注延迟分布
   * buckets 设置得比 HTTP 更大，因为 AI 调用可能要几秒
   */
  aiCallDurationMs = new Histogram({
    name: 'ai_call_duration_ms',
    help: 'AI 调用延迟（毫秒）',
    labelNames: ['service', 'model'],
    buckets: [100, 500, 1000, 2000, 5000, 10000, 30000],
    registers: [register],
  });

  /**
   * AI Token 消耗
   *
   * 为什么单独统计 Token？因为我们要分别看 prompt token 和 completion token。
   * 这样可以分析成本，优化 prompt 的长度。
   *
   * type 标签有两个值："prompt" 和 "completion"
   */
  aiTokensUsed = new Counter({
    name: 'ai_tokens_used_total',
    help: 'AI Token 总消耗数',
    labelNames: ['service', 'model', 'type'],
    registers: [register],
  });

  /**
   * AI 调用成本
   *
   * 这是一个业务指标。我们需要实时了解花了多少钱。
   * 单位是元（RMB）
   */
  aiCostTotal = new Counter({
    name: 'ai_cost_total',
    help: 'AI 调用总成本（元）',
    labelNames: ['service', 'model'],
    registers: [register],
  });

  // ========== 业务相关 ==========

  /**
   * 虚拟币消费计数
   */
  virtualCoinSpent = new Counter({
    name: 'virtual_coin_spent_total',
    help: '虚拟币消费总数',
    labelNames: ['package_type'],
    registers: [register],
  });

  /**
   * 完成的面试数
   */
  interviewsCompleted = new Counter({
    name: 'interviews_completed_total',
    help: '完成的面试总数',
    registers: [register],
  });

  /**
   * 当前在线用户数
   *
   * 为什么用 Gauge？因为在线人数会上升也会下降。
   * 这是一个实时的、不断变化的指标。
   */
  onlineUsers = new Gauge({
    name: 'online_users',
    help: '当前在线用户数',
    registers: [register],
  });

  // ========== 错误相关 ==========

  /**
   * 错误计数器
   * 记录所有的错误，便于后续分析
   */
  errorsTotal = new Counter({
    name: 'errors_total',
    help: '错误总数',
    labelNames: ['type', 'service'],
    registers: [register],
  });

  /**
   * 导出 Prometheus 格式的指标数据
   *
   * Prometheus 会定期调用你的 /metrics 端点
   * 这个方法就是把所有指标转换成 Prometheus 能理解的文本格式
   */
  getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * 获取指标注册表
   * 这个方法供其他服务使用，比如有时候需要直接访问指标对象
   */
  getRegister() {
    return register;
  }
}
