import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StockTickerSettingsPanel from './StockTickerSettingsPanel';
import { newsAPI } from '../../../../utils/api';

jest.mock('../../../../utils/api', () => ({
  newsAPI: {
    searchStocks: jest.fn(),
  },
}));

describe('StockTickerSettingsPanel', () => {
  let container;
  let root;
  let mockUpdatePreferences;

  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  });

  const flush = async () => {
    await act(async () => {
      await Promise.resolve();
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockUpdatePreferences = jest.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    jest.useRealTimers();
    act(() => {
      root.unmount();
    });
    container.remove();
    container = null;
    root = null;
  });

  it('renders the settings panel with toggle and empty state', async () => {
    await act(async () => {
      root.render(
        <StockTickerSettingsPanel
          tickers={[]}
          enabled={false}
          onUpdatePreferences={mockUpdatePreferences}
        />
      );
    });
    await flush();

    expect(container.querySelector('[data-testid="stock-ticker-settings"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="stock-ticker-toggle"]')).not.toBeNull();
    expect(container.textContent).toContain('No tickers added yet');
    expect(container.textContent).toContain('0/9');
  });

  it('displays existing tickers with remove buttons', async () => {
    await act(async () => {
      root.render(
        <StockTickerSettingsPanel
          tickers={['AAPL', 'MSFT', 'BTC-USD']}
          enabled={true}
          onUpdatePreferences={mockUpdatePreferences}
        />
      );
    });
    await flush();

    expect(container.querySelector('[data-testid="ticker-item-AAPL"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ticker-item-MSFT"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ticker-item-BTC-USD"]')).not.toBeNull();
    expect(container.textContent).toContain('3/9');
  });

  it('toggles enabled state when toggle is clicked', async () => {
    await act(async () => {
      root.render(
        <StockTickerSettingsPanel
          tickers={['AAPL']}
          enabled={false}
          onUpdatePreferences={mockUpdatePreferences}
        />
      );
    });
    await flush();

    const toggle = container.querySelector('[data-testid="stock-ticker-toggle"]');
    await act(async () => {
      toggle.click();
    });
    await flush();

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ stockTickersEnabled: true });
  });

  it('removes a ticker when remove button is clicked', async () => {
    await act(async () => {
      root.render(
        <StockTickerSettingsPanel
          tickers={['AAPL', 'MSFT']}
          enabled={true}
          onUpdatePreferences={mockUpdatePreferences}
        />
      );
    });
    await flush();

    const removeBtn = container.querySelector('[data-testid="ticker-remove-AAPL"]');
    await act(async () => {
      removeBtn.click();
    });
    await flush();

    expect(mockUpdatePreferences).toHaveBeenCalledWith({ stockTickers: ['MSFT'] });
  });

  it('enforces max 9 tickers limit', async () => {
    const maxTickers = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9'];
    await act(async () => {
      root.render(
        <StockTickerSettingsPanel
          tickers={maxTickers}
          enabled={true}
          onUpdatePreferences={mockUpdatePreferences}
        />
      );
    });
    await flush();

    // Search input should not be visible when at max
    expect(container.querySelector('[data-testid="stock-ticker-search"]')).toBeNull();
    expect(container.textContent).toContain('9/9');
  });
});
