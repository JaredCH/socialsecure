/**
 * Tests for newsLocalSourcePlanner service.
 *
 * Validates:
 * - Location normalization
 * - Per-location plan generation with expected tiers
 * - No duplicate source URLs
 * - Batch plan deduplication across locations
 * - Non-US locations produce empty plans
 * - Tier enable/disable overrides
 */

const {
  buildLocalSourcePlan,
  buildBatchLocalSourcePlans,
  normalizeLocationInput,
  _indexes
} = require('./newsLocalSourcePlanner');

describe('newsLocalSourcePlanner', () => {
  describe('normalizeLocationInput', () => {
    it('normalizes a full US location', () => {
      const result = normalizeLocationInput({
        city: ' Austin ',
        state: 'TX',
        zipCode: '78666',
        country: 'US'
      });
      expect(result.city).toBe('Austin');
      expect(result.stateAbbrev).toBe('tx');
      expect(result.zipCode).toBe('78666');
      expect(result.country).toBe('US');
    });

    it('defaults country to US', () => {
      const result = normalizeLocationInput({ city: 'Denver' });
      expect(result.country).toBe('US');
    });

    it('handles empty input', () => {
      const result = normalizeLocationInput({});
      expect(result.city).toBe('');
      expect(result.stateAbbrev).toBe('');
      expect(result.zipCode).toBe('');
    });

    it('resolves full state names to abbreviations', () => {
      const result = normalizeLocationInput({ city: 'Austin', state: 'Texas' });
      expect(result.stateAbbrev).toBe('tx');
    });

    it('resolves multi-word state names', () => {
      const result = normalizeLocationInput({ city: 'Charlotte', state: 'North Carolina' });
      expect(result.stateAbbrev).toBe('nc');
    });

    it('preserves existing abbreviations', () => {
      const result = normalizeLocationInput({ city: 'Denver', stateAbbrev: 'CO' });
      expect(result.stateAbbrev).toBe('co');
    });
  });

  describe('buildLocalSourcePlan', () => {
    it('generates plan for Austin, TX with expected tiers', () => {
      const plan = buildLocalSourcePlan({
        city: 'Austin',
        stateAbbrev: 'tx',
        zipCode: '78666'
      });

      expect(plan.locationKey).toBe('78666|Austin,tx');
      expect(plan.sources.length).toBeGreaterThan(0);

      // Should include Google News, TV affiliates, Patch, newspaper, Reddit
      const tiers = new Set(plan.sources.map(s => s.tier));
      expect(tiers.has(1)).toBe(true); // Google News
      expect(tiers.has(3)).toBe(true); // Patch

      // Should include TV affiliates (Austin has KVUE and KXAN)
      const affiliates = plan.sources.filter(s => s.providerId === 'tv-affiliate');
      expect(affiliates.length).toBeGreaterThanOrEqual(1);

      // Should include newspaper
      const papers = plan.sources.filter(s => s.providerId === 'local-newspaper');
      expect(papers.length).toBeGreaterThanOrEqual(1);
    });

    it('generates plan for New York, NY with multiple affiliates', () => {
      const plan = buildLocalSourcePlan({
        city: 'New York',
        stateAbbrev: 'ny'
      });

      expect(plan.locationKey).toBe('New York,ny');
      const affiliates = plan.sources.filter(s => s.providerId === 'tv-affiliate');
      expect(affiliates.length).toBeGreaterThanOrEqual(3); // WABC, WCBS, WNBC, WNYW
    });

    it('generates plan with only state (no city)', () => {
      const plan = buildLocalSourcePlan({
        stateAbbrev: 'la'
      });

      expect(plan.sources.length).toBeGreaterThan(0);
      // Should have Google News state query
      const gn = plan.sources.filter(s => s.providerId === 'google-news-local');
      expect(gn.length).toBeGreaterThanOrEqual(1);
      expect(gn[0].queryType).toBe('state');

      // Should have state-level newspaper fallback
      const papers = plan.sources.filter(s => s.providerId === 'local-newspaper');
      expect(papers.length).toBeGreaterThanOrEqual(1);
    });

    it('produces no duplicate URLs within a plan', () => {
      const plan = buildLocalSourcePlan({
        city: 'Chicago',
        stateAbbrev: 'il',
        zipCode: '60601'
      });

      const urls = plan.sources.map(s => s.url.toLowerCase().trim());
      const uniqueUrls = new Set(urls);
      expect(urls.length).toBe(uniqueUrls.size);
    });

    it('returns empty sources for non-US country', () => {
      const plan = buildLocalSourcePlan({
        city: 'London',
        state: 'England',
        country: 'UK'
      });

      expect(plan.sources).toEqual([]);
    });

    it('respects tier enable/disable overrides', () => {
      const plan = buildLocalSourcePlan(
        { city: 'Austin', stateAbbrev: 'tx' },
        { enabledTiers: { googleNews: false, tvAffiliate: false, patch: true, newspaper: false, reddit: false } }
      );

      // Only Patch should be present
      expect(plan.sources.every(s => s.providerId === 'patch')).toBe(true);
      expect(plan.sources.length).toBe(1);
    });

    it('includes Reddit subreddit for cities in the mapping', () => {
      const plan = buildLocalSourcePlan({
        city: 'San Marcos',
        stateAbbrev: 'tx'
      });

      const reddit = plan.sources.filter(s => s.providerId === 'reddit-local');
      expect(reddit.length).toBe(1);
      expect(reddit[0].subreddit).toBe('sanmarcos');
    });

    it('includes locationKey on every source', () => {
      const plan = buildLocalSourcePlan({
        city: 'Denver',
        stateAbbrev: 'co',
        zipCode: '80202'
      });

      for (const src of plan.sources) {
        expect(src.locationKey).toBeDefined();
        expect(src.locationKey).toContain('co');
      }
    });
  });

  describe('buildBatchLocalSourcePlans', () => {
    it('deduplicates sources across multiple locations', () => {
      // Two locations with overlapping state (same newspapers)
      const result = buildBatchLocalSourcePlans([
        { city: 'Austin', stateAbbrev: 'tx' },
        { city: 'San Antonio', stateAbbrev: 'tx' }
      ]);

      expect(result.plans.length).toBe(2);
      expect(result.allSources.length).toBeGreaterThan(0);

      // No duplicate URLs across all sources
      const urls = result.allSources.map(s => s.url.toLowerCase().trim());
      const uniqueUrls = new Set(urls);
      expect(urls.length).toBe(uniqueUrls.size);
    });

    it('reports stats by tier', () => {
      const result = buildBatchLocalSourcePlans([
        { city: 'Chicago', stateAbbrev: 'il' }
      ]);

      expect(result.stats.totalLocations).toBe(1);
      expect(result.stats.totalSources).toBeGreaterThan(0);
      expect(result.stats.byTier).toBeDefined();
    });

    it('handles empty location array', () => {
      const result = buildBatchLocalSourcePlans([]);
      expect(result.plans).toEqual([]);
      expect(result.allSources).toEqual([]);
      expect(result.stats.totalLocations).toBe(0);
    });
  });

  describe('static data indexes', () => {
    it('has TV affiliates indexed', () => {
      expect(_indexes.affiliateIndex.size).toBeGreaterThan(0);
    });

    it('has newspapers indexed', () => {
      expect(_indexes.newspaperIndex.size).toBeGreaterThan(0);
    });

    it('has subreddits indexed', () => {
      expect(_indexes.subredditIndex.size).toBeGreaterThan(0);
    });
  });
});
