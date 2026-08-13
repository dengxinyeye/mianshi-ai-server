import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserModule } from './user/user.module';
import { InterviewModule } from './interview/interview.module';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { JwtStrategy } from './auth/jwt.strategy';
import { getTokenExpirationSeconds } from './common/utils/jwt.util';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';
import { MetricsModule } from './common/metrics/metrics.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env.development',
      isGlobal: true,
    }),
    MongooseModule.forRoot(
      process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mianshi-ai',
    ),
    WinstonModule.forRoot({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.ms(),
        winston.format.json(),
      ),
      defaultMeta: {
        service: 'mianshi-ai-server',
      },
      transports: [new winston.transports.Console()],
    }),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const expirationSeconds = getTokenExpirationSeconds();
        const secret = configService.get<string>('JWT_SECRET');
        // 密钥只允许来自环境变量：缺失时直接启动失败，避免使用可预测的默认值签发 Token
        if (!secret) {
          throw new Error(
            'JWT_SECRET 未配置，请在 .env.development 中设置后再启动服务',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: expirationSeconds,
          },
        };
      },
      inject: [ConfigService],
      global: true,
    }),
    UserModule,
    InterviewModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JwtStrategy,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    MetricsInterceptor,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceIdMiddleware).forRoutes('*');
  }
}
