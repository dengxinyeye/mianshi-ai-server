import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  BadRequestException,
  Res,
  Sse,
  Param,
  Get,
  Query,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InterviewService } from './services/interview.service';
import { ResumeQuizDto } from './dto/resume-quiz.dto';
import {
  AnswerMockInterviewDto,
  StartMockInterviewDto,
} from './dto/mock-interview.dto';
import { ResponseUtil } from '../common/utils/response.util';
import { ExchangePackageDto } from './dto/exchange-package.dto';
import { AIInterviewType } from './schemas/ai-interview-result.schema';

/**
 * 上传文件的最小结构（等价于 Express.Multer.File 的必要字段）
 * 这里手写类型而不引入 @types/multer，避免为一个接口新增开发依赖
 */
interface UploadedResumeFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** 简历文件大小上限：10MB */
const RESUME_MAX_FILE_SIZE = 10 * 1024 * 1024;

@Controller('interview')
export class InterviewController {
  constructor(private readonly interviewService: InterviewService) {}

  /**
   * 上传简历文件并解析为纯文本
   *
   * 用途：前端拿到返回的 resumeContent 后，直接作为押题 / 模拟面试的入参，
   * 无需依赖任何对象存储服务。文件仅在内存中解析，不落盘。
   */
  @Post('resume/parse')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      // multer 默认使用内存存储，这里只需限制体积，避免大文件打满内存
      limits: { fileSize: RESUME_MAX_FILE_SIZE, files: 1 },
    }),
  )
  async parseResumeFile(@UploadedFile() file: UploadedResumeFile) {
    if (!file || !file.buffer) {
      throw new BadRequestException('请选择要上传的简历文件');
    }

    const result = await this.interviewService.parseResumeFile(
      file.buffer,
      file.originalname,
    );

    return ResponseUtil.success(result, '简历解析成功');
  }

  /**
   * 8.3-LangChain 实战-分析报告
   * @param body
   * @returns
   */
  @Post('/analyze-resume')
  @UseGuards(JwtAuthGuard)
  async analyzeResume(
    @Body() body: { position: string; resume: string; jobDescription: string },
    @Request() req: any,
  ) {
    const result = await this.interviewService.analyzeResume(
      req.user.userId,
      body.position,
      body.resume,
      body.jobDescription,
    );

    return {
      code: 200,
      data: result,
    };
  }

  /**
   * 8.4-对话历史和上下文管理
   * @param body
   * @returns
   */
  @Post('/continue-conversation')
  async continueConversation(
    @Body() body: { sessionId: string; question: string },
  ) {
    const result = await this.interviewService.continueConversation(
      body.sessionId,
      body.question,
    );

    return {
      code: 200,
      data: {
        response: result,
      },
    };
  }

  /**
   * 简历押题的接口
   */
  @Post('resume/quiz/stream')
  @UseGuards(JwtAuthGuard)
  async resumeQuizStream(
    @Body() dto: ResumeQuizDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
    // 订阅进度事件
    const subscription = this.interviewService
      .generateResumeQuizWithProgress(userId, dto)
      .subscribe({
        next: (event) => {
          // 发送 SSE 事件
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        },
        error: (error) => {
          // 发送错误事件
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          res.end();
        },
        complete: () => {
          // 完成后关闭连接
          res.end();
        },
      });

    // 客户端断开连接时取消订阅
    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  /**
   * 开始模拟面试 - SSE流式响应
   */
  @Post('mock/start')
  @UseGuards(JwtAuthGuard)
  async startMockInterview(
    @Body() dto: StartMockInterviewDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;

    // 设置 SSE 响应头
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
    res.setHeader('Access-Control-Allow-Origin', '*'); // 如果需要CORS

    // 发送初始注释，保持连接活跃
    res.write(': connected\n\n');
    // flush 数据（如果可用）
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    // 订阅进度事件
    const subscription = this.interviewService
      .startMockInterviewWithStream(userId, dto)
      .subscribe({
        next: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          // flush 数据（如果可用）
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        },
        error: (error) => {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

    // 客户端断开连接时取消订阅
    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  /**
   * 回答面试问题 - SSE流式响应
   */
  @Post('mock/answer')
  @UseGuards(JwtAuthGuard)
  async answerMockInterview(
    @Body() dto: AnswerMockInterviewDto,
    @Request() req: any,
    @Res() res: Response,
  ) {
    const userId = req.user.userId;

    // 设置 SSE 响应头
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // 禁用 Nginx 缓冲
    res.setHeader('Access-Control-Allow-Origin', '*'); // 如果需要CORS

    // 发送初始注释，保持连接活跃
    res.write(': connected\n\n');
    // flush 数据（如果可用）
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    // 订阅进度事件
    const subscription = this.interviewService
      .answerMockInterviewWithStream(userId, dto.sessionId, dto.answer)
      .subscribe({
        next: (event) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
          // flush 数据（如果可用）
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
        },
        error: (error) => {
          res.write(
            `data: ${JSON.stringify({
              type: 'error',
              error: error.message,
            })}\n\n`,
          );
          if (typeof (res as any).flush === 'function') {
            (res as any).flush();
          }
          res.end();
        },
        complete: () => {
          res.end();
        },
      });

    // 客户端断开连接时取消订阅
    req.on('close', () => {
      subscription.unsubscribe();
    });
  }

  /**
   * 结束面试（用户主动结束）
   */
  @Post('mock/end/:resultId')
  @UseGuards(JwtAuthGuard)
  async endMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    await this.interviewService.endMockInterview(req.user.userId, resultId);

    return ResponseUtil.success({ resultId }, '面试已结束，正在生成分析报告');
  }

  /**
   * 暂停面试
   */
  @Post('mock/pause/:resultId')
  @UseGuards(JwtAuthGuard)
  async pauseMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const result = await this.interviewService.pauseMockInterview(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(result, '面试已暂停，进度已保存');
  }

  /**
   * 恢复面试
   */
  @Post('mock/resume/:resultId')
  @UseGuards(JwtAuthGuard)
  async resumeMockInterview(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const result = await this.interviewService.resumeMockInterview(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(result, '面试已恢复，可以继续回答');
  }

  /**
   * 获取分析报告
   * 统一接口，根据 resultId 自动识别类型（简历押题/专项面试/综合面试）
   */
  @Get('analysis/report/:resultId')
  @UseGuards(JwtAuthGuard)
  async getAnalysisReport(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const report = await this.interviewService.getAnalysisReport(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(report, '查询成功');
  }

  /**
   * 获取未完成（进行中 / 已暂停）的模拟面试列表
   *
   * 这是恢复历史面试的入口：前端拿到列表后带上 resultId 进入面试页即可继续。
   * 注意：静态路径需声明在 mock/:param 之前，避免被动态路由抢先匹配。
   */
  @Get('mock/unfinished')
  @UseGuards(JwtAuthGuard)
  async getUnfinishedMockInterviews(@Request() req: any) {
    const result = await this.interviewService.getUnfinishedMockInterviews(
      req.user.userId,
    );

    return ResponseUtil.success(result, '查询成功');
  }

  /**
   * 获取面试会话的历史问答记录（刷新页面继续 / 历史回看）
   */
  @Get('mock/history/:resultId')
  @UseGuards(JwtAuthGuard)
  async getMockInterviewSessionHistory(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const result = await this.interviewService.getMockInterviewSessionHistory(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(result, '查询成功');
  }

  /**
   * 获取模拟面试的问答结果
   */
  @Get('mock/result/:resultId/qa')
  @UseGuards(JwtAuthGuard)
  async getMockInterviewQAResult(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const result = await this.interviewService.getMockInterviewQAResult(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(result, '查询成功');
  }

  /**
   * 获取简历押题历史记录（分页）
   */
  @Get('resume/quiz/history')
  @UseGuards(JwtAuthGuard)
  async getResumeQuizHistory(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.interviewService.getResumeQuizHistory(
      req.user.userId,
      Number(page),
      Number(limit),
    );

    return ResponseUtil.success(result, '查询成功');
  }

  /**
   * 获取简历押题结果详情
   */
  @Get('resume/quiz/result/:resultId')
  @UseGuards(JwtAuthGuard)
  async getResumeQuizResultDetail(
    @Param('resultId') resultId: string,
    @Request() req: any,
  ) {
    const result = await this.interviewService.getResumeQuizResultDetail(
      req.user.userId,
      resultId,
    );

    return ResponseUtil.success(result, '查询成功');
  }

  /**
   * 获取专项面试历史记录（分页）
   */
  @Get('special/history')
  @UseGuards(JwtAuthGuard)
  async getSpecialInterviewHistory(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.interviewService.getMockInterviewHistory(
      req.user.userId,
      AIInterviewType.SPECIAL,
      Number(page),
      Number(limit),
    );

    return ResponseUtil.success(result, '查询成功');
  }

  /**
   * 获取行测 + HR 综合面试历史记录（分页）
   */
  @Get('behavior/history')
  @UseGuards(JwtAuthGuard)
  async getBehaviorInterviewHistory(
    @Request() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.interviewService.getMockInterviewHistory(
      req.user.userId,
      AIInterviewType.BEHAVIOR,
      Number(page),
      Number(limit),
    );

    return ResponseUtil.success(result, '查询成功');
  }

  /**
   * 使用旺旺币兑换套餐
   */
  @Post('exchange-package')
  @UseGuards(JwtAuthGuard)
  async exchangePackage(@Body() dto: ExchangePackageDto, @Request() req: any) {
    const result = await this.interviewService.exchangePackage(
      req.user.userId,
      dto.packageType,
    );

    return ResponseUtil.success(result, result.message);
  }
}
