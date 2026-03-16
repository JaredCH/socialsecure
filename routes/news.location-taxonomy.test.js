const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

jest.mock('../models/User', () => ({
  findById: jest.fn()
}));

jest.mock('../services/zipLocationIndex', () => ({
  resolveZipLocation: jest.fn(),
  resolveZipLocationByCityState: jest.fn()
}));

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { resolveZipLocation } = require('../services/zipLocationIndex');
const newsRoutes = require('./news');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/news', newsRoutes.router);
  return app;
};

describe('GET /api/news/location-taxonomy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secret, callback) => callback(null, { userId: 'user-1' }));
  });

  it('includes the registered ZIP-derived preferred state in the taxonomy payload', async () => {
    const app = buildApp();
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ zipCode: '78666', state: null })
      })
    });
    resolveZipLocation.mockResolvedValue({ stateCode: 'TX', state: 'Texas' });

    const response = await request(app)
      .get('/api/news/location-taxonomy')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(resolveZipLocation).toHaveBeenCalledWith('78666', { allowGeocode: true, persist: true });
    expect(response.body.taxonomy.preferredStateCode).toBe('TX');
    expect(response.body.taxonomy.preferredStateName).toBe('Texas');
  });

  it('falls back to the stored profile state when ZIP lookup cannot resolve one', async () => {
    const app = buildApp();
    User.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ zipCode: '', state: 'California' })
      })
    });
    resolveZipLocation.mockResolvedValue(null);

    const response = await request(app)
      .get('/api/news/location-taxonomy')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body.taxonomy.preferredStateCode).toBe('CA');
    expect(response.body.taxonomy.preferredStateName).toBe('California');
  });
});
