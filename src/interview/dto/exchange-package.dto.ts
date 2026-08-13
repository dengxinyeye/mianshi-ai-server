import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty } from 'class-validator';

/**
 * 兑换类型枚举
 */
export enum ExchangePackageType {
  RESUME_QUIZ = 'resume', // 简历押题
  SPECIAL_INTERVIEW = 'special', // 专项面试
  BEHAVIOR_INTERVIEW = 'behavior', // 行测+HR面试
}

/**
 * 兑换套餐请求 DTO
 */
export class ExchangePackageDto {
  @ApiProperty({
    description: '兑换类型',
    enum: ExchangePackageType,
    example: ExchangePackageType.RESUME_QUIZ,
  })
  @IsEnum(ExchangePackageType, { message: '兑换类型无效' })
  @IsNotEmpty({ message: '兑换类型不能为空' })
  packageType: ExchangePackageType;
}
