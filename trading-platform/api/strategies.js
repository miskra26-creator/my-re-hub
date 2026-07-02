'use strict';

const { STRATEGIES } = require('../src/strategies');

// GET /api/strategies — list available strategies with their defaults.
module.exports = (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  res.status(200).json(
    Object.entries(STRATEGIES).map(([key, v]) => ({
      key,
      name: v.name,
      defaults: v.defaults,
      blurb: v.blurb,
    }))
  );
};
