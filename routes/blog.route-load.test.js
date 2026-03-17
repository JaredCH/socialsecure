const request = require('supertest');
const express = require('express');

const blogRouter = require('./blog');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/blog', blogRouter);
  return app;
}

describe('blog route module', () => {
  it('mounts without missing dependency errors', () => {
    const app = buildApp();
    expect(app).toBeDefined();
  });

  it('returns 401 for protected create endpoint without auth token', async () => {
    const app = buildApp();
    const response = await request(app).post('/api/blog').send({
      title: 'Test title',
      content: 'Test content'
    });

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: 'Authentication required' });
  });

  it('returns 500 for protected create endpoint when JWT secret is missing', async () => {
    const originalJwtSecret = process.env.JWT_SECRET;
    let response;
    try {
      delete process.env.JWT_SECRET;
      const app = buildApp();
      response = await request(app)
        .post('/api/blog')
        .set('Authorization', 'Bearer some-token')
        .send({
          title: 'Test title',
          content: 'Test content'
        });
    } finally {
      if (originalJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalJwtSecret;
      }
    }

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'JWT configuration is missing' });
  });
});
