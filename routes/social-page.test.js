const request = require('supertest');
const express = require('express');

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn()
}));

const mockUserModel = {
  findById: jest.fn(),
  findOne: jest.fn()
};
const mockSocialPageConfigModel = {
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  updateOne: jest.fn()
};

jest.mock('../models/User', () => mockUserModel);
jest.mock('../models/SocialPageConfig', () => mockSocialPageConfigModel);

const jwt = require('jsonwebtoken');
const router = require('./social-page');

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/social-page', router);
  return app;
};

const buildUserDoc = () => ({
  _id: 'user-1',
  username: 'owner',
  realName: 'Owner User',
  profileTheme: 'default',
  registrationStatus: 'active',
  socialPagePreferences: null,
  save: jest.fn().mockResolvedValue(true)
});

describe('social page route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jwt.verify.mockImplementation((token, secretOrOptions, maybeCallback) => {
      const payload = { userId: 'user-1' };
      if (typeof maybeCallback === 'function') {
        maybeCallback(null, payload);
        return undefined;
      }
      return payload;
    });
  });

  it('creates a saved config without applying it', async () => {
    const app = buildApp();
    const user = buildUserDoc();
    mockUserModel.findById.mockResolvedValue(user);

    const createdConfig = {
      _id: 'config-1',
      name: 'Studio Draft',
      design: {
        themePreset: 'dark',
        globalStyles: { panelColor: '#111111' },
        panels: {}
      },
      isShared: false,
      templateId: null,
      sourceConfigId: null,
      sourceOwnerId: null,
      favoritedBy: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      toObject() {
        return this;
      }
    };
    mockSocialPageConfigModel.create.mockResolvedValue(createdConfig);

    const response = await request(app)
      .post('/api/social-page/configs')
      .set('Authorization', 'Bearer token')
      .send({
        name: 'Studio Draft',
        apply: false,
        design: {
          themePreset: 'dark',
          panels: {
            timeline: {
              area: 'main',
              size: 'halfTile',
              useCustomStyles: true,
              styles: {
                panelColor: '#111111',
                headerColor: '#222222',
                fontColor: '#f8fafc',
                fontFamily: 'Manrope'
              }
            }
          }
        }
      });

    expect(response.status).toBe(201);
    expect(response.body.config.name).toBe('Studio Draft');
    expect(mockSocialPageConfigModel.create).toHaveBeenCalled();
    expect(user.save).not.toHaveBeenCalled();
  });

  it('clones a shared design safely for the current user', async () => {
    const app = buildApp();
    const user = buildUserDoc();
    mockUserModel.findById.mockResolvedValue(user);

    const sourceConfig = {
      _id: 'shared-1',
      owner: 'user-2',
      name: 'Shared Aurora',
      design: {
        themePreset: 'dark',
        panels: {
          timeline: {
            area: 'main',
            size: 'fullTile',
            useCustomStyles: true,
            styles: {
              panelColor: '#0f172a',
              headerColor: '#4f46e5',
              fontColor: '#e2e8f0',
              fontFamily: 'Space Grotesk'
            }
          }
        }
      },
      isShared: true
    };

    const clonedConfig = {
      _id: 'clone-1',
      owner: 'user-1',
      name: 'Shared Aurora Clone',
      design: sourceConfig.design,
      isShared: false,
      templateId: null,
      sourceConfigId: 'shared-1',
      sourceOwnerId: 'user-2',
      favoritedBy: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      toObject() {
        return this;
      }
    };

    mockSocialPageConfigModel.findOne.mockResolvedValue(sourceConfig);
    mockSocialPageConfigModel.create.mockResolvedValue(clonedConfig);

    const response = await request(app)
      .post('/api/social-page/shared/shared-1/clone')
      .set('Authorization', 'Bearer token')
      .send({ name: 'Shared Aurora Clone', apply: false });

    expect(response.status).toBe(201);
    expect(response.body.config.name).toBe('Shared Aurora Clone');
    expect(response.body.config.isShared).toBe(false);
    expect(mockSocialPageConfigModel.create).toHaveBeenCalledWith(expect.objectContaining({
      owner: 'user-1',
      sourceConfigId: 'shared-1',
      sourceOwnerId: 'user-2'
    }));
  });
});
