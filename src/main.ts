import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { WinstonModule, WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { createWinstonLogger } from './common/logger/winston.config'; // 引入你之前的 winston 配置

async function bootstrap() {
  const nodeEnv = process.env.NODE_ENV || 'development';

  // 创建 Winston logger
  const winstonLogger = createWinstonLogger(nodeEnv);

  // 创建 NestJS 应用，使用 Winston logger
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({
      instance: winstonLogger,
    }),
  });

  // 让所有的 NestJS 组件都用 Winston logger
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // 全局验证管道
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // 自动移除 DTO 中没有声明的字段
      transform: true, // 自动类型转换
    }),
  );

  // 启用 CORS
  app.enableCors();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`应用启动成功，监听端口 ${port}`);
}

bootstrap();
