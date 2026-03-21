import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import StockTicker from './StockTicker';
import { newsAPI } from '../../utils/api';

jest.mock('../../utils/api', () => ({
  newsAPI: {
    getStockQuotes: jest.fn(),
  },
}));

describe('StockTicker', () => {
  let container;
  let root;

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

  it('renders nothing when disabled', async () => {
    await act(async () => {
      root.render(<StockTicker tickers={['AAPL']} enabled={false} />);
    });
    await flush();

    expect(container.querySelector('[data-testid="stock-ticker-strip"]')).toBeNull();
  });

  it('renders nothing when tickers array is empty', async () => {
    await act(async () => {
      root.render(<StockTicker tickers={[]} enabled={true} />);
    });
    await flush();

    expect(container.querySelector('[data-testid="stock-ticker-strip"]')).toBeNull();
  });

  it('fetches and displays ticker data', async () => {
    newsAPI.getStockQuotes.mockResolvedValue({
      data: {
        quotes: [
          {
            symbol: 'AAPL',
            name: 'Apple Inc.',
            price: 175.50,
            previousClose: 173.00,
            change: 2.50,
            changePercent: 1.45,
            direction: 'up',
            sparkline: [172, 173, 174, 175, 175.5],
            currency: 'USD',
            marketState: 'REGULAR',
          },
          {
            symbol: 'BTC-USD',
            name: 'Bitcoin USD',
            price: 45000,
            previousClose: 46000,
            change: -1000,
            changePercent: -2.17,
            direction: 'down',
            sparkline: [46000, 45500, 45200, 45000],
            currency: 'USD',
            marketState: 'REGULAR',
          },
        ],
      },
    });

    await act(async () => {
      root.render(<StockTicker tickers={['AAPL', 'BTC-USD']} enabled={true} />);
    });
    await flush();

    expect(newsAPI.getStockQuotes).toHaveBeenCalledWith(['AAPL', 'BTC-USD']);
    expect(container.querySelector('[data-testid="stock-ticker-strip"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ticker-card-AAPL"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ticker-card-BTC-USD"]')).not.toBeNull();

    // Check AAPL shows green (up)
    const aaplCard = container.querySelector('[data-testid="ticker-card-AAPL"]');
    expect(aaplCard.textContent).toContain('AAPL');
    expect(aaplCard.textContent).toContain('175.50');
    expect(aaplCard.textContent).toContain('+1.45%');

    // Check BTC-USD shows red (down)
    const btcCard = container.querySelector('[data-testid="ticker-card-BTC-USD"]');
    expect(btcCard.textContent).toContain('BTC-USD');
    expect(btcCard.textContent).toContain('-2.17%');
  });

  it('shows loading state before data arrives', async () => {
    let resolveQuotes;
    newsAPI.getStockQuotes.mockReturnValue(
      new Promise((resolve) => { resolveQuotes = resolve; })
    );

    await act(async () => {
      root.render(<StockTicker tickers={['MSFT']} enabled={true} />);
    });
    await flush();

    expect(container.textContent).toContain('Loading tickers');

    await act(async () => {
      resolveQuotes({
        data: {
          quotes: [{
            symbol: 'MSFT',
            price: 380,
            direction: 'up',
            changePercent: 0.5,
            sparkline: [378, 379, 380],
          }],
        },
      });
    });
    await flush();

    expect(container.textContent).not.toContain('Loading tickers');
    expect(container.querySelector('[data-testid="ticker-card-MSFT"]')).not.toBeNull();
  });

  it('filters out errored quotes and still renders valid ones', async () => {
    newsAPI.getStockQuotes.mockResolvedValue({
      data: {
        quotes: [
          { symbol: 'INVALID', error: 'not_found' },
          {
            symbol: 'GOOG',
            price: 140,
            direction: 'flat',
            changePercent: 0,
            sparkline: [140, 140],
          },
        ],
      },
    });

    await act(async () => {
      root.render(<StockTicker tickers={['INVALID', 'GOOG']} enabled={true} />);
    });
    await flush();

    expect(container.querySelector('[data-testid="ticker-card-INVALID"]')).toBeNull();
    expect(container.querySelector('[data-testid="ticker-card-GOOG"]')).not.toBeNull();
  });
});
