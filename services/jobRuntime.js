'use strict';

/**
 * Shared Job Runtime
 *
 * Central abstraction for all scheduled, recurring, and background jobs.
 * Every job is declared through this framework, gaining consistent
 * retry/backoff logic, dead-letter tracking, metrics, and admin observability.
 *
 * Schedule types supported:
 *  - 'interval'   : fixed-interval setInterval (e.g. every 15 min)
 *  - 'timeOfDay'  : runs at specific UTC hours (e.g. 3am & 3pm)
 */

const DEFAULT_RETRY_POLICY = {
  maxRetries: 2,
  backoffMs: 1000,
  backoffMultiplier: 2,
};

const MAX_DEAD_LETTERS = 50;

class JobRuntime {
  constructor() {
    /** @type {Map<string, JobEntry>} */
    this.jobs = new Map();
    this._started = false;
  }

  /**
   * Register a job with the runtime.
   *
   * @param {string} name         Unique job name
   * @param {object} config
   * @param {function} config.handler         Async function to execute
   * @param {string}  [config.queue]          Logical queue name (for grouping)
   * @param {string}  [config.description]    Human-readable description
   * @param {object}  [config.schedule]       Schedule configuration
   * @param {string}  config.schedule.type    'interval' | 'timeOfDay'
   * @param {number}  [config.schedule.intervalMs]         Interval in ms (for type 'interval')
   * @param {number}  [config.schedule.initialDelayMs]     Delay before first run (ms)
   * @param {Array}   [config.schedule.timesUTC]           [{hour,minute}] (for type 'timeOfDay')
   * @param {number}  [config.schedule.fallbackIntervalMs] Fallback check interval (for type 'timeOfDay')
   * @param {object}  [config.retryPolicy]                 Retry/backoff configuration
   * @param {number}  config.retryPolicy.maxRetries        Max retry attempts
   * @param {number}  config.retryPolicy.backoffMs         Initial backoff delay (ms)
   * @param {number}  config.retryPolicy.backoffMultiplier Backoff multiplier per retry
   */
  define(name, config = {}) {
    if (this.jobs.has(name)) {
      throw new Error(`Job "${name}" is already defined`);
    }

    const schedule = config.schedule || { type: 'interval', intervalMs: 60000 };
    const retryPolicy = { ...DEFAULT_RETRY_POLICY, ...config.retryPolicy };

    this.jobs.set(name, {
      name,
      handler: config.handler,
      queue: config.queue || 'default',
      description: config.description || '',
      schedule,
      retryPolicy,
      // Handles for cleanup
      _intervalHandle: null,
      _timeoutHandle: null,
      _timeOfDayHandle: null,
      // Metrics
      lastRunAt: null,
      lastSuccessAt: null,
      nextRunAt: null,
      runCount: 0,
      successCount: 0,
      errorCount: 0,
      lastError: null,
      status: 'idle', // idle | running | scheduled | stopped
      deadLetterQueue: [],
    });
  }

  /**
   * Execute a job's handler with retry/backoff logic.
   * Returns a result object { success, attempts, error? }.
   */
  async runJob(name) {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Unknown job: ${name}`);

    const { retryPolicy } = job;
    const idempotencyKey = `${name}:${Date.now()}`;
    let lastError = null;

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        job.status = 'running';
        job.lastRunAt = new Date();
        await job.handler();
        job.runCount++;
        job.successCount++;
        job.lastSuccessAt = new Date();
        job.status = 'scheduled';
        job.lastError = null;
        return { success: true, attempts: attempt + 1, idempotencyKey };
      } catch (error) {
        lastError = error;
        job.errorCount++;

        if (attempt < retryPolicy.maxRetries) {
          const delay = retryPolicy.backoffMs * Math.pow(retryPolicy.backoffMultiplier, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    // All retries exhausted → dead-letter
    job.lastError = { message: lastError.message, stack: lastError.stack, timestamp: new Date() };
    job.status = 'scheduled';
    job.deadLetterQueue.push({
      timestamp: new Date(),
      error: lastError.message,
      idempotencyKey,
    });
    if (job.deadLetterQueue.length > MAX_DEAD_LETTERS) {
      job.deadLetterQueue = job.deadLetterQueue.slice(-MAX_DEAD_LETTERS);
    }

    return { success: false, attempts: retryPolicy.maxRetries + 1, error: lastError.message, idempotencyKey };
  }

  /**
   * Start scheduling a single job.
   */
  start(name) {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Unknown job: ${name}`);
    if (job._intervalHandle || job._timeoutHandle || job._timeOfDayHandle) return; // already running

    const { schedule } = job;

    if (schedule.type === 'timeOfDay') {
      this._startTimeOfDayJob(job);
    } else {
      this._startIntervalJob(job);
    }

    job.status = 'scheduled';
  }

  /**
   * Start all registered jobs.
   */
  startAll() {
    this._started = true;
    for (const name of this.jobs.keys()) {
      this.start(name);
    }
  }

  /**
   * Stop a single job's scheduling.
   */
  stop(name) {
    const job = this.jobs.get(name);
    if (!job) throw new Error(`Unknown job: ${name}`);
    this._clearJobHandles(job);
    job.status = 'stopped';
  }

  /**
   * Stop all jobs.
   */
  stopAll() {
    this._started = false;
    for (const job of this.jobs.values()) {
      this._clearJobHandles(job);
      job.status = 'stopped';
    }
  }

  /**
   * Get the status of a single job.
   */
  getStatus(name) {
    const job = this.jobs.get(name);
    if (!job) return null;
    return this._buildJobStatus(job);
  }

  /**
   * Get status of all jobs.
   */
  getAllStatus() {
    const result = {};
    for (const [name, job] of this.jobs) {
      result[name] = this._buildJobStatus(job);
    }
    return result;
  }

  /**
   * Generate an overall health report.
   */
  getHealthReport() {
    const jobs = [];
    let healthy = true;
    let totalRuns = 0;
    let totalErrors = 0;
    let totalDeadLetters = 0;

    for (const [name, job] of this.jobs) {
      const status = this._buildJobStatus(job);
      jobs.push(status);
      totalRuns += job.runCount;
      totalErrors += job.errorCount;
      totalDeadLetters += job.deadLetterQueue.length;
      if (job.status === 'stopped' || job.deadLetterQueue.length > 0) {
        healthy = false;
      }
    }

    return {
      healthy,
      timestamp: new Date().toISOString(),
      summary: {
        totalJobs: this.jobs.size,
        totalRuns,
        totalErrors,
        totalDeadLetters,
      },
      jobs,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  _buildJobStatus(job) {
    return {
      name: job.name,
      queue: job.queue,
      description: job.description,
      status: job.status,
      schedule: job.schedule,
      retryPolicy: job.retryPolicy,
      lastRunAt: job.lastRunAt,
      lastSuccessAt: job.lastSuccessAt,
      nextRunAt: job.nextRunAt,
      runCount: job.runCount,
      successCount: job.successCount,
      errorCount: job.errorCount,
      lastError: job.lastError,
      deadLetterCount: job.deadLetterQueue.length,
      deadLetterQueue: job.deadLetterQueue.slice(-10), // last 10
    };
  }

  _clearJobHandles(job) {
    if (job._intervalHandle) {
      clearInterval(job._intervalHandle);
      job._intervalHandle = null;
    }
    if (job._timeoutHandle) {
      clearTimeout(job._timeoutHandle);
      job._timeoutHandle = null;
    }
    if (job._timeOfDayHandle) {
      clearInterval(job._timeOfDayHandle);
      job._timeOfDayHandle = null;
    }
  }

  _startIntervalJob(job) {
    const { schedule } = job;
    const intervalMs = schedule.intervalMs || 60000;
    const initialDelayMs = schedule.initialDelayMs || 0;

    const tick = () => {
      job.nextRunAt = new Date(Date.now() + intervalMs);
      this.runJob(job.name).catch((err) => {
        console.error(`[jobRuntime] Unhandled error in job "${job.name}":`, err);
      });
    };

    if (initialDelayMs > 0) {
      job._timeoutHandle = setTimeout(() => {
        tick();
        job._intervalHandle = setInterval(tick, intervalMs);
      }, initialDelayMs);
    } else {
      // Run immediately then schedule recurring
      tick();
      job._intervalHandle = setInterval(tick, intervalMs);
    }

    job.nextRunAt = new Date(Date.now() + (initialDelayMs || 0));
  }

  _startTimeOfDayJob(job) {
    const { schedule } = job;
    const timesUTC = schedule.timesUTC || [{ hour: 0, minute: 0 }];
    const fallbackIntervalMs = schedule.fallbackIntervalMs || 60 * 60 * 1000;

    const getNextRunDelay = () => {
      const now = new Date();
      let earliest = Infinity;

      for (const { hour, minute } of timesUTC) {
        const candidate = new Date(now);
        candidate.setUTCHours(hour, minute || 0, 0, 0);
        if (candidate.getTime() <= now.getTime()) {
          candidate.setUTCDate(candidate.getUTCDate() + 1);
        }
        const delay = candidate.getTime() - now.getTime();
        if (delay < earliest) earliest = delay;
      }

      return earliest;
    };

    // Run initial execution
    this.runJob(job.name).catch((err) => {
      console.error(`[jobRuntime] Initial run error for "${job.name}":`, err);
    });

    // Schedule precise next run via setTimeout chain
    const scheduleNextRun = () => {
      const delay = getNextRunDelay();
      job.nextRunAt = new Date(Date.now() + delay);

      job._timeoutHandle = setTimeout(() => {
        this.runJob(job.name).catch((err) => {
          console.error(`[jobRuntime] Scheduled run error for "${job.name}":`, err);
        });
        scheduleNextRun();
      }, delay);
    };

    scheduleNextRun();

    // Fallback interval check
    job._timeOfDayHandle = setInterval(() => {
      const now = new Date();
      const hours = now.getUTCHours();
      const minutes = now.getUTCMinutes();

      for (const t of timesUTC) {
        if (hours === t.hour && minutes < 5) {
          this.runJob(job.name).catch((err) => {
            console.error(`[jobRuntime] Fallback run error for "${job.name}":`, err);
          });
          break;
        }
      }
    }, fallbackIntervalMs);
  }
}

// Singleton instance
const runtime = new JobRuntime();

module.exports = { JobRuntime, runtime };
