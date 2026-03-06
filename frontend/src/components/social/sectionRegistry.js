export const SOCIAL_SECTIONS = Object.freeze([
  { id: 'profile_header', area: 'top' },
  { id: 'guest_preview_notice', area: 'top' },
  { id: 'left_profile_rail', area: 'left' },
  { id: 'shortcuts', area: 'left' },
  { id: 'snapshot', area: 'left' },
  { id: 'guest_lookup', area: 'main' },
  { id: 'composer', area: 'main' },
  { id: 'circles', area: 'main' },
  { id: 'timeline', area: 'main' },
  { id: 'moderation_status', area: 'main' },
  { id: 'gallery', area: 'main' },
  { id: 'right_rail', area: 'right' },
  { id: 'chat_panel', area: 'right' },
  { id: 'top_friends', area: 'right' },
  { id: 'community_notes', area: 'right' }
]);

export const SOCIAL_SECTION_IDS = Object.freeze(
  SOCIAL_SECTIONS.reduce((acc, section) => {
    acc[section.id] = section.id;
    return acc;
  }, {})
);
