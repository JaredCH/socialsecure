const ChatRoom = require('../models/ChatRoom');

const reconcileEventRooms = async ({ now = new Date() } = {}) => {
  if (typeof ChatRoom.ensureDefaultStateRooms === 'function') {
    await ChatRoom.ensureDefaultStateRooms();
  }
  const deleteResult = await ChatRoom.deleteMany({ type: 'event' });
  return {
    created: 0,
    updated: 0,
    archived: deleteResult.deletedCount || 0,
    cap: 0,
    removedAt: now
  };
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
