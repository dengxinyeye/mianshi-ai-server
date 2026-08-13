/**
 * 预置演示账号脚本
 *
 * 作用：本地跑起来后无需注册即可直接登录体验完整面试流程，并给足各项配额，
 *      避免演示到一半提示「次数不足」。
 *
 * 用法：
 *   npm run seed
 *
 * 可通过环境变量覆盖默认值：
 *   SEED_EMAIL / SEED_PASSWORD / SEED_USERNAME
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import { UserSchema } from '../src/user/schemas/user.schema';

// 与 app.module.ts 保持一致，读取同一份环境变量文件
dotenv.config({ path: '.env.development' });

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/mianshi-ai';

const DEMO_EMAIL = process.env.SEED_EMAIL || 'demo@mianshiwang.com';
const DEMO_PASSWORD = process.env.SEED_PASSWORD || 'demo1234';
const DEMO_USERNAME = process.env.SEED_USERNAME || '演示账号';

/** 演示用配额，给足以免打断演示 */
const DEMO_QUOTA = {
  resumeRemainingCount: 99, // 简历押题
  specialRemainingCount: 99, // 专项面试
  behaviorRemainingCount: 99, // 综合面试
  aiInterviewRemainingCount: 99, // AI 模拟面试次数
  aiInterviewRemainingMinutes: 999, // AI 模拟面试时长
  wwCoinBalance: 999, // 旺旺币（用于兑换套餐功能）
};

async function seed(): Promise<void> {
  await mongoose.connect(MONGODB_URI);
  console.log(`✅ 已连接数据库: ${MONGODB_URI}`);

  // 复用业务 Schema，确保 pre('save') 的密码哈希钩子生效
  const UserModel = mongoose.model('User', UserSchema);

  let user = await UserModel.findOne({ email: DEMO_EMAIL }).select(
    '+password',
  );

  if (user) {
    // 已存在则重置密码与配额，保证脚本可重复执行
    user.set({
      username: DEMO_USERNAME,
      password: DEMO_PASSWORD, // 赋值后由 pre('save') 重新哈希
      isActive: true,
      roles: ['user'],
      ...DEMO_QUOTA,
    });
    await user.save();
    console.log('♻️  演示账号已存在，已重置密码与配额');
  } else {
    user = new UserModel({
      username: DEMO_USERNAME,
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      isActive: true,
      roles: ['user'],
      ...DEMO_QUOTA,
    });
    await user.save();
    console.log('🎉 演示账号创建成功');
  }

  console.log('----------------------------------------');
  console.log(`  邮箱：${DEMO_EMAIL}`);
  console.log(`  密码：${DEMO_PASSWORD}`);
  console.log(`  用户ID：${user._id.toString()}`);
  console.log('----------------------------------------');
}

seed()
  .then(async () => {
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('❌ 预置演示账号失败:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
