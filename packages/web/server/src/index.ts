import { Hono } from 'hono';
import type { Env } from '../../../../env.js';

const app = new Hono<{ Bindings: Env }>();

app.get('/health', c => c.json({ status: 'ok' }));

app.get('*', async c => {
    const url = new URL(c.req.url);
    url.pathname = '/index.html';
    return c.env.ASSETS.fetch(new Request(url, c.req));
});

export default app;
