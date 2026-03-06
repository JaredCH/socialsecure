const mongoose = require('mongoose');
const TOP_FRIENDS_LIMIT = 5;

const topFriendSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  // Ordered array of friend IDs (max configurable, default 5)
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  // Maximum number of top friends allowed
  maxFriends: {
    type: Number,
    default: TOP_FRIENDS_LIMIT
  }
}, {
  timestamps: true
});

// Validate that all friends are actually accepted friends
topFriendSchema.pre('save', async function(next) {
  if (this.friends.length > this.maxFriends) {
    const error = new Error(`Cannot have more than ${this.maxFriends} top friends`);
    error.status = 400;
    return next(error);
  }
  next();
});

// Static method to get or create top friends list for a user
topFriendSchema.statics.getOrCreate = async function(userId) {
  let topFriend = await this.findOne({ user: userId });
  if (!topFriend) {
    topFriend = await this.create({ user: userId, friends: [], maxFriends: TOP_FRIENDS_LIMIT });
  } else {
    const currentMax = Number.isFinite(topFriend.maxFriends) ? topFriend.maxFriends : TOP_FRIENDS_LIMIT;
    const normalizedFriends = topFriend.friends.slice(0, TOP_FRIENDS_LIMIT);
    if (currentMax !== TOP_FRIENDS_LIMIT || normalizedFriends.length !== topFriend.friends.length) {
      topFriend.maxFriends = TOP_FRIENDS_LIMIT;
      topFriend.friends = normalizedFriends;
      await topFriend.save();
    }
  }
  return topFriend;
};

// Static method to update top friends order
topFriendSchema.statics.updateOrder = async function(userId, friendIds) {
  const topFriend = await this.getOrCreate(userId);
  const uniqueFriendIds = [...new Set(friendIds.map(id => id.toString()))];
  if (uniqueFriendIds.length > TOP_FRIENDS_LIMIT) {
    const error = new Error(`Cannot have more than ${TOP_FRIENDS_LIMIT} top friends`);
    error.status = 400;
    throw error;
  }
  
  // Validate all friends are accepted
  const Friendship = require('./Friendship');
  const userObjectId = mongoose.Types.ObjectId(userId);
  
  for (const friendId of uniqueFriendIds) {
    const friendship = await Friendship.findFriendship(userObjectId, friendId);
    if (!friendship || friendship.status !== 'accepted') {
      const error = new Error('All top friends must be accepted friends');
      error.status = 400;
      throw error;
    }
  }
  
  // Update the order (removes duplicates, keeps order)
  topFriend.maxFriends = TOP_FRIENDS_LIMIT;
  topFriend.friends = uniqueFriendIds.map(id => 
    mongoose.Types.ObjectId(id)
  );
  
  await topFriend.save();
  return topFriend;
};

// Method to add a friend to top friends
topFriendSchema.methods.addFriend = async function(friendId) {
  if (this.maxFriends !== TOP_FRIENDS_LIMIT) {
    this.maxFriends = TOP_FRIENDS_LIMIT;
  }
  if (this.friends.length >= TOP_FRIENDS_LIMIT) {
    const error = new Error(`Top friends list is full (max ${TOP_FRIENDS_LIMIT})`);
    error.status = 400;
    throw error;
  }
  
  if (!this.friends.some(id => id.toString() === friendId.toString())) {
    this.friends.push(friendId);
    await this.save();
  }
  
  return this;
};

// Method to remove a friend from top friends
topFriendSchema.methods.removeFriend = async function(friendId) {
  this.friends = this.friends.filter(id => id.toString() !== friendId.toString());
  await this.save();
  return this;
};

// Method to reorder top friends
topFriendSchema.methods.reorder = async function(newOrder) {
  // Validate all friends exist in current list
  const currentIds = this.friends.map(id => id.toString());
  for (const friendId of newOrder) {
    if (!currentIds.includes(friendId.toString())) {
      const error = new Error('Invalid friend ID in new order');
      error.status = 400;
      throw error;
    }
  }
  
  this.friends = newOrder.map(id => mongoose.Types.ObjectId(id));
  await this.save();
  return this;
};

module.exports = mongoose.model('TopFriend', topFriendSchema);
