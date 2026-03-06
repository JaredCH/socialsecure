const bcrypt = require('bcryptjs');
const User = require('../models/User');

const ADMIN_PROFILE = {
  realName: 'Jared Hicks',
  country: 'US',
  zipCode: '78666'
};

const ensureUniversalAdminAccount = async ({
  username,
  email,
  password,
  encryptionPassword
} = {}) => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (!normalizedUsername) {
    throw new Error('Universal admin username is required');
  }

  const resolvedEmail = typeof email === 'string' ? email.trim() : '';
  const resolvedPassword = typeof password === 'string' ? password : '';
  const resolvedEncryptionPassword = typeof encryptionPassword === 'string' ? encryptionPassword : '';

  if (!resolvedEmail) {
    throw new Error('Universal admin email is required');
  }
  if (!resolvedPassword) {
    throw new Error('Universal admin password is required');
  }

  let adminUser = await User.findOne({ username: normalizedUsername });
  const now = new Date();

  if (!adminUser) {
    const passwordHash = await bcrypt.hash(resolvedPassword, 12);
    const encryptionPasswordHash = resolvedEncryptionPassword
      ? await bcrypt.hash(resolvedEncryptionPassword, 12)
      : null;

    adminUser = new User({
      realName: ADMIN_PROFILE.realName,
      username: normalizedUsername,
      email: resolvedEmail,
      passwordHash,
      country: ADMIN_PROFILE.country,
      zipCode: ADMIN_PROFILE.zipCode,
      registrationStatus: 'active',
      isAdmin: true,
      onboardingStatus: 'completed',
      onboardingStep: 4,
      mustResetPassword: false,
      encryptionPasswordHash,
      encryptionPasswordSetAt: encryptionPasswordHash ? now : null,
      encryptionPasswordVersion: encryptionPasswordHash ? 1 : 0
    });
    await adminUser.save();
    console.log('Universal ADMIN account created.');
    if (encryptionPasswordHash) {
      console.log('Universal ADMIN encryption password set.');
    }
    return { created: true, updated: false, encryptionPasswordUpdated: !!encryptionPasswordHash };
  }

  let updated = false;
  let privilegesRepaired = false;
  let encryptionPasswordUpdated = false;

  if (adminUser.realName !== ADMIN_PROFILE.realName) {
    adminUser.realName = ADMIN_PROFILE.realName;
    updated = true;
  }

  if (adminUser.country !== ADMIN_PROFILE.country) {
    adminUser.country = ADMIN_PROFILE.country;
    updated = true;
  }

  if (adminUser.zipCode !== ADMIN_PROFILE.zipCode) {
    adminUser.zipCode = ADMIN_PROFILE.zipCode;
    updated = true;
  }

  if (!adminUser.isAdmin || adminUser.registrationStatus !== 'active') {
    adminUser.isAdmin = true;
    adminUser.registrationStatus = 'active';
    updated = true;
    privilegesRepaired = true;
  }

  if (!adminUser.encryptionPasswordHash && resolvedEncryptionPassword) {
    adminUser.encryptionPasswordHash = await bcrypt.hash(resolvedEncryptionPassword, 12);
    adminUser.encryptionPasswordSetAt = now;
    adminUser.encryptionPasswordVersion = 1;
    updated = true;
    encryptionPasswordUpdated = true;
  }

  if (updated) {
    adminUser.updatedAt = now;
    await adminUser.save();
  }

  if (privilegesRepaired) {
    console.log('Universal ADMIN account privileges repaired.');
  }
  if (encryptionPasswordUpdated) {
    console.log('Universal ADMIN encryption password set.');
  }

  return { created: false, updated, encryptionPasswordUpdated };
};

module.exports = { ensureUniversalAdminAccount };
