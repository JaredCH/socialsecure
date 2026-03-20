import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  StatusBadge,
  EmptyState,
  LoadMoreButton,
  SectionHeader,
  ErrorBanner,
  Spinner,
  PresenceDot,
  ToggleSwitch,
} from './index';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ─── helpers ──────────────────────────────────────────────────────────────────

let container;
let root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  container = null;
  root = null;
});

const render = (ui) => {
  act(() => root.render(ui));
};

// ─── StatusBadge ──────────────────────────────────────────────────────────────

describe('StatusBadge', () => {
  it('renders status text by default', () => {
    render(<StatusBadge status="active" />);
    expect(container.textContent).toBe('active');
  });

  it('renders custom label when provided', () => {
    render(<StatusBadge status="active" label="Running" />);
    expect(container.textContent).toBe('Running');
  });

  it('applies the color for known status', () => {
    render(<StatusBadge status="failed" />);
    const badge = container.querySelector('span');
    expect(badge.className).toContain('bg-red-100');
  });

  it('applies fallback color for unknown status', () => {
    render(<StatusBadge status="unknown_xyz" />);
    const badge = container.querySelector('span');
    expect(badge.className).toContain('bg-gray-100');
  });

  it('supports custom colorMap', () => {
    render(<StatusBadge status="custom" colorMap={{ custom: 'bg-pink-100 text-pink-700' }} />);
    const badge = container.querySelector('span');
    expect(badge.className).toContain('bg-pink-100');
  });

  it('forwards className', () => {
    render(<StatusBadge status="pending" className="extra" />);
    const badge = container.querySelector('span');
    expect(badge.className).toContain('extra');
  });
});

// ─── EmptyState ───────────────────────────────────────────────────────────────

describe('EmptyState', () => {
  it('renders title', () => {
    render(<EmptyState title="Nothing here" />);
    expect(container.textContent).toContain('Nothing here');
  });

  it('renders icon, description, and action', () => {
    render(
      <EmptyState
        icon="📭"
        title="Empty"
        description="No data found"
        action={<button>Retry</button>}
      />
    );
    expect(container.textContent).toContain('📭');
    expect(container.textContent).toContain('No data found');
    expect(container.querySelector('button').textContent).toBe('Retry');
  });

  it('has role="status"', () => {
    render(<EmptyState title="Empty" />);
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });
});

// ─── LoadMoreButton ───────────────────────────────────────────────────────────

describe('LoadMoreButton', () => {
  it('renders button when hasMore is true and not loading', () => {
    const onClick = jest.fn();
    render(<LoadMoreButton onClick={onClick} hasMore loading={false} />);
    const btn = container.querySelector('button');
    expect(btn).not.toBeNull();
    expect(btn.textContent).toBe('Load more');
    act(() => btn.click());
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when hasMore is false', () => {
    render(<LoadMoreButton onClick={() => {}} hasMore={false} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders nothing when loading', () => {
    render(<LoadMoreButton onClick={() => {}} hasMore loading />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('supports custom label', () => {
    render(<LoadMoreButton onClick={() => {}} hasMore label="Show more" />);
    expect(container.textContent).toContain('Show more');
  });
});

// ─── SectionHeader ────────────────────────────────────────────────────────────

describe('SectionHeader', () => {
  it('renders title text in uppercase', () => {
    render(<SectionHeader title="Trending" />);
    const heading = container.querySelector('h2');
    expect(heading).not.toBeNull();
    expect(heading.textContent).toContain('Trending');
    expect(heading.className).toContain('uppercase');
  });

  it('renders icon and subtitle', () => {
    render(<SectionHeader icon="🔥" title="Trending" subtitle="3 items" />);
    expect(container.textContent).toContain('🔥');
    expect(container.textContent).toContain('3 items');
  });

  it('renders action slot', () => {
    render(<SectionHeader title="Sources" action={<button>Manage</button>} />);
    expect(container.querySelector('button').textContent).toBe('Manage');
  });

  it('supports custom tag via as prop', () => {
    render(<SectionHeader title="Test" as="h3" />);
    expect(container.querySelector('h3')).not.toBeNull();
  });
});

// ─── ErrorBanner ──────────────────────────────────────────────────────────────

describe('ErrorBanner', () => {
  it('renders error message', () => {
    render(<ErrorBanner message="Something broke" />);
    expect(container.textContent).toContain('Something broke');
  });

  it('renders nothing when message is falsy', () => {
    render(<ErrorBanner message="" />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders nothing when message is null', () => {
    render(<ErrorBanner message={null} />);
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it('has role="alert"', () => {
    render(<ErrorBanner message="err" />);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('renders action slot', () => {
    render(<ErrorBanner message="Error" action={<button>Retry</button>} />);
    expect(container.querySelector('button').textContent).toBe('Retry');
  });
});

// ─── Spinner ──────────────────────────────────────────────────────────────────

describe('Spinner', () => {
  it('renders with aria-busy', () => {
    render(<Spinner />);
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
  });

  it('renders label text', () => {
    render(<Spinner label="Loading…" />);
    expect(container.textContent).toContain('Loading…');
  });

  it('applies custom size', () => {
    render(<Spinner size="h-4 w-4" />);
    const circle = container.querySelector('.animate-spin');
    expect(circle.className).toContain('h-4');
    expect(circle.className).toContain('w-4');
  });
});

// ─── PresenceDot ──────────────────────────────────────────────────────────────

describe('PresenceDot', () => {
  it('shows emerald for online', () => {
    render(<PresenceDot presence={{ status: 'online' }} />);
    const dot = container.querySelector('span');
    expect(dot.className).toContain('bg-emerald-500');
    expect(dot.getAttribute('title')).toBe('online');
  });

  it('shows amber for inactive', () => {
    render(<PresenceDot presence={{ status: 'inactive', lastSeen: new Date().toISOString() }} />);
    const dot = container.querySelector('span');
    expect(dot.className).toContain('bg-amber-400');
  });

  it('shows slate fallback for offline', () => {
    render(<PresenceDot presence={{ status: 'offline' }} />);
    const dot = container.querySelector('span');
    expect(dot.className).toContain('bg-slate-300');
  });

  it('has accessible role and label', () => {
    render(<PresenceDot presence={{ status: 'online' }} />);
    const dot = container.querySelector('[role="img"]');
    expect(dot).not.toBeNull();
    expect(dot.getAttribute('aria-label')).toContain('online');
  });
});

// ─── ToggleSwitch ─────────────────────────────────────────────────────────────

describe('ToggleSwitch', () => {
  it('renders with role="switch"', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} label="Toggle" />);
    const btn = container.querySelector('[role="switch"]');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-checked')).toBe('false');
  });

  it('calls onChange with toggled value on click', () => {
    const onChange = jest.fn();
    render(<ToggleSwitch checked={false} onChange={onChange} label="Toggle" />);
    act(() => container.querySelector('button').click());
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reflects checked state', () => {
    render(<ToggleSwitch checked={true} onChange={() => {}} label="Toggle" />);
    const btn = container.querySelector('[role="switch"]');
    expect(btn.getAttribute('aria-checked')).toBe('true');
    expect(btn.className).toContain('bg-blue-500');
  });

  it('disables when disabled=true', () => {
    render(<ToggleSwitch checked={false} onChange={() => {}} label="Toggle" disabled />);
    const btn = container.querySelector('button');
    expect(btn.disabled).toBe(true);
    expect(btn.className).toContain('opacity-50');
  });
});
