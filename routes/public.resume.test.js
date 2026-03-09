const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findOne: jest.fn()
};

const mockPost = {
  find: jest.fn(),
  countDocuments: jest.fn()
};

const mockBlockList = {
  findOne: jest.fn()
};

const mockResume = {
  findOne: jest.fn()
};
const mockFriendship = {
  findOne: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Post', () => mockPost);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/Resume', () => mockResume);
jest.mock('../models/Friendship', () => mockFriendship);

const jwt = require('jsonwebtoken');
const publicRouter = require('./public');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/public', publicRouter);
  return app;
};

const resolvedQuery = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value)
  })
});

const resolvedPostQuery = (value) => ({
  sort: jest.fn().mockReturnValue({
    skip: jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue(value)
          })
        })
      })
    })
  })
});

describe('Public resume routes', () => {
  const targetUser = {
    _id: '507f1f77bcf86cd799439011',
    username: 'alice',
    realName: 'Alice Doe',
    city: 'Austin',
    state: 'TX',
    country: 'US',
    registrationStatus: 'active',
    pgpPublicKey: null,
    createdAt: new Date('2026-03-01T00:00:00.000Z')
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    mockUser.findOne.mockReturnValue(resolvedQuery(targetUser));
    mockBlockList.findOne.mockReturnValue(resolvedQuery(null));
    mockResume.findOne.mockReturnValue(resolvedQuery(null));
    mockFriendship.findOne.mockReturnValue(resolvedQuery(null));
  });

  it('returns hosted resume for public visibility to guests', async () => {
    const app = buildApp();
    mockResume.findOne.mockReturnValue(resolvedQuery({
      visibility: 'public',
      basics: { headline: 'Security Engineer', summary: 'Building reliable systems.' },
      sections: [],
      createdAt: new Date('2026-02-20T00:00:00.000Z'),
      updatedAt: new Date('2026-03-02T00:00:00.000Z')
    }));

    const response = await request(app).get('/api/public/users/alice/resume');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.canManage).toBe(false);
    expect(response.body.resume.visibility).toBe('public');
    expect(response.body.resume.basics.headline).toBe('Security Engineer');
    expect(response.body.resumeUrl).toBe('/resume/alice');
  });

  it('returns not found for private resume to non-owner viewers', async () => {
    const app = buildApp();
    mockResume.findOne.mockReturnValue(resolvedQuery({
      visibility: 'private',
      basics: { headline: 'Private Resume' },
      sections: []
    }));

    const response = await request(app).get('/api/public/users/alice/resume');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/resume not found/i);
  });

  it('allows owner to access private resume via the public route', async () => {
    const app = buildApp();
    jwt.verify.mockReturnValue({ userId: '507f1f77bcf86cd799439011' });
    mockResume.findOne.mockReturnValue(resolvedQuery({
      visibility: 'private',
      basics: { headline: 'Private Resume' },
      sections: []
    }));

    const response = await request(app)
      .get('/api/public/users/alice/resume')
      .set('Authorization', 'Bearer owner-token');

    expect(response.status).toBe(200);
    expect(response.body.canManage).toBe(true);
    expect(response.body.resume.visibility).toBe('private');
  });

  it('adds discoverable resume metadata on public feed payloads only for public visibility', async () => {
    const app = buildApp();
    mockResume.findOne.mockReturnValueOnce(resolvedQuery({
      visibility: 'public',
      basics: { headline: 'Principal Engineer' },
      updatedAt: new Date('2026-03-03T00:00:00.000Z')
    }));
    mockPost.find.mockReturnValue(resolvedPostQuery([]));
    mockPost.countDocuments.mockResolvedValue(0);

    const response = await request(app).get('/api/public/users/alice/feed');

    expect(response.status).toBe(200);
    expect(response.body.user.hasPublicResume).toBe(true);
    expect(response.body.user.resumeUrl).toBe('/resume/alice');
    expect(response.body.user.resumeHeadline).toBe('Principal Engineer');
  });

  it('hides resume metadata on public feed payload when visibility is unlisted', async () => {
    const app = buildApp();
    mockResume.findOne.mockReturnValueOnce(resolvedQuery({
      visibility: 'unlisted',
      basics: { headline: 'Hidden headline' }
    }));
    mockPost.find.mockReturnValue(resolvedPostQuery([]));
    mockPost.countDocuments.mockResolvedValue(0);

    const response = await request(app).get('/api/public/users/alice/feed');

    expect(response.status).toBe(200);
    expect(response.body.user.hasPublicResume).toBe(false);
    expect(response.body.user.resumeUrl).toBeUndefined();
  });

  it('returns only limited data for private profiles on the public feed route', async () => {
    const app = buildApp();
    mockUser.findOne.mockReturnValue(resolvedQuery({
      ...targetUser,
      friendListPrivacy: 'private',
      topFriendsPrivacy: 'private'
    }));
    mockResume.findOne.mockReturnValueOnce(resolvedQuery({
      visibility: 'public',
      basics: { headline: 'Should stay hidden' }
    }));

    const response = await request(app).get('/api/public/users/alice/feed');

    expect(response.status).toBe(200);
    expect(response.body.user.isPrivateProfile).toBe(true);
    expect(response.body.user.hasPublicResume).toBe(false);
    expect(response.body.user.resumeUrl).toBeUndefined();
    expect(response.body.user.restrictedContent).toBe(true);
    expect(response.body.posts).toEqual([]);
    expect(response.body.pagination.total).toBe(0);
  });

  it('includes social-level personal info for friends and hides secure-only fields', async () => {
    const app = buildApp();
    jwt.verify.mockReturnValue({ userId: 'viewer-1' });
    mockUser.findOne.mockReturnValue(resolvedQuery({
      ...targetUser,
      worksAt: 'Acme Labs',
      hobbies: ['Cycling', 'Chess'],
      streetAddress: '123 Main St',
      profileFieldVisibility: {
        worksAt: 'social',
        hobbies: 'secure',
        streetAddress: 'secure'
      }
    }));
    mockFriendship.findOne.mockReturnValue(resolvedQuery({
      requester: 'viewer-1',
      requesterCategory: 'social',
      recipientCategory: 'social'
    }));
    mockPost.find.mockReturnValue(resolvedPostQuery([]));
    mockPost.countDocuments.mockResolvedValue(0);

    const response = await request(app)
      .get('/api/public/users/alice/feed')
      .set('Authorization', 'Bearer viewer-token');

    expect(response.status).toBe(200);
    expect(response.body.user.personalInfo).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'worksAt', value: 'Acme Labs', visibility: 'social' })
    ]));
    const visibleFieldIds = response.body.user.personalInfo.map((entry) => entry.id);
    expect(visibleFieldIds).not.toContain('hobbies');
    expect(visibleFieldIds).not.toContain('streetAddress');
  });
});
