const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ userId: 'admin-user-id' }))
}));

const adminAuthUser = { _id: 'admin-user-id', isAdmin: true, moderationStatus: 'active' };
let targetUser;

const mockUserFindById = jest.fn();
const mockUserCountDocuments = jest.fn().mockResolvedValue(0);
const mockUserFind = jest.fn(() => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([])
}));

jest.mock('../models/User', () => ({
  findById: (...args) => mockUserFindById(...args),
  countDocuments: (...args) => mockUserCountDocuments(...args),
  find: (...args) => mockUserFind(...args),
  findByIdAndDelete: jest.fn().mockResolvedValue(null)
}));

const mockEmptyQueryResult = {
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue([])
};

const buildChain = (rows = []) => ({
  sort: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  populate: jest.fn().mockReturnThis(),
  skip: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockResolvedValue(rows)
});

jest.mock('../models/Post', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(() => ({ ...mockEmptyQueryResult })),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/ChatMessage', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(() => ({ ...mockEmptyQueryResult })),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/ConversationMessage', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(() => ({ ...mockEmptyQueryResult })),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/Report', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/BlockList', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/MuteList', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  deleteMany: jest.fn().mockResolvedValue({})
}));

jest.mock('../models/ChatRoom', () => ({
  countDocuments: jest.fn().mockResolvedValue(0)
}));

jest.mock('../models/ChatConversation', () => ({
  countDocuments: jest.fn().mockResolvedValue(0)
}));

const mockArticleFindById = jest.fn();
jest.mock('../models/Article', () => ({
  findById: (...args) => mockArticleFindById(...args)
}));

const mockNewsIngestionRecordFind = jest.fn();
const mockNewsIngestionRecordCountDocuments = jest.fn().mockResolvedValue(0);
const mockNewsIngestionRecordFindById = jest.fn();
jest.mock('../models/NewsIngestionRecord', () => ({
  find: (...args) => mockNewsIngestionRecordFind(...args),
  countDocuments: (...args) => mockNewsIngestionRecordCountDocuments(...args),
  findById: (...args) => mockNewsIngestionRecordFindById(...args)
}));

const moderationRouter = require('./moderation');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/moderation', moderationRouter);
  return app;
};

describe('Moderation control panel admin actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    targetUser = {
      _id: 'target-user-id',
      username: 'member',
      passwordHash: 'old-hash',
      mustResetPassword: false,
      mutedUntil: null,
      muteReason: '',
      moderationStatus: 'active',
      moderationHistory: [],
      save: jest.fn().mockResolvedValue(true)
    };

    mockUserFindById.mockImplementation((id) => {
      if (id === 'admin-user-id') {
        return {
          select: jest.fn().mockResolvedValue(adminAuthUser)
        };
      }
      if (id === 'target-user-id') {
        return Promise.resolve(targetUser);
      }
      return Promise.resolve(null);
    });
    mockNewsIngestionRecordFind.mockReturnValue(buildChain([]));
    mockNewsIngestionRecordCountDocuments.mockResolvedValue(0);
    mockNewsIngestionRecordFindById.mockReturnValue(buildChain([]));
    mockArticleFindById.mockReturnValue(buildChain([]));
  });

  it('resets password with random 8-digit temporary password and flags one-time reset', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/moderation/control-panel/users/target-user-id/reset-password')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.temporaryPassword).toMatch(/^\d{8}$/);
    expect(targetUser.mustResetPassword).toBe(true);
    expect(typeof targetUser.passwordHash).toBe('string');
    expect(targetUser.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(targetUser.moderationHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'password_reset' })])
    );
    expect(targetUser.save).toHaveBeenCalled();
  });

  it('applies mute duration and appends mute history entry', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/moderation/control-panel/users/target-user-id/mute')
      .set('Authorization', 'Bearer token')
      .send({ durationKey: '48h', reason: 'cooldown' });

    expect(response.status).toBe(200);
    expect(targetUser.moderationStatus).toBe('suspended');
    expect(targetUser.muteReason).toBe('cooldown');
    expect(targetUser.mutedUntil).toBeTruthy();
    expect(targetUser.moderationHistory).toEqual(
      expect.arrayContaining([expect.objectContaining({ action: 'mute' })])
    );
    expect(targetUser.save).toHaveBeenCalled();
  });

  it('prevents deleting own admin account', async () => {
    const app = buildApp();
    const response = await request(app)
      .delete('/api/moderation/control-panel/users/admin-user-id')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/cannot delete their own account/i);
  });

  it('returns admin ingestion observability list with pagination metadata', async () => {
    const app = buildApp();
    mockNewsIngestionRecordFind.mockReturnValue(buildChain([
      {
        _id: 'record-1',
        ingestionRunId: 'run-1',
        source: { name: 'State Wire', sourceType: 'rss' },
        normalized: { title: 'Texas emergency update', topics: ['politics'], assignedZipCode: '78666', locations: ['Texas'], localityLevel: 'state' },
        resolvedScope: 'regional',
        dedupe: { outcome: 'inserted' },
        persistence: { operation: 'insert' },
        processingStatus: 'processed',
        tags: ['politics'],
        events: [{ eventType: 'insert' }],
        createdAt: new Date('2026-03-06T00:00:00.000Z')
      }
    ]));
    mockNewsIngestionRecordCountDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/moderation/control-panel/news-ingestion?page=1&limit=20&region=regional')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.records).toHaveLength(1);
    expect(response.body.records[0].resolvedScope).toBe('regional');
    expect(response.body.pagination.total).toBe(1);
  });

  it('returns ingestion drill-down detail, timeline, and log endpoints', async () => {
    const app = buildApp();
    const record = {
      _id: 'record-2',
      ingestionRunId: 'run-2',
      source: { name: 'City Desk', sourceType: 'rss' },
      normalized: { title: 'City update', assignedZipCode: '10001' },
      dedupe: { outcome: 'updated' },
      persistence: { articleId: 'article-1', operation: 'update' },
      processingStatus: 'processed',
      events: [
        { timestamp: new Date('2026-03-06T00:01:00.000Z'), severity: 'info', eventType: 'record_received', message: 'Record received', metadata: {} },
        { timestamp: new Date('2026-03-06T00:02:00.000Z'), severity: 'warn', eventType: 'dedupe_update', message: 'Updated existing article', metadata: {} }
      ]
    };
    mockNewsIngestionRecordFindById.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(record)
    }));
    mockArticleFindById.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ _id: 'article-1', title: 'City update', source: 'City Desk' })
    }));

    const detailRes = await request(app)
      .get('/api/moderation/control-panel/news-ingestion/record-2')
      .set('Authorization', 'Bearer token');
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.record.persistence.articleId).toBe('article-1');

    const timelineRes = await request(app)
      .get('/api/moderation/control-panel/news-ingestion/record-2/timeline')
      .set('Authorization', 'Bearer token');
    expect(timelineRes.status).toBe(200);
    expect(timelineRes.body.timeline).toHaveLength(2);

    const logsRes = await request(app)
      .get('/api/moderation/control-panel/news-ingestion/record-2/logs?severity=warn')
      .set('Authorization', 'Bearer token');
    expect(logsRes.status).toBe(200);
    expect(logsRes.body.logs).toHaveLength(1);
    expect(logsRes.body.logs[0].severity).toBe('warn');
  });
});
