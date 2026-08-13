import 'dotenv/config';
import axios from 'axios';
/**
 * 读取后端服务的基础地址。
 *
 * 这里优先从环境变量里读取：
 * process.env.WWZHIDAO_API_BASE_URL
 *
 * 如果没有配置，就默认使用本地地址：
 * http://127.0.0.1:8888
 *
 * 为什么要这样写？
 *
 * 因为 MCP Server 在不同环境下，可能会连接不同的后端：
 * - 本地开发环境
 * - 测试环境
 * - 线上环境
 *
 * 如果把地址写死，后面切环境会很麻烦。
 * 所以通常会把这类配置放到 .env 里管理。
 */
const baseURL = process.env.WWZHIDAO_API_BASE_URL ?? 'http://127.0.0.1:8888';
/**
 * 读取 JWT Token。
 *
 * 这个 token 一般是用户登录后拿到的身份凭证。
 * 后续 MCP Server 调用业务接口时，
 * 会把它放到请求头里，告诉后端：
 * “我是一个已经登录的用户，请按这个身份返回数据。”
 *
 * 这一步非常关键。
 * 因为你现在做的这些 Tool，本质上很多都是“用户私有数据”：
 * - 当前用户信息
 * - 当前用户消费记录
 * - 当前用户的押题历史
 *
 * 没有 token，后端通常不会返回这些数据。
 */
const token = process.env.WWZHIDAO_JWT_TOKEN;
/**
 * 启动时做一次必要的前置校验。
 *
 * 如果 token 没有配置，
 * 那么后面所有请求几乎都会因为未登录而失败。
 *
 * 与其等到调用 Tool 时再报错，
 * 不如在程序启动阶段就直接抛错，
 * 这样问题暴露得更早，也更容易排查。
 *
 * 这是一个很常见的工程实践：
 * “配置缺失 -> 尽早失败”
 */
if (!token) {
    throw new Error('缺少 WWZHIDAO_JWT_TOKEN，请先检查 mcp/.env 配置');
}
/**
 * 创建一个 axios 实例，作为统一的 HTTP 请求客户端。
 */
const http = axios.create({
    baseURL,
    timeout: 30000,
    headers: {
        Authorization: `Bearer ${token}`,
    },
});
/**
 * 封装一个通用的 GET 请求方法。
 *
 * 这是这份代码里非常重要的一层抽象。
 *
 * 为什么要封装？
 *
 * 因为你会发现，后面的几个 Tool 虽然请求地址不同，
 * 但它们做的事情几乎一样：
 *
 * 1. 发起 GET 请求
 * 2. 拿到统一结构的响应
 * 3. 判断业务 code 是否报错
 * 4. 如果成功，只返回 data
 *
 * 这类重复逻辑，如果每个函数都写一遍：
 * - 代码重复
 * - 不好维护
 * - 容易漏掉错误处理
 *
 * 所以这里把“公共逻辑”抽出来做成一个 get<T>()。
 *
 * T 表示你希望最终拿到的数据类型。
 * 这个函数的返回值不是整个响应体，
 * 而是已经帮你拆好的 payload.data。
 *
 * 也就是说：
 * 后面业务函数只关心“我要什么数据”，
 * 不用每次都重新处理 code/message/data 这一层壳。
 */
async function get(url) {
    /**
     * 发起 GET 请求。
     *
     * 这里告诉 axios：
     * 这次接口返回的数据结构应该是 ApiResponse<T>
     *
     * 这样 response.data 的类型就会很清晰，
     * TypeScript 后续也能给出更好的提示。
     */
    const response = await http.get(url);
    /**
     * 取出后端真正返回的响应体
     */
    const payload = response.data;
    /**
     * 这里不是判断 HTTP 状态码，
     * 而是在判断“业务状态码”。
     *
     * 很多后端就算 HTTP 层返回 200，
     * 业务层也可能仍然是失败的，比如：
     *
     * {
     *   code: 401,
     *   message: '未登录',
     *   data: null
     * }
     *
     * 所以这里需要额外做一次业务判断。
     *
     * 一旦失败，直接抛出错误，
     * 这样 MCP Tool 在被调用时，
     * AI 客户端也能拿到明确的失败信息。
     */
    if (payload.code >= 400) {
        throw new Error(payload.message || '接口调用失败');
    }
    /**
     * 如果调用成功，
     * 就只把最核心的业务数据 payload.data 返回出去。
     *
     * 这样后面的业务函数都会非常干净。
     */
    return payload.data;
}
/**
 * 获取当前登录用户信息
 *
 * 对应接口：
 * GET /user/info
 *
 * 这个函数现在还只是一个普通的业务函数，
 * 但在 MCP 里，后面它通常会被注册成一个 Tool，比如：
 * get_current_user_info
 *
 * 也就是说：
 * AI 客户端真正调 Tool 时，
 * 底层最终调用的，往往就是这种函数。
 */
export async function getCurrentUserInfo() {
    return get('/user/info');
}
/**
 * 获取当前用户的消费记录
 *
 * 对应接口：
 * GET /user/consumption-records
 *
 * 为什么这里直接调用 get(...) 就够了？
 *
 * 因为：
 * - 请求基地址已经在 http 里统一配置好了
 * - token 已经自动带上了
 * - 错误处理已经在 get() 里统一处理了
 *
 * 所以这里的函数只需要表达一件事：
 * “我要请求哪个接口”
 *
 * 这就是封装的价值。
 */
export async function getUserConsumptionRecords() {
    return get('/user/consumption-records');
}
/**
 * 获取简历押题历史记录
 *
 * 对应接口：
 * GET /interview/resume/quiz/history?page=1&limit=10
 *
 * 这里多了两个参数：
 * - page：页码
 * - limit：每页条数
 *
 * 说明这个接口是一个分页接口。
 *
 * 为什么分页很常见？
 *
 * 因为“历史记录”这类数据理论上可能很多，
 * 如果一次全拉回来：
 * - 响应会很大
 * - 接口会变慢
 * - AI 也没必要一次看完所有数据
 *
 * 所以通常会分页返回。
 *
 * 这里直接用字符串拼接 query 参数，
 * 属于最基础的写法，简单直接，也容易教学理解。
 */
export async function getResumeQuizHistory(page, limit) {
    return get(`/interview/resume/quiz/history?page=${page}&limit=${limit}`);
}
/**
 * 根据 resultId 获取某一次押题结果详情
 *
 * 对应接口：
 * GET /interview/resume/quiz/result/:resultId
 *
 * 这里的 resultId 可以理解成：
 * “某一次押题结果的唯一标识”
 *
 * 为什么有了历史记录还需要详情接口？
 *
 * 因为历史列表通常只返回摘要信息，
 * 比如：
 * - 记录 id
 * - 创建时间
 * - 标题
 * - 状态
 *
 * 真正更完整的内容，往往要点进详情页再查一次。
 *
 * 在 MCP 场景里也是一样：
 * AI 可能先调用 history Tool 拿到列表，
 * 再根据其中某条记录的 resultId，
 * 调这个详情 Tool 去拿完整结果。
 *
 * 这就是 Tool 之间“串起来”的典型方式。
 */
export async function getResumeQuizResultDetail(resultId) {
    return get(`/interview/resume/quiz/result/${resultId}`);
}
/**
 * 根据 resultId 获取分析报告
 *
 * 对应接口：
 * GET /interview/analysis/report/:resultId
 *
 * 这个接口和“获取押题结果详情”很像，
 * 但它取回来的不是普通结果详情，
 * 而是更进一步的分析报告。
 *
 * 举个很常见的 MCP 调用链路：
 *
 * 1. 先获取押题历史
 * 2. 从历史记录里挑中某个 resultId
 * 3. 获取该 resultId 的结果详情
 * 4. 再进一步获取该 resultId 的分析报告
 *
 * 到这里你就能看出来了：
 * 这些函数单独看只是“几个接口请求”，
 * 但放到 MCP 里，它们其实就是一组可以被 AI 编排调用的能力。
 */
export async function getAnalysisReport(resultId) {
    return get(`/interview/analysis/report/${resultId}`);
}
