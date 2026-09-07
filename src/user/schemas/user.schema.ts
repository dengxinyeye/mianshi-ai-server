import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserDocument = User &
  Document & {
    comparePassword(candidatePassword: string): Promise<boolean>;
  };

@Schema({ timestamps: true })
export class User {
  // 基础认证字段
  @Prop({ required: true })
  username: string;

  @Prop({ required: false, unique: true, sparse: true })
  email?: string; // 登录账号，全局唯一

  @Prop({ required: false })
  phone: string;

  @Prop()
  avatar?: string;

  @Prop({ default: ['user'] })
  roles: string[]; // 角色数组，支持多角色

  @Prop({ default: false })
  isActive: boolean; // 账号是否激活

  // 密码哈希：默认不随查询返回，需要校验时必须用 .select('+password') 显式取出
  @Prop({ select: false })
  password?: string;

  // 配额相关（这很关键）
  //
  // 说明：本项目已移除支付模块，旺旺币不再通过充值获得，改为「注册即赠送」。
  // 三层配额模型保持不变：旺旺币（通用货币）→ 各服务次数（专用票券）→ 消耗时原子扣减。
  // 兑换比例见 interview.service.ts 的 EXCHANGE_COST（20 币 = 1 次）。
  @Prop({ default: 0 })
  aiInterviewRemainingCount: number; // AI模拟面试剩余次数

  @Prop({ default: 0 })
  aiInterviewRemainingMinutes: number; // AI模拟面试剩余时间（分钟）

  @Prop({ default: 100 })
  wwCoinBalance: number; // 旺旺币余额（注册赠送 100，可兑换 5 次服务）

  @Prop({ default: 1 })
  resumeRemainingCount: number; // 简历押题剩余次数（注册赠送 1 次，可直接体验）

  @Prop({ default: 1 })
  specialRemainingCount: number; // 专项面试剩余次数（注册赠送 1 次）

  @Prop({ default: 1 })
  behaviorRemainingCount: number; // 综合面试剩余次数（注册赠送 1 次）

  // 用户行为追踪
  @Prop()
  lastLoginTime?: Date; // 最近登录时间

  // 时间戳（自动添加）
  // createdAt: Date;
  // updatedAt: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// 保存前加密密码
UserSchema.pre('save', async function () {
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  if (this.password) {
    this.password = await bcrypt.hash(this.password, salt);
  }
});

// 添加比较密码的方法
UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
) {
  // 未设置密码的账号（如历史第三方登录数据）一律视为校验失败，避免 bcrypt 抛错
  if (!this.password) {
    return false;
  }
  return await bcrypt.compare(candidatePassword, this.password);
};
