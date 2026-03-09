const mockUser = jest.fn((data) => ({
  ...data,
  save: jest.fn().mockResolvedValue(true)
}));
mockUser.findOne = jest.fn();
mockUser.deleteMany = jest.fn().mockResolvedValue({ acknowledged: true, deletedCount: 0 });

jest.mock('../models/User', () => mockUser);
jest.mock('bcryptjs', () => ({
  hash: jest.fn()
}));

const bcrypt = require('bcryptjs');
const { ensureUniversalAdminAccount } = require('./universalAdmin');

describe('services/universalAdmin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates the universal admin account with hashed encryption password', async () => {
    mockUser.findOne.mockResolvedValue(null);
    bcrypt.hash
      .mockResolvedValueOnce('hashed-admin-password')
      .mockResolvedValueOnce('hashed-encryption-password');

    const result = await ensureUniversalAdminAccount({
      username: 'ADMIN',
      email: 'admin@socialsecure.local',
      password: 'AdminPass123',
      encryptionPassword: 'EncryptionPass123'
    });

    expect(bcrypt.hash).toHaveBeenNthCalledWith(1, 'AdminPass123', 12);
    expect(bcrypt.hash).toHaveBeenNthCalledWith(2, 'EncryptionPass123', 12);
    expect(mockUser).toHaveBeenCalledWith(expect.objectContaining({
      realName: 'Jared Hicks',
      username: 'admin',
      email: 'admin@socialsecure.local',
      passwordHash: 'hashed-admin-password',
      country: 'US',
      zipCode: '78666',
      encryptionPasswordHash: 'hashed-encryption-password',
      encryptionPasswordVersion: 1
    }));
    expect(mockUser.mock.calls[0][0].encryptionPasswordSetAt).toEqual(expect.any(Date));
    expect(result.created).toBe(true);
    expect(result.encryptionPasswordUpdated).toBe(true);
  });

  it('sets encryption password hash when existing admin account lacks one', async () => {
    const adminUser = {
      realName: 'System Administrator',
      isAdmin: true,
      registrationStatus: 'active',
      onboardingStatus: 'completed',
      onboardingStep: 4,
      mustResetPassword: false,
      country: null,
      zipCode: null,
      encryptionPasswordHash: null,
      save: jest.fn().mockResolvedValue(true)
    };
    mockUser.findOne.mockResolvedValue(adminUser);
    bcrypt.hash.mockResolvedValue('hashed-encryption-password');

    const result = await ensureUniversalAdminAccount({
      username: 'ADMIN',
      email: 'admin@socialsecure.local',
      password: 'AdminPass123',
      encryptionPassword: 'EncryptionPass123'
    });

    expect(bcrypt.hash).toHaveBeenCalledWith('EncryptionPass123', 12);
    expect(adminUser.encryptionPasswordHash).toBe('hashed-encryption-password');
    expect(adminUser.encryptionPasswordVersion).toBe(1);
    expect(adminUser.encryptionPasswordSetAt).toEqual(expect.any(Date));
    expect(adminUser.realName).toBe('Jared Hicks');
    expect(adminUser.country).toBe('US');
    expect(adminUser.zipCode).toBe('78666');
    expect(adminUser.save).toHaveBeenCalled();
    expect(result.encryptionPasswordUpdated).toBe(true);
  });

  it('wipes users and recreates admin account when existing admin is stuck in onboarding', async () => {
    mockUser.findOne.mockResolvedValueOnce({
      onboardingStatus: 'in_progress'
    });
    bcrypt.hash
      .mockResolvedValueOnce('hashed-admin-password')
      .mockResolvedValueOnce('hashed-encryption-password');

    const result = await ensureUniversalAdminAccount({
      username: 'ADMIN',
      email: 'admin@socialsecure.local',
      password: 'AdminPass123',
      encryptionPassword: 'EncryptionPass123'
    });

    expect(mockUser.deleteMany).toHaveBeenCalledWith({});
    expect(mockUser).toHaveBeenCalledWith(expect.objectContaining({
      username: 'admin',
      onboardingStatus: 'completed',
      onboardingStep: 4
    }));
    expect(result.created).toBe(true);
  });
});
