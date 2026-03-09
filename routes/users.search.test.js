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

describe('User search routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns default users sorted by friend count when criteria is empty', async () => {
    const app = buildApp();

    const leanMock = jest.fn().mockResolvedValue([
      {
        _id: 'u-top',
        username: 'topfriend',
        realName: 'Top Friend',
        city: 'Austin',
        state: 'TX',
        country: 'US',
        county: 'Travis',
        zipCode: '73301',
        avatarUrl: '',
        bannerUrl: '',
        friendCount: 99,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
        pgpPublicKey: 'pgp'
      },
      {
        _id: 'u-low',
        username: 'lowfriend',
        realName: 'Low Friend',
        city: 'Dallas',
        state: 'TX',
        country: 'US',
        county: 'Dallas',
        zipCode: '75001',
        avatarUrl: '',
        bannerUrl: '',
        friendCount: 2,
        createdAt: new Date('2026-03-02T00:00:00.000Z'),
        pgpPublicKey: null
      }
    ]);
    const limitMock = jest.fn().mockReturnValue({ lean: leanMock });
    const sortMock = jest.fn().mockReturnValue({ limit: limitMock });
    const selectMock = jest.fn().mockReturnValue({ sort: sortMock });
    mockUser.find.mockReturnValue({ select: selectMock });

    const response = await request(app).post('/api/users/search').send({});

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(sortMock).toHaveBeenCalledWith({ friendCount: -1, createdAt: -1 });
    expect(limitMock).toHaveBeenCalledWith(50);
    expect(response.body.users).toHaveLength(2);
    expect(response.body.users[0]).toMatchObject({
      _id: 'u-top',
      username: 'topfriend',
      hasPGP: true
    });
    expect(response.body.users[1]).toMatchObject({
      _id: 'u-low',
      username: 'lowfriend',
      hasPGP: false
    });
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
                avatarUrl: 'https://cdn.example.com/avatar-u1.jpg',
                bannerUrl: 'https://cdn.example.com/banner-u1.jpg',
                streetAddress: 'Austin, TX',
                worksAt: 'Acme Corp',
                hobbies: ['hiking', 'chess'],
                ageGroup: '25-34',
                sex: 'female',
                race: 'other',
                profileFieldVisibility: {
                  streetAddress: 'public',
                  worksAt: 'public',
                  hobbies: 'public',
                  ageGroup: 'public',
                  sex: 'secure',
                  race: 'public'
                },
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
                avatarUrl: '',
                bannerUrl: '',
                streetAddress: 'Dallas, TX',
                worksAt: 'Other Company',
                hobbies: ['music'],
                ageGroup: '35-44',
                sex: 'male',
                race: 'white',
                profileFieldVisibility: {
                  streetAddress: 'secure',
                  worksAt: 'social',
                  hobbies: 'social',
                  ageGroup: 'social',
                  sex: 'social',
                  race: 'social'
                },
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

    const response = await request(app).post('/api/users/search').send({
      firstName: 'Ali',
      city: 'Austin',
      worksAt: 'Acme',
      hobbies: 'hiking',
      streetAddress: 'Austin',
      race: 'other',
      friendsOfUser: 'sourceuser'
    });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0]).toMatchObject({
      _id: 'u-1',
      username: 'alice',
      hasPGP: true,
      avatarUrl: 'https://cdn.example.com/avatar-u1.jpg',
      bannerUrl: 'https://cdn.example.com/banner-u1.jpg'
    });
    expect(response.body.users[0].rankingScore).toBeGreaterThan(0);
    expect(response.body.unsupportedCriteria).toEqual([]);
  });

  it('keeps legacy GET search working for q-based lookups', async () => {
    const app = buildApp();

    mockUser.find.mockReturnValue({
      select: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue([
            {
              _id: 'u-legacy',
              username: 'legacy',
              realName: 'Legacy User',
              city: 'Austin',
              state: 'TX',
              country: 'US',
              pgpPublicKey: null
            }
          ])
        })
      })
    });

    const response = await request(app).get('/api/users/search').query({ q: 'leg' });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.users).toHaveLength(1);
    expect(response.body.users[0].username).toBe('legacy');
  });
});
