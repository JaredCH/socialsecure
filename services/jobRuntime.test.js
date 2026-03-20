'use strict';

const { JobRuntime } = require('./jobRuntime');

describe('JobRuntime', () => {
  let runtime;

  beforeEach(() => {
    runtime = new JobRuntime();
    jest.useFakeTimers();
  });

  afterEach(() => {
    runtime.stopAll();
    jest.useRealTimers();
  });

  // ── define() ────────────────────────────────────────────────────────────

  describe('define()', () => {
    test('registers a job with default retry policy', () => {
      const handler = jest.fn();
      runtime.define('test-job', { handler, description: 'A test' });

      const status = runtime.getStatus('test-job');
      expect(status).toBeTruthy();
      expect(status.name).toBe('test-job');
      expect(status.description).toBe('A test');
      expect(status.queue).toBe('default');
      expect(status.retryPolicy.maxRetries).toBe(2);
      expect(status.retryPolicy.backoffMs).toBe(1000);
      expect(status.retryPolicy.backoffMultiplier).toBe(2);
      expect(status.status).toBe('idle');
    });

    test('registers a job with custom retry policy', () => {
      runtime.define('custom-retry', {
        handler: jest.fn(),
        queue: 'custom',
        retryPolicy: { maxRetries: 5, backoffMs: 500, backoffMultiplier: 3 },
      });

      const status = runtime.getStatus('custom-retry');
      expect(status.retryPolicy.maxRetries).toBe(5);
      expect(status.retryPolicy.backoffMs).toBe(500);
      expect(status.retryPolicy.backoffMultiplier).toBe(3);
      expect(status.queue).toBe('custom');
    });

    test('throws when defining duplicate job name', () => {
      runtime.define('dup', { handler: jest.fn() });
      expect(() => runtime.define('dup', { handler: jest.fn() })).toThrow(
        'Job "dup" is already defined'
      );
    });
  });

  // ── runJob() ────────────────────────────────────────────────────────────

  describe('runJob()', () => {
    beforeEach(() => {
      jest.useRealTimers();
    });

    test('runs handler successfully and updates metrics', async () => {
      const handler = jest.fn().mockResolvedValue('done');
      runtime.define('success-job', { handler });

      const result = await runtime.runJob('success-job');

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);

      const status = runtime.getStatus('success-job');
      expect(status.runCount).toBe(1);
      expect(status.successCount).toBe(1);
      expect(status.errorCount).toBe(0);
      expect(status.lastRunAt).toBeTruthy();
      expect(status.lastSuccessAt).toBeTruthy();
      expect(status.lastError).toBeNull();
    });

    test('retries on failure and succeeds on second attempt', async () => {
      const handler = jest.fn()
        .mockRejectedValueOnce(new Error('temporary'))
        .mockResolvedValue('ok');

      runtime.define('retry-job', {
        handler,
        retryPolicy: { maxRetries: 2, backoffMs: 10, backoffMultiplier: 1 },
      });

      const result = await runtime.runJob('retry-job');

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
      expect(handler).toHaveBeenCalledTimes(2);

      const status = runtime.getStatus('retry-job');
      expect(status.runCount).toBe(1);
      expect(status.errorCount).toBe(1); // one retry error
      expect(status.deadLetterCount).toBe(0);
    });

    test('exhausts retries and adds to dead-letter queue', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('permanent'));

      runtime.define('fail-job', {
        handler,
        retryPolicy: { maxRetries: 1, backoffMs: 10, backoffMultiplier: 1 },
      });

      const result = await runtime.runJob('fail-job');

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(2); // initial + 1 retry
      expect(result.error).toBe('permanent');
      expect(handler).toHaveBeenCalledTimes(2);

      const status = runtime.getStatus('fail-job');
      expect(status.errorCount).toBe(2);
      expect(status.deadLetterCount).toBe(1);
      expect(status.deadLetterQueue[0].error).toBe('permanent');
      expect(status.lastError.message).toBe('permanent');
    });

    test('returns idempotency key', async () => {
      runtime.define('idempotent', { handler: jest.fn().mockResolvedValue() });

      const result = await runtime.runJob('idempotent');
      expect(result.idempotencyKey).toMatch(/^idempotent:\d+$/);
    });

    test('throws for unknown job', async () => {
      await expect(runtime.runJob('nonexistent')).rejects.toThrow('Unknown job: nonexistent');
    });

    test('caps dead-letter queue at 50 entries', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('fail'));
      runtime.define('dl-cap', {
        handler,
        retryPolicy: { maxRetries: 0, backoffMs: 1, backoffMultiplier: 1 },
      });

      for (let i = 0; i < 60; i++) {
        await runtime.runJob('dl-cap');
      }

      const status = runtime.getStatus('dl-cap');
      expect(status.deadLetterCount).toBe(50);
    });
  });

  // ── start() / stop() ───────────────────────────────────────────────────

  describe('start() and stop()', () => {
    test('starts an interval job and updates status', () => {
      const handler = jest.fn().mockResolvedValue();
      runtime.define('interval-job', {
        handler,
        schedule: { type: 'interval', intervalMs: 1000 },
      });

      runtime.start('interval-job');

      const status = runtime.getStatus('interval-job');
      expect(status.status).toBe('scheduled');
      expect(status.nextRunAt).toBeTruthy();
    });

    test('stops a running job', () => {
      const handler = jest.fn().mockResolvedValue();
      runtime.define('stop-test', {
        handler,
        schedule: { type: 'interval', intervalMs: 1000 },
      });

      runtime.start('stop-test');
      expect(runtime.getStatus('stop-test').status).toBe('scheduled');

      runtime.stop('stop-test');
      expect(runtime.getStatus('stop-test').status).toBe('stopped');
    });

    test('start is idempotent (does not double-register)', () => {
      const handler = jest.fn().mockResolvedValue();
      runtime.define('idempotent-start', {
        handler,
        schedule: { type: 'interval', intervalMs: 5000 },
      });

      runtime.start('idempotent-start');
      runtime.start('idempotent-start'); // second call should be no-op

      // Advance time and verify handler isn't called more than expected
      jest.advanceTimersByTime(5000);
      // Handler called once from initial run, once from first interval tick
      expect(handler.mock.calls.length).toBe(2);
    });

    test('throws for unknown job on start/stop', () => {
      expect(() => runtime.start('ghost')).toThrow('Unknown job: ghost');
      expect(() => runtime.stop('ghost')).toThrow('Unknown job: ghost');
    });
  });

  // ── startAll() / stopAll() ─────────────────────────────────────────────

  describe('startAll() and stopAll()', () => {
    test('starts and stops all registered jobs', () => {
      runtime.define('job-a', {
        handler: jest.fn().mockResolvedValue(),
        schedule: { type: 'interval', intervalMs: 1000 },
      });
      runtime.define('job-b', {
        handler: jest.fn().mockResolvedValue(),
        schedule: { type: 'interval', intervalMs: 2000 },
      });

      runtime.startAll();
      expect(runtime.getStatus('job-a').status).toBe('scheduled');
      expect(runtime.getStatus('job-b').status).toBe('scheduled');

      runtime.stopAll();
      expect(runtime.getStatus('job-a').status).toBe('stopped');
      expect(runtime.getStatus('job-b').status).toBe('stopped');
    });
  });

  // ── getAllStatus() ─────────────────────────────────────────────────────

  describe('getAllStatus()', () => {
    test('returns status for all registered jobs', () => {
      runtime.define('alpha', { handler: jest.fn() });
      runtime.define('beta', { handler: jest.fn(), queue: 'q2' });

      const all = runtime.getAllStatus();
      expect(Object.keys(all)).toEqual(['alpha', 'beta']);
      expect(all.alpha.name).toBe('alpha');
      expect(all.beta.queue).toBe('q2');
    });

    test('returns empty object when no jobs registered', () => {
      expect(runtime.getAllStatus()).toEqual({});
    });
  });

  // ── getHealthReport() ──────────────────────────────────────────────────

  describe('getHealthReport()', () => {
    test('reports healthy when all jobs are running without dead letters', () => {
      runtime.define('healthy-job', {
        handler: jest.fn().mockResolvedValue(),
        schedule: { type: 'interval', intervalMs: 1000 },
      });
      runtime.start('healthy-job');

      const report = runtime.getHealthReport();
      expect(report.healthy).toBe(true);
      expect(report.summary.totalJobs).toBe(1);
      expect(report.summary.totalRuns).toBe(0);
      expect(report.jobs).toHaveLength(1);
      expect(report.timestamp).toBeTruthy();
    });

    test('reports unhealthy when a job has dead letters', async () => {
      jest.useRealTimers();

      const handler = jest.fn().mockRejectedValue(new Error('crash'));
      runtime.define('unhealthy-job', {
        handler,
        retryPolicy: { maxRetries: 0, backoffMs: 1, backoffMultiplier: 1 },
      });

      await runtime.runJob('unhealthy-job');

      const report = runtime.getHealthReport();
      expect(report.healthy).toBe(false);
      expect(report.summary.totalDeadLetters).toBe(1);
    });

    test('reports unhealthy when a job is stopped', () => {
      runtime.define('stopped-job', {
        handler: jest.fn(),
        schedule: { type: 'interval', intervalMs: 1000 },
      });
      runtime.start('stopped-job');
      runtime.stop('stopped-job');

      const report = runtime.getHealthReport();
      expect(report.healthy).toBe(false);
    });
  });

  // ── interval scheduling ────────────────────────────────────────────────

  describe('interval scheduling', () => {
    test('runs handler on interval ticks', () => {
      const handler = jest.fn().mockResolvedValue();
      runtime.define('ticker', {
        handler,
        schedule: { type: 'interval', intervalMs: 5000 },
      });

      runtime.start('ticker');

      // First call happens immediately on start
      expect(handler).toHaveBeenCalledTimes(1);

      // Advance to next tick
      jest.advanceTimersByTime(5000);
      expect(handler).toHaveBeenCalledTimes(2);

      // Another tick
      jest.advanceTimersByTime(5000);
      expect(handler).toHaveBeenCalledTimes(3);
    });

    test('respects initialDelayMs before first run', () => {
      const handler = jest.fn().mockResolvedValue();
      runtime.define('delayed', {
        handler,
        schedule: { type: 'interval', intervalMs: 5000, initialDelayMs: 2000 },
      });

      runtime.start('delayed');
      expect(handler).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2000);
      expect(handler).toHaveBeenCalledTimes(1);

      jest.advanceTimersByTime(5000);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  // ── timeOfDay scheduling ───────────────────────────────────────────────

  describe('timeOfDay scheduling', () => {
    test('runs initial execution immediately and schedules future runs', () => {
      const handler = jest.fn().mockResolvedValue();
      runtime.define('daily', {
        handler,
        schedule: {
          type: 'timeOfDay',
          timesUTC: [{ hour: 3, minute: 0 }, { hour: 15, minute: 0 }],
          fallbackIntervalMs: 60 * 60 * 1000,
        },
      });

      runtime.start('daily');

      // Initial run fires immediately
      expect(handler).toHaveBeenCalledTimes(1);

      const status = runtime.getStatus('daily');
      expect(status.status).toBe('scheduled');
      expect(status.nextRunAt).toBeTruthy();
    });
  });

  // ── getStatus for nonexistent job ──────────────────────────────────────

  describe('getStatus()', () => {
    test('returns null for unknown job', () => {
      expect(runtime.getStatus('ghost')).toBeNull();
    });
  });
});
