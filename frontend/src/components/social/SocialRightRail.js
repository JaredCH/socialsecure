import React from 'react';
import { Link } from 'react-router-dom';
import { getInitials } from '../../utils/initials';

const DEFAULT_ACCENT_COLORS = ['#6366f1', '#8b5cf6'];

const SocialRightRail = ({ sectionId, topFriends, onSectionClick, accentColor, accentColor2 }) => {
  const color1 = accentColor || DEFAULT_ACCENT_COLORS[0];
  const color2 = accentColor2 || DEFAULT_ACCENT_COLORS[1];
  return (
  <aside id={sectionId} data-social-section={sectionId} className="xl:col-span-3 space-y-4 xl:sticky xl:top-6">
    <section className="bg-white rounded-xl shadow p-5 border border-gray-100" onClick={() => onSectionClick('chat_panel')}>
      <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Chat Panel</h3>
      <p className="mt-3 text-sm text-gray-700">Jump into direct or room conversations without leaving the social experience.</p>
      <Link to="/chat" className="mt-4 inline-flex items-center justify-center w-full bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-800">
        Open Chat
      </Link>
    </section>

    <section className="bg-white rounded-xl shadow p-5 border border-gray-100" onClick={() => onSectionClick('top_friends')}>
      <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Top Friends</h3>
      {topFriends.length === 0 ? (
        <p className="mt-3 text-sm text-gray-600">Top friends are private or not set yet.</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          {topFriends.slice(0, 5).map((friend) => (
            <li key={friend._id || friend.username} className="flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold text-white" style={{ background: `linear-gradient(135deg, ${color1}, ${color2})` }}>
                {friend.avatarUrl ? <img src={friend.avatarUrl} alt={friend.username} className="h-full w-full object-cover" /> : getInitials(friend.realName, friend.username)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">@{friend.username}</p>
                {friend.realName ? <p className="truncate text-xs text-gray-500">{friend.realName}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>

    <section className="bg-white rounded-xl shadow p-5 border border-gray-100" onClick={() => onSectionClick('community_notes')}>
      <h3 className="text-sm uppercase tracking-wide text-gray-500 font-semibold">Community Notes</h3>
      <ul className="mt-3 space-y-2 text-sm text-gray-700 list-disc list-inside">
        <li>Keep posts constructive and clear.</li>
        <li>Use visibility settings to control reach.</li>
        <li>Switch to chat for real-time discussion.</li>
      </ul>
    </section>
  </aside>
  );
};

export default SocialRightRail;
