import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import SocialHero from './SocialHero';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SocialHero hero display', () => {
  let container;
  let root;

  const renderHero = async (props = {}) => {
    await act(async () => {
      root.render(
        <SocialHero
          profile={{ name: 'Avery Stone', location: 'Portland, OR' }}
          heroConfig={{}}
          {...props}
        />
      );
    });
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('renders the profile name and location', async () => {
    await renderHero();

    expect(container.textContent).toContain('Avery Stone');
    expect(container.textContent).toContain('Portland, OR');
  });

  it('renders the avatar initial when no avatar URL is provided', async () => {
    await renderHero({ profile: { name: 'Avery Stone', avatarUrl: '' } });

    expect(container.textContent).toContain('A');
  });

  it('renders an avatar image when URL is provided', async () => {
    await renderHero({ profile: { name: 'Avery Stone', avatarUrl: '/avatar.jpg' } });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('/avatar.jpg');
  });

  it('shows the customize stage button when editing', async () => {
    const onEditClick = jest.fn();
    await renderHero({ isEditing: true, onEditClick });

    const editBtn = Array.from(container.querySelectorAll('button'))
      .find(b => b.textContent.includes('Customize stage'));
    expect(editBtn).not.toBeNull();
  });

  it('renders desktop section navigation when visibleTabs are provided', async () => {
    const onTabChange = jest.fn();
    await renderHero({
      heroConfig: { showNavigation: true },
      isMobile: false,
      activeTab: 'main',
      onTabChange,
      visibleTabs: [
        { id: 'main', label: 'Feed', icon: 'home' },
        { id: 'gallery', label: 'Gallery', icon: 'photo' },
        { id: 'friends', label: 'Friends', icon: 'users' }
      ]
    });

    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    expect(nav.textContent).toContain('Feed');
    expect(nav.textContent).toContain('Gallery');
    expect(nav.textContent).toContain('Friends');

    const galleryBtn = Array.from(nav.querySelectorAll('button'))
      .find(b => b.textContent.includes('Gallery'));
    await act(async () => {
      galleryBtn.click();
    });
    expect(onTabChange).toHaveBeenCalledWith('gallery');
  });

  it('does not render desktop nav on mobile (navigation handled by DotNav)', async () => {
    await renderHero({
      heroConfig: { showNavigation: true },
      isMobile: true,
      visibleTabs: [
        { id: 'main', label: 'Feed', icon: 'home' }
      ]
    });

    expect(container.querySelector('nav')).toBeNull();
  });

  it('does not render desktop nav when showNavigation is false', async () => {
    await renderHero({
      heroConfig: { showNavigation: false },
      isMobile: false,
      visibleTabs: [
        { id: 'main', label: 'Feed', icon: 'home' }
      ]
    });

    expect(container.querySelector('nav')).toBeNull();
  });

  it('hides location when showLocation is false', async () => {
    await renderHero({ heroConfig: { showLocation: false } });

    expect(container.textContent).not.toContain('Portland, OR');
  });

  it('accepts legacy navigation props without breaking', async () => {
    // SocialHero still accepts old props for backward compat but ignores them
    await renderHero({
      activeTab: 'gallery',
      onTabChange: jest.fn(),
      activitySummary: { unreadNotificationCount: 5 },
      enableMobileLauncher: true,
      visibleTabs: [],
      enabledSections: {},
      isGuestPreview: false,
    });

    expect(container.textContent).toContain('Avery Stone');
  });
});
