import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { getAnalysisReport, getCurrentUserInfo, getResumeQuizHistory, getResumeQuizResultDetail, getUserConsumptionRecords, } from './api.js';
/**
 * 创建一个 MCP Server 实例。
 *
 * 你可以把它理解成：
 * “先创建一个专门给 AI 客户端调用的服务对象”。
 *
 * 后面所有的 Tool，都会注册到这个 server 上。
 *
 * 这里的 name 和 version 主要是这个 MCP 服务自己的基础信息：
 * - name：这个 MCP Server 叫什么名字
 * - version：当前版本号是多少
 *
 * 当 AI 客户端连接这个 Server 时，
 * 它可以知道自己连上的到底是哪个服务。
 */
const server = new McpServer({
    name: 'wwzhidao-mcp',
    version: '1.0.0',
});
/**
 * 注册第一个 Tool：获取当前登录用户信息
 *
 * registerTool 一共有 3 个核心参数：
 *
 * 1. Tool 名称
 *    - 这是给 AI 客户端识别和调用的名字
 *    - 一般建议用 snake_case，清晰直接
 *
 * 2. Tool 配置对象
 *    - description：告诉 AI 这个 Tool 是干什么的
 *    - inputSchema：定义这个 Tool 需要什么输入参数
 *
 * 3. Tool 的实际实现函数
 *    - 当 AI 真正调用这个 Tool 时，执行的就是这里的函数
 */
server.registerTool('get_current_user_info', {
    description: '获取当前登录用户的信息',
    /**
     * inputSchema 为空对象，表示这个 Tool 不需要任何输入参数。
     *
     * 也就是说：
     * AI 只要决定调用它，就可以直接调，
     * 不需要再额外传 page、id、keyword 之类的数据。
     */
    inputSchema: {},
}, async () => {
    /**
     * 调用你在 api.ts 里封装好的业务函数
     * 去真正请求后端接口。
     */
    const user = await getCurrentUserInfo();
    /**
     * MCP Tool 的返回值不是随便 return 什么都行，
     * 而是要按 MCP 约定的结构返回。
     *
     * 这里返回的是一个 content 数组，
     * 其中每一项都是一段返回内容。
     *
     * 当前最简单的做法就是返回 text 文本。
     */
    return {
        content: [
            {
                type: 'text',
                /**
                 * JSON.stringify(user, null, 2) 的作用是：
                 * 把对象转成格式化后的 JSON 字符串，方便 AI 和开发者阅读。
                 *
                 * 参数解释：
                 * - 第一个参数：要转换的数据
                 * - 第二个参数：null，表示不自定义字段替换
                 * - 第三个参数：2，表示缩进 2 个空格
                 */
                text: JSON.stringify(user, null, 2),
            },
        ],
    };
});
/**
 * 注册第二个 Tool：获取当前用户消费记录
 *
 * 整体模式和上面完全一致：
 * 1. 定义 Tool 名称
 * 2. 定义描述和输入参数
 * 3. 调用底层 API
 * 4. 返回标准 MCP content
 *
 * 这也是 MCP Tool 开发里最常见的套路。
 */
server.registerTool('get_user_consumption_records', {
    description: '获取当前用户的消费记录',
    inputSchema: {},
}, async () => {
    const records = await getUserConsumptionRecords();
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(records, null, 2),
            },
        ],
    };
});
/**
 * 注册第三个 Tool：分页获取简历押题历史记录
 *
 * 这个 Tool 和前两个最大的区别在于：
 * 它需要输入参数。
 *
 * 所以这里的 inputSchema 就不再是空对象了，
 * 而是用 zod 明确定义参数结构。
 */
server.registerTool('get_resume_quiz_history', {
    description: '分页获取当前用户的简历押题历史记录',
    inputSchema: {
        /**
         * page：页码
         *
         * z.number()      -> 必须是数字
         * .int()          -> 必须是整数
         * .positive()     -> 必须大于 0
         * .default(1)     -> 如果没传，默认是 1
         * .describe(...)  -> 给这个字段加说明，方便 AI 理解参数含义
         */
        page: z.number().int().positive().default(1).describe('页码'),
        /**
         * limit：每页条数
         *
         * 这里额外加了 .max(20)
         * 表示单次最多只能查 20 条。
         *
         * 这是一种很常见的参数约束手段：
         * 防止 AI 或调用方一次查太多数据。
         */
        limit: z
            .number()
            .int()
            .positive()
            .max(20)
            .default(10)
            .describe('每页条数，最大 20'),
    },
}, 
/**
 * 这里的参数对象，就是 MCP 调用这个 Tool 时传进来的输入。
 *
 * 比如 AI 传：
 * {
 *   page: 2,
 *   limit: 5
 * }
 *
 * 那这里就会拿到 page=2, limit=5。
 *
 * 这里再次写默认值 page = 1, limit = 10，
 * 是一种额外保护，避免参数缺失时函数内部出问题。
 */
async ({ page = 1, limit = 10 }) => {
    const history = await getResumeQuizHistory(page, limit);
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(history, null, 2),
            },
        ],
    };
});
/**
 * 注册第四个 Tool：根据 resultId 获取押题结果详情
 *
 * 这个 Tool 说明：
 * 前面的 history Tool 拿到的是“历史列表”，
 * 而这里拿到的是“某一条记录的详情”。
 *
 * 这就是非常典型的一种 Tool 串联关系：
 * 先查列表 -> 再拿某个 ID 查详情
 */
server.registerTool('get_resume_quiz_result_detail', {
    description: '根据 resultId 获取某次简历押题的结果详情',
    inputSchema: {
        /**
         * resultId 是必填字符串参数
         *
         * 这里没有加 default，
         * 说明调用方必须传。
         */
        resultId: z.string().describe('简历押题结果 ID'),
    },
}, async ({ resultId }) => {
    const result = await getResumeQuizResultDetail(resultId);
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(result, null, 2),
            },
        ],
    };
});
/**
 * 注册第五个 Tool：根据 resultId 获取分析报告
 *
 * 这个 Tool 和上面的详情 Tool 很像，
 * 区别只是底层调用的接口不同。
 *
 * 这也能看出 MCP 的一个特点：
 * MCP 本身不负责你的业务逻辑，
 * 它只是把已有业务能力“包装成 AI 可调用的 Tool”。
 */
server.registerTool('get_analysis_report', {
    description: '根据 resultId 获取分析报告',
    inputSchema: {
        resultId: z.string().describe('结果 ID'),
    },
}, async ({ resultId }) => {
    const report = await getAnalysisReport(resultId);
    return {
        content: [
            {
                type: 'text',
                text: JSON.stringify(report, null, 2),
            },
        ],
    };
});
/**
 * main 函数：启动 MCP Server
 *
 * 为什么要单独写一个 main？
 *
 * 因为“创建 server”和“真正启动 server”是两件事：
 * - 前面只是把 Tool 注册好了
 * - 这里才是真正开始监听客户端连接
 */
async function main() {
    /**
     * 创建 stdio 传输层
     *
     * stdio = standard input / standard output
     * 也就是标准输入输出。
     *
     * 这是很多本地 MCP Server 最常见的通信方式。
     *
     * 你可以简单理解成：
     * AI 客户端通过“命令行进程通信”的方式和这个 Server 对话，
     * 而不是通过 HTTP 端口通信。
     *
     * 比如 Cursor、Claude Desktop、Cherry Studio 一类支持 MCP 的客户端，
     * 很多时候就是直接拉起这个进程，然后通过 stdio 和它通信。
     */
    const transport = new StdioServerTransport();
    /**
     * 把当前 MCP Server 连接到这个传输层上
     *
     * connect 完成后，这个 server 就真正进入可用状态了。
     */
    await server.connect(transport);
    /**
     * 这里用 console.error 打一条日志，
     * 主要是方便开发阶段确认服务已经启动成功。
     *
     * 注意：
     * MCP 的 stdio 通信会占用标准输出，
     * 所以很多示例会把日志打到 stderr（也就是 console.error），
     * 避免污染标准输出数据流。
     */
    console.error('wwzhidao MCP server running on stdio');
}
/**
 * 执行 main，并统一兜底处理启动异常
 *
 * 如果启动过程中有错误：
 * - 比如配置有问题
 * - 依赖加载失败
 * - connect 失败
 *
 * 就会进入 catch。
 */
main().catch((error) => {
    /**
     * 打印致命错误日志
     */
    console.error('Fatal error in main():', error);
    /**
     * 以非 0 状态码退出进程
     *
     * 这表示程序是“异常退出”，
     * 方便外部系统或开发者识别启动失败。
     */
    process.exit(1);
});
