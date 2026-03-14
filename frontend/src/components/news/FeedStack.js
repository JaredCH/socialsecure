import React from 'react';
import ArticleCard from './ArticleCard';

/**
 * FeedStack
 *
 * Renders the priority-stack from buildFeed response:
 *   • 2 featured local cards at top
 *   • 1 compact state card
 *   • 1 compact national card
 *   • then mini feed items
 *
 * Props:
 *   feedData  — API response: { sections: { local, state, national, trending }, feed }
 *   onArticle — (article) => void  called when a card is tapped
 *   loading   — bool
 */
const FeedStack = ({ feedData, onArticle, loading }) => {
  if (loading) {
    return (
      <div className="space-y-3 px-1 pt-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="animate-pulse rounded-2xl bg-gray-100 h-32" />
        ))}
      </div>
    );
  }

  if (!feedData) return null;

  const { sections = {}, feed = [] } = feedData;
  const { local = [], state = [], national = [], trending = [] } = sections;

  // Build the priority stack
  const localArticles = local.slice(0, 2);
  const stateArticle = state[0] || trending.find((a) => !localArticles.some((l) => l._id === a._id)) || null;
  const nationalArticle = national[0] || trending.find((a) =>
    a._id !== stateArticle?._id && !localArticles.some((l) => l._id === a._id)
  ) || null;

  const shownIds = new Set([
    ...localArticles.map((a) => a._id),
    stateArticle?._id,
    nationalArticle?._id
  ].filter(Boolean));

  const remainingFeed = feed.filter((a) => !shownIds.has(a._id));

  const hasAnything = localArticles.length > 0 || stateArticle || nationalArticle || remainingFeed.length > 0;

  if (!hasAnything) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-4">
        <span className="text-4xl mb-3" aria-hidden="true">📰</span>
        <p className="text-sm font-medium text-gray-600">No articles yet</p>
        <p className="text-xs text-gray-400 mt-1">Stories will appear here shortly after ingestion.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 px-1 pt-2 pb-6">
      {/* Local news — featured size */}
      {localArticles.length > 0 && (
        <section aria-label="Local news">
          {localArticles.length > 0 && (
            <header className="flex items-center gap-2 mb-2 px-1">
              <span className="text-xs font-semibold text-green-700 uppercase tracking-wide">Local</span>
              <div className="flex-1 h-px bg-green-100" />
            </header>
          )}
          <div className="space-y-3">
            {localArticles.map((article) => (
              <ArticleCard key={article._id} article={article} size="featured" onClick={onArticle} />
            ))}
          </div>
        </section>
      )}

      {/* State / National — compact size */}
      {(stateArticle || nationalArticle) && (
        <section aria-label="State and national news">
          <header className="flex items-center gap-2 mb-2 px-1">
            <span className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
              {stateArticle && nationalArticle ? 'State & National' : stateArticle ? 'State' : 'National'}
            </span>
            <div className="flex-1 h-px bg-blue-100" />
          </header>
          <div className="space-y-2">
            {stateArticle && <ArticleCard article={stateArticle} size="compact" onClick={onArticle} />}
            {nationalArticle && <ArticleCard article={nationalArticle} size="compact" onClick={onArticle} />}
          </div>
        </section>
      )}

      {/* Remaining feed — mini size */}
      {remainingFeed.length > 0 && (
        <section aria-label="More stories">
          <header className="flex items-center gap-2 mb-2 px-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">More Stories</span>
            <div className="flex-1 h-px bg-gray-100" />
          </header>
          <div className="bg-white rounded-xl ring-1 ring-gray-100 px-3 py-1">
            {remainingFeed.map((article) => (
              <ArticleCard key={article._id} article={article} size="mini" onClick={onArticle} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default FeedStack;
