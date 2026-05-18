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
};
