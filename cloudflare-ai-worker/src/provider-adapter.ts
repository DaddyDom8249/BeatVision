export type ProviderStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export type ProviderSubmission = {
  provider_job_id: string;
  accepted_at: string;
};

export type ProviderResult = {
  provider_job_id: string;
  output_url: string;
  asset_id: string;
};

export interface MotionProviderAdapter {
  submit(input: Record<string, unknown>, idempotencyKey: string): Promise<ProviderSubmission>;
  getStatus(providerJobId: string): Promise<ProviderStatus>;
  getOutput(providerJobId: string): Promise<ProviderResult>;
}

export class DeterministicMockProvider implements MotionProviderAdapter {
  private readonly jobs = new Map<string, { input: Record<string, unknown>; polls: number; failTransiently: boolean; permanentFailure: boolean }>();
  private readonly options: { transientFailures?: number; permanentFailure?: boolean };
  submitCalls = 0;
  statusCalls = 0;

  constructor(options: { transientFailures?: number; permanentFailure?: boolean } = {}) { this.options = options; }

  async submit(input: Record<string, unknown>, idempotencyKey: string): Promise<ProviderSubmission> {
    const providerJobId = `mock-provider:${idempotencyKey}`;
    if (!this.jobs.has(providerJobId)) {
      this.jobs.set(providerJobId, {
        input,
        polls: 0,
        failTransiently: (this.options.transientFailures || 0) > 0,
        permanentFailure: Boolean(this.options.permanentFailure)
      });
      this.submitCalls += 1;
    }
    return { provider_job_id: providerJobId, accepted_at: '2026-01-01T00:00:00.000Z' };
  }

  async getStatus(providerJobId: string): Promise<ProviderStatus> {
    const job = this.jobs.get(providerJobId);
    if (!job) throw new Error(`MOCK_PROVIDER_JOB_NOT_FOUND:${providerJobId}`);
    this.statusCalls += 1;
    job.polls += 1;
    if (job.permanentFailure) return 'FAILED';
    if (job.failTransiently && job.polls <= (this.options.transientFailures || 0)) throw new Error('MOCK_TRANSIENT_PROVIDER_FAILURE');
    return job.polls === 1 ? 'RUNNING' : 'SUCCEEDED';
  }

  async getOutput(providerJobId: string): Promise<ProviderResult> {
    const job = this.jobs.get(providerJobId);
    if (!job) throw new Error(`MOCK_PROVIDER_JOB_NOT_FOUND:${providerJobId}`);
    return {
      provider_job_id: providerJobId,
      output_url: `fixture://motion/${providerJobId}`,
      asset_id: `motion-asset:${providerJobId}`
    };
  }
}
