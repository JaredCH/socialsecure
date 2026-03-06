const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const {
  RELATIONSHIP_AUDIENCE_VALUES,
  normalizeRelationshipAudience,
  socialOrUnsetAudienceQuery,
  isViewerSecureFriendOfOwner
} = require('../utils/relationshipAudience');

const User = require('../models/User');
const Friendship = require('../models/Friendship');
const Calendar = require('../models/Calendar');
const CalendarEvent = require('../models/CalendarEvent');

const router = express.Router();

const MAX_EVENT_DURATION_MS = 1000 * 60 * 60 * 24 * 366;
const MAX_QUERY_WINDOW_MS = 1000 * 60 * 60 * 24 * 365;
const DEFAULT_RANGE_DAYS = 90;

const eventMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: 'Too many calendar changes, please try again later.',
  keyGenerator: (req) => req.ip || req.socket?.remoteAddress || 'unknown',
  validate: {
    xForwardedForHeader: false
  }
});

const sanitizeText = (value, maxLength) => {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, maxLength);
};

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const buildBoundedDateRange = (fromInput, toInput) => {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - (1000 * 60 * 60 * 24 * 30));
  const defaultEnd = new Date(now.getTime() + (1000 * 60 * 60 * 24 * DEFAULT_RANGE_DAYS));

  const from = parseDate(fromInput) || defaultStart;
  const to = parseDate(toInput) || defaultEnd;

  if (to < from) {
    return { error: 'The `to` date must be greater than or equal to `from` date.' };
  }

  if (to.getTime() - from.getTime() > MAX_QUERY_WINDOW_MS) {
    return { error: 'Date window is too large. Please request up to 365 days at a time.' };
  }

  return { from, to };
};

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err || !user?.userId) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = { userId: String(user.userId) };
    return next();
  });
};

const optionalAuth = (req, _res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key-change-in-production', (err, user) => {
    if (err || !user?.userId) {
      req.user = null;
      return next();
    }
    req.user = { userId: String(user.userId) };
    return next();
  });
};

const ensureCalendarForOwner = async (ownerId) => {
  let calendar = await Calendar.findOne({ ownerId });
  if (!calendar) {
    calendar = await Calendar.create({ ownerId });
  }
  return calendar;
};

const canViewerAccessCalendar = async (viewerId, ownerId, guestVisibility) => {
  if (viewerId && String(viewerId) === String(ownerId)) {
    return { allowed: true, isOwner: true };
  }

  if (guestVisibility === 'public_readonly') {
    return { allowed: true, isOwner: false };
  }

  if (guestVisibility === 'friends_readonly') {
    if (!viewerId) {
      return { allowed: false, reason: 'Friends-only calendar. Sign in with a friend account to view.' };
    }
    const friendship = await Friendship.findFriendship(viewerId, ownerId);
    if (friendship?.status === 'accepted') {
      return { allowed: true, isOwner: false };
    }
    return { allowed: false, reason: 'This calendar is visible to friends only.' };
  }

  return { allowed: false, reason: 'This calendar is private.' };
};

const eventResponse = (event) => ({
  _id: event._id,
  title: event.title,
  description: event.description || '',
  startAt: event.startAt,
  endAt: event.endAt,
  allDay: !!event.allDay,
  location: event.location || '',
  color: event.color || '',
  recurrence: event.recurrence || 'none',
  reminderMinutes: event.reminderMinutes,
  invitees: Array.isArray(event.invitees) ? event.invitees : [],
  announceToFeed: Boolean(event.announceToFeed),
  announceTarget: ['feed', 'post'].includes(event.announceTarget) ? event.announceTarget : 'none',
  relationshipAudience: normalizeRelationshipAudience(event.relationshipAudience),
  createdAt: event.createdAt,
  updatedAt: event.updatedAt
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const calendar = await ensureCalendarForOwner(ownerId);
    const now = new Date();

    const [totalEvents, upcomingEvents] = await Promise.all([
      CalendarEvent.countDocuments({ ownerId, isDeleted: false }),
      CalendarEvent.countDocuments({ ownerId, isDeleted: false, endAt: { $gte: now } })
    ]);

    return res.json({
      success: true,
      calendar,
      stats: {
        totalEvents,
        upcomingEvents
      }
    });
  } catch (error) {
    console.error('Error loading calendar settings:', error);
    return res.status(500).json({ error: 'Failed to load calendar' });
  }
});

router.patch('/me/settings', requireAuth, [
  body('title').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('description').optional().isString().trim().isLength({ max: 500 }),
  body('guestVisibility').optional().isIn(['private', 'public_readonly', 'friends_readonly']),
  body('timezone').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('defaultView').optional().isIn(['month', 'week', 'agenda'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const ownerId = req.user.userId;
    const calendar = await ensureCalendarForOwner(ownerId);

    const updates = {};
    if (typeof req.body.title === 'string') updates.title = sanitizeText(req.body.title, 120) || 'My Calendar';
    if (typeof req.body.description === 'string') updates.description = sanitizeText(req.body.description, 500);
    if (typeof req.body.guestVisibility === 'string') updates.guestVisibility = req.body.guestVisibility;
    if (typeof req.body.timezone === 'string') updates.timezone = sanitizeText(req.body.timezone, 80) || 'UTC';
    if (typeof req.body.defaultView === 'string') updates.defaultView = req.body.defaultView;

    Object.assign(calendar, updates);
    await calendar.save();

    return res.json({ success: true, calendar });
  } catch (error) {
    console.error('Error updating calendar settings:', error);
    return res.status(500).json({ error: 'Failed to update calendar settings' });
  }
});

router.get('/me/events', requireAuth, async (req, res) => {
  try {
    const ownerId = req.user.userId;
    const range = buildBoundedDateRange(req.query.from, req.query.to);
    if (range.error) {
      return res.status(400).json({ error: range.error });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const calendar = await ensureCalendarForOwner(ownerId);

    const query = {
      ownerId,
      calendarId: calendar._id,
      isDeleted: false,
      startAt: { $lte: range.to },
      endAt: { $gte: range.from }
    };

    const [events, total] = await Promise.all([
      CalendarEvent.find(query).sort({ startAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      CalendarEvent.countDocuments(query)
    ]);

    return res.json({
      success: true,
      page,
      limit,
      total,
      hasMore: skip + events.length < total,
      range: { from: range.from, to: range.to },
      events
    });
  } catch (error) {
    console.error('Error loading calendar events:', error);
    return res.status(500).json({ error: 'Failed to load calendar events' });
  }
});

const eventValidation = [
  body('title').isString().trim().isLength({ min: 1, max: 200 }),
  body('description').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  body('startAt').isISO8601(),
  body('endAt').isISO8601(),
  body('allDay').optional().isBoolean(),
  body('location').optional({ nullable: true }).isString().trim().isLength({ max: 200 }),
  body('color').optional({ nullable: true }).isIn(['', 'blue', 'green', 'red', 'purple', 'orange', 'gray']),
  body('recurrence').optional().isIn(['none', 'daily', 'weekly', 'monthly']),
  body('reminderMinutes').optional({ nullable: true }).isInt({ min: 0, max: 10080 }),
  body('invitees').optional({ nullable: true }).isArray({ max: 20 }),
  body('invitees.*').optional().isString().trim().isLength({ min: 1, max: 120 }),
  body('announceToFeed').optional().isBoolean(),
  body('announceTarget').optional().isIn(['none', 'feed', 'post']),
  body('relationshipAudience').optional().isIn(RELATIONSHIP_AUDIENCE_VALUES)
];

const buildEventPayload = (input) => {
  const title = sanitizeText(input.title, 200);
  const description = sanitizeText(input.description, 2000);
  const location = sanitizeText(input.location, 200);
  const startAt = new Date(input.startAt);
  const endAt = new Date(input.endAt);

  const announceTarget = ['feed', 'post'].includes(input.announceTarget) ? input.announceTarget : 'none';
  const announceToFeed = typeof input.announceToFeed === 'boolean'
    ? input.announceToFeed
    : announceTarget !== 'none';

  return {
    title,
    description,
    startAt,
    endAt,
    allDay: Boolean(input.allDay),
    location,
    color: typeof input.color === 'string' ? input.color : '',
    recurrence: typeof input.recurrence === 'string' ? input.recurrence : 'none',
    reminderMinutes: Number.isInteger(input.reminderMinutes) ? input.reminderMinutes : null,
    invitees: Array.isArray(input.invitees)
      ? input.invitees
        .map((invitee) => sanitizeText(invitee, 120))
        .filter(Boolean)
        .slice(0, 20)
      : [],
    announceToFeed,
    announceTarget,
    relationshipAudience: normalizeRelationshipAudience(input.relationshipAudience)
  };
};

const validateEventDates = (payload) => {
  if (Number.isNaN(payload.startAt.getTime()) || Number.isNaN(payload.endAt.getTime())) {
    return 'startAt and endAt must be valid ISO timestamps.';
  }
  if (payload.endAt < payload.startAt) {
    return 'endAt must be greater than or equal to startAt.';
  }
  if ((payload.endAt.getTime() - payload.startAt.getTime()) > MAX_EVENT_DURATION_MS) {
    return 'Event duration is too long. Maximum allowed is 366 days.';
  }
  return null;
};

router.post('/me/events', requireAuth, eventMutationLimiter, eventValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const ownerId = req.user.userId;
    const calendar = await ensureCalendarForOwner(ownerId);

    const payload = buildEventPayload(req.body);
    const dateError = validateEventDates(payload);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    const created = await CalendarEvent.create({
      ...payload,
      ownerId,
      calendarId: calendar._id
    });

    return res.status(201).json({
      success: true,
      event: eventResponse(created)
    });
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return res.status(500).json({ error: 'Failed to create calendar event' });
  }
});

router.put('/me/events/:eventId', requireAuth, eventMutationLimiter, eventValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
    return res.status(400).json({ error: 'Invalid event ID' });
  }

  try {
    const ownerId = req.user.userId;

    const existing = await CalendarEvent.findOne({
      _id: req.params.eventId,
      ownerId,
      isDeleted: false
    });

    if (!existing) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const payload = buildEventPayload(req.body);
    const dateError = validateEventDates(payload);
    if (dateError) {
      return res.status(400).json({ error: dateError });
    }

    Object.assign(existing, payload);
    await existing.save();

    return res.json({
      success: true,
      event: eventResponse(existing)
    });
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return res.status(500).json({ error: 'Failed to update calendar event' });
  }
});

router.delete('/me/events/:eventId', requireAuth, eventMutationLimiter, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.eventId)) {
    return res.status(400).json({ error: 'Invalid event ID' });
  }

  try {
    const ownerId = req.user.userId;
    const event = await CalendarEvent.findOne({
      _id: req.params.eventId,
      ownerId,
      isDeleted: false
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    event.isDeleted = true;
    event.deletedAt = new Date();
    await event.save();

    return res.json({ success: true });
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return res.status(500).json({ error: 'Failed to delete calendar event' });
  }
});

router.get('/user/:username', optionalAuth, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const owner = await User.findOne({ username }).select('_id username realName');
    if (!owner) {
      return res.status(404).json({ error: 'User not found' });
    }

    const calendar = await Calendar.findOne({ ownerId: owner._id });
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const access = await canViewerAccessCalendar(req.user?.userId, owner._id, calendar.guestVisibility);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason || 'Calendar is not visible' });
    }

    return res.json({
      success: true,
      isOwner: access.isOwner,
      owner: {
        _id: owner._id,
        username: owner.username,
        realName: owner.realName
      },
      calendar: {
        _id: calendar._id,
        title: calendar.title,
        description: calendar.description,
        guestVisibility: calendar.guestVisibility,
        timezone: calendar.timezone,
        defaultView: calendar.defaultView,
        updatedAt: calendar.updatedAt
      }
    });
  } catch (error) {
    console.error('Error loading user calendar metadata:', error);
    return res.status(500).json({ error: 'Failed to load user calendar' });
  }
});

router.get('/user/:username/events', optionalAuth, async (req, res) => {
  try {
    const username = String(req.params.username || '').trim().toLowerCase();
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    const owner = await User.findOne({ username }).select('_id username realName');
    if (!owner) {
      return res.status(404).json({ error: 'User not found' });
    }

    const calendar = await Calendar.findOne({ ownerId: owner._id });
    if (!calendar) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    const access = await canViewerAccessCalendar(req.user?.userId, owner._id, calendar.guestVisibility);
    if (!access.allowed) {
      return res.status(403).json({ error: access.reason || 'Calendar is not visible' });
    }

    const range = buildBoundedDateRange(req.query.from, req.query.to);
    if (range.error) {
      return res.status(400).json({ error: range.error });
    }

    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 25, 1), 100);
    const skip = (page - 1) * limit;

    const viewerId = req.user?.userId ? String(req.user.userId) : null;
    const viewerCanSeeSecure = access.isOwner
      ? true
      : await isViewerSecureFriendOfOwner(viewerId, owner._id);

    const query = {
      calendarId: calendar._id,
      ownerId: owner._id,
      isDeleted: false,
      startAt: { $lte: range.to },
      endAt: { $gte: range.from }
    };
    if (!access.isOwner && !viewerCanSeeSecure) {
      Object.assign(query, socialOrUnsetAudienceQuery('relationshipAudience'));
    }

    const [events, total] = await Promise.all([
      CalendarEvent.find(query).sort({ startAt: 1, _id: 1 }).skip(skip).limit(limit).lean(),
      CalendarEvent.countDocuments(query)
    ]);

    return res.json({
      success: true,
      isOwner: access.isOwner,
      owner: {
        _id: owner._id,
        username: owner.username,
        realName: owner.realName
      },
      page,
      limit,
      total,
      hasMore: skip + events.length < total,
      range: { from: range.from, to: range.to },
      events
    });
  } catch (error) {
    console.error('Error loading user calendar events:', error);
    return res.status(500).json({ error: 'Failed to load user calendar events' });
  }
});

module.exports = router;
