const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/api/fub',
    createProxyMiddleware({
      target: 'https://api.followupboss.com/v1',
      changeOrigin: true,
      pathRewrite: { '^/api/fub': '' },
      onProxyReq: (proxyReq, req) => {
        // Pull key from env (set in .env.local) or request header. Never hardcode here.
        const apiKey = req.headers['x-fub-key']
                    || process.env.FUB_API_KEY
                    || process.env.REACT_APP_FUB_API_KEY;
        if (!apiKey) {
          console.warn('[setupProxy] No FUB API key set — add FUB_API_KEY to .env.local');
          return;
        }
        const cred = Buffer.from(`${apiKey}:`).toString('base64');
        proxyReq.setHeader('Authorization', `Basic ${cred}`);
        proxyReq.removeHeader('x-fub-key');
      }
    })
  );

  // Forward /api/claude/* to the local Express server (server.js on port 3001),
  // which proxies to api.anthropic.com with ANTHROPIC_API_KEY injected.
  // In production, Vercel serves api/claude/messages.js as a serverless function.
  app.use(
    '/api/claude',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );

  // Forward /api/elevenlabs/* to the local Express server, which holds
  // ELEVENLABS_API_KEY and proxies to api.elevenlabs.io.
  app.use(
    '/api/elevenlabs',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );

  // Forward /api/google-business/* to the local Express server, which proxies
  // to Google's Business Profile APIs using the user's OAuth Bearer token.
  app.use(
    '/api/google-business',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );

  // Forward /api/meta-ads/* to the local Express server, which orchestrates
  // Meta Marketing API calls for campaign launch.
  app.use(
    '/api/meta-ads',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );
};
