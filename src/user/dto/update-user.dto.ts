import { IsString, IsOptional, IsEmail, Length } from 'class-validator';

export class UpdateUserDto {
  /**
   * 用户名
   * 长度与前端个人资料表单保持一致（2-20 字符）
   */
  @IsString()
  @IsOptional()
  @Length(2, 20, { message: '用户名长度需在 2-20 个字符之间' })
  username?: string;

  @IsString()
  @IsOptional()
  avatar?: string;

  @IsEmail({}, { message: '请输入有效的邮箱地址' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;
}
