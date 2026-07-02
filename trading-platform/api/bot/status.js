'use strict';

// The paper-trading bot only runs when the app is running LOCALLY on your
// machine (it uses your Alpaca API keys, which must never be exposed on a
// public site). On the deployed URL, this endpoint tells the UI to show a
// "run locally to use the bot" notice instead.
module.exports = (req, res) => {
  res.status(200).json({
    hasKeys: false,
    notAvailable: true,
    log: [],
    auto: { enabled: false, minutes: 60, config: null },
  });
};
