const mongoose = require('mongoose');

const ingestionEventSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  severity: { type: String, enum: ['debug', 'info', 'warn', 'error'], default: 'info' },
  eventType: { type: String, required: true },
  message: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { _id: false });

const newsIngestionRecordSchema = new mongoose.Schema({
  ingestionRunId: { type: String, required: true },
  source: {
    name: { type: String, default: '' },
    sourceType: { type: String, default: '' },
    sourceId: { type: String, default: '' },
    providerId: { type: String, default: '' },
    url: { type: String, default: '' },
    tier: { type: Number, default: null },
    locationKey: { type: String, default: null }
  },
  ingestedAt: { type: Date, default: Date.now, index: true },
  scrapedAt: { type: Date, default: Date.now, index: true },
  normalized: {
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    url: { type: String, default: '' },
    imageUrl: { type: String, default: null },
    publishedAt: { type: Date, default: null },
    category: { type: String, default: null },
    topics: [{ type: String }],
    locations: [{ type: String }],
    assignedZipCode: { type: String, default: null },
    localityLevel: { type: String, default: 'global' },
    language: { type: String, default: 'en' },
    normalizedUrlHash: { type: String, default: null },
    locationTags: {
      zipCodes: [{ type: String }],
      cities: [{ type: String }],
      counties: [{ type: String }],
      states: [{ type: String }],
      countries: [{ type: String }]
    }
  },
  resolvedScope: { type: String, default: 'global', index: true },
  dedupe: {
    outcome: { type: String, enum: ['inserted', 'updated', 'duplicate', 'error'], required: true, index: true },
    existingArticleId: { type: String, default: null },
    reason: { type: String, default: '' }
  },
  persistence: {
    articleId: { type: String, default: null },
    operation: { type: String, enum: ['insert', 'update', 'skip', 'error'], default: 'skip' },
    persistedAt: { type: Date, default: null },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null }
  },
  processingStatus: { type: String, enum: ['processed', 'failed'], default: 'processed', index: true },
  tags: [{ type: String, index: true }],
  events: { type: [ingestionEventSchema], default: [] }
}, {
  timestamps: true
});

newsIngestionRecordSchema.index({ 'source.name': 1, createdAt: -1 });
newsIngestionRecordSchema.index({ 'normalized.assignedZipCode': 1, createdAt: -1 });
newsIngestionRecordSchema.index({ ingestionRunId: 1, createdAt: -1 });
newsIngestionRecordSchema.index({ processingStatus: 1, createdAt: -1 });

module.exports = mongoose.model('NewsIngestionRecord', newsIngestionRecordSchema);
