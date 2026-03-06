const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findById: jest.fn()
};

const mockSession = {
  findOne: jest.fn()
};

const mockResume = {
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Session', () => mockSession);
jest.mock('../models/Resume', () => mockResume);

const jwt = require('jsonwebtoken');
const resumeRouter = require('./resume');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/resume', resumeRouter);
  return app;
};

const mockAuth = (userId = 'user-1') => {
  jwt.verify.mockImplementation(() => ({ userId }));
  const session = { save: jest.fn().mockResolvedValue(undefined) };
  mockSession.findOne.mockResolvedValue(session);
  mockUser.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ _id: userId })
  });
};

const validPayload = {
  basics: {
    fullName: 'Jane Smith',
    headline: 'Senior Engineer',
    email: 'jane@example.com',
    phone: '555-1234',
    city: 'Austin',
    state: 'TX',
    country: 'USA',
    website: 'https://example.com',
    profileLinks: [{ label: 'LinkedIn', url: 'https://linkedin.com/in/jane' }]
  },
  summary: 'Experienced software engineer.',
  experience: [
    {
      employer: 'Acme',
      title: 'Engineer',
      location: 'Austin, TX',
      startDate: '2022-01',
      endDate: '2023-12',
      isCurrent: false,
      bullets: ['Built systems']
    }
  ],
  education: [
    {
      institution: 'State University',
      degree: 'BS',
      fieldOfStudy: 'Computer Science',
      startDate: '2018-08',
      endDate: '2022-05',
      isCurrent: false,
      location: 'Austin, TX',
      bullets: ['Graduated']
    }
  ],
  skills: ['Node.js', 'React'],
  certifications: [],
  projects: [],
  visibility: 'private'
};

describe('Resume routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth();
  });

  it('returns null resume when none exists', async () => {
    const app = buildApp();
    mockResume.findOne.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/resume/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.resume).toBeNull();
  });

  it('rejects invalid experience date ranges', async () => {
    const app = buildApp();
    const payload = {
      ...validPayload,
      experience: [{
        employer: 'Acme',
        title: 'Engineer',
        startDate: '2024-12',
        endDate: '2024-01',
        isCurrent: false,
        bullets: []
      }]
    };

    const response = await request(app)
      .put('/api/resume/me')
      .set('Authorization', 'Bearer token')
      .send(payload);

    expect(response.status).toBe(400);
    expect(response.body.errors[0].msg).toMatch(/endDate/i);
    expect(mockResume.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('upserts and returns normalized resume payload', async () => {
    const app = buildApp();
    mockResume.findOneAndUpdate.mockResolvedValue({
      _id: 'resume-1',
      ownerId: 'user-1',
      basics: validPayload.basics,
      summary: validPayload.summary,
      experience: validPayload.experience,
      education: validPayload.education,
      skills: validPayload.skills,
      certifications: [],
      projects: [],
      visibility: 'private',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-02T00:00:00.000Z')
    });

    const response = await request(app)
      .put('/api/resume/me')
      .set('Authorization', 'Bearer token')
      .send(validPayload);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.resume.basics.fullName).toBe('Jane Smith');
    expect(mockResume.findOneAndUpdate).toHaveBeenCalledWith(
      { ownerId: 'user-1' },
      expect.objectContaining({
        $set: expect.objectContaining({
          visibility: 'private',
          isDeleted: false
        })
      }),
      expect.objectContaining({ upsert: true, new: true })
    );
  });

  it('soft-deletes a resume', async () => {
    const app = buildApp();
    mockResume.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

    const response = await request(app)
      .delete('/api/resume/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(mockResume.updateOne).toHaveBeenCalledWith(
      { ownerId: 'user-1', isDeleted: false },
      expect.objectContaining({
        $set: expect.objectContaining({ isDeleted: true })
      })
    );
  });

  it('validates telemetry event types', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/resume/me/telemetry')
      .set('Authorization', 'Bearer token')
      .send({ eventType: 'invalid_event' });

    expect(response.status).toBe(400);
  });
});
