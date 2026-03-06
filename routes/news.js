const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Parser = require('rss-parser');
const { v4: uuidv4 } = require('uuid');

// Import models
const Article = require('../models/Article');
const RssSource = require('../models/RssSource');
const NewsPreferences = require('../models/NewsPreferences');
const User = require('../models/User');
const {
  calculateViralScore,
  createMomentumMap,
  getArticleMomentumSignal,
  summarizeSignals
} = require('../services/newsViralScore');

// Initialize RSS parser with timeout
const parser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'SocialSecure-NewsBot/1.0'
  }
});

const DEFAULT_PROMOTED_ITEMS = Math.max(1, parseInt(process.env.NEWS_PROMOTED_MAX_ITEMS || '10', 10) || 10);
const FEED_PROMOTED_MAX_ITEMS = 20;
const PROMOTED_ENDPOINT_MAX_ITEMS = 50;

// ============================================
// SOURCE ADAPTERS
// ============================================

/**
 * RSS Source Adapter
 * Handles standard RSS/Atom feeds
 */
async function fetchRssSource(source) {
  try {
    const feed = await parser.parseURL(source.url);
    
    return feed.items.map(item => {
      // Determine locality level from content
      let localityLevel = 'global';
      const content = `${item.title || ''} ${item.contentSnippet || ''}`.toLowerCase();
      
      if (content.includes('local') || content.includes('city') || 
          item.categories?.some(c => ['local', 'city'].includes(c.toLowerCase()))) {
        localityLevel = 'city';
      }
      
      return {
        title: item.title || 'Untitled',
        description: item.contentSnippet || item.content || '',
        source: source.name,
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: item.enclosure?.url || extractImageFromContent(item.content) || null,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        topics: item.categories?.map(c => c.toLowerCase()) || [],
        sourceType: 'rss',
        localityLevel,
        language: item.isoLanguage || 'en'
      };
    });
  } catch (error) {
    console.error(`Error fetching RSS source ${source.name}:`, error.message);
    // Mark source as unhealthy - using correct field names from RssSource model
    await RssSource.findByIdAndUpdate(source._id, {
      $inc: { errorCount: 1 },
      lastFetchStatus: 'error',
      lastError: error.message
    });
    return [];
  }
}

/**
 * Google News Source Adapter
 * Handles Google News RSS feeds based on queries
 */
async function fetchGoogleNewsSource(query, sourceType = 'googleNews') {
  try {
    const encodedQuery = encodeURIComponent(query);
    const feedUrl = `https://news.google.com/rss/search?q=${encodedQuery}`;
    
    const feed = await parser.parseURL(feedUrl);
    
    return feed.items.map(item => {
      // Extract source name from title format: "Title - Source Name"
      let sourceName = 'Google News';
      const dashIndex = item.title?.lastIndexOf(' - ');
      if (dashIndex > 0) {
        sourceName = item.title.substring(dashIndex + 3);
      }
      
      // Determine locality based on query
      let localityLevel = 'global';
      const queryLower = query.toLowerCase();
      
      if (queryLower.includes('city:') || queryLower.includes(',') || 
          /^[A-Z][a-z]+,?\s*[A-Z]{2}$/.test(query)) {
        localityLevel = 'city';
      } else if (queryLower.includes('state:')) {
        localityLevel = 'state';
      } else if (queryLower.includes('country:')) {
        localityLevel = 'country';
      }
      
      return {
        title: item.title || 'Untitled',
        description: item.contentSnippet || '',
        source: sourceName,
        sourceId: item.guid || item.link,
        url: item.link,
        imageUrl: null,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        topics: [queryLower],
        locations: [query],
        sourceType,
        localityLevel,
        language: 'en'
      };
    });
  } catch (error) {
    console.error(`Error fetching Google News for "${query}":`, error.message);
    return [];
  }
}

/**
 * YouTube RSS Adapter
 * Handles YouTube channel RSS feeds
 */
async function fetchYoutubeSource(channelUrl) {
  try {
    // Convert YouTube channel URL to RSS format if needed
    let rssUrl = channelUrl;
    if (channelUrl.includes('youtube.com/channel/')) {
      const channelId = channelUrl.split('youtube.com/channel/')[1]?.split('?')[0];
      rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    }
    
    const feed = await parser.parseURL(rssUrl);
    
    return feed.items.map(item => {
      return {
        title: item.title || 'Untitled',
        description: item.content || item.contentSnippet || '',
        source: 'YouTube',
        sourceId: item.id,
        url: item.links?.[0]?.href || item.link,
        imageUrl: item.mediaGroup?.mediaContents?.[0]?.url || null,
        publishedAt: item.published ? new Date(item.published) : new Date(),
        topics: ['youtube', 'video'],
        sourceType: 'youtube',
        localityLevel: 'global',
        language: 'en'
      };
    });
  } catch (error) {
    console.error(`Error fetching YouTube source:`, error.message);
    return [];
  }
}

/**
 * Podcast RSS Adapter
 * Handles podcast RSS feeds
 */
async function fetchPodcastSource(feedUrl) {
  try {
    const feed = await parser.parseURL(feedUrl);
    
    return feed.items.map(item => {
      return {
        title: item.title || 'Untitled',
        description: item.contentSnippet || item.content || '',
        source: feed.title || 'Podcast',
        sourceId: item.guid || item.enclosure?.url,
        url: item.enclosure?.url || item.link,
        imageUrl: feed.image?.url || null,
        publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
        topics: ['podcast', 'audio'],
        sourceType: 'podcast',
        localityLevel: 'global',
        language: feed.language || 'en'
      };
    });
  } catch (error) {
    console.error(`Error fetching Podcast source:`, error.message);
    return [];
  }
}

/**
 * Government Source Adapter
 * Handles government/official feeds
 */
async function fetchGovernmentSource(source) {
  // Government feeds are essentially RSS with specific handling
  return fetchRssSource(source);
}

// Helper: Extract image from HTML content
function extractImageFromContent(content) {
  if (!content) return null;
  const imgMatch = content.match(/<img[^>]+src="([^">]+)"/);
  return imgMatch ? imgMatch[1] : null;
}

// ============================================
// INGESTION LOGIC
// ============================================

/**
 * Process and deduplicate articles
 */
async function processArticles(articles) {
  const results = {
    inserted: 0,
    updated: 0,
    duplicates: 0
  };
  
  const scoredArticles = [];
  const momentumMap = createMomentumMap(articles, new Date());

  for (const article of articles) {
    try {
      const sourceMomentum = getArticleMomentumSignal(article, momentumMap);
      const scoring = calculateViralScore(article, { sourceMomentum });
      const scoredArticle = {
        ...article,
        viralScore: scoring.score,
        viralScoreVersion: scoring.scoreVersion,
        viralSignals: scoring.signals,
        isPromoted: scoring.isPromoted,
        lastScoredAt: scoring.lastScoredAt
      };

      // Check for duplicate by URL hash
      const existing = await Article.findOne({ normalizedUrlHash: article.normalizedUrlHash });
      
      if (existing) {
        // Update if newer
        if (article.publishedAt > existing.publishedAt) {
          await Article.findByIdAndUpdate(existing._id, {
            $set: {
              title: scoredArticle.title,
              description: scoredArticle.description,
              imageUrl: scoredArticle.imageUrl,
              publishedAt: scoredArticle.publishedAt,
              topics: [...new Set([...existing.topics, ...scoredArticle.topics])],
              locations: scoredArticle.locations ? [...new Set([...existing.locations, ...scoredArticle.locations])] : existing.locations,
              viralScore: scoredArticle.viralScore,
              viralScoreVersion: scoredArticle.viralScoreVersion,
              viralSignals: scoredArticle.viralSignals,
              isPromoted: scoredArticle.isPromoted,
              lastScoredAt: scoredArticle.lastScoredAt
            }
          });
          results.updated++;
          scoredArticles.push(scoredArticle);
        } else {
          results.duplicates++;
        }
        continue;
      }
      
      // Create new article
      const newArticle = new Article(scoredArticle);
      await newArticle.save();
      results.inserted++;
      scoredArticles.push(scoredArticle);
    } catch (error) {
      if (error.code === 11000) {
        results.duplicates++;
      } else {
        console.error('Error processing article:', error.message);
      }
    }
  }
  
  const scoreValues = scoredArticles.map(a => Number(a.viralScore) || 0);
  if (scoreValues.length > 0) {
    const scoreDistribution = {
      count: scoreValues.length,
      min: Math.min(...scoreValues),
      max: Math.max(...scoreValues),
      avg: Number((scoreValues.reduce((sum, score) => sum + score, 0) / scoreValues.length).toFixed(2)),
      promotedCount: scoredArticles.filter(a => a.isPromoted).length
    };
    console.log('[news-viral-score-distribution]', JSON.stringify(scoreDistribution));
  }

  return results;
}

/**
 * Main ingestion function - fetches all sources
 */
async function ingestAllSources() {
  console.log('Starting news ingestion...');
  const startTime = Date.now();
  
  let allArticles = [];
  
  // 1. Fetch configured RSS sources
  const rssSources = await RssSource.find({ isActive: true });
  for (const source of rssSources) {
    const articles = await fetchRssSource(source);
    allArticles = [...allArticles, ...articles];
    
    // Update source status - using correct field names from RssSource model
    await RssSource.findByIdAndUpdate(source._id, {
      lastFetchAt: new Date(),
      lastFetchStatus: 'success',
      fetchCount: articles.length
    });
  }
  
  // 2. Fetch default Google News topics - include ALL 10 categories
  const defaultTopics = [
    'technology',
    'science',
    'health',
    'business',
    'sports',
    'entertainment',
    'politics',
    'finance',
    'gaming',
    'artificial intelligence'
  ];
  for (const topic of defaultTopics) {
    const articles = await fetchGoogleNewsSource(topic, 'googleNews');
    allArticles = [...allArticles, ...articles];
  }
  
  // 3. Process all articles (deduplication)
  const results = await processArticles(allArticles);
  
  console.log(`Ingestion complete: ${results.inserted} inserted, ${results.updated} updated, ${results.duplicates} duplicates in ${Date.now() - startTime}ms`);
  return results;
}

// ============================================
// AUTHENTICATION MIDDLEWARE
// ============================================

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const jwt = require('jsonwebtoken');
  jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

// ============================================
// API ROUTES
// ============================================

/**
 * GET /api/news/feed
 * Get personalized news feed for user with followed keywords prioritization
 */
router.get('/feed', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      sourceType,
      topic,
      location
    } = req.query;
    
    // Get user's news preferences
    let preferences = await NewsPreferences.findOne({ user: req.user.userId });
    
    // Extract followed keywords for personalization
    const followedKeywords = preferences?.followedKeywords?.map(k => k.keyword) || [];
    
    // Build query
    const query = { isActive: true };
    
    // Filter by source type
    if (sourceType) {
      query.sourceType = sourceType;
    }
    
    // Filter by topic - if no specific topic provided, use user's preferences
    if (topic) {
      query.topics = topic.toLowerCase();
    } else if (preferences?.googleNewsTopics?.length > 0 || preferences?.gdletCategories?.length > 0) {
      // Use user's preferred topics/categories when no specific topic filter is selected
      const userTopics = [
        ...(preferences.googleNewsTopics || []),
        ...(preferences.gdletCategories || [])
      ];
      if (userTopics.length > 0) {
        query.$or = [
          { topics: { $in: userTopics.map(t => t.toLowerCase()) } },
          { topics: { $exists: false } }
        ];
      }
    }
    
    // Filter by location
    if (location) {
      query.locations = location.toLowerCase();
    }
    
    // Filter out hidden categories if user has preferences
    if (preferences?.hiddenCategories?.length > 0) {
      query.topics = {
        $nin: preferences.hiddenCategories.map(c => c.toLowerCase())
      };
    }
    
    // Calculate skip
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch articles with sorting (recency first, then by freshness score)
    let articles = await Article.find(query)
      .sort({ publishedAt: -1, freshnessScore: -1 })
      .skip(skip)
      .limit(parseInt(limit) * 2) // Fetch more to account for re-ranking
      .lean();
    
    // If user has preferences, apply personalization
    if (preferences) {
      // Apply local prioritization if enabled
      if (preferences.localPriorityEnabled && preferences.locations?.length > 0) {
        const priorityOrder = { city: 1, county: 2, state: 3, country: 4, global: 5 };
        
        // Get user's location locality levels
        const userLocalityLevels = preferences.locations.map(loc => {
          if (loc.city) return 'city';
          if (loc.county) return 'county';
          if (loc.state) return 'state';
          return 'country';
        });
        
        // Re-sort to prioritize local content
        articles = articles.sort((a, b) => {
          const aLevel = priorityOrder[a.localityLevel] || 5;
          const bLevel = priorityOrder[b.localityLevel] || 5;
          
          // Both are local - keep original order
          if (userLocalityLevels.includes(a.localityLevel) && userLocalityLevels.includes(b.localityLevel)) {
            return 0;
          }
          
          // Prioritize local content
          if (userLocalityLevels.includes(a.localityLevel)) return -1;
          if (userLocalityLevels.includes(b.localityLevel)) return 1;
          
          return 0;
        });
      }
      
      // Apply source filtering based on preferences
      if (preferences.rssSources?.length > 0) {
        const enabledSources = preferences.rssSources.filter(s => s.enabled).map(s => s.sourceId);
        articles = articles.filter(a => enabledSources.includes(a.source) || a.sourceType !== 'rss');
      }
    }
    
    // PRIORITY: Apply followed keywords boosting and add visual indicators
    if (followedKeywords.length > 0) {
      articles = articles.map(article => {
        const articleText = `${article.title || ''} ${article.description || ''} ${(article.topics || []).join(' ')}`.toLowerCase();
        
        // Check if article matches any followed keyword
        const matchedKeywords = followedKeywords.filter(keyword =>
          articleText.includes(keyword.toLowerCase())
        );
        
        // Add matched keywords and boost score if matches found
        if (matchedKeywords.length > 0) {
          return {
            ...article,
            matchedKeywords,
            isFollowingMatch: true, // Visual indicator for frontend
            _boostScore: matchedKeywords.length // Used for sorting
          };
        }
        
        return {
          ...article,
          matchedKeywords: [],
          isFollowingMatch: false,
          _boostScore: 0
        };
      });
      
      // Re-sort to prioritize articles matching followed keywords
      articles.sort((a, b) => {
        // First priority: followed keyword matches (higher boost score = higher priority)
        if (a._boostScore !== b._boostScore) {
          return b._boostScore - a._boostScore;
        }
        // Second priority: recency
        return new Date(b.publishedAt) - new Date(a.publishedAt);
      });
    }
    
    // Limit to requested number after re-ranking
    articles = articles.slice(0, parseInt(limit));
    
    // Get total count
    const total = await Article.countDocuments(query);

    const promotedLimit = Math.min(DEFAULT_PROMOTED_ITEMS, FEED_PROMOTED_MAX_ITEMS);
    const promotedArticles = await Article.find({ isActive: true, isPromoted: true })
      .sort({ viralScore: -1, publishedAt: -1 })
      .limit(promotedLimit)
      .lean();
    
    res.json({
      articles,
      promoted: promotedArticles.map((article) => ({
        article,
        viralScore: article.viralScore || 0,
        viralSignalsSummary: summarizeSignals(article.viralSignals)
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      },
      personalization: {
        followedKeywords,
        hasKeywordMatches: articles.some(a => a.isFollowingMatch)
      }
    });
  } catch (error) {
    console.error('Error fetching news feed:', error);
    res.status(500).json({ error: 'Failed to fetch news feed' });
  }
});

/**
 * GET /api/news/promoted
 * Get promoted news ranked by viral score
 */
router.get('/promoted', authenticateToken, async (req, res) => {
  try {
    const requestedLimit = parseInt(req.query.limit || String(DEFAULT_PROMOTED_ITEMS), 10);
    const limit = Math.max(1, Math.min(Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_PROMOTED_ITEMS, PROMOTED_ENDPOINT_MAX_ITEMS));
    const topic = req.query.topic ? String(req.query.topic).toLowerCase() : null;

    const query = {
      isActive: true,
      isPromoted: true
    };

    if (topic) {
      query.topics = topic;
    }

    const promotedArticles = await Article.find(query)
      .sort({ viralScore: -1, publishedAt: -1 })
      .limit(limit)
      .lean();

    return res.json({
      items: promotedArticles.map((article) => ({
        article,
        viralScore: article.viralScore || 0,
        viralSignalsSummary: summarizeSignals(article.viralSignals)
      }))
    });
  } catch (error) {
    console.error('Error fetching promoted news:', error);
    return res.status(500).json({ error: 'Failed to fetch promoted news' });
  }
});

/**
 * GET /api/news/sources
 * Get available RSS sources
 */
router.get('/sources', authenticateToken, async (req, res) => {
  try {
    const sources = await RssSource.find({ isActive: true })
      .sort({ priority: -1, name: 1 });
    
    res.json({ sources });
  } catch (error) {
    console.error('Error fetching sources:', error);
    res.status(500).json({ error: 'Failed to fetch sources' });
  }
});

/**
 * GET /api/news/preferences
 * Get user's news preferences
 */
router.get('/preferences', authenticateToken, async (req, res) => {
  try {
    let preferences = await NewsPreferences.findOne({ user: req.user.userId })
      .populate('rssSources.sourceId');
    
    // Create default preferences if none exist
    if (!preferences) {
      preferences = await NewsPreferences.create({
        user: req.user.userId,
        rssSources: [],
        googleNewsTopics: ['technology', 'science'],
        googleNewsEnabled: true,
        gdletEnabled: true,
        locations: [],
        followedKeywords: [],
        localPriorityEnabled: true
      });
    }
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

/**
 * PUT /api/news/preferences
 * Update user's news preferences
 */
router.put('/preferences', authenticateToken, async (req, res) => {
  try {
    const {
      rssSources,
      googleNewsTopics,
      googleNewsEnabled,
      gdletCategories,
      gdletEnabled,
      locations,
      followedKeywords,
      localPriorityEnabled
    } = req.body;
    
    const updateData = {};
    
    if (rssSources !== undefined) updateData.rssSources = rssSources;
    if (googleNewsTopics !== undefined) updateData.googleNewsTopics = googleNewsTopics;
    if (googleNewsEnabled !== undefined) updateData.googleNewsEnabled = googleNewsEnabled;
    if (gdletCategories !== undefined) updateData.gdletCategories = gdletCategories;
    if (gdletEnabled !== undefined) updateData.gdletEnabled = gdletEnabled;
    if (locations !== undefined) updateData.locations = locations;
    if (followedKeywords !== undefined) updateData.followedKeywords = followedKeywords;
    if (localPriorityEnabled !== undefined) updateData.localPriorityEnabled = localPriorityEnabled;
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { $set: updateData },
      { new: true, upsert: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

/**
 * POST /api/news/preferences/keywords
 * Add a followed keyword
 */
router.post('/preferences/keywords', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.body;
    
    if (!keyword) {
      return res.status(400).json({ error: 'Keyword is required' });
    }
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $addToSet: { 
          followedKeywords: { 
            keyword: keyword.toLowerCase(),
            createdAt: new Date()
          } 
        }
      },
      { new: true, upsert: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error adding keyword:', error);
    res.status(500).json({ error: 'Failed to add keyword' });
  }
});

/**
 * DELETE /api/news/preferences/keywords/:keyword
 * Remove a followed keyword
 */
router.delete('/preferences/keywords/:keyword', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.params;
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $pull: { 
          followedKeywords: { keyword: keyword.toLowerCase() } 
        }
      },
      { new: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error removing keyword:', error);
    res.status(500).json({ error: 'Failed to remove keyword' });
  }
});

/**
 * POST /api/news/preferences/locations
 * Add a location preference
 */
router.post('/preferences/locations', authenticateToken, async (req, res) => {
  try {
    const { city, county, state, country, isPrimary = false } = req.body;
    
    if (!city && !county && !state && !country) {
      return res.status(400).json({ error: 'At least one location field is required' });
    }
    
    const locationData = {
      city: city || null,
      county: county || null,
      state: state || null,
      country: country || null,
      isPrimary
    };
    
    // If setting as primary, unset other primaries
    if (isPrimary) {
      await NewsPreferences.updateMany(
        { user: req.user.userId, 'locations.isPrimary': true },
        { $set: { 'locations.$[].isPrimary': false } }
      );
    }
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $addToSet: { locations: locationData }
      },
      { new: true, upsert: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error adding location:', error);
    res.status(500).json({ error: 'Failed to add location' });
  }
});

/**
 * DELETE /api/news/preferences/locations/:locationId
 * Remove a location preference
 */
router.delete('/preferences/locations/:locationId', authenticateToken, async (req, res) => {
  try {
    const { locationId } = req.params;
    
    const preferences = await NewsPreferences.findOneAndUpdate(
      { user: req.user.userId },
      { 
        $pull: { 
          locations: { _id: locationId } 
        }
      },
      { new: true }
    );
    
    res.json({ preferences });
  } catch (error) {
    console.error('Error removing location:', error);
    res.status(500).json({ error: 'Failed to remove location' });
  }
});

/**
 * PUT /api/news/preferences/hidden-categories
 * Update hidden categories - saves hidden categories to user's NewsPreferences
 */
router.put('/preferences/hidden-categories', authenticateToken, async (req, res) => {
  try {
    const { hiddenCategories } = req.body;
    
    if (!Array.isArray(hiddenCategories)) {
      return res.status(400).json({ error: 'hiddenCategories must be an array' });
    }
    
    // Ensure preferences exist first
    let preferences = await NewsPreferences.findOne({ user: req.user.userId });
    
    if (!preferences) {
      // Create new preferences with hidden categories
      preferences = await NewsPreferences.create({
        user: req.user.userId,
        hiddenCategories: hiddenCategories.map(c => c.toLowerCase())
      });
    } else {
      // Update existing preferences
      preferences = await NewsPreferences.findOneAndUpdate(
        { user: req.user.userId },
        {
          $set: {
            hiddenCategories: hiddenCategories.map(c => c.toLowerCase()),
            updatedAt: new Date()
          }
        },
        { new: true }
      );
    }
    
    res.json({
      success: true,
      preferences
    });
  } catch (error) {
    console.error('Error updating hidden categories:', error);
    res.status(500).json({ error: 'Failed to update hidden categories' });
  }
});

/**
 * POST /api/news/sources
 * Add a new RSS source (admin or user-defined)
 */
router.post('/sources', authenticateToken, async (req, res) => {
  try {
    const { name, url, type = 'rss', category, priority = 1 } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({ error: 'Name and URL are required' });
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }
    
    // Check if source already exists
    const existing = await RssSource.findOne({ url });
    if (existing) {
      return res.status(400).json({ error: 'Source already exists' });
    }
    
    const source = await RssSource.create({
      name,
      url,
      type,
      category,
      priority,
      addedBy: req.user.userId,
      isActive: true
    });
    
    res.status(201).json({ source });
  } catch (error) {
    console.error('Error adding source:', error);
    res.status(500).json({ error: 'Failed to add source' });
  }
});

/**
 * DELETE /api/news/sources/:sourceId
 * Remove an RSS source
 */
router.delete('/sources/:sourceId', authenticateToken, async (req, res) => {
  try {
    const { sourceId } = req.params;
    
    await RssSource.findByIdAndDelete(sourceId);
    
    res.json({ message: 'Source deleted successfully' });
  } catch (error) {
    console.error('Error deleting source:', error);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

/**
 * POST /api/news/ingest
 * Trigger manual ingestion (for testing/admin)
 */
router.post('/ingest', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin (you might want to add role checking)
    const results = await ingestAllSources();
    
    res.json({ 
      message: 'Ingestion completed',
      results
    });
  } catch (error) {
    console.error('Error during ingestion:', error);
    res.status(500).json({ error: 'Ingestion failed' });
  }
});

/**
 * POST /api/news/promoted/rescore
 * Re-score recent articles (admin only)
 */
router.post('/promoted/rescore', authenticateToken, async (req, res) => {
  try {
    const requester = await User.findById(req.user.userId).select('_id isAdmin');
    if (!requester?.isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const hours = Math.max(1, Math.min(parseInt(req.body.hours || '48', 10), 168));
    const limit = Math.max(1, Math.min(parseInt(req.body.limit || '200', 10), 1000));
    const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));

    const recentArticles = await Article.find({
      isActive: true,
      publishedAt: { $gte: cutoff }
    })
      .sort({ publishedAt: -1 })
      .limit(limit)
      .lean();

    const momentumMap = createMomentumMap(recentArticles, new Date());
    const bulkOps = [];
    const rescoredValues = [];
    let promotedCount = 0;

    for (const article of recentArticles) {
      const sourceMomentum = getArticleMomentumSignal(article, momentumMap);
      const scoring = calculateViralScore(article, { sourceMomentum });
      rescoredValues.push(scoring.score);
      if (scoring.isPromoted) {
        promotedCount += 1;
      }
      bulkOps.push({
        updateOne: {
          filter: { _id: article._id },
          update: {
            $set: {
              viralScore: scoring.score,
              viralScoreVersion: scoring.scoreVersion,
              viralSignals: scoring.signals,
              isPromoted: scoring.isPromoted,
              lastScoredAt: scoring.lastScoredAt
            }
          }
        }
      });
    }

    if (bulkOps.length > 0) {
      await Article.bulkWrite(bulkOps);
      const scoreDistribution = {
        count: rescoredValues.length,
        min: Math.min(...rescoredValues),
        max: Math.max(...rescoredValues),
        avg: Number((rescoredValues.reduce((sum, score) => sum + score, 0) / rescoredValues.length).toFixed(2)),
        promotedCount
      };
      console.log('[news-viral-rescore-distribution]', JSON.stringify(scoreDistribution));
    }

    return res.json({
      rescored: bulkOps.length,
      hours,
      limit
    });
  } catch (error) {
    console.error('Error rescoring promoted news:', error);
    return res.status(500).json({ error: 'Failed to rescore promoted news' });
  }
});

/**
 * GET /api/news/topics
 * Get available news topics
 */
router.get('/topics', (req, res) => {
  const topics = [
    { id: 'technology', name: 'Technology', icon: '💻' },
    { id: 'science', name: 'Science', icon: '🔬' },
    { id: 'health', name: 'Health', icon: '🏥' },
    { id: 'business', name: 'Business', icon: '💼' },
    { id: 'sports', name: 'Sports', icon: '⚽' },
    { id: 'entertainment', name: 'Entertainment', icon: '🎬' },
    { id: 'politics', name: 'Politics', icon: '🏛️' },
    { id: 'finance', name: 'Finance', icon: '📈' },
    { id: 'gaming', name: 'Gaming', icon: '🎮' },
    { id: 'ai', name: 'AI & Machine Learning', icon: '🤖' }
  ];
  
  res.json({ topics });
});

/**
 * GET /api/news/article/:id
 * Get single article by ID
 */
router.get('/article/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const article = await Article.findById(id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json({ article });
  } catch (error) {
    console.error('Error fetching article:', error);
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

// ============================================
// INGESTION SCHEDULER
// ============================================

// Start ingestion scheduler (every 10 minutes)
let ingestionInterval = null;

function startIngestionScheduler() {
  if (ingestionInterval) {
    clearInterval(ingestionInterval);
  }
  
  // Initial ingestion
  ingestAllSources().catch(console.error);
  
  // Schedule every 10 minutes
  ingestionInterval = setInterval(() => {
    ingestAllSources().catch(console.error);
  }, 10 * 60 * 1000);
  
  console.log('News ingestion scheduler started (10-minute cadence)');
}

function stopIngestionScheduler() {
  if (ingestionInterval) {
    clearInterval(ingestionInterval);
    ingestionInterval = null;
    console.log('News ingestion scheduler stopped');
  }
}

// Export for manual control
module.exports = {
  router,
  ingestAllSources,
  startIngestionScheduler,
  stopIngestionScheduler,
  // Export adapters for testing
  adapters: {
    fetchRssSource,
    fetchGoogleNewsSource,
    fetchYoutubeSource,
    fetchPodcastSource,
    fetchGovernmentSource
  }
};
