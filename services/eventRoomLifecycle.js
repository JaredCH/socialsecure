const ChatRoom = require('../models/ChatRoom');
const EventSchedule = require('../models/EventSchedule');
const { buildDedupeKey } = require('./eventScheduleIngestion');

const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_BEFORE_DAYS = 3;
const WINDOW_AFTER_DAYS = 3;
const DEFAULT_DAILY_CAP = 250;

const buildEventRoomName = (event) => {
  const dateLabel = new Date(event.startAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${event.title} • ${dateLabel}`;
};

const buildRoomStableKey = (event) =>
  `event-room::${buildDedupeKey({ eventType: event.eventType, sourceRef: event.sourceRef, startAt: event.startAt })}`;

const reconcileEventRooms = async ({ now = new Date() } = {}) => {
  const roomCap = Math.max(parseInt(process.env.EVENT_ROOM_DAILY_CAP || `${DEFAULT_DAILY_CAP}`, 10) || DEFAULT_DAILY_CAP, 1);
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + DAY_MS);

  const alreadyCreatedToday = await ChatRoom.countDocuments({
    type: 'event',
    autoLifecycle: true,
    createdAt: { $gte: startOfDay, $lt: endOfDay }
  });

  let createsUsed = alreadyCreatedToday;
  let created = 0;
  let updated = 0;
  let archived = 0;

  const events = await EventSchedule.find({
    startAt: {
      $gte: new Date(now.getTime() - (WINDOW_BEFORE_DAYS * DAY_MS) - DAY_MS),
      $lte: new Date(now.getTime() + (WINDOW_AFTER_DAYS * DAY_MS) + DAY_MS)
    }
  }).lean();

  for (const event of events) {
    const visibilityStart = new Date(new Date(event.startAt).getTime() - (WINDOW_BEFORE_DAYS * DAY_MS));
    const visibilityEnd = new Date(new Date(event.startAt).getTime() + (WINDOW_AFTER_DAYS * DAY_MS));
    const isInWindow = now >= visibilityStart && now <= visibilityEnd;
    const shouldDiscover = isInWindow && event.status !== 'canceled';
    const stableKey = buildRoomStableKey(event);

    const existing = await ChatRoom.findOne({ stableKey }).select('_id').lean();
    const baseUpdate = {
      name: buildEventRoomName(event),
      type: 'event',
      eventRef: event._id,
      stableKey,
      autoLifecycle: true,
      discoverable: shouldDiscover,
      archivedAt: shouldDiscover ? null : now,
      visibilityWindow: {
        startAt: visibilityStart,
        endAt: visibilityEnd
      },
      lastActivity: now,
      city: null,
      state: null,
      country: null,
      county: null,
      radius: 50,
      location: {
        type: 'Point',
        coordinates: [0, 0]
      }
    };

    if (!existing && shouldDiscover && createsUsed >= roomCap) {
      console.warn(`[event-lifecycle] room cap reached cap=${roomCap} skipped=${stableKey}`);
      continue;
    }

    await ChatRoom.findOneAndUpdate(
      { stableKey },
      {
        $set: baseUpdate,
        $setOnInsert: { members: [], messageCount: 0, createdAt: now }
      },
      { upsert: true, new: true }
    );

    if (!existing) {
      createsUsed += 1;
      created += 1;
      console.log(`[event-lifecycle] created room key=${stableKey}`);
    } else if (shouldDiscover) {
      updated += 1;
    } else {
      archived += 1;
      console.log(`[event-lifecycle] archived room key=${stableKey}`);
    }
  }

  const staleResult = await ChatRoom.updateMany(
    {
      type: 'event',
      autoLifecycle: true,
      'visibilityWindow.endAt': { $lt: now },
      discoverable: true
    },
    {
      $set: {
        discoverable: false,
        archivedAt: now
      }
    }
  );

  archived += staleResult.modifiedCount || 0;
  return { created, updated, archived, cap: roomCap };
};

const startEventRoomLifecycleScheduler = () => {
  const intervalMinutes = Math.max(parseInt(process.env.EVENT_ROOM_LIFECYCLE_INTERVAL_MINUTES || '15', 10) || 15, 5);
  const intervalMs = intervalMinutes * 60 * 1000;

  reconcileEventRooms().catch((error) => {
    console.error('Initial event room lifecycle run failed:', error?.message || error);
  });

  setInterval(() => {
    reconcileEventRooms().catch((error) => {
      console.error('Scheduled event room lifecycle run failed:', error?.message || error);
    });
  }, intervalMs);
};

module.exports = {
  reconcileEventRooms,
  startEventRoomLifecycleScheduler
};
