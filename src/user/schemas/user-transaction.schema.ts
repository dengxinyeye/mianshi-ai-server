import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type UserTransactionDocument = UserTransaction & Document;

export enum UserTransactionType {
  RECHARGE = 'recharge',
  EXPENSE = 'expense',
}

@Schema({ timestamps: true })
/**
 * 用户交易记录模型
 *
 * 该实体用于描述一次与“用户余额 / 账户变动”相关的交易流水，
 * 常见场景包括：充值、扣费、退款、购买套餐、系统补偿等。
 */
export class UserTransaction {
  /**
   * 关联的用户 ObjectId（MongoDB 引用）
   * - ref: 'User' 表示关联 User 集合
   * - index: true 便于按用户维度快速查询交易流水
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', index: true })
  user?: Types.ObjectId;

  /**
   * 用户业务唯一标识
   * - 可能是 userId、unionId、openId 等业务层标识
   * - 作为冗余字段，避免频繁 join User 表
   */
  @Prop({ required: true, index: true })
  userIdentifier: string;

  /**
   * 交易类型
   * - 由 UserTransactionType 枚举约束
   * - 用于区分：充值 / 消费 / 退款 / 调账 / 系统赠送 等
   */
  @Prop({ enum: UserTransactionType, required: true })
  type: UserTransactionType;

  /**
   * 交易金额
   * - 正数通常表示入账
   * - 负数通常表示扣费（具体语义由业务约定）
   */
  @Prop({ required: true })
  amount: number;

  /**
   * 币种
   * - 默认 CNY
   * - 预留多币种扩展能力
   */
  @Prop({ default: 'CNY' })
  currency: string;

  /**
   * 交易描述
   * - 用于展示给用户或运营人员查看
   * - 例如：“购买 7 天强化练习套餐”
   */
  @Prop()
  description?: string;

  /**
   * 关联的套餐 / 商品 ID
   * - 业务侧用于定位具体商品或服务
   */
  @Prop()
  planId?: string;

  /**
   * 套餐 / 商品名称（冗余字段，便于展示与审计）
   */
  @Prop()
  planName?: string;

  /**
   * 交易来源
   * - 例如：web / h5 / mini-program / admin / system
   * - 便于做渠道分析与风控
   */
  @Prop()
  source?: string;

  /**
   * 业务自定义扩展元数据
   * - 存放非结构化信息
   * - 例如：活动信息、场景标识、风控标签等
   */
  @Prop({ type: SchemaTypes.Mixed })
  metadata?: Record<string, any>;

  /**
   * 关联的外部订单号
   * - 通常对应支付系统的 outTradeNo
   * - unique + sparse 用于保证：
   *   - 有值时全局唯一
   *   - 允许多个文档该字段为空
   */
  @Prop({ index: true, unique: true, sparse: true })
  relatedOrderId?: string;

  /**
   * 原始交易上下文数据
   * - 存放交易发生时的规范化快照
   * - 用于对账、审计、问题回溯
   */
  @Prop({ type: SchemaTypes.Mixed })
  payData?: Record<string, any>;

  /**
   * 交易创建时间
   * - 如果未开启 timestamps，这里通常由业务层手动赋值
   */
  @Prop()
  createdAt?: Date;
}

export const UserTransactionSchema =
  SchemaFactory.createForClass(UserTransaction);
