// craco.config.js — webpack overrides for CRA 5
//
// Why this file exists:
//   @imgly/background-removal pulls in onnxruntime-web, whose distributed
//   source maps reference files that no longer ship in newer versions
//   (e.g. ort-web.min.js was renamed to ort.min.js). source-map-loader
//   treats missing source files as build errors, breaking `npm start`.
//
//   The standard fix is to exclude node_modules from source-map-loader,
//   which is what CRA used to do by default before v5. We just put that
//   behavior back here.

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      webpackConfig.module.rules.forEach((rule) => {
        if (!rule.oneOf) return;
        rule.oneOf.forEach((loader) => {
          // Find the source-map-loader rule (test contains js|mjs|jsx|ts|tsx|css)
          if (loader.use && Array.isArray(loader.use)) {
            loader.use.forEach((u) => {
              if (u.loader && u.loader.includes('source-map-loader')) {
                u.options = { ...(u.options || {}), filterSourceMappingUrl: () => 'skip' };
              }
            });
          }
        });
      });
      // Also tell webpack to swallow the missing-source warnings if any slip through.
      webpackConfig.ignoreWarnings = [
        ...(webpackConfig.ignoreWarnings || []),
        /Failed to parse source map/,
        /onnxruntime-web/,
      ];
      return webpackConfig;
    },
  },
};
