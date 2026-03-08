const request = require('supertest');
const express = require('express');

const mockUser = {
  find: jest.fn(),
  findOne: jest.fn()
};

const mockBlockList = {
  findOne: jest.fn()
};

const mockFriendship = {
  find: jest.fn()
};

const mockResume = {
  find: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/BlockList', () => mockBlockList);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/Resume', () => mockResume);

const usersRouter = require('./users');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

describe('GET /api/users/search', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requires at least one search criteria field', async () => {
    const app = buildApp();
    const response = await request(app).get('/api/users/search');

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/at least one search criteria/i);
  });

  it('returns ranked users using optional criteria and friend/work matching', async () => {
    const app = buildApp();

    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        sort: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            lean: jest.fn().mockResolvedValue([
              {
                _id: 'u-1',
                username: 'alice',
                realName: 'Alice Johnson',
                city: 'Austin',
                state: 'TX',
                county: 'Travis',
                zipCode: '73301',
                phone: '512-555-1111',
                country: 'US',
                bio: 'Runner and reader',
                friendCount: 10,
                createdAt: new Date('2026-03-01T00:00:00.000Z'),
                pgpPublicKey: 'pgp'
              },
              {
                _id: 'u-2',
                username: 'bob',
                realName: 'Bob Smith',
                city: 'Dallas',
                state: 'TX',
                county: 'Dallas',
                zipCode: '75001',
                phone: '214-555-2222',
                country: 'US',
                bio: 'Cycling and games',
                friendCount: 2,
                createdAt: new Date('2026-03-02T00:00:00.000Z'),
                pgpPublicKey: null
              }
            ])
          })
        })
      })
    });

    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'source-1' })
      })
    });

    mockFriendship.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          { requester: 'source-1', recipient: 'u-1', status: 'accepted' }
        ])
      })
    });

    mockResume.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            ownerId: 'u-1',
            summary: 'Enjoys hiking and chess',
            skills: ['hiking', 'chess'],
            experience: [{ employer: 'Acme Corp' }]
          },
          {
            ownerId: 'u-2',
            summary: 'Music and travel',
            skills: ['music'],
            experience: [{ employer: 'Other Company' }]
          }
        ])
      })
    });

    const response = await request(app).get('/api/users/search').query({
      firstName: 'Ali',
      city: 'Austin',
      worksAt: 'Acme',
      hobbies: 'hiking',
      friendsOfUser: 'sourceuser'
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0]).toMatchObject({
      _id: 'u-1',
      username: 'alice',
      hasPGP: true
    });
    expect(response.body.users[0].rankingScore).toBeGreaterThan(0);
  });
});
