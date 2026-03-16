jest.mock('../models/Article', () => ({ find: jest.fn(), countDocuments: jest.fn(), findDuplicate: jest.fn(), findByIdAndUpdate: jest.fn(), findById: jest.fn(), deleteMany: jest.fn() }));
jest.mock('../models/NewsPreferences', () => ({ findOne: jest.fn(), create: jest.fn(), findOneAndUpdate: jest.fn(), updateMany: jest.fn() }));
jest.mock('../models/User', () => ({ findById: jest.fn() }));
jest.mock('../models/NewsIngestionRecord', () => ({ create: jest.fn(), deleteMany: jest.fn() }));

const { internals } = require('./news');

describe('getUpcomingHourlyForecastWindow', () => {
  const buildHourly = () =>
    Array.from({ length: 24 }, (_, hour) => `2026-03-15T${String(hour).padStart(2, '0')}:00`);

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts the hourly window on the next top of hour for the location local time', () => {
    const hourlyWindow = internals.getUpcomingHourlyForecastWindow(buildHourly(), {
      currentTime: '2026-03-15T13:45',
      limit: 8
    });

    expect(hourlyWindow.map(({ time }) => time)).toEqual([
      '2026-03-15T14:00',
      '2026-03-15T15:00',
      '2026-03-15T16:00',
      '2026-03-15T17:00',
      '2026-03-15T18:00',
      '2026-03-15T19:00',
      '2026-03-15T20:00',
      '2026-03-15T21:00'
    ]);
  });

  it('can derive the local current time from the saved location timezone when currentTime is missing', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-15T19:45:00.000Z'));

    const hourlyWindow = internals.getUpcomingHourlyForecastWindow(buildHourly(), {
      timeZone: 'America/Chicago',
      limit: 8
    });

    expect(hourlyWindow.map(({ time }) => time)).toEqual([
      '2026-03-15T15:00',
      '2026-03-15T16:00',
      '2026-03-15T17:00',
      '2026-03-15T18:00',
      '2026-03-15T19:00',
      '2026-03-15T20:00',
      '2026-03-15T21:00',
      '2026-03-15T22:00'
    ]);
  });
});
