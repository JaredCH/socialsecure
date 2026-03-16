const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('bcryptjs', () => ({
  hash: jest.fn()
}));

const mockUser = { findById: jest.fn() };
jest.mock('../models/User', () => mockUser);

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const authRouter = require('./auth');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  return app;
};

describe('Auth encryption-password endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockReturnValue({ userId: 'user-1' });
  });

  it('returns encryption-password status for authenticated user', async () => {
    const app = buildApp();
    mockUser.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        encryptionPasswordHash: null,
        encryptionPasswordSetAt: null,
        encryptionPasswordVersion: 0
      })
    });

    const response = await request(app)
      .get('/api/auth/encryption-password/status')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.hasEncryptionPassword).toBe(false);
    expect(response.body.encryptionPasswordVersion).toBe(0);
  });

  it('sets initial encryption password with hashed value only', async () => {
    const app = buildApp();
    const user = {
      encryptionPasswordHash: null,
      encryptionPasswordSetAt: null,
      encryptionPasswordVersion: 0,
      save: jest.fn().mockResolvedValue(true)
    };

    mockUser.findById.mockResolvedValue(user);
    bcrypt.hash.mockResolvedValue('hashed-encryption-password');

    const response = await request(app)
      .post('/api/auth/encryption-password/set')
      .set('Authorization', 'Bearer token')
      .send({
        encryptionPassword: 'NewStrongPass1',
        confirmEncryptionPassword: 'NewStrongPass1'
      });

    expect(response.status).toBe(200);
    expect(bcrypt.hash).toHaveBeenCalledWith('NewStrongPass1', 12);
    expect(user.encryptionPasswordHash).toBe('hashed-encryption-password');
    expect(user.encryptionPasswordVersion).toBe(1);
  });

  it('rejects set when confirmation does not match', async () => {
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/encryption-password/set')
      .set('Authorization', 'Bearer token')
      .send({
        encryptionPassword: 'NewStrongPass1',
        confirmEncryptionPassword: 'MismatchPass1'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/confirmation does not match/i);
  });

  it('requires correct current encryption password when changing', async () => {
    const app = buildApp();
    const user = {
      encryptionPasswordHash: 'existing-hash',
      encryptionPasswordVersion: 1,
      compareEncryptionPassword: jest.fn().mockResolvedValue(false),
      save: jest.fn().mockResolvedValue(true)
    };

    mockUser.findById.mockResolvedValue(user);

    const response = await request(app)
      .post('/api/auth/encryption-password/change')
      .set('Authorization', 'Bearer token')
      .send({
        currentEncryptionPassword: 'WrongPass1',
        newEncryptionPassword: 'AnotherStrongPass1',
        confirmNewEncryptionPassword: 'AnotherStrongPass1'
      });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/incorrect/i);
  });

  it('changes encryption password and increments version', async () => {
    const app = buildApp();
    const user = {
      encryptionPasswordHash: 'existing-hash',
      encryptionPasswordSetAt: new Date('2024-01-01T00:00:00.000Z'),
      encryptionPasswordVersion: 2,
      compareEncryptionPassword: jest.fn().mockResolvedValue(true),
      save: jest.fn().mockResolvedValue(true)
    };

    mockUser.findById.mockResolvedValue(user);
    bcrypt.hash.mockResolvedValue('new-hashed-encryption-password');

    const response = await request(app)
      .post('/api/auth/encryption-password/change')
      .set('Authorization', 'Bearer token')
      .send({
        currentEncryptionPassword: 'CurrentPass1',
        newEncryptionPassword: 'AnotherStrongPass1',
        confirmNewEncryptionPassword: 'AnotherStrongPass1'
      });

    expect(response.status).toBe(200);
    expect(user.compareEncryptionPassword).toHaveBeenCalledWith('CurrentPass1');
    expect(user.encryptionPasswordHash).toBe('new-hashed-encryption-password');
    expect(user.encryptionPasswordVersion).toBe(3);
  });

  it('returns bad request when verify endpoint gets incorrect encryption password', async () => {
    const app = buildApp();
    const user = {
      registrationStatus: 'active',
      encryptionPasswordHash: 'existing-hash',
      encryptionPasswordVersion: 1,
      compareEncryptionPassword: jest.fn().mockResolvedValue(false)
    };

    mockUser.findById.mockResolvedValue(user);

    const response = await request(app)
      .post('/api/auth/encryption-password/verify')
      .set('Authorization', 'Bearer token')
      .send({
        encryptionPassword: 'WrongPass1'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/incorrect/i);
  });

  it('saves a valid armored public PGP key', async () => {
    const app = buildApp();
    const user = {
      pgpPublicKey: null,
      save: jest.fn().mockResolvedValue(true)
    };

    mockUser.findById.mockResolvedValue(user);

    const response = await request(app)
      .post('/api/auth/pgp/setup')
      .set('Authorization', 'Bearer token')
      .send({
        publicKey: '-----BEGIN PGP PUBLIC KEY BLOCK-----\nabc123\n-----END PGP PUBLIC KEY BLOCK-----'
      });

    expect(response.status).toBe(200);
    expect(response.body.hasPGP).toBe(true);
    expect(user.pgpPublicKey).toContain('BEGIN PGP PUBLIC KEY BLOCK');
    expect(user.save).toHaveBeenCalled();
  });

  it('rejects private PGP key block submission with explicit error', async () => {
    const app = buildApp();
    const user = {
      pgpPublicKey: null,
      save: jest.fn().mockResolvedValue(true)
    };

    mockUser.findById.mockResolvedValue(user);

    const response = await request(app)
      .post('/api/auth/pgp/setup')
      .set('Authorization', 'Bearer token')
      .send({
        publicKey: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nsecret\n-----END PGP PRIVATE KEY BLOCK-----'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/private key blocks are not allowed/i);
    expect(user.save).not.toHaveBeenCalled();
  });
});
