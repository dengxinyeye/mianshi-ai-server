# AI 智能面试平台 · 后端服务

基于大语言模型的 AI 面试系统后端，支持**简历押题**、**专项面试**、**综合面试（行测 + HR）** 三种模式，实现实时问题生成、答案评估与结构化报告输出。

面试全流程通过 **SSE 流式推送**逐字返回，支持中途暂停、关闭浏览器后凭 `resultId` 恢复进度。

## 技术栈

| 分类 | 选型 |
| --- | --- |
| 后端框架 | NestJS 11 + TypeScript 5.7 |
| AI 编排 | LangChain 1.1 + `@langchain/deepseek` |
| 大模型 | DeepSeek（`deepseek-chat`） |
| 数据库 | MongoDB + Mongoose ODM |
| 实时推送 | Server-Sent Events + RxJS |
| 认证鉴权 | JWT + Passport（邮箱 + 密码） |
| 文档解析 | `pdf-parse` + `mammoth`（PDF / DOCX） |
| 参数校验 | class-validator + 全局 ValidationPipe |
| 可观测性 | Prometheus + Winston + 链路追踪 |

## 架构设计

### 分层结构

```
API 层  Controller ── 路由 / DTO 校验 / Guard 鉴权 / 响应包装
                ↓
业务层  Service ──── 流程编排 / 状态机 / 配额扣减 / 会话管理
                ↓
数据层  Schema ───── Mongoose 模型 / 索引 / 嵌套文档
```

**约束**：Controller 不写业务逻辑，只做参数提取与 `ResponseUtil` 包装；Service 不接触 `req`/`res`；Schema 只描述数据结构。

### 模块划分

```
AppModule（根模块，仅负责组装）
├── UserModule        用户域：注册、登录、资料、消费记录
├── InterviewModule   面试域：押题、模拟面试、简历解析、历史查询
│   └── AIModule      AI 基础设施（被业务模块按需引用）
└── MetricsModule     监控域
```

`AIModule` 作为通用基础设施独立抽取，**不反向依赖任何业务模块**，从模块层面杜绝循环依赖。

### 目录结构

```text
src/
├── ai/                              # AI 基础设施
│   └── services/
│       ├── ai-model.factory.ts      # 模型工厂（三档 temperature）
│       └── session.manager.ts       # 对话历史管理
├── auth/                            # JWT 策略 / 守卫 / @Public 装饰器
├── interview/                       # 面试核心域
│   ├── interview.controller.ts      # 18 个路由（含 3 个 SSE 端点）
│   ├── services/                    # 业务编排、AI 调用、文档解析
│   ├── prompts/                     # 分阶段 Prompt 模板
│   ├── schemas/                     # Mongoose Schema
│   └── dto/                         # 请求 / 事件 DTO
├── user/                            # 用户域
├── common/                          # 异常过滤、拦截器、链路追踪、日志、监控
├── app.module.ts
└── main.ts

scripts/seed-demo-user.ts            # 演示账号与配额预置
```

## 核心能力

### 1. 模块化分层架构

AI 能力通过工厂模式封装，业务层不感知底层模型：

```typescript
createDefaultModel()   // temperature 0.7 —— 常规问答
createStableModel()    // temperature 0.3 —— 答案评估（需一致性）
createCreativeModel()  // temperature 0.8 —— 题目生成（需发散）
```

更换模型供应商只需改动 `ai-model.factory.ts` 一个文件。

### 2. SSE + RxJS 流式推送

放弃轮询，用 `RxJS Subject` 驱动事件流，逐块写入响应：

```typescript
res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
res.setHeader('X-Accel-Buffering', 'no');   // 关键：禁用 Nginx 缓冲

const subscription = this.interviewService
  .startMockInterviewWithStream(userId, dto)
  .subscribe({
    next: (event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.flush?.();                          // 立即刷出，不等缓冲区攒满
    },
    complete: () => res.end(),
  });

req.on('close', () => subscription.unsubscribe());   // 断连即释放
```

事件类型：`start` / `question` / `waiting` / `reference_answer` / `thinking` / `end` / `error`，配合 `isStreaming` 标志支撑前端「占位符 + 增量更新」渲染。

**三个易踩的坑**：
- 不设 `X-Accel-Buffering: no`，Nginx 会攒满缓冲区才转发，流式效果消失
- 不调 `res.flush()`，Node 自身的响应缓冲同样会阻塞逐字输出
- 不监听 `req.on('close')`，客户端断开后 AI 仍在后台烧 token

### 3. LangChain + DeepSeek 分阶段 Prompt

采用 **Pipe Chain**（`prompt → model → parser`）而非 Agent —— 面试流程是路径可枚举的确定性状态机，Agent 的动态规划只会带来 token 翻倍与延迟不可控：

```typescript
const chain = promptTemplate.pipe(model).pipe(new JsonOutputParser());
const result = await chain.invoke(params);
```

流式场景用 `AsyncGenerator` 逐块产出：

```typescript
async *generateInterviewQuestionStream(ctx): AsyncGenerator<string> {
  const stream = await promptTemplate.pipe(model).stream(params);
  for await (const chunk of stream) {
    yield chunk.content?.toString() || '';
  }
}
```

Prompt 按阶段拆分，覆盖问题生成 → 参考答案 → 答案评估 → 报告生成：

```
prompts/
├── resume-quiz.prompts.ts          # 押题：题目生成 + 匹配度分析
├── mock-interview.prompts.ts       # 模拟面试：追问 + 评估报告
├── resume-analysis.prompts.ts      # 简历分析
└── format-instructions.prompts.ts  # JSON 输出格式约束
```

面试是否结束由模型输出 `[END_INTERVIEW]` 标记，后端识别后驱动状态机流转 —— **决策交给 Prompt，控制权留在代码**。

### 4. Schema 设计与增量写入

问答列表用嵌套数组存储，**每答一题增量写入一条**，而非等面试结束整体落库，进程中途崩溃也不丢数据：

```typescript
@Prop({ type: [InterviewQASchema], default: [] })
qaList: InterviewQA[];   // question / answer / standardAnswer / score / starAnalysis
```

配额扣减用 CAS 原子操作，从根上避免并发超卖：

```typescript
const user = await this.userModel.findOneAndUpdate(
  { _id: userId, resumeRemainingCount: { $gt: 0 } },  // 条件：余额 > 0
  { $inc: { resumeRemainingCount: -1 } },             // 原子扣减
  { new: false },
);
if (!user) throw new BadRequestException('次数不足');
```

配套两层兜底：
- **幂等**：`requestId` 落在消费记录上，重复提交直接返回已有结果，不二次扣费
- **回滚**：AI 调用失败时自动返还次数，并把消费记录标记为 `failed`

### 5. 面试会话生命周期管理

```
        start                pause              resume
 创建 ────────→ in_progress ────────→ paused ────────→ in_progress
                    │                                       │
                    │ end / 超时                             │
                    ↓                                       │
                completed ←──────────────────────────────────┘

                abandoned（主动放弃 / 超时回收）
```

活跃会话存于内存 `Map` 保证交互低延迟，同时把完整快照写进 `sessionState` 字段以支持跨进程恢复：

```typescript
// 恢复：从数据库快照重建内存会话
const session = dbResult.sessionState as InterviewSession;
session.isActive = true;
this.interviewSessions.set(session.sessionId, session);
await this.aiInterviewResultModel.findOneAndUpdate(
  { resultId },
  { $set: { status: 'in_progress', resumedAt: new Date() } },
);
```

**历史回放采用双数据源降级**：进行中/暂停的面试读会话快照（保留完整逐轮上下文）；已完成的面试快照无需保留，则用 `qaList` 重建「一问一答」对话流，确保历史回看不会空白。

## 数据模型

```
User（用户）
 ├── 1:N → AIInterviewResult（模拟面试结果）
 │           └── 1:N → qaList[]（问答，嵌套数组）
 │                       └── 1:1 → starAnalysis（STAR 评分，嵌套文档）
 ├── 1:N → ResumeQuizResult（押题结果）
 │           └── 1:N → questions[]（题目，嵌套数组）
 ├── 1:N → ConsumptionRecord（消费记录）
 └── 1:N → UserTransaction（配额变动流水）
```

关键索引：

```typescript
{ userId: 1, interviewType: 1, createdAt: -1 }  // 历史列表分页
{ userId: 1, status: 1, updatedAt: -1 }         // 未完成面试查询
{ userId: 1, overallScore: -1 }                 // 成绩排序
```

`userId` 同时存 `ObjectId`（用于 populate 关联）与字符串（用于高频 where 条件），以少量冗余换查询性能。

## 接口一览

### 用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/user/register` | 注册（公开） |
| POST | `/user/login` | 登录，返回 JWT（公开） |
| GET | `/user/info` | 当前用户信息 |
| PUT | `/user/profile` | 更新资料 |
| GET | `/user/consumption-records` | 消费记录 |

### 面试（均需 Bearer Token）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/interview/resume/parse` | 上传简历 → 内存解析为纯文本 |
| POST | `/interview/resume/quiz/stream` | **SSE** 简历押题进度流 |
| POST | `/interview/mock/start` | **SSE** 开始模拟面试 |
| POST | `/interview/mock/answer` | **SSE** 提交回答并获取追问 |
| POST | `/interview/mock/pause/:resultId` | 暂停面试 |
| POST | `/interview/mock/resume/:resultId` | 恢复面试 |
| POST | `/interview/mock/end/:resultId` | 结束面试 |
| GET | `/interview/mock/unfinished` | 未完成面试列表（恢复入口） |
| GET | `/interview/mock/history/:resultId` | 会话历史回放 |
| GET | `/interview/mock/result/:resultId/qa` | 模拟面试问答结果 |
| GET | `/interview/analysis/report/:resultId` | 分析报告（自动识别类型） |
| GET | `/interview/resume/quiz/history` | 押题历史（分页） |
| GET | `/interview/resume/quiz/result/:resultId` | 押题详情 |
| GET | `/interview/special/history` | 专项面试历史（分页） |
| GET | `/interview/behavior/history` | 综合面试历史（分页） |
| POST | `/interview/exchange-package` | 兑换服务次数 |
| POST | `/interview/analyze-resume` | 简历分析（创建会话） |
| POST | `/interview/continue-conversation` | 多轮对话续聊 |

### 监控

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/metrics` | Prometheus 指标 |

统一响应格式（由全局拦截器包装）：

```json
{ "code": 200, "message": "操作成功", "data": {}, "timestamp": "..." }
```

## 快速开始

### 环境要求

- Node.js >= 20
- MongoDB >= 6
- 一个可用的 DeepSeek API Key

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

从模板复制一份，再填入真实值：

```bash
cp .env.example .env.development
```

生成一个随机 JWT 密钥：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `MONGODB_URI` | 否 | `mongodb://127.0.0.1:27017/mianshi-ai` | 数据库连接 |
| `JWT_SECRET` | **是** | — | JWT 签名密钥，缺失时服务直接启动失败 |
| `DEEPSEEK_API_KEY` | **是** | — | 缺失则 AI 功能不可用 |
| `DEEPSEEK_MODEL` | 否 | `deepseek-chat` | 建议保持默认，`deepseek-reasoner` 会超时 |
| `DEEPSEEK_TEMPERATURE` | 否 | `0.7` | 默认模型温度 |
| `DEEPSEEK_MAX_TOKENS` | 否 | `4096` | 单次最大输出 |
| `PORT` | 否 | `3000` | 服务端口，**本地联调需设为 `8888`**（前端 devProxy 默认指向该端口） |

> 所有 `.env*` 文件均已被 `.gitignore` 忽略，仅 `.env.example` 入库。切勿把真实密钥提交到仓库。

### 3. 预置演示账号

```bash
npm run seed
```

创建 `demo@mianshiwang.com / demo1234` 并写入充足配额，脚本可重复执行（已存在则重置密码与配额）。可用 `SEED_EMAIL` / `SEED_PASSWORD` 覆盖默认值。

### 4. 启动服务

```bash
npm run start:dev     # 开发模式（热重载）
npm run build         # 构建
npm run start:prod    # 生产模式
```

## 工程化能力

| 能力 | 实现 |
| --- | --- |
| 统一响应 | `ResponseInterceptor` 全局包装为 `{ code, message, data }` |
| 统一异常 | `AllExceptionsFilter` 兜底所有未捕获异常 |
| 链路追踪 | `TraceIdMiddleware` 为每个请求注入 `traceId`，贯穿日志 |
| 日志 | Winston + 按天切分文件，生产环境结构化 JSON |
| 监控 | `MetricsInterceptor` 采集接口耗时与调用量，暴露 `/metrics` |
| 参数校验 | 全局 `ValidationPipe`（`whitelist: true` 自动剥离未声明字段） |

## 安全设计

| 项 | 措施 |
| --- | --- |
| 密钥管理 | 全部走环境变量；`JWT_SECRET` 缺失即启动失败，不设可预测的默认值；日志中不打印任何密钥 |
| 密码存储 | bcrypt 哈希（salt 10）；`password` 字段 `select: false`，校验时才显式取出 |
| 用户枚举防护 | 登录失败时「邮箱不存在」与「密码错误」返回同一提示 |
| 越权访问 | 所有查询均以 `userId` 为前置条件，无法通过篡改 `resultId` 读取他人数据 |
| 文件上传 | 扩展名结尾白名单（防 `a.pdf.exe`）+ 10MB 上限 + 内存解析不落盘 |
| SSRF | 按 URL 拉取文档时阻断内网、回环与 `169.254.x` 元数据地址，仅允许 http(s)，并禁用自动重定向防 302 绕过 |
| 重复提交 | `requestId` 幂等去重，避免重复扣费 |
| 分页放大 | 单页上限 50 条 |

## 常见问题

**SSE 没有流式效果，数据一次性返回**
检查反向代理是否开启缓冲。Nginx 需配置 `proxy_buffering off;`，代码侧已设置 `X-Accel-Buffering: no`。

**服务启动报 `JWT_SECRET 未配置`**
这是预期行为。密钥只允许来自环境变量，请在 `.env.development` 中设置。

**简历解析失败**
仅支持 PDF / DOC / DOCX 且不超过 10MB。扫描版 PDF 是图片，无文本层可提取，需改用文本版或先做 OCR。

**AI 请求超时**
确认 `DEEPSEEK_MODEL` 为 `deepseek-chat`。`deepseek-reasoner` 为深度推理模式，生成面试题耗时可达 5-10 分钟。

## 提交规范

遵循 Conventional Commits：

| 类型 | 含义 |
| --- | --- |
| `feat` | 新功能 |
| `fix` | 修复缺陷 |
| `docs` | 文档变更 |
| `style` | 格式调整（不影响逻辑） |
| `refactor` | 重构 |
| `perf` | 性能优化 |
| `test` | 测试相关 |
| `build` | 构建或依赖变更 |
| `chore` | 其他杂项 |

示例：`feat(interview): add unfinished session query API`
