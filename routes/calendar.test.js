const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUser = {
  findOne: jest.fn()
};

const mockFriendship = {
  findFriendship: jest.fn()
};

const mockCalendar = {
  findOne: jest.fn(),
  create: jest.fn()
};

const mockCalendarEvent = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  countDocuments: jest.fn()
};

jest.mock('../models/User', () => mockUser);
jest.mock('../models/Friendship', () => mockFriendship);
jest.mock('../models/Calendar', () => mockCalendar);
jest.mock('../models/CalendarEvent', () => mockCalendarEvent);

const jwt = require('jsonwebtoken');
const calendarRouter = require('./calendar');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/calendar', calendarRouter);
  return app;
};

const mockAuth = (userId = 'viewer-1') => {
  jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId }));
};

const mockEventsQuery = (events) => {
  mockCalendarEvent.find.mockReturnValue({
    sort: jest.fn().mockReturnValue({
      skip: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(events)
        })
      })
    })
  });
};

describe('Calendar routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates default calendar on first GET /me', async () => {
    const app = buildApp();
    mockAuth('owner-1');

    mockCalendar.findOne.mockResolvedValueOnce(null);
    mockCalendar.create.mockResolvedValue({
      _id: 'cal-1',
      ownerId: 'owner-1',
      title: 'My Calendar',
      guestVisibility: 'private',
      timezone: 'UTC',
      defaultView: 'month'
    });

    mockCalendarEvent.countDocuments
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(2);

    const response = await request(app)
      .get('/api/calendar/me')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.calendar.title).toBe('My Calendar');
    expect(response.body.stats).toMatchObject({ totalEvents: 3, upcomingEvents: 2 });
    expect(mockCalendar.create).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'owner-1' }));
  });

  it('rejects event create when endAt is before startAt', async () => {
    const app = buildApp();
    mockAuth('owner-1');

    mockCalendar.findOne.mockResolvedValue({ _id: 'cal-1', ownerId: 'owner-1' });

    const response = await request(app)
      .post('/api/calendar/me/events')
      .set('Authorization', 'Bearer token')
      .send({
        title: 'Invalid event',
        startAt: '2026-03-10T10:00:00.000Z',
        endAt: '2026-03-10T09:00:00.000Z'
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/endat/i);
  });

  it('blocks guest access to private calendar events', async () => {
    const app = buildApp();

    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'owner-1', username: 'alice', realName: 'Alice' })
    });
    mockCalendar.findOne.mockResolvedValue({ _id: 'cal-1', ownerId: 'owner-1', guestVisibility: 'private' });

    const response = await request(app).get('/api/calendar/user/alice/events');

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/private/i);
  });

  it('allows friends to view friends_readonly calendar events', async () => {
    const app = buildApp();
    mockAuth('friend-1');

    mockUser.findOne.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'owner-1', username: 'alice', realName: 'Alice' })
    });
    mockCalendar.findOne.mockResolvedValue({
      _id: 'cal-1',
      ownerId: 'owner-1',
      guestVisibility: 'friends_readonly'
    });
    mockFriendship.findFriendship.mockResolvedValue({ status: 'accepted' });

    mockEventsQuery([
      { _id: 'evt-1', title: 'Friend-visible event', startAt: new Date('2026-03-10T10:00:00.000Z'), endAt: new Date('2026-03-10T11:00:00.000Z') }
    ]);
    mockCalendarEvent.countDocuments.mockResolvedValue(1);

    const response = await request(app)
      .get('/api/calendar/user/alice/events')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.events).toHaveLength(1);
    expect(response.body.owner.username).toBe('alice');
  });

  it('returns 404 when deleting non-existent owner event', async () => {
    const app = buildApp();
    mockAuth('owner-1');
    mockCalendarEvent.findOne.mockResolvedValue(null);

    const response = await request(app)
      .delete('/api/calendar/me/events/507f191e810c19729de860ea')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/i);
  });
});
