import { formatPresenceLastSeen, getPresenceMeta, resolvePresenceStatus } from './presence';

describe('presence utilities', () => {
  const referenceTime = new Date('2026-03-16T19:47:33.332Z').getTime();

  it('keeps recently disconnected users inactive for five minutes', () => {
    expect(resolvePresenceStatus({
      status: 'inactive',
      lastSeen: '2026-03-16T19:44:00.000Z'
    }, referenceTime)).toBe('inactive');

    expect(resolvePresenceStatus({
      status: 'inactive',
      lastSeen: '2026-03-16T19:41:00.000Z'
    }, referenceTime)).toBe('offline');
  });

  it('formats green, yellow, and gray presence labels consistently', () => {
    expect(getPresenceMeta({ status: 'online' }, referenceTime)).toMatchObject({
      status: 'online',
      shortLabel: 'Online',
      dotClassName: 'bg-emerald-500'
    });

    expect(getPresenceMeta({
      status: 'inactive',
      lastSeen: '2026-03-16T19:44:00.000Z'
    }, referenceTime)).toMatchObject({
      status: 'inactive',
      shortLabel: 'Inactive',
      dotClassName: 'bg-amber-400'
    });

    expect(getPresenceMeta({
      status: 'inactive',
      lastSeen: '2026-03-16T19:39:00.000Z'
    }, referenceTime)).toMatchObject({
      status: 'offline',
      shortLabel: 'Offline',
      dotClassName: 'bg-slate-300'
    });
  });

  it('formats last seen text for offline users', () => {
    expect(formatPresenceLastSeen('2026-03-16T19:42:33.332Z', referenceTime)).toBe('Last seen 5m ago');
  });
});
