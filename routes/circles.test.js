const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findById: jest.fn()
};

const mockFriendship = {
  findOne: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Friendship', () => mockFriendship);

const jwt = require('jsonwebtoken');
const circlesRouter = require('./circles');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/circles', circlesRouter);
  return app;
};

describe('Circles routes limits', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockReturnValue({ userId: '507f1f77bcf86cd799439011' });
  });

  it('blocks creating more than 10 circles for a user', async () => {
    const app = buildApp();
    const save = jest.fn();
    mockUser.findById.mockResolvedValue({
      circles: Array.from({ length: 10 }).map((_, index) => ({ name: `Circle ${index + 1}` })),
      save
    });

    const response = await request(app)
      .post('/api/circles')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Overflow Circle' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('up to 10 circles');
    expect(save).not.toHaveBeenCalled();
  });

  it('blocks adding members past 25 per circle', async () => {
    const app = buildApp();
    const save = jest.fn();
    mockFriendship.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue({ status: 'accepted' })
    });
    mockUser.findById.mockResolvedValue({
      circles: [{
        name: 'Trusted',
        members: Array.from({ length: 25 }).map((_, index) => `507f1f77bcf86cd7994390${index.toString(16).padStart(2, '0')}`)
      }],
      save
    });

    const response = await request(app)
      .post('/api/circles/Trusted/members')
      .set('Authorization', 'Bearer token')
      .send({ userId: '507f1f77bcf86cd799439099' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('limit is 25');
    expect(save).not.toHaveBeenCalled();
  });
});
