import { SOCIAL_SECTIONS, SOCIAL_SECTION_IDS } from './sectionRegistry';

describe('social section registry', () => {
  it('provides stable section ids for all registered sections', () => {
    const ids = SOCIAL_SECTIONS.map((section) => section.id);

    expect(ids).toEqual([
      'profile_header',
      'guest_preview_notice',
      'left_profile_rail',
      'shortcuts',
      'snapshot',
      'guest_lookup',
      'composer',
      'circles',
      'timeline',
      'moderation_status',
      'gallery',
      'right_rail',
      'chat_panel',
      'top_friends',
      'community_notes'
    ]);

    ids.forEach((id) => {
      expect(SOCIAL_SECTION_IDS[id]).toBe(id);
    });
  });
});
