jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-uuid') }));
jest.mock('../../ai/services/session.manager', () => ({
  SessionManager: class {},
}));
jest.mock('./resume-analysis.service', () => ({
  ResumeAnalysisService: class {},
}));
jest.mock('./conversation-continuation.service', () => ({
  ConversationContinuationService: class {},
}));
jest.mock('./document-parser.service', () => ({
  DocumentParserService: class {},
}));
jest.mock('./interview-ai.service', () => ({ InterviewAIService: class {} }));

import { ResumeQuizDto } from '../dto/resume-quiz.dto';
import { InterviewService } from './interview.service';

type TestableInterviewService = {
  executeResumeQuiz: (userId: string, dto: ResumeQuizDto) => Promise<unknown>;
};

describe('InterviewService.generateResumeQuizWithProgress', () => {
  it('emits the completed result and closes the progress stream', async () => {
    const service = Object.create(
      InterviewService.prototype,
    ) as InterviewService;
    const result = {
      resultId: 'result-1',
      questions: [{ question: '题目一' }],
      summary: '押题摘要',
    };
    const testableService = service as unknown as TestableInterviewService;

    jest.spyOn(testableService, 'executeResumeQuiz').mockResolvedValue(result);

    const events: unknown[] = [];
    let completed = false;

    service
      .generateResumeQuizWithProgress('user-1', {} as ResumeQuizDto)
      .subscribe({
        next: (event) => events.push(event),
        complete: () => {
          completed = true;
        },
      });

    await new Promise((resolve) => setImmediate(resolve));

    expect(events).toEqual([
      {
        type: 'complete',
        progress: 100,
        label: '✅ 押题分析完成',
        message: '✅ 押题分析完成',
        stage: 'done',
        data: result,
      },
    ]);
    expect(completed).toBe(true);
  });
});
