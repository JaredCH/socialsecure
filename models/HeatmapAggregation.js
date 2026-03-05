const mongoose = require('mongoose');

const heatmapAggregationSchema = new mongoose.Schema({
  // Coarse geohash cell
  geohash: {
    type: String,
    required: true,
    index: true
  },
  // Precision level (1-6)
  precision: {
    type: Number,
    required: true,
    enum: [1, 2, 3, 4, 5, 6]
  },
  // Aggregated data
  data: {
    // Total active users in this cell
    userCount: {
      type: Number,
      default: 0
    },
    // Sum of activity scores
    totalActivity: {
      type: Number,
      default: 0
    },
    // Average activity score
    avgActivity: {
      type: Number,
      default: 0
    },
    // Number of interactions in this cell
    interactionCount: {
      type: Number,
      default: 0
    },
    // Number of spotlights in this cell
    spotlightCount: {
      type: Number,
      default: 0
    }
  },
  // Center point for rendering
  center: {
    lat: Number,
    lng: Number
  },
  // Bounding box for this cell
  bounds: {
    north: Number,
    south: Number,
    east: Number,
    west: Number
  },
  // Time window for this aggregation
  timeWindow: {
    type: String,
    enum: ['hour', 'day', 'week'],
    default: 'hour'
  },
  // When this aggregation was computed
  computedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
heatmapAggregationSchema.index({ geohash: 1, precision: 1, timeWindow: 1 }, { unique: true });
heatmapAggregationSchema.index({ 'data.userCount': -1 });
heatmapAggregationSchema.index({ computedAt: 1 });

// Static method to recompute heatmap for a region
heatmapAggregationSchema.statics.recomputeRegion = async function(bounds, precision = 5) {
  const LocationPresence = require('./LocationPresence');
  const Spotlight = require('./Spotlight');
  
  // Get all active presences in bounds
  const presencePipeline = [
    {
      $geoMatch: {
        location: {
          $geometry: {
            type: 'Polygon',
            coordinates: [[
              [bounds.west, bounds.south],
              [bounds.east, bounds.south],
              [bounds.east, bounds.north],
              [bounds.west, bounds.north],
              [bounds.west, bounds.south]
            ]]
          }
        }
      }
    },
    {
      $group: {
        _id: { $substr: ['$geohash', 0, precision] },
        userCount: { $sum: 1 },
        totalActivity: { $sum: '$activityScore' },
        avgLat: { $avg: { $arrayElemAt: ['$location.coordinates', 1] } },
        avgLng: { $avg: { $arrayElemAt: ['$location.coordinates', 0] } }
      }
    }
  ];
  
  const presenceResults = await LocationPresence.aggregate(presencePipeline);
  
  // Get spotlight counts per cell
  const spotlightPipeline = [
    {
      $geoMatch: {
        location: {
          $geometry: {
            type: 'Polygon',
            coordinates: [[
              [bounds.west, bounds.south],
              [bounds.east, bounds.south],
              [bounds.east, bounds.north],
              [bounds.west, bounds.north],
              [bounds.west, bounds.south]
            ]]
          }
        }
      }
    },
    {
      $group: {
        _id: { $substr: ['$geohash', 0, precision] },
        spotlightCount: { $sum: 1 }
      }
    }
  ];
  
  const spotlightResults = await Spotlight.aggregate(spotlightPipeline);
  
  const spotlightMap = new Map(
    spotlightResults.map(s => [s._id, s.spotlightCount])
  );
  
  // Upsert all aggregations
  const bulkOps = presenceResults.map(result => {
    const avgActivity = result.userCount > 0 
      ? result.totalActivity / result.userCount 
      : 0;
    
    // Calculate bounds for this geohash cell
    const cellBounds = getGeohashBounds(result._id, precision);
    
    return {
      updateOne: {
        filter: { 
          geohash: result._id, 
          precision, 
          timeWindow: 'hour' 
        },
        update: {
          $set: {
            'data.userCount': result.userCount,
            'data.totalActivity': result.totalActivity,
            'data.avgActivity': avgActivity,
            'data.spotlightCount': spotlightMap.get(result._id) || 0,
            center: {
              lat: result.avgLat,
              lng: result.avgLng
            },
            bounds: cellBounds,
            timeWindow: 'hour',
            computedAt: new Date()
          }
        },
        upsert: true
      }
    };
  });
  
  if (bulkOps.length > 0) {
    await this.bulkWrite(bulkOps);
  }
  
  return bulkOps.length;
};

// Static method to get heatmap tiles
heatmapAggregationSchema.statics.getTiles = async function(bounds, precision = 5) {
  return this.find({
    precision,
    timeWindow: 'hour',
    computedAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) }, // Within last hour
    'data.userCount': { $gt: 0 },
    'center.lat': { $gte: bounds.south, $lte: bounds.north },
    'center.lng': { $gte: bounds.west, $lte: bounds.east }
  }).sort({ 'data.userCount': -1 });
};

// Helper: Get bounding box for a geohash
function getGeohashBounds(geohash, precision) {
  // This is a simplified version - in production use a proper geohash library
  const base32 = '0123456789bcdefghjkmnpqrstuvwxyz';
  let latInterval = [-90, 90];
  let lngInterval = [-180, 180];
  
  let isLon = true;
  for (let i = 0; i < precision; i++) {
    const char = geohash[i] || '';
    const idx = base32.indexOf(char);
    if (idx === -1) continue;
    
    const val = idx;
    
    if (isLon) {
      const range = lngInterval[1] - lngInterval[0];
      const div = range / 32;
      if ((val & 16) > 0) lngInterval[0] += div;
      else lngInterval[1] -= div;
      if ((val & 8) > 0) lngInterval[0] += div / 2;
      else lngInterval[1] -= div / 2;
      if ((val & 4) > 0) lngInterval[0] += div / 4;
      else lngInterval[1] -= div / 4;
      if ((val & 2) > 0) lngInterval[0] += div / 8;
      else lngInterval[1] -= div / 8;
      if ((val & 1) > 0) lngInterval[0] += div / 16;
      else lngInterval[1] -= div / 16;
    } else {
      const range = latInterval[1] - latInterval[0];
      const div = range / 32;
      if ((val & 16) > 0) latInterval[0] += div;
      else latInterval[1] -= div;
      if ((val & 8) > 0) latInterval[0] += div / 2;
      else latInterval[1] -= div / 2;
      if ((val & 4) > 0) latInterval[0] += div / 4;
      else latInterval[1] -= div / 4;
      if ((val & 2) > 0) latInterval[0] += div / 8;
      else latInterval[1] -= div / 8;
      if ((val & 1) > 0) latInterval[0] += div / 16;
      else latInterval[1] -= div / 16;
    }
    isLon = !isLon;
  }
  
  return {
    north: latInterval[1],
    south: latInterval[0],
    east: lngInterval[1],
    west: lngInterval[0]
  };
}

// Static method to cleanup old aggregations
heatmapAggregationSchema.statics.cleanup = async function() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  return this.deleteMany({ computedAt: { $lt: cutoff } });
};

const HeatmapAggregation = mongoose.model('HeatmapAggregation', heatmapAggregationSchema);

module.exports = HeatmapAggregation;
