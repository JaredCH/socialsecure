const express = require('express');
const jwt = require('jsonwebtoken');
const Resume = require('../models/Resume');
const User = require('../models/User');

const router = express.Router();

const sanitizeString = (value, maxLength = 200) => {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
};

const sanitizeResumePayload = (input = {}) => {
  const visibility = ['private', 'unlisted', 'public'].includes(input.visibility)
    ? input.visibility
    : undefined;

  const basics = {
    headline: sanitizeString(input?.basics?.headline, 200),
    summary: sanitizeString(input?.basics?.summary, 5000)
  };

  const sections = Array.isArray(input.sections)
    ? input.sections.slice(0, 12).map((section) => ({
      title: sanitizeString(section?.title, 200),
      items: Array.isArray(section?.items)
        ? section.items.slice(0, 100).map((item) => ({
          title: sanitizeString(item?.title, 200),
          subtitle: sanitizeString(item?.subtitle, 200),
          startDate: sanitizeString(item?.startDate, 64),
          endDate: sanitizeString(item?.endDate, 64),
          description: sanitizeString(item?.description, 4000),
          bullets: Array.isArray(item?.bullets)
            ? item.bullets.slice(0, 25).map((bullet) => sanitizeString(bullet, 300)).filter(Boolean)
            : []
        }))
        : []
    }))
    : [];

  return {
    ...(visibility ? { visibility } : {}),
    basics,
    sections
  };
};

const authenticateToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, decoded) => {
    if (err || !decoded?.userId) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = { userId: String(decoded.userId) };
    return next();
  });
};

const toOwnerResumePayload = (resumeDoc, username = '') => {
  if (!resumeDoc) {
    return {
      hasResume: false,
      visibility: 'private',
      resumeUrl: null,
      resumeHeadline: null,
      updatedAt: null
    };
  }

  return {
    hasResume: true,
    visibility: resumeDoc.visibility || 'private',
    resumeUrl: username ? `/resume/${encodeURIComponent(String(username))}` : null,
    resumeHeadline: resumeDoc?.basics?.headline || null,
    updatedAt: resumeDoc.updatedAt || null,
    basics: {
      headline: resumeDoc?.basics?.headline || '',
      summary: resumeDoc?.basics?.summary || ''
    },
    sections: Array.isArray(resumeDoc.sections) ? resumeDoc.sections : []
  };
};

const logResumeEvent = ({ eventType, userId, req, metadata = {} }) => {
  const payload = {
    eventType,
    userId,
    metadata,
    ipAddress: req.ip,
    userAgent: req.get('user-agent') || null,
    createdAt: new Date().toISOString()
  };
  console.log('[resume-event]', JSON.stringify(payload));
};

router.get('/me', authenticateToken, async (req, res) => {
  try {
    const [resume, user] = await Promise.all([
      Resume.findOne({ userId: req.user.userId })
        .select('visibility basics sections updatedAt')
        .lean(),
      User.findById(req.user.userId).select('username').lean()
    ]);
    const ownerPayload = toOwnerResumePayload(resume, user?.username || '');

    return res.json({ success: true, resume: ownerPayload });
  } catch (error) {
    console.error('Error fetching owner resume:', error);
    return res.status(500).json({ error: 'Failed to fetch resume' });
  }
});

router.put('/me', authenticateToken, async (req, res) => {
  try {
    const existingResume = await Resume.findOne({ userId: req.user.userId }).select('visibility').lean();
    const update = sanitizeResumePayload(req.body || {});

    const saved = await Resume.findOneAndUpdate(
      { userId: req.user.userId },
      { $set: update },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    )
      .select('visibility basics sections updatedAt')
      .lean();

    if (!existingResume || existingResume.visibility !== saved.visibility) {
      logResumeEvent({
        eventType: 'resume_visibility_changed',
        userId: req.user.userId,
        req,
        metadata: {
          previousVisibility: existingResume?.visibility || null,
          nextVisibility: saved.visibility
        }
      });
    }

    return res.json({
      success: true,
      resume: {
        hasResume: true,
        visibility: saved.visibility,
        resumeHeadline: saved?.basics?.headline || null,
        updatedAt: saved.updatedAt,
        basics: saved.basics || { headline: '', summary: '' },
        sections: Array.isArray(saved.sections) ? saved.sections : []
      }
    });
  } catch (error) {
    console.error('Error saving owner resume:', error);
    return res.status(500).json({ error: 'Failed to save resume' });
  }
});

module.exports = router;
