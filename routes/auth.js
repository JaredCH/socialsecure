const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');

const PROFILE_THEMES = ['default', 'light', 'dark', 'sunset', 'forest'];
const ENCRYPTION_PASSWORD_MIN_LENGTH = 8;
const MAX_PGP_PUBLIC_KEY_LENGTH = 20000;
const PGP_PUBLIC_KEY_BEGIN = '-----BEGIN PGP PUBLIC KEY BLOCK-----';
const PGP_PUBLIC_KEY_END = '-----END PGP PUBLIC KEY BLOCK-----';
const PGP_PRIVATE_KEY_BEGIN = '-----BEGIN PGP PRIVATE KEY BLOCK-----';
const PGP_PRIVATE_KEY_END = '-----END PGP PRIVATE KEY BLOCK-----';
const ONBOARDING_TOTAL_STEPS = 4;

const isSafeHttpUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (error) {
    return false;
  }
};

const normalizeLinks = (links) => {
  if (!Array.isArray(links)) return [];

  return links
    .map((link) => {
      if (typeof link === 'string') {
        return link.trim();
      }

      if (link && typeof link === 'object' && typeof link.url === 'string') {
        return link.url.trim();
      }

      return '';
    })
    .filter(Boolean);
};

const normalizePgpPublicKey = (value) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim();
};

const getPgpPublicKeyValidationError = (publicKey) => {
  if (!publicKey) {
    return 'PGP public key is required';
  }

  if (publicKey.length > MAX_PGP_PUBLIC_KEY_LENGTH) {
    return `PGP public key must be at most ${MAX_PGP_PUBLIC_KEY_LENGTH} characters`;
  }

  if (publicKey.includes(PGP_PRIVATE_KEY_BEGIN) || publicKey.includes(PGP_PRIVATE_KEY_END)) {
    return 'Private key blocks are not allowed. Please submit only a public key block.';
  }

  if (!publicKey.includes(PGP_PUBLIC_KEY_BEGIN) || !publicKey.includes(PGP_PUBLIC_KEY_END)) {
    return 'Invalid PGP public key format. Expected an armored public key block.';
  }

  return null;
};

// Generate JWT token
const generateToken = (userId, onboardingStatus = 'pending') => {
  return jwt.sign(
    { userId, onboardingStatus },
    process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    { expiresIn: '24h' }
  );
};

const getUserFromBearerToken = async (req, select = '') => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId).select(select);
    if (!user) {
      return { error: 'User not found', status: 404 };
    }

    return { user, decoded };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
};

const sanitizeSecurityPreferences = (input = {}) => {
  const defaults = {
    loginNotifications: true,
    sessionTimeout: 60,
    requirePasswordForSensitive: true
  };

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return defaults;
  }

  const sessionTimeout = Number.parseInt(input.sessionTimeout, 10);

  return {
    loginNotifications: typeof input.loginNotifications === 'boolean'
      ? input.loginNotifications
      : defaults.loginNotifications,
    sessionTimeout: Number.isInteger(sessionTimeout)
      ? Math.min(Math.max(sessionTimeout, 5), 1440)
      : defaults.sessionTimeout,
    requirePasswordForSensitive: typeof input.requirePasswordForSensitive === 'boolean'
      ? input.requirePasswordForSensitive
      : defaults.requirePasswordForSensitive
  };
};

const buildCompletedSteps = (status, onboardingStep) => {
  if (status === 'completed') {
    return [1, 2, 3, 4];
  }

  const step = Number.isInteger(onboardingStep) ? onboardingStep : 1;
  const maxCompleted = Math.max(Math.min(step - 1, ONBOARDING_TOTAL_STEPS), 0);
  return Array.from({ length: maxCompleted }, (_, index) => index + 1);
};

// Register new user
router.post('/register', [
  body('realName').trim().notEmpty().withMessage('Real name is required'),
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_.]+$/)
    .withMessage('Username can only contain letters, numbers, underscores, and dots'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('referralCode').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { realName, username, email, password, city, state, country, referralCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ 
        error: existingUser.email === email ? 'Email already registered' : 'Username already taken' 
      });
    }

    // Generate universal ID
    const universalId = User.generateUniversalId(email);

    // Create new user
    const user = new User({
      universalId,
      realName,
      username,
      email,
      passwordHash: password, // Will be hashed by pre-save middleware
      city,
      state,
      country,
      registrationStatus: 'active',
      referralCode: referralCode || require('crypto').randomBytes(4).toString('hex')
    });

    await user.save();

    // Generate token
    const token = generateToken(user._id, user.onboardingStatus || 'pending');

    res.status(201).json({
      message: 'Registration successful',
      user: user.toPublicProfile(),
      token,
      expiresIn: 86400 // 24 hours in seconds
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Login user
router.post('/login', [
  body('identifier').trim().notEmpty().withMessage('Email or username is required'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { identifier, password } = req.body;

    // Find user by email or username
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase() },
        { username: identifier.toLowerCase() }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is active
    if (user.registrationStatus !== 'active') {
      return res.status(403).json({ error: 'Account is not active' });
    }

    // Generate token
    const token = generateToken(user._id, user.onboardingStatus || 'pending');

    res.json({
      message: 'Login successful',
      user: user.toPublicProfile(),
      token,
      expiresIn: 86400
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const auth = await getUserFromBearerToken(req, '-passwordHash -encryptionPasswordHash');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    res.json({ user: auth.user.toPublicProfile() });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.get('/onboarding-status', async (req, res) => {
  try {
    const auth = await getUserFromBearerToken(req, 'onboardingStatus onboardingStep securityPreferences');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const status = auth.user.onboardingStatus || 'pending';
    const currentStep = status === 'completed'
      ? ONBOARDING_TOTAL_STEPS
      : Math.min(Math.max(auth.user.onboardingStep || 1, 1), ONBOARDING_TOTAL_STEPS);

    res.json({
      status,
      currentStep,
      completedSteps: buildCompletedSteps(status, currentStep),
      securityPreferences: auth.user.securityPreferences || sanitizeSecurityPreferences()
    });
  } catch (error) {
    console.error('Onboarding status error:', error);
    res.status(500).json({ error: 'Failed to fetch onboarding status' });
  }
});

router.post('/onboarding/progress', [
  body('step').isInt({ min: 1, max: ONBOARDING_TOTAL_STEPS }).withMessage('Step must be between 1 and 4'),
  body('data').optional().isObject().withMessage('data must be an object')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const auth = await getUserFromBearerToken(req, 'onboardingStatus onboardingStep securityPreferences');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const requestedStep = Number.parseInt(req.body.step, 10);
    const user = auth.user;

    if (user.onboardingStatus === 'completed') {
      return res.json({
        success: true,
        nextStep: ONBOARDING_TOTAL_STEPS,
        status: 'completed'
      });
    }

    if (requestedStep === 4) {
      user.securityPreferences = sanitizeSecurityPreferences(req.body?.data);
    }

    const previousStep = Number.isInteger(user.onboardingStep) ? user.onboardingStep : 1;
    const advancedStep = Math.max(previousStep, requestedStep + 1);

    user.onboardingStatus = advancedStep > 1 ? 'in_progress' : 'pending';
    user.onboardingStep = Math.min(advancedStep, ONBOARDING_TOTAL_STEPS);
    user.updatedAt = new Date();
    await user.save();

    res.json({
      success: true,
      nextStep: Math.min(requestedStep + 1, ONBOARDING_TOTAL_STEPS),
      status: user.onboardingStatus,
      currentStep: user.onboardingStep
    });
  } catch (error) {
    console.error('Onboarding progress error:', error);
    res.status(500).json({ error: 'Failed to update onboarding progress' });
  }
});

router.post('/onboarding/complete', [
  body('securityPreferences').optional().isObject().withMessage('securityPreferences must be an object')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const auth = await getUserFromBearerToken(req, 'onboardingStatus onboardingStep securityPreferences');
    if (auth.error) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const user = auth.user;
    if (req.body?.securityPreferences) {
      user.securityPreferences = sanitizeSecurityPreferences(req.body.securityPreferences);
    }

    user.onboardingStatus = 'completed';
    user.onboardingStep = ONBOARDING_TOTAL_STEPS;
    user.updatedAt = new Date();
    await user.save();

    const token = generateToken(user._id, 'completed');

    res.json({
      success: true,
      status: 'completed',
      currentStep: ONBOARDING_TOTAL_STEPS,
      completedSteps: [1, 2, 3, 4],
      token
    });
  } catch (error) {
    console.error('Onboarding completion error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  }
});

// Get encryption-password status
router.get('/encryption-password/status', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId).select('encryptionPasswordHash encryptionPasswordSetAt encryptionPasswordVersion');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      hasEncryptionPassword: !!user.encryptionPasswordHash,
      encryptionPasswordSetAt: user.encryptionPasswordSetAt || null,
      encryptionPasswordVersion: user.encryptionPasswordVersion || 0
    });
  } catch (error) {
    console.error('Encryption password status error:', error);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Set initial encryption password
router.post('/encryption-password/set', [
  body('encryptionPassword')
    .isString()
    .withMessage('Encryption password is required')
    .isLength({ min: ENCRYPTION_PASSWORD_MIN_LENGTH })
    .withMessage(`Encryption password must be at least ${ENCRYPTION_PASSWORD_MIN_LENGTH} characters`),
  body('confirmEncryptionPassword')
    .isString()
    .withMessage('Encryption password confirmation is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { encryptionPassword, confirmEncryptionPassword } = req.body;
    if (encryptionPassword !== confirmEncryptionPassword) {
      return res.status(400).json({ error: 'Encryption password confirmation does not match' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.encryptionPasswordHash) {
      return res.status(409).json({ error: 'Encryption password is already set. Use change endpoint.' });
    }

    user.encryptionPasswordHash = await bcrypt.hash(encryptionPassword, 12);
    user.encryptionPasswordSetAt = new Date();
    user.encryptionPasswordVersion = 1;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Encryption password set successfully',
      hasEncryptionPassword: true,
      encryptionPasswordSetAt: user.encryptionPasswordSetAt,
      encryptionPasswordVersion: user.encryptionPasswordVersion
    });
  } catch (error) {
    console.error('Set encryption password error:', error);
    res.status(500).json({ error: 'Failed to set encryption password', details: error.message });
  }
});

// Change existing encryption password
router.post('/encryption-password/change', [
  body('currentEncryptionPassword')
    .isString()
    .withMessage('Current encryption password is required'),
  body('newEncryptionPassword')
    .isString()
    .withMessage('New encryption password is required')
    .isLength({ min: ENCRYPTION_PASSWORD_MIN_LENGTH })
    .withMessage(`New encryption password must be at least ${ENCRYPTION_PASSWORD_MIN_LENGTH} characters`),
  body('confirmNewEncryptionPassword')
    .isString()
    .withMessage('New encryption password confirmation is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const { currentEncryptionPassword, newEncryptionPassword, confirmNewEncryptionPassword } = req.body;
    if (newEncryptionPassword !== confirmNewEncryptionPassword) {
      return res.status(400).json({ error: 'New encryption password confirmation does not match' });
    }
    if (currentEncryptionPassword === newEncryptionPassword) {
      return res.status(400).json({ error: 'New encryption password must be different from current password' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.encryptionPasswordHash) {
      return res.status(400).json({ error: 'Encryption password is not set. Use set endpoint first.' });
    }

    const isCurrentPasswordValid = await user.compareEncryptionPassword(currentEncryptionPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json({ error: 'Current encryption password is incorrect' });
    }

    user.encryptionPasswordHash = await bcrypt.hash(newEncryptionPassword, 12);
    user.encryptionPasswordSetAt = new Date();
    user.encryptionPasswordVersion = (user.encryptionPasswordVersion || 1) + 1;
    user.updatedAt = new Date();
    await user.save();

    res.json({
      message: 'Encryption password changed successfully',
      hasEncryptionPassword: true,
      encryptionPasswordSetAt: user.encryptionPasswordSetAt,
      encryptionPasswordVersion: user.encryptionPasswordVersion
    });
  } catch (error) {
    console.error('Change encryption password error:', error);
    res.status(500).json({ error: 'Failed to change encryption password', details: error.message });
  }
});

// Verify encryption password and create 12-hour unlock session
router.post('/encryption-password/verify', [
  body('encryptionPassword')
    .isString()
    .withMessage('Encryption password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { encryptionPassword } = req.body;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId);

    if (!user || user.registrationStatus !== 'active') {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!user.encryptionPasswordHash) {
      return res.status(400).json({ error: 'Encryption password is not set' });
    }

    const isPasswordValid = await user.compareEncryptionPassword(encryptionPassword);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Incorrect encryption password' });
    }

    // Create a signed unlock token valid for 12 hours
    const unlockToken = jwt.sign(
      {
        userId: user._id,
        type: 'encryption_unlock',
        version: user.encryptionPasswordVersion
      },
      process.env.JWT_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '12h' }
    );

    // Set secure cookie with unlock token
    res.cookie('encryption_unlock', unlockToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 12 * 60 * 60 * 1000 // 12 hours
    });

    res.json({
      success: true,
      message: 'Encryption unlocked for 12 hours',
      expiresIn: 12 * 60 * 60 // 12 hours in seconds
    });
  } catch (error) {
    console.error('Verify encryption password error:', error);
    res.status(500).json({ error: 'Failed to verify encryption password' });
  }
});

// Check if encryption is currently unlocked (via cookie)
router.get('/encryption-password/status/unlock', async (req, res) => {
  try {
    const unlockToken = req.cookies?.encryption_unlock;
    
    if (!unlockToken) {
      return res.json({ unlocked: false });
    }

    try {
      const decoded = jwt.verify(unlockToken, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
      
      if (decoded.type !== 'encryption_unlock') {
        return res.json({ unlocked: false });
      }

      // Verify password version hasn't changed
      const user = await User.findById(decoded.userId);
      if (!user || user.encryptionPasswordVersion !== decoded.version) {
        return res.json({ unlocked: false });
      }

      // Calculate remaining time
      const exp = decoded.exp * 1000;
      const remaining = Math.max(0, exp - Date.now());

      res.json({
        unlocked: true,
        expiresIn: Math.floor(remaining / 1000),
        userId: decoded.userId
      });
    } catch (jwtError) {
      return res.json({ unlocked: false });
    }
  } catch (error) {
    console.error('Check unlock status error:', error);
    res.status(500).json({ error: 'Failed to check unlock status' });
  }
});

// Lock encryption (clear unlock cookie)
router.post('/encryption-password/lock', async (req, res) => {
  try {
    res.cookie('encryption_unlock', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0
    });

    res.json({ success: true, message: 'Encryption locked' });
  } catch (error) {
    console.error('Lock encryption error:', error);
    res.status(500).json({ error: 'Failed to lock encryption' });
  }
});

// Update user profile
router.put('/profile', [
  body('realName').optional().trim().notEmpty().withMessage('Real name cannot be empty'),
  body('city').optional().trim(),
  body('state').optional().trim(),
  body('country').optional().trim(),
  body('bio')
    .optional({ nullable: true })
    .isString()
    .withMessage('Bio must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio must be at most 500 characters'),
  body('avatarUrl')
    .optional({ nullable: true })
    .isString()
    .withMessage('Avatar URL must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Avatar URL must be at most 500 characters')
    .custom((value) => !value || isSafeHttpUrl(value))
    .withMessage('Avatar URL must be a valid http(s) URL'),
  body('bannerUrl')
    .optional({ nullable: true })
    .isString()
    .withMessage('Banner URL must be a string')
    .trim()
    .isLength({ max: 500 })
    .withMessage('Banner URL must be at most 500 characters')
    .custom((value) => !value || isSafeHttpUrl(value))
    .withMessage('Banner URL must be a valid http(s) URL'),
  body('links')
    .optional({ nullable: true })
    .isArray({ max: 10 })
    .withMessage('Links must be an array with at most 10 items'),
  body('links.*')
    .optional({ nullable: true })
    .custom((value) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return !trimmed || (trimmed.length <= 500 && isSafeHttpUrl(trimmed));
      }

      if (value && typeof value === 'object' && typeof value.url === 'string') {
        const trimmedUrl = value.url.trim();
        return !!trimmedUrl && trimmedUrl.length <= 500 && isSafeHttpUrl(trimmedUrl);
      }

      return false;
    })
    .withMessage('Each link must be a valid http(s) URL string or object with a valid url field'),
  body('profileTheme')
    .optional({ nullable: true })
    .isString()
    .withMessage('Profile theme must be a string')
    .trim()
    .isIn(PROFILE_THEMES)
    .withMessage(`Profile theme must be one of: ${PROFILE_THEMES.join(', ')}`)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update allowed fields
    const { realName, city, state, country, bio, avatarUrl, bannerUrl, links, profileTheme } = req.body;
    if (realName) user.realName = realName;
    if (city) user.city = city;
    if (state) user.state = state;
    if (country) user.country = country;

    if (Object.prototype.hasOwnProperty.call(req.body, 'bio')) {
      user.bio = (bio || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'avatarUrl')) {
      user.avatarUrl = (avatarUrl || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'bannerUrl')) {
      user.bannerUrl = (bannerUrl || '').trim();
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'links')) {
      user.links = normalizeLinks(links);
    }
    if (Object.prototype.hasOwnProperty.call(req.body, 'profileTheme')) {
      user.profileTheme = profileTheme || 'default';
    }
    
    user.updatedAt = new Date();
    await user.save();

    res.json({ 
      message: 'Profile updated successfully',
      user: user.toPublicProfile() 
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Profile update failed', details: error.message });
  }
});

// Setup PGP public key
router.post('/pgp/setup', [
  body('publicKey').isString().withMessage('PGP public key is required')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const normalizedPublicKey = normalizePgpPublicKey(req.body.publicKey);
    const publicKeyValidationError = getPgpPublicKeyValidationError(normalizedPublicKey);
    if (publicKeyValidationError) {
      return res.status(400).json({ error: publicKeyValidationError });
    }

    user.pgpPublicKey = normalizedPublicKey;
    user.updatedAt = new Date();
    await user.save();

    res.json({ 
      message: 'PGP public key saved successfully',
      hasPGP: true 
    });
  } catch (error) {
    console.error('PGP setup error:', error);
    res.status(500).json({ error: 'PGP setup failed', details: error.message });
  }
});

module.exports = router;
