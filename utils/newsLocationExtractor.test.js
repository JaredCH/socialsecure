'use strict';

const { extractLocationContext } = require('./newsLocationExtractor');

describe('newsLocationExtractor', () => {
  describe('extractLocationContext', () => {
    it('returns null when no US location signal is found', () => {
      expect(extractLocationContext('Global economy slows down', 'Markets react worldwide.')).toBeNull();
    });

    it('detects "City, ST" pattern in title', () => {
      const result = extractLocationContext('Roadwork announced in San Marcos, TX this weekend', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.cities).toContain('san marcos');
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['tx', 'texas']));
      expect(result.localityLevel).toBe('city');
      expect(result.scopeReason).toBe('city_mention');
    });

    it('detects full state name "Florida" in title', () => {
      const result = extractLocationContext('Florida Man arrested after bizarre incident', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['fl', 'florida']));
      expect(result.localityLevel).toBe('state');
      expect(result.scopeReason).toBe('state_mention');
    });

    it('detects "Tampa, FL" pattern and tags both city and state', () => {
      const result = extractLocationContext('New development project in Tampa, FL approved', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.cities).toContain('tampa');
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['fl', 'florida']));
      expect(result.localityLevel).toBe('city');
    });

    it('does not match "Kansas" inside "Arkansas"', () => {
      const result = extractLocationContext('Arkansas governor signs new bill', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['ar', 'arkansas']));
      expect(result.locationTags.states).not.toContain('ks');
      expect(result.locationTags.states).not.toContain('kansas');
    });

    it('matches "West Virginia" without also matching "Virginia"', () => {
      const result = extractLocationContext('West Virginia miners protest new regulation', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['wv', 'west virginia']));
      // Should NOT independently match "Virginia" (VA)
      expect(result.locationTags.states).not.toContain('va');
      expect(result.locationTags.states).not.toContain('virginia');
    });

    it('detects state mentioned only in description', () => {
      const result = extractLocationContext('New law signed by governor', 'The Texas legislature passed the bill.');
      expect(result).not.toBeNull();
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['tx', 'texas']));
    });

    it('detects multiple states in the same article', () => {
      const result = extractLocationContext('California and Texas lead in tech jobs', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['ca', 'california']));
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['tx', 'texas']));
    });

    it('falls back to city location index for known cities', () => {
      const result = extractLocationContext('Downtown growth surges in Miami as housing demand rises', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.cities).toContain('miami');
      expect(result.locationTags.states).toEqual(expect.arrayContaining(['fl']));
    });

    it('always includes "us" in countries when a state is detected', () => {
      const result = extractLocationContext('Ohio voters head to the polls', '');
      expect(result).not.toBeNull();
      expect(result.locationTags.countries).toContain('us');
    });

    it('returns null for non-location text with common words', () => {
      expect(extractLocationContext('How to cook the perfect steak', 'Tips from professional chefs.')).toBeNull();
    });

    it('handles empty inputs gracefully', () => {
      expect(extractLocationContext('', '')).toBeNull();
      expect(extractLocationContext()).toBeNull();
    });
  });
});
