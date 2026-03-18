const crypto = require('crypto');

const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const User = require('../models/User');
const Session = require('../models/Session');
const Resume = require('../models/Resume');

const router = express.Router();

const DATE_INPUT_REGEX = /^\d{4}-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?$/;
const MAX_ITEM_COUNT = 25;
const MAX_BULLET_COUNT = 10;
const MAX_SKILL_COUNT = 50;

const resumeReadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many resume requests, please try again shortly.',
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  validate: { xForwardedForHeader: false }
});

const resumeMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many resume changes, please try again later.',
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  validate: { xForwardedForHeader: false }
});

const hashToken = (token = '') => crypto.createHash('sha256').update(token).digest('hex');

const logResumeEvent = ({ userId, eventType, metadata = {}, req }) => {
  const payload = {
    eventType,
    userId: String(userId),
    metadata,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    createdAt: new Date().toISOString()
  };
  console.log('[resume-event]', JSON.stringify(payload));
};

const getUserFromBearerToken = async (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return { error: 'No token provided', status: 401 };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production');

    const tokenHash = hashToken(token);
    const session = await Session.findOne({ userId: decoded.userId, tokenHash, isRevoked: false });
    if (!session) {
      return { error: 'Session expired or revoked', status: 401 };
    }

    session.lastActivity = new Date();
    await session.save();

    const user = await User.findById(decoded.userId).select('_id');
    if (!user) {
      return { error: 'User not found', status: 404 };
    }

    return { user };
  } catch (error) {
    return { error: 'Invalid token', status: 401 };
  }
};

const authenticateToken = async (req, res, next) => {
  const auth = await getUserFromBearerToken(req);
  if (auth.error) {
    return res.status(auth.status).json({ error: auth.error });
  }
  req.user = auth.user;
  return next();
};

const sanitizeString = (value, maxLength, { allowNull = false } = {}) => {
  if (typeof value !== 'string') {
    return allowNull ? null : '';
  }
  const normalized = value.replace(/\r\n/g, '\n').trim().slice(0, maxLength);
  if (!normalized) {
    return allowNull ? null : '';
  }
  return normalized;
};

const sanitizeStringArray = (input, maxLength, maxCount) => {
  if (!Array.isArray(input)) return [];
  return input
    .slice(0, maxCount)
    .map((value) => sanitizeString(value, maxLength))
    .filter(Boolean);
};

const parseDateInput = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!DATE_INPUT_REGEX.test(normalized)) return null;

  const dateOnly = normalized.length === 7 ? `${normalized}-01` : normalized;
  const parsed = new Date(`${dateOnly}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const normalizeDateInput = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!DATE_INPUT_REGEX.test(normalized)) return null;
  return normalized;
};

const validateDateRange = ({ startDate, endDate, isCurrent }, label) => {
  if (!startDate) {
    return `${label}: startDate is required`;
  }

  const parsedStartDate = parseDateInput(startDate);
  if (!parsedStartDate) {
    return `${label}: startDate must be YYYY-MM or YYYY-MM-DD`;
  }

  if (isCurrent && !endDate) {
    return null;
  }

  if (!endDate) {
    return `${label}: endDate is required unless isCurrent is true`;
  }

  const parsedEndDate = parseDateInput(endDate);
  if (!parsedEndDate) {
    return `${label}: endDate must be YYYY-MM or YYYY-MM-DD`;
  }

  if (parsedEndDate.getTime() < parsedStartDate.getTime()) {
    return `${label}: endDate must be greater than or equal to startDate`;
  }

  return null;
};

const validateResumePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return 'Payload must be an object';
  }

  const basics = payload.basics;
  if (!basics || typeof basics !== 'object' || Array.isArray(basics)) {
    return 'basics is required and must be an object';
  }

  const fullName = sanitizeString(basics.fullName, 120);
  const headline = sanitizeString(basics.headline, 160);
  const email = sanitizeString(basics.email, 160);

  if (!fullName) return 'basics.fullName is required';
  if (!headline) return 'basics.headline is required';
  if (!email) return 'basics.email is required';

  if (!Array.isArray(payload.experience || [])) return 'experience must be an array';
  if (!Array.isArray(payload.education || [])) return 'education must be an array';
  if (!Array.isArray(payload.skills || [])) return 'skills must be an array';
  if (!Array.isArray(payload.certifications || [])) return 'certifications must be an array';
  if (!Array.isArray(payload.projects || [])) return 'projects must be an array';

  if ((payload.experience || []).length > MAX_ITEM_COUNT) return `experience cannot exceed ${MAX_ITEM_COUNT} items`;
  if ((payload.education || []).length > MAX_ITEM_COUNT) return `education cannot exceed ${MAX_ITEM_COUNT} items`;
  if ((payload.certifications || []).length > MAX_ITEM_COUNT) return `certifications cannot exceed ${MAX_ITEM_COUNT} items`;
  if ((payload.projects || []).length > MAX_ITEM_COUNT) return `projects cannot exceed ${MAX_ITEM_COUNT} items`;
  if ((payload.skills || []).length > MAX_SKILL_COUNT) return `skills cannot exceed ${MAX_SKILL_COUNT} items`;

  const experience = payload.experience || [];
  for (let i = 0; i < experience.length; i += 1) {
    const row = experience[i] || {};
    const employer = sanitizeString(row.employer, 120);
    const title = sanitizeString(row.title, 120);
    if (!employer) return `experience[${i}].employer is required`;
    if (!title) return `experience[${i}].title is required`;
    if (Array.isArray(row.bullets) && row.bullets.length > MAX_BULLET_COUNT) {
      return `experience[${i}].bullets cannot exceed ${MAX_BULLET_COUNT}`;
    }

    const dateError = validateDateRange({
      startDate: row.startDate,
      endDate: row.endDate,
      isCurrent: !!row.isCurrent
    }, `experience[${i}]`);
    if (dateError) return dateError;
  }

  const education = payload.education || [];
  for (let i = 0; i < education.length; i += 1) {
    const row = education[i] || {};
    const institution = sanitizeString(row.institution, 120);
    const degree = sanitizeString(row.degree, 120);
    if (!institution) return `education[${i}].institution is required`;
    if (!degree) return `education[${i}].degree is required`;
    if (Array.isArray(row.bullets) && row.bullets.length > MAX_BULLET_COUNT) {
      return `education[${i}].bullets cannot exceed ${MAX_BULLET_COUNT}`;
    }

    const dateError = validateDateRange({
      startDate: row.startDate,
      endDate: row.endDate,
      isCurrent: !!row.isCurrent
    }, `education[${i}]`);
    if (dateError) return dateError;
  }

  return null;
};

const normalizeResumePayload = (payload) => {
  const basics = payload.basics || {};

  const normalized = {
    basics: {
      fullName: sanitizeString(basics.fullName, 120),
      headline: sanitizeString(basics.headline, 160),
      email: sanitizeString(basics.email, 160),
      phone: sanitizeString(basics.phone, 40, { allowNull: true }),
      city: sanitizeString(basics.city, 80, { allowNull: true }),
      state: sanitizeString(basics.state, 80, { allowNull: true }),
      country: sanitizeString(basics.country, 80, { allowNull: true }),
      website: sanitizeString(basics.website, 300, { allowNull: true }),
      profileLinks: Array.isArray(basics.profileLinks)
        ? basics.profileLinks
          .slice(0, MAX_ITEM_COUNT)
          .map((entry) => ({
            label: sanitizeString(entry?.label, 80),
            url: sanitizeString(entry?.url, 300)
          }))
          .filter((entry) => entry.url)
        : []
    },
    summary: sanitizeString(payload.summary, 2000),
    experience: (payload.experience || []).slice(0, MAX_ITEM_COUNT).map((entry) => ({
      employer: sanitizeString(entry?.employer, 120),
      title: sanitizeString(entry?.title, 120),
      location: sanitizeString(entry?.location, 120, { allowNull: true }),
      startDate: normalizeDateInput(entry?.startDate) || '',
      endDate: entry?.isCurrent ? null : (normalizeDateInput(entry?.endDate) || null),
      isCurrent: !!entry?.isCurrent,
      bullets: sanitizeStringArray(entry?.bullets, 280, MAX_BULLET_COUNT)
    })),
    education: (payload.education || []).slice(0, MAX_ITEM_COUNT).map((entry) => ({
      institution: sanitizeString(entry?.institution, 120),
      degree: sanitizeString(entry?.degree, 120),
      fieldOfStudy: sanitizeString(entry?.fieldOfStudy, 120, { allowNull: true }),
      startDate: normalizeDateInput(entry?.startDate) || '',
      endDate: entry?.isCurrent ? null : (normalizeDateInput(entry?.endDate) || null),
      isCurrent: !!entry?.isCurrent,
      location: sanitizeString(entry?.location, 120, { allowNull: true }),
      bullets: sanitizeStringArray(entry?.bullets, 280, MAX_BULLET_COUNT)
    })),
    skills: sanitizeStringArray(payload.skills, 60, MAX_SKILL_COUNT),
    certifications: (payload.certifications || []).slice(0, MAX_ITEM_COUNT).map((entry) => ({
      name: sanitizeString(entry?.name, 120),
      issuer: sanitizeString(entry?.issuer, 120, { allowNull: true }),
      issueDate: normalizeDateInput(entry?.issueDate),
      expirationDate: normalizeDateInput(entry?.expirationDate),
      credentialId: sanitizeString(entry?.credentialId, 120, { allowNull: true }),
      url: sanitizeString(entry?.url, 300, { allowNull: true })
    })).filter((entry) => entry.name),
    projects: (payload.projects || []).slice(0, MAX_ITEM_COUNT).map((entry) => ({
      name: sanitizeString(entry?.name, 120),
      description: sanitizeString(entry?.description, 600, { allowNull: true }),
      url: sanitizeString(entry?.url, 300, { allowNull: true }),
      highlights: sanitizeStringArray(entry?.highlights, 280, MAX_BULLET_COUNT)
    })).filter((entry) => entry.name),
    visibility: ['private', 'unlisted', 'public'].includes(payload.visibility)
      ? payload.visibility
      : 'private'
  };

  return normalized;
};

const toResumeResponse = (resume) => {
  if (!resume) return null;
  return {
    _id: resume._id,
    ownerId: resume.ownerId,
    basics: resume.basics,
    summary: resume.summary || '',
    experience: Array.isArray(resume.experience) ? resume.experience : [],
    education: Array.isArray(resume.education) ? resume.education : [],
    skills: Array.isArray(resume.skills) ? resume.skills : [],
    certifications: Array.isArray(resume.certifications) ? resume.certifications : [],
    projects: Array.isArray(resume.projects) ? resume.projects : [],
    visibility: resume.visibility || 'private',
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt
  };
};

router.get('/me', authenticateToken, resumeReadLimiter, async (req, res) => {
  try {
    const resume = await Resume.findOne({ ownerId: req.user._id, isDeleted: false });

    logResumeEvent({
      userId: req.user._id,
      eventType: 'resume_builder_opened',
      req,
      metadata: { hasResume: !!resume }
    });

    return res.json({
      success: true,
      resume: toResumeResponse(resume)
    });
  } catch (error) {
    console.error('Resume get error:', error);
    return res.status(500).json({ error: 'Failed to load resume' });
  }
});

router.put('/me', authenticateToken, resumeMutationLimiter, [
  body().custom((payload) => {
    const validationError = validateResumePayload(payload);
    if (validationError) {
      throw new Error(validationError);
    }
    return true;
  }),
  body('visibility').optional().isIn(['private', 'unlisted', 'public'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const normalizedPayload = normalizeResumePayload(req.body || {});

    const resume = await Resume.findOneAndUpdate(
      { ownerId: req.user._id },
      {
        $set: {
          ...normalizedPayload,
          ownerId: req.user._id,
          isDeleted: false,
          deletedAt: null
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    logResumeEvent({
      userId: req.user._id,
      eventType: 'resume_saved',
      req,
      metadata: {
        experienceCount: normalizedPayload.experience.length,
        educationCount: normalizedPayload.education.length,
        skillsCount: normalizedPayload.skills.length
      }
    });

    return res.json({
      success: true,
      resume: toResumeResponse(resume)
    });
  } catch (error) {
    console.error('Resume save error:', error);
    return res.status(500).json({ error: 'Failed to save resume' });
  }
});

router.delete('/me', authenticateToken, resumeMutationLimiter, async (req, res) => {
  try {
    const updateResult = await Resume.updateOne(
      { ownerId: req.user._id, isDeleted: false },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date()
        }
      }
    );

    if (!updateResult.matchedCount) {
      return res.status(404).json({ error: 'Resume not found' });
    }

    logResumeEvent({
      userId: req.user._id,
      eventType: 'resume_deleted',
      req
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Resume delete error:', error);
    return res.status(500).json({ error: 'Failed to delete resume' });
  }
});

router.post('/me/telemetry', authenticateToken, resumeReadLimiter, [
  body('eventType').isIn([
    'resume_builder_opened',
    'resume_saved',
    'resume_deleted',
    'resume_print_preview_opened'
  ]),
  body('metadata').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    logResumeEvent({
      userId: req.user._id,
      eventType: req.body.eventType,
      metadata: req.body.metadata || {},
      req
    });

    return res.status(202).json({ success: true });
  } catch (error) {
    console.error('Resume telemetry error:', error);
    return res.status(500).json({ error: 'Failed to record resume telemetry' });
  }
});

module.exports = router;
