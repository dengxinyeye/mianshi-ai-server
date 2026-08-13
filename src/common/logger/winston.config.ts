import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { utilities as nestWinstonModuleUtilities } from 'nest-winston';

// 定义日志级别的颜色（控制台输出用）
const customColorConfig = {
  colors: {
    silly: 'magenta',
    debug: 'cyan',
    verbose: 'gray',
    info: 'green',
    warn: 'yellow',
    error: 'red',
  },
};

winston.addColors(customColorConfig.colors);

// 定义日志格式
const commonFormat = winston.format.combine(
  // 添加时间戳
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  // 添加上下文（哪个文件/服务输出的）
  winston.format.ms(),
  // JSON 格式输出
  winston.format.json(),
);

/**
 * 创建 Winston logger 实例
 * @param nodeEnv 运行环境（development / production）
 */
export function createWinstonLogger(nodeEnv: string) {
  const transports: winston.transport[] = [];

  // ===== 通用日志（所有级别）=====
  // 按天切割文件，每个文件最大 20MB
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d', // 以 d 作为后缀则表示按天数删除，日志保留 14 天
      format: commonFormat,
    }),
  );

  // ===== 错误日志（仅 ERROR 及以上）=====
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d', // 错误日志保留更久
      format: commonFormat,
    }),
  );

  // ===== 审计日志（金钱相关操作）=====
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: 'logs/audit-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '50m',
      maxFiles: '365d', // 审计日志保留 1 年
      format: commonFormat,
    }),
  );

  // ===== 控制台输出（开发环境用）=====
  if (nodeEnv !== 'production') {
    transports.push(
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
          winston.format.ms(),
          nestWinstonModuleUtilities.format.nestLike('MianshiAI', {
            colors: true,
            prettyPrint: true,
          }),
        ),
      }),
    );
  }

  return winston.createLogger({
    level: nodeEnv === 'production' ? 'info' : 'debug',
    format: commonFormat,
    defaultMeta: {
      service: 'mianshi-ai-server', // 服务名
      environment: nodeEnv,
    },
    transports,
  });
}
