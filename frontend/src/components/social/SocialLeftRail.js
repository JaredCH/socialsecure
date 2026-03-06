import React from 'react';
import { Link } from 'react-router-dom';

const SocialLeftRail = ({ sectionId, currentUser, guestProfile, isAuthenticated, postsCount, friendsCount, onSectionClick }) => (
  <aside id={sectionId} data-social-section={sectionId} className="xl:col-span-3 space-y-4 xl:sticky xl:top-6">
    <section className="bg-white rounded-xl shadow p-5 border border-gray-100" onClick={() => onSectionClick('shortcuts')}>
      <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Shortcuts</h3>
      <ul className="mt-3 space-y-2 text-sm">
        <li><Link to="/social" className="block px-3 py-2 rounded-lg bg-blue-50 text-blue-700 font-medium">Social Stream</Link></li>
        <li><Link to="/market" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">Marketplace</Link></li>
        <li><Link to="/calendar" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">Calendar</Link></li>
        <li><Link to="/settings" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">User Settings</Link></li>
        <li><Link to="/refer" className="block px-3 py-2 rounded-lg hover:bg-gray-50 text-gray-700">Refer Friend</Link></li>
      </ul>
    </section>

    <section className="bg-white rounded-xl shadow p-5 border border-gray-100" onClick={() => onSectionClick('snapshot')}>
      <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Social Snapshot</h3>
      <div className="mt-3 space-y-3 text-sm text-gray-700">
        <p>Active profile: <span className="font-medium">{currentUser?.username ? `@${currentUser.username}` : guestProfile?.username ? `@${guestProfile.username}` : 'Guest'}</span></p>
        <p>Loaded posts: <span className="font-medium">{postsCount}</span></p>
        <p>Friends: <span className="font-medium">{friendsCount}</span></p>
        {!isAuthenticated && guestProfile?.username && (
          <p>Viewing public profile: <span className="font-medium">@{guestProfile.username}</span></p>
        )}
      </div>
    </section>
  </aside>
);

export default SocialLeftRail;
