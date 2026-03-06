const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = { findOne: jest.fn() };
const mockGalleryImage = {
  find: jest.fn(),
  countDocuments: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/GalleryImage', () => mockGalleryImage);

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

describe('Gallery routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns gallery items with reaction counts', async () => {
    const app = buildApp();
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });

    const imageDoc = {
      _id: 'img-1',
      ownerId: 'owner-1',
      mediaUrl: 'https://example.com/photo.jpg',
      mediaType: 'url',
      caption: 'Caption',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      getReactionCounts: jest.fn().mockReturnValue({ likesCount: 3, dislikesCount: 1 }),
      getViewerReaction: jest.fn().mockReturnValue(null)
    };

    mockGalleryImage.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([imageDoc])
    });
    mockGalleryImage.countDocuments.mockResolvedValue(1);

    const response = await request(app).get('/api/gallery/owner');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({
      _id: 'img-1',
      likesCount: 3,
      dislikesCount: 1,
      mediaUrl: 'https://example.com/photo.jpg'
    });
  });

  it('rejects create when requester is not owner', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'viewer-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });

    const response = await request(app)
      .post('/api/gallery/owner-1')
      .set('Authorization', 'Bearer token')
      .send({ mediaUrl: 'https://example.com/photo.jpg' });

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/only the owner/i);
  });

  it('rejects create for non-http/https image URL', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'owner-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const response = await request(app)
      .post('/api/gallery/owner-1')
      .set('Authorization', 'Bearer token')
      .send({ mediaUrl: 'ftp://example.com/photo.jpg' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/http\/https/i);
  });

  it('accepts URL without a recognized image file extension', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'owner-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const createdDoc = {
      _id: 'img-cdn',
      ownerId: 'owner-1',
      mediaUrl: 'https://cdn.example.com/media/abc123',
      mediaType: 'url',
      caption: '',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      getReactionCounts: jest.fn().mockReturnValue({ likesCount: 0, dislikesCount: 0 }),
      getViewerReaction: jest.fn().mockReturnValue(null)
    };
    mockGalleryImage.create.mockResolvedValue(createdDoc);

    const response = await request(app)
      .post('/api/gallery/owner-1')
      .set('Authorization', 'Bearer token')
      .send({ mediaUrl: 'https://cdn.example.com/media/abc123' });

    expect(response.status).toBe(201);
    expect(response.body.item).toMatchObject({
      _id: 'img-cdn',
      mediaUrl: 'https://cdn.example.com/media/abc123'
    });
  });

  it('creates gallery image for owner via URL', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'owner-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const createdDoc = {
      _id: 'img-created',
      ownerId: 'owner-1',
      mediaUrl: 'https://example.com/photo.jpg',
      mediaType: 'url',
      caption: 'hello',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      getReactionCounts: jest.fn().mockReturnValue({ likesCount: 0, dislikesCount: 0 }),
      getViewerReaction: jest.fn().mockReturnValue(null)
    };
    mockGalleryImage.create.mockResolvedValue(createdDoc);

    const response = await request(app)
      .post('/api/gallery/owner-1')
      .set('Authorization', 'Bearer token')
      .send({ mediaUrl: 'https://example.com/photo.jpg', caption: 'hello' });

    expect(response.status).toBe(201);
    expect(response.body.item).toMatchObject({
      _id: 'img-created',
      mediaUrl: 'https://example.com/photo.jpg',
      caption: 'hello'
    });
    expect(mockGalleryImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        mediaUrl: 'https://example.com/photo.jpg',
        caption: 'hello'
      })
    );
  });

  it('creates gallery image when URL payload uses url alias', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'owner-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const createdDoc = {
      _id: 'img-url-alias',
      ownerId: 'owner-1',
      mediaUrl: 'https://example.com/photo.jpg',
      mediaType: 'url',
      caption: '',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      getReactionCounts: jest.fn().mockReturnValue({ likesCount: 0, dislikesCount: 0 }),
      getViewerReaction: jest.fn().mockReturnValue(null)
    };
    mockGalleryImage.create.mockResolvedValue(createdDoc);

    const response = await request(app)
      .post('/api/gallery/owner-1')
      .set('Authorization', 'Bearer token')
      .send({ url: 'https://example.com/photo.jpg' });

    expect(response.status).toBe(201);
    expect(mockGalleryImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: 'https://example.com/photo.jpg'
      })
    );
  });

  it('rejects create for blocked host URL', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'owner-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const response = await request(app)
      .post('/api/gallery/owner-1')
      .set('Authorization', 'Bearer token')
      .send({ mediaUrl: 'https://localhost/photo.jpg' });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/host is blocked/i);
  });

  it('normalizes gallery URL by removing fragment before persistence', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'owner-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });
    mockGalleryImage.countDocuments.mockResolvedValue(0);

    const createdDoc = {
      _id: 'img-normalized',
      ownerId: 'owner-1',
      mediaUrl: 'https://example.com/photo.jpg',
      mediaType: 'url',
      caption: '',
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      getReactionCounts: jest.fn().mockReturnValue({ likesCount: 0, dislikesCount: 0 }),
      getViewerReaction: jest.fn().mockReturnValue(null)
    };
    mockGalleryImage.create.mockResolvedValue(createdDoc);

    const response = await request(app)
      .post('/api/gallery/owner-1')
      .set('Authorization', 'Bearer token')
      .send({ mediaUrl: 'https://example.com/photo.jpg#section' });

    expect(response.status).toBe(201);
    expect(mockGalleryImage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        mediaUrl: 'https://example.com/photo.jpg'
      })
    );
  });

  it('rejects delete when requester is not owner', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'viewer-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });

    const response = await request(app)
      .delete('/api/gallery/owner-1/img-1')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/only the owner/i);
  });

  it('applies like/dislike reaction toggle endpoint for authenticated user', async () => {
    const app = buildApp();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'viewer-1' }));
    mockOwnerLookup({ _id: 'owner-1', username: 'owner' });

    const imageDoc = {
      applyReaction: jest.fn().mockReturnValue({
        viewerReaction: 'like',
        likesCount: 1,
        dislikesCount: 0
      }),
      save: jest.fn().mockResolvedValue(true)
    };
    mockGalleryImage.findOne.mockResolvedValue(imageDoc);

    const response = await request(app)
      .post('/api/gallery/owner-1/image-1/reaction')
      .set('Authorization', 'Bearer token')
      .send({ type: 'like' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      reaction: 'like',
      likesCount: 1,
      dislikesCount: 0
    });
    expect(imageDoc.applyReaction).toHaveBeenCalledWith('viewer-1', 'like');
  });
});
