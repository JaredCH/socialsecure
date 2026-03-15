'use strict';
const mongoose = require('mongoose');
const Article = require('../models/Article');

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/socialsecure')
  .then(async () => {
    const total = await Article.countDocuments();
    const active = await Article.countDocuments({ isActive: { $ne: false } });
    const inactive = await Article.countDocuments({ isActive: false });
    console.log('total:', total, 'active:', active, 'inactive:', inactive);
    const gr = await Article.aggregate([{ $group: { _id: '$category', c: { $sum: 1 } } }]);
    gr.sort((a,b)=>b.c-a.c).forEach(g => console.log(g._id, g.c));
    await mongoose.disconnect();
    process.exit(0);
  })
  .catch(e => { console.error(e.message); process.exit(1); });
