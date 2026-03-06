const bcrypt = require('bcryptjs');
const User = require('../models/User');

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

  let adminUser = await User.findOne({ username: normalizedUsername });
  const now = new Date();

  if (!adminUser) {
    const passwordHash = await bcrypt.hash(password, 12);
    const encryptionPasswordHash = encryptionPassword
      ? await bcrypt.hash(encryptionPassword, 12)
      : null;

    adminUser = new User({
      realName: 'System Administrator',
      username: normalizedUsername,
      email,
      passwordHash,
      country: 'US',
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

  if (!adminUser.isAdmin || adminUser.registrationStatus !== 'active') {
    adminUser.isAdmin = true;
    adminUser.registrationStatus = 'active';
    updated = true;
    privilegesRepaired = true;
  }

  if (!adminUser.encryptionPasswordHash && encryptionPassword) {
    adminUser.encryptionPasswordHash = await bcrypt.hash(encryptionPassword, 12);
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
