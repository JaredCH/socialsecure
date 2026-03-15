'use strict';
const mongoose = require('mongoose');
const Article = require('../models/Article');
const NewsPreferences = require('../models/NewsPreferences');
const ArticleImpression = require('../models/ArticleImpression');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/socialmedia';

mongoose.connect(MONGODB_URI).then(async () => {
  // Find admin user
  const admin = await User.findOne({ username: 'admin' }).lean();
  if (!admin) { console.log('No admin user found'); process.exit(1); }
  console.log('Admin ID:', admin._id.toString());

  // Check their prefs
  const prefs = await NewsPreferences.findOne({ user: admin._id }).lean();
  console.log('Has prefs:', !!prefs);
  if (prefs) {
    console.log('Locations:', JSON.stringify(prefs.locations || []));
    console.log('Teams:', JSON.stringify(prefs.followedSportsTeams || []));
  }

  // Check impressions
  const impressionCount = await ArticleImpression.countDocuments({ user: admin._id });
  console.log('Impression docs:', impressionCount);

  // Check what getDeprioritisedArticleIds returns
  const depIds = await ArticleImpression.getDeprioritisedArticleIds(admin._id, 2);
  console.log('Deprioritised IDs count:', depIds.length);

  // Test actual feed query - no exclude
  const feedArts = await Article.find({ isActive: { $ne: false } })
    .sort({ publishedAt: -1, viralScore: -1 })
    .limit(5)
    .lean();
  console.log('Direct feed query result count:', feedArts.length);
  if (feedArts.length > 0) {
    console.log('Sample article:', feedArts[0].title, '|', feedArts[0].category, '|', feedArts[0].publishedAt);
  }

  await mongoose.disconnect();
  process.exit(0);
}).catch(e => { console.error('Error:', e.message); process.exit(1); });
