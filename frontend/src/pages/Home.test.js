import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Home from './Home';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* polyfill IntersectionObserver for jsdom */
if (typeof IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class IntersectionObserver {
    constructor(cb) { this._cb = cb; }
    observe() {
      /* immediately fire with isIntersecting true so whileInView triggers */
      this._cb([{ isIntersecting: true, target: document.createElement('div') }]);
    }
    unobserve() {}
    disconnect() {}
  };
}

/* stub canvas so ParticleGrid doesn't blow up in jsdom */
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = () => ({
    clearRect: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    arc: () => {},
    fill: () => {},
    set strokeStyle(_) {},
    set fillStyle(_) {},
    set lineWidth(_) {},
  });
});

describe('Home landing page', () => {
  let container;
  let root;

  const renderHome = async (props = {}) => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Home {...props} />
        </MemoryRouter>
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

  it('shows the new landing page headline and logged-out CTAs', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.textContent).toContain('Real Data.');
    expect(container.textContent).toContain('Real Privacy.');
    expect(container.textContent).toContain('Real Control.');
    expect(container.textContent).toContain(
      'A social platform built on encrypted communication, real-time local intelligence'
    );
    expect(container.textContent).toContain('Get Started');
    expect(container.textContent).toContain('View Live Demo');
    expect(container.textContent).toContain('Get Started Free');
    expect(container.textContent).toContain('Sign In');
  });

  it('shows authenticated member actions instead of signup prompts', async () => {
    await renderHome({ isAuthenticated: true });

    expect(container.textContent).toContain('Open Social Feed');
    expect(container.textContent).toContain('Open Chat');
    expect(container.textContent).toContain('Go to Social');
    expect(container.textContent).toContain('Open Calendar');
    expect(container.textContent).not.toContain('Get Started');
    expect(container.querySelector('a[href="/chat"]')).not.toBeNull();
    expect(container.querySelector('a[href="/calendar"]')).not.toBeNull();
  });

  it('renders the hero section with particle grid and US map', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="hero-section"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="landing-page"]')).not.toBeNull();
    expect(container.querySelector('canvas')).not.toBeNull();
    expect(container.textContent).toContain('Privacy-First Social Platform');
  });

  it('renders the population density heatmap section', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="heatmap-visualization"]')).not.toBeNull();
    expect(container.textContent).toContain('Population Density');
    expect(container.textContent).toContain('LIVE DATA VISUALIZATION');
    expect(container.textContent).toContain('Active Regions');
    expect(container.textContent).toContain('Encrypted Streams');
    expect(container.textContent).toContain('LIVE');
  });

  it('renders the encrypted communication demo', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="encryption-demo"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="data-packet-line"]')).not.toBeNull();
    expect(container.textContent).toContain('ENCRYPTED COMMUNICATION');
    expect(container.textContent).toContain('End-to-End Encrypted');
    expect(container.textContent).toContain('Messages That');
    expect(container.textContent).toContain('Only You');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
  });

  it('renders the news aggregation engine section', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="news-aggregation"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="news-card"]').length).toBe(6);
    expect(container.textContent).toContain('NEWS AGGREGATION ENGINE');
    expect(container.textContent).toContain('One Intelligent Feed.');
    expect(container.textContent).toContain('Aggregated');
    expect(container.textContent).toContain('in Real-Time');
  });

  it('renders data flow visualization and privacy shield', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="data-flow"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="privacy-shield"]')).not.toBeNull();
    expect(container.textContent).toContain('DATA FLOW ARCHITECTURE');
    expect(container.textContent).toContain('PRIVACY SHIELD');
    expect(container.textContent).toContain('AES-256 encryption at rest');
    expect(container.textContent).toContain('End-to-end encrypted messaging');
    expect(container.textContent).toContain('Optional BYO PGP keys');
    expect(container.textContent).toContain('Zero-knowledge architecture');
  });

  it('renders the location intelligence section', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="location-intelligence"]')).not.toBeNull();
    expect(container.textContent).toContain('LOCATION INTELLIGENCE');
    expect(container.textContent).toContain('Nearby Data,');
  });

  it('renders the platform features grid with all 6 features', async () => {
    await renderHome({ isAuthenticated: false });

    expect(container.querySelector('[data-testid="features-grid"]')).not.toBeNull();
    expect(container.textContent).toContain('Real-Time Data');
    expect(container.textContent).toContain('End-to-End Encryption');
    expect(container.textContent).toContain('Local Intelligence');
    expect(container.textContent).toContain('News Aggregation');
    expect(container.textContent).toContain('Social Circles');
    expect(container.textContent).toContain('Data Sovereignty');
  });
});
