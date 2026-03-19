const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ userId: 'admin-user-id' }))
}));

const adminAuthUser = { _id: 'admin-user-id', isAdmin: true, moderationStatus: 'active' };
let targetUser;
let mockTargetRoomMessage;
let mockTargetConversationMessage;

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
  findById: jest.fn((id) => (id === 'room-message-id' ? mockTargetRoomMessage : null)),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({}),
  toPublicMessageShape: jest.fn((message) => ({
    _id: message._id,
    content: message.content,
    messageType: message.messageType,
    moderation: message.moderation,
    userId: message.userId
  }))
}));

jest.mock('../models/ConversationMessage', () => ({
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(() => ({ ...mockEmptyQueryResult })),
  findById: jest.fn((id) => (id === 'conversation-message-id' ? mockTargetConversationMessage : null)),
  findByIdAndDelete: jest.fn().mockResolvedValue(null),
  deleteMany: jest.fn().mockResolvedValue({}),
  toPublicMessageShape: jest.fn((message) => ({
    _id: message._id,
    content: message.content,
    messageType: message.messageType,
    moderation: message.moderation,
    userId: message.userId
  }))
}));

const mockReportFind = jest.fn();
const mockReportCountDocuments = jest.fn().mockResolvedValue(0);
jest.mock('../models/Report', () => ({
  countDocuments: (...args) => mockReportCountDocuments(...args),
  find: (...args) => mockReportFind(...args),
  deleteMany: jest.fn().mockResolvedValue({})
}));

const mockBlockListFind = jest.fn();
const mockBlockListCountDocuments = jest.fn().mockResolvedValue(0);
jest.mock('../models/BlockList', () => ({
  countDocuments: (...args) => mockBlockListCountDocuments(...args),
  find: (...args) => mockBlockListFind(...args),
  deleteMany: jest.fn().mockResolvedValue({})
}));

const mockMuteListFind = jest.fn();
const mockMuteListCountDocuments = jest.fn().mockResolvedValue(0);
jest.mock('../models/MuteList', () => ({
  countDocuments: (...args) => mockMuteListCountDocuments(...args),
  find: (...args) => mockMuteListFind(...args),
  deleteMany: jest.fn().mockResolvedValue({})
}));

const mockChatRoomFind = jest.fn();
const mockChatRoomCountDocuments = jest.fn().mockResolvedValue(0);
jest.mock('../models/ChatRoom', () => ({
  countDocuments: (...args) => mockChatRoomCountDocuments(...args),
  find: (...args) => mockChatRoomFind(...args),
  findById: jest.fn(() => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'room-1', members: ['admin-user-id', 'target-user-id'] }) })
  }))
}));

const mockChatConversationFind = jest.fn();
const mockChatConversationCountDocuments = jest.fn().mockResolvedValue(0);
jest.mock('../models/ChatConversation', () => ({
  countDocuments: (...args) => mockChatConversationCountDocuments(...args),
  find: (...args) => mockChatConversationFind(...args),
  findById: jest.fn(() => ({
    select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: 'conversation-1', type: 'zip-room', participants: ['admin-user-id', 'target-user-id'] }) })
  }))
}));

const mockArticleFindById = jest.fn();
jest.mock('../models/Article', () => ({
  findById: (...args) => mockArticleFindById(...args)
}));

const mockNewsIngestionRecordFind = jest.fn();
const mockNewsIngestionRecordCountDocuments = jest.fn().mockResolvedValue(0);
const mockNewsIngestionRecordFindById = jest.fn();
const mockZipLocationIndexFind = jest.fn();
const mockSiteContentFilterFindOne = jest.fn();
const mockSiteContentFilterFindOneAndUpdate = jest.fn();
jest.mock('../models/NewsIngestionRecord', () => ({
  find: (...args) => mockNewsIngestionRecordFind(...args),
  countDocuments: (...args) => mockNewsIngestionRecordCountDocuments(...args),
  findById: (...args) => mockNewsIngestionRecordFindById(...args)
}));
jest.mock('../models/ZipLocationIndex', () => ({
  find: (...args) => mockZipLocationIndexFind(...args)
}));
jest.mock('../models/SiteContentFilter', () => ({
  findOne: (...args) => mockSiteContentFilterFindOne(...args),
  findOneAndUpdate: (...args) => mockSiteContentFilterFindOneAndUpdate(...args)
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
    mockTargetRoomMessage = {
      _id: 'room-message-id',
      roomId: 'room-1',
      userId: { _id: 'target-user-id', username: 'member' },
      content: 'hello room',
      messageType: 'text',
      mediaType: null,
      audio: {
        storageKey: null,
        url: null,
        durationMs: null,
        waveformBins: [],
        mimeType: null,
        sizeBytes: null
      },
      commandData: null,
      encryptedContent: null,
      isEncrypted: false,
      e2ee: { enabled: false },
      moderation: { removedByAdmin: false, removedByAdminAt: null, removedByAdminBy: null, originalPayload: null },
      save: jest.fn().mockResolvedValue(true),
      toObject() {
        return {
          _id: this._id,
          roomId: this.roomId,
          userId: this.userId,
          content: this.content,
          messageType: this.messageType,
          mediaType: this.mediaType,
          audio: this.audio,
          commandData: this.commandData,
          encryptedContent: this.encryptedContent,
          isEncrypted: this.isEncrypted,
          e2ee: this.e2ee,
          moderation: this.moderation
        };
      }
    };
    mockTargetConversationMessage = {
      _id: 'conversation-message-id',
      conversationId: 'conversation-1',
      userId: { _id: 'target-user-id', username: 'member' },
      content: 'hello conversation',
      messageType: 'text',
      commandData: null,
      senderNameColor: '#123456',
      chatScope: 'chat',
      e2ee: { enabled: false },
      moderation: { removedByAdmin: false, removedByAdminAt: null, removedByAdminBy: null, originalPayload: null },
      save: jest.fn().mockResolvedValue(true),
      toObject() {
        return {
          _id: this._id,
          conversationId: this.conversationId,
          userId: this.userId,
          content: this.content,
          messageType: this.messageType,
          commandData: this.commandData,
          senderNameColor: this.senderNameColor,
          chatScope: this.chatScope,
          e2ee: this.e2ee,
          moderation: this.moderation
        };
      }
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
    mockZipLocationIndexFind.mockReturnValue(buildChain([]));
    mockSiteContentFilterFindOne.mockReturnValue({ lean: jest.fn().mockResolvedValue(null) });
    mockSiteContentFilterFindOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue({ zeroToleranceWords: [], maturityCensoredWords: [] }) });
    mockArticleFindById.mockReturnValue(buildChain([]));
    mockReportFind.mockReturnValue(buildChain([]));
    mockReportCountDocuments.mockResolvedValue(0);
    mockBlockListFind.mockReturnValue(buildChain([]));
    mockBlockListCountDocuments.mockResolvedValue(0);
    mockMuteListFind.mockReturnValue(buildChain([]));
    mockMuteListCountDocuments.mockResolvedValue(0);
    mockChatRoomFind.mockReturnValue(buildChain([]));
    mockChatRoomCountDocuments.mockResolvedValue(0);
    mockChatConversationFind.mockReturnValue(buildChain([]));
    mockChatConversationCountDocuments.mockResolvedValue(0);
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

  it('supports a 2 hour admin mute duration for in-room moderation', async () => {
    const app = buildApp();
    const before = Date.now();
    const response = await request(app)
      .post('/api/moderation/control-panel/users/target-user-id/mute')
      .set('Authorization', 'Bearer token')
      .send({ durationKey: '2h', reason: 'chat room admin action' });

    expect(response.status).toBe(200);
    const mutedUntilMs = new Date(targetUser.mutedUntil).getTime();
    expect(mutedUntilMs).toBeGreaterThanOrEqual(before + (2 * 60 * 60 * 1000) - 5000);
    expect(mutedUntilMs).toBeLessThanOrEqual(before + (2 * 60 * 60 * 1000) + 5000);
  });

  it('redacts and restores room messages for admin chat actions', async () => {
    const app = buildApp();
    const removeResponse = await request(app)
      .post('/api/moderation/control-panel/messages/room-message-id/remove')
      .set('Authorization', 'Bearer token');

    expect(removeResponse.status).toBe(200);
    expect(mockTargetRoomMessage.content).toBe('Removed by site Admin');
    expect(mockTargetRoomMessage.moderation.removedByAdmin).toBe(true);
    expect(mockTargetRoomMessage.moderation.originalPayload).toEqual(expect.objectContaining({ content: 'hello room' }));

    const restoreResponse = await request(app)
      .delete('/api/moderation/control-panel/messages/room-message-id/remove')
      .set('Authorization', 'Bearer token');

    expect(restoreResponse.status).toBe(200);
    expect(mockTargetRoomMessage.content).toBe('hello room');
    expect(mockTargetRoomMessage.moderation.removedByAdmin).toBe(false);
    expect(mockTargetRoomMessage.moderation.originalPayload).toBeNull();
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
        normalized: {
          title: 'Texas emergency update',
          category: 'politics',
          topics: ['politics'],
          assignedZipCode: '78666',
          locations: ['Texas'],
          localityLevel: 'state',
          locationTags: { zipCodes: ['78666'], cities: ['san marcos'], states: ['tx'], countries: ['us'] }
        },
        resolvedScope: 'regional',
        dedupe: { outcome: 'inserted' },
        persistence: { operation: 'insert' },
        processingStatus: 'processed',
        tags: ['politics'],
        events: [{ eventType: 'insert' }],
        updatedAt: new Date('2026-03-06T00:00:45.000Z'),
        ingestedAt: new Date('2026-03-06T00:00:30.000Z'),
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
    expect(response.body.records[0].normalized.category).toBe('politics');
    expect(response.body.records[0].locationAssociations.cities).toEqual(['san marcos']);
    expect(response.body.records[0].locationDetection).toEqual({
      usedPlainText: true,
      matchedToken: 'Texas'
    });
    expect(response.body.records[0].processedAt).toBe('2026-03-06T00:00:45.000Z');
    expect(response.body.records[0].ingestedAt).toBeTruthy();
    expect(response.body.pagination.total).toBe(1);
  });

  it('applies a quality filter so cache-only observability records are excluded', async () => {
    const app = buildApp();
    mockNewsIngestionRecordFind.mockReturnValue(buildChain([]));
    mockNewsIngestionRecordCountDocuments.mockResolvedValue(0);

    const response = await request(app)
      .get('/api/moderation/control-panel/news-ingestion')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    const query = mockNewsIngestionRecordFind.mock.calls[0][0];
    expect(Array.isArray(query.$and)).toBe(true);
    const qualityClause = query.$and.find((entry) => Array.isArray(entry.$or));
    expect(qualityClause).toBeTruthy();
    expect(qualityClause.$or).toEqual(expect.arrayContaining([
      { 'normalized.title': { $exists: true, $ne: '' } },
      { 'normalized.url': { $exists: true, $ne: '' } },
      { 'source.name': { $exists: true, $ne: '' } },
      { 'dedupe.outcome': { $exists: true } },
      { 'persistence.operation': { $exists: true } }
    ]));
  });

  it('returns ingestion drill-down detail, timeline, and log endpoints', async () => {
    const app = buildApp();
    const record = {
      _id: 'record-2',
      ingestionRunId: 'run-2',
      source: { name: 'City Desk', sourceType: 'rss' },
      normalized: { title: 'City update', assignedZipCode: '10001', locationTags: { cities: ['new york'], states: ['ny'] } },
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
    expect(detailRes.body.record.locationAssociations.cities).toEqual(['new york']);

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

  it('applies city search with nearby 50-mile location expansion for news ingestion records', async () => {
    const app = buildApp();
    mockZipLocationIndexFind
      .mockReturnValueOnce(buildChain([
        {
          zipCode: '78701',
          city: 'Austin',
          county: 'Travis County',
          state: 'Texas',
          stateCode: 'TX',
          latitude: 30.2672,
          longitude: -97.7431
        }
      ]))
      .mockReturnValueOnce(buildChain([
        {
          zipCode: '78701',
          city: 'Austin',
          county: 'Travis County',
          state: 'Texas',
          stateCode: 'TX',
          latitude: 30.2672,
          longitude: -97.7431
        },
        {
          zipCode: '78664',
          city: 'Round Rock',
          county: 'Williamson County',
          state: 'Texas',
          stateCode: 'TX',
          latitude: 30.5083,
          longitude: -97.6789
        },
        {
          zipCode: '78666',
          city: 'San Marcos',
          county: 'Hays County',
          state: 'Texas',
          stateCode: 'TX',
          latitude: 29.8833,
          longitude: -97.9414
        },
        {
          zipCode: '75201',
          city: 'Dallas',
          county: 'Dallas County',
          state: 'Texas',
          stateCode: 'TX',
          latitude: 32.7816,
          longitude: -96.7998
        }
      ]));

    const response = await request(app)
      .get('/api/moderation/control-panel/news-ingestion?location=austin')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    const query = mockNewsIngestionRecordFind.mock.calls[0][0];
    expect(query.$and).toBeTruthy();
    const locationClause = query.$and.find((entry) =>
      Array.isArray(entry.$or)
      && entry.$or.some((candidate) => candidate['normalized.locationTags.cities'])
    );
    expect(locationClause).toBeTruthy();
    const cityClause = locationClause.$or.find((entry) => entry['normalized.locationTags.cities']);
    const countyClause = locationClause.$or.find((entry) => entry['normalized.locationTags.counties']);
    const zipClause = locationClause.$or.find((entry) => entry['normalized.locationTags.zipCodes']);
    const stateClause = locationClause.$or.find((entry) => entry['normalized.locationTags.states']);
    expect(cityClause['normalized.locationTags.cities'].$in).toEqual(expect.arrayContaining(['austin', 'round rock', 'san marcos']));
    expect(cityClause['normalized.locationTags.cities'].$in).not.toContain('dallas');
    expect(countyClause['normalized.locationTags.counties'].$in).toEqual(expect.arrayContaining(['travis county', 'williamson county', 'hays county']));
    expect(zipClause['normalized.locationTags.zipCodes'].$in).toEqual(expect.arrayContaining(['78701', '78664', '78666']));
    expect(zipClause['normalized.locationTags.zipCodes'].$in).not.toContain('75201');
    expect(stateClause['normalized.locationTags.states'].$in).toEqual(expect.arrayContaining(['texas', 'tx']));
  });

  it('returns reports details with reporter and target user info', async () => {
    const app = buildApp();
    mockReportFind.mockReturnValue(buildChain([
      {
        _id: 'report-1',
        reporterId: { _id: 'user-1', username: 'alice', realName: 'Alice' },
        targetUserId: { _id: 'user-2', username: 'bob', realName: 'Bob' },
        targetType: 'post',
        category: 'spam',
        description: 'Spam post',
        status: 'pending',
        priority: 'medium',
        createdAt: new Date('2026-03-06T00:00:00.000Z')
      }
    ]));
    mockReportCountDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/moderation/control-panel/details?section=reports')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.section).toBe('reports');
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0].category).toBe('spam');
    expect(response.body.rows[0].reporter.username).toBe('alice');
    expect(response.body.rows[0].targetUser.username).toBe('bob');
    expect(response.body.pagination.total).toBe(1);
  });

  it('returns blocks details with user relationships', async () => {
    const app = buildApp();
    mockBlockListFind.mockReturnValue(buildChain([
      {
        _id: 'block-1',
        userId: { _id: 'user-1', username: 'alice', realName: 'Alice' },
        blockedUserId: { _id: 'user-2', username: 'bob', realName: 'Bob' },
        reason: 'Harassment',
        createdAt: new Date('2026-03-06T00:00:00.000Z')
      }
    ]));
    mockBlockListCountDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/moderation/control-panel/details?section=blocks')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.section).toBe('blocks');
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0].user.username).toBe('alice');
    expect(response.body.rows[0].blockedUser.username).toBe('bob');
    expect(response.body.rows[0].reason).toBe('Harassment');
  });

  it('returns mutes details with user relationships', async () => {
    const app = buildApp();
    mockMuteListFind.mockReturnValue(buildChain([
      {
        _id: 'mute-1',
        userId: { _id: 'user-1', username: 'alice', realName: 'Alice' },
        mutedUserId: { _id: 'user-2', username: 'bob', realName: 'Bob' },
        expiresAt: null,
        createdAt: new Date('2026-03-06T00:00:00.000Z')
      }
    ]));
    mockMuteListCountDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/moderation/control-panel/details?section=mutes')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.section).toBe('mutes');
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0].user.username).toBe('alice');
    expect(response.body.rows[0].mutedUser.username).toBe('bob');
  });

  it('returns rooms details with room metadata', async () => {
    const app = buildApp();
    mockChatRoomFind.mockReturnValue(buildChain([
      {
        _id: 'room-1',
        name: 'San Marcos Chat',
        type: 'city',
        city: 'San Marcos',
        state: 'TX',
        zipCode: '78666',
        messageCount: 42,
        lastActivity: new Date('2026-03-06T00:00:00.000Z'),
        createdAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ]));
    mockChatRoomCountDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/moderation/control-panel/details?section=rooms')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.section).toBe('rooms');
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0].name).toBe('San Marcos Chat');
    expect(response.body.rows[0].type).toBe('city');
    expect(response.body.rows[0].messageCount).toBe(42);
  });

  it('returns conversations details with conversation metadata', async () => {
    const app = buildApp();
    mockChatConversationFind.mockReturnValue(buildChain([
      {
        _id: 'conv-1',
        type: 'dm',
        title: 'Alice & Bob',
        zipCode: null,
        messageCount: 15,
        lastMessageAt: new Date('2026-03-06T00:00:00.000Z'),
        createdAt: new Date('2026-03-01T00:00:00.000Z')
      }
    ]));
    mockChatConversationCountDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/moderation/control-panel/details?section=conversations')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.section).toBe('conversations');
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.rows[0].type).toBe('dm');
    expect(response.body.rows[0].title).toBe('Alice & Bob');
    expect(response.body.rows[0].messageCount).toBe(15);
  });

  it('returns stored content filter word lists', async () => {
    const app = buildApp();
    mockSiteContentFilterFindOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        zeroToleranceWords: ['slur'],
        maturityCensoredWords: ['fuck']
      })
    });

    const response = await request(app)
      .get('/api/moderation/control-panel/content-filter')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.zeroToleranceWords).toEqual(['slur']);
    expect(response.body.maturityCensoredWords).toEqual(['fuck']);
  });

  it('saves normalized content filter word lists', async () => {
    const app = buildApp();
    mockSiteContentFilterFindOneAndUpdate.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        zeroToleranceWords: ['Slur'],
        maturityCensoredWords: ['Fuck']
      })
    });

    const response = await request(app)
      .put('/api/moderation/control-panel/content-filter')
      .set('Authorization', 'Bearer token')
      .send({
        zeroToleranceWords: [' Slur ', 'slur'],
        maturityCensoredWords: ['Fuck', ' fuck ']
      });

    expect(response.status).toBe(200);
    expect(mockSiteContentFilterFindOneAndUpdate).toHaveBeenCalledWith(
      { key: 'global' },
      expect.objectContaining({
        $set: {
          zeroToleranceWords: ['Slur'],
          maturityCensoredWords: ['Fuck']
        }
      }),
      expect.objectContaining({ upsert: true, new: true, setDefaultsOnInsert: true })
    );
  });
});
