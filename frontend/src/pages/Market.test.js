import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Market from './Market';
import { authAPI, marketAPI } from '../utils/api';

jest.mock('../utils/api', () => ({
  authAPI: { getProfile: jest.fn() },
  marketAPI: {
    getListings: jest.fn(),
    createListing: jest.fn(),
    updateListing: jest.fn(),
    getUserListings: jest.fn(),
    getTransactions: jest.fn(),
    getTradeHistory: jest.fn(),
  },
}));

jest.mock('react-hot-toast', () => ({
  success: jest.fn(),
  error: jest.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Market listing creation affordance', () => {
  let container;
  let root;

  const renderMarket = async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <Market />
        </MemoryRouter>
      );
    });
  };

  const setFieldValue = async (selector, value) => {
    const element = container.querySelector(selector);
    await act(async () => {
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  const clickByText = async (text, scope = container) => {
    const button = Array.from(scope.querySelectorAll('button')).find((candidate) => candidate.textContent.includes(text));
    await act(async () => {
      button.click();
    });
  };

  beforeEach(() => {
    authAPI.getProfile.mockResolvedValue({ data: { user: { _id: 'user-1', username: 'seller' } } });
    marketAPI.getListings.mockResolvedValue({
      data: {
        listings: [],
        pagination: { page: 1, pages: 1, total: 0 },
      },
    });
    marketAPI.createListing.mockResolvedValue({ data: { listing: { _id: 'listing-1' } } });
    marketAPI.updateListing.mockResolvedValue({ data: { listing: { _id: 'listing-1' } } });
    marketAPI.getUserListings.mockResolvedValue({ data: { listings: [] } });
    marketAPI.getTransactions.mockResolvedValue({ data: { transactions: [] } });
    marketAPI.getTradeHistory.mockResolvedValue({ data: { history: [], pagination: { page: 1, pages: 1, total: 0 } } });

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
    jest.clearAllMocks();
  });

  it('shows an Add a Listing action', async () => {
    await renderMarket();

    expect(container.textContent).toContain('Add a Listing');
  });

  it('allows toggling mobile filter controls in browse view', async () => {
    await renderMarket();

    expect(container.textContent).toContain('Show Filters');
    await clickByText('Show Filters');
    expect(container.textContent).toContain('Hide Filters');
    await clickByText('Hide Filters');
    expect(container.textContent).toContain('Show Filters');
  });

  it('requires condition and category-specific details before creating for-sale listings', async () => {
    await renderMarket();
    await clickByText('Add a Listing');

    const modal = Array.from(container.querySelectorAll('.fixed.inset-0')).pop();
    await setFieldValue('input[placeholder="What are you listing?"]', 'Gaming Laptop');
    await clickByText('For Sale', modal);
    await clickByText('Electronics', modal);
    await setFieldValue('input[placeholder="0.00"]', '750');
    await setFieldValue('textarea[placeholder="Describe your listing in detail..."]', 'High-end laptop with charger included');
    await clickByText('Create Listing', modal);

    expect(container.textContent).toContain('Condition is required');
    expect(container.textContent).toContain('Item Type is required');
    expect(container.textContent).toContain('Pickup / Delivery Details is required');
    expect(marketAPI.createListing).not.toHaveBeenCalled();
  });

  it('shows an image upload field for listings', async () => {
    await renderMarket();
    await clickByText('Add a Listing');

    const modal = Array.from(container.querySelectorAll('.fixed.inset-0')).pop();
    const fileInput = modal.querySelector('input[type="file"]');
    expect(fileInput).not.toBeNull();
  });
});
