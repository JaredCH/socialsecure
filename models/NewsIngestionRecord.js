const mongoose = require('mongoose');

const newsIngestionRecordSchema = new mongoose.Schema({
  ingestionRunId: { type: String, required: true },
  eventType: { type: String, required: true, index: true },
  locationKey: { type: String, default: null, index: true },
  cacheHit: { type: Boolean, default: false },
  articleCount: { type: Number, default: 0 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  ingestedAt: { type: Date, default: Date.now, index: true }
}, {
  timestamps: true
});

newsIngestionRecordSchema.index({ locationKey: 1, createdAt: -1 });
newsIngestionRecordSchema.index({ eventType: 1, createdAt: -1 });

module.exports = mongoose.models.NewsIngestionRecord || mongoose.model('NewsIngestionRecord', newsIngestionRecordSchema);
