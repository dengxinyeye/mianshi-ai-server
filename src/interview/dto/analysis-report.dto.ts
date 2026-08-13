import { ApiProperty } from '@nestjs/swagger';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * 报告生成状态
 */
export enum ReportStatus {
  PENDING = 'pending', // 等待生成
  GENERATING = 'generating', // 生成中
  COMPLETED = 'completed', // 已完成
  FAILED = 'failed', // 生成失败
}

/**
 * 技能匹配项
 */
export class SkillMatchDto {
  @ApiProperty({ description: '技能名称', example: 'Vue.js' })
  skill: string;

  @ApiProperty({ description: '是否匹配', example: true })
  matched: boolean;

  @ApiProperty({
    description: '熟练度描述',
    example: '熟练掌握，有2年项目经验',
  })
  proficiency?: string;
}

/**
 * 雷达图维度数据
 */
export class RadarDimensionDto {
  @ApiProperty({ description: '维度名称', example: '技术能力' })
  dimension: string;

  @ApiProperty({
    description: '得分 (0-100)',
    example: 85,
    minimum: 0,
    maximum: 100,
  })
  score: number;

  @ApiPropertyOptional({ description: '维度说明', example: '掌握了主流技术栈' })
  description?: string;
}

/**
 * 面试押题分析报告
 */
export class ResumeQuizAnalysisDto {
  @ApiProperty({ description: '报告ID', example: 'rq_1234567890' })
  resultId: string;

  @ApiProperty({ description: '面试类型', example: 'resume_quiz' })
  type: 'resume_quiz';

  @ApiProperty({ description: '公司名称', example: '字节跳动' })
  company: string;

  @ApiProperty({ description: '岗位名称', example: '前端开发工程师' })
  position: string;

  @ApiPropertyOptional({ description: '薪资范围', example: '20K-35K' })
  salaryRange?: string;

  @ApiProperty({ description: '生成时间', example: '2025-11-28T10:30:00.000Z' })
  createdAt: string;

  // ============ 匹配度分析 ============
  @ApiProperty({
    description: '简历与岗位匹配度 (0-100)',
    example: 82,
    minimum: 0,
    maximum: 100,
  })
  matchScore: number;

  @ApiProperty({
    description: '匹配度等级',
    example: '良好',
    enum: ['优秀', '良好', '中等', '较差'],
  })
  matchLevel: string;

  @ApiProperty({ description: '匹配的技能', type: [SkillMatchDto] })
  matchedSkills: SkillMatchDto[];

  @ApiProperty({
    description: '缺失的技能',
    type: [String],
    example: ['TypeScript', 'Webpack'],
  })
  missingSkills: string[];

  // ============ 知识补充建议 ============
  @ApiProperty({ description: '需要补充的知识点', type: [String] })
  knowledgeGaps: string[];

  @ApiProperty({
    description: '学习优先级',
    type: [Object],
    example: [
      { topic: 'TypeScript', priority: 'high', reason: 'JD明确要求' },
      { topic: 'Webpack优化', priority: 'medium', reason: '提升竞争力' },
    ],
  })
  learningPriorities: Array<{
    topic: string;
    priority: 'high' | 'medium' | 'low';
    reason: string;
  }>;

  // ============ 雷达图数据 ============
  @ApiProperty({ description: '雷达图维度数据', type: [RadarDimensionDto] })
  radarData: RadarDimensionDto[];

  // ============ 综合评估 ============
  @ApiProperty({
    description: '总体优势',
    type: [String],
    example: ['具有3年Vue.js开发经验', '有大型项目经验', '熟悉前端工程化'],
  })
  strengths: string[];

  @ApiProperty({
    description: '薄弱环节',
    type: [String],
    example: ['TypeScript使用经验较少', '缺少性能优化经验'],
  })
  weaknesses: string[];

  @ApiProperty({
    description: 'AI综合评估',
    example: '候选人具有扎实的前端基础...',
  })
  summary: string;

  // ============ 面试准备建议 ============
  @ApiProperty({
    description: '面试准备建议',
    type: [String],
    example: [
      '重点准备Vue3新特性相关问题',
      '准备项目中的性能优化案例',
      '复习TypeScript基础知识',
    ],
  })
  interviewTips: string[];

  @ApiProperty({ description: '问题总数', example: 12 })
  totalQuestions: number;

  @ApiProperty({
    description: '各类别问题分布',
    type: Object,
    example: {
      technical: 5,
      project: 4,
      'problem-solving': 2,
      'soft-skill': 2,
    },
  })
  questionDistribution: Record<string, number>;

  @ApiProperty({ description: '查看次数', example: 3 })
  viewCount: number;
}
