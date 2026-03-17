const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = { findOne: jest.fn() };
const mockGalleryImage = {
  find: jest.fn(),
  countDocuments: jest.fn(),
  findOne: jest.fn()
};
const mockFriendship = { findOne: jest.fn() };

jest.mock('../models/User', () => mockUser);
jest.mock('../models/GalleryImage', () => mockGalleryImage);
jest.mock('../models/Friendship', () => mockFriendship);

const jwt = require('jsonwebtoken');
const galleryRouter = require('./gallery');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/gallery', galleryRouter);
  return app;
};

const mockOwnerLookup = (owner) => {
  mockUser.findOne.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(owner)
    })
  });
};

describe('Gallery relationship audience enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('filters unauthenticated gallery lists to public audience', async () => {
    const app = buildApp();
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockGalleryImage.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([])
    });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const response = await request(app).get('/api/gallery/owner');

    expect(response.status).toBe(200);
    expect(mockGalleryImage.find).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: 'owner-1',
      relationshipAudience: 'public'
    }));
  });

  it('does not apply social-only filter for secure friends', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'viewer-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockFriendship.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          status: 'accepted',
          requester: 'owner-1',
          recipient: 'viewer-1',
          requesterRelationshipAudience: 'secure'
        })
      })
    });
    mockGalleryImage.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([])
    });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const response = await request(app)
      .get('/api/gallery/owner')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(mockGalleryImage.find).toHaveBeenCalledWith({ ownerId: 'owner-1' });
  });
});
