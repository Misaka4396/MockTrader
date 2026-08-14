/* worker.js — 后台线程运行核心流水线（不卡 UI），回传进度与结果 */
(function () {
  'use strict';
  const MT =
    typeof self !== 'undefined' && self.MockTrader ? self.MockTrader : globalThis.MockTrader;

  function serialize(result) {
    return {
      performance: result.performance,
      summary: {
        nVarieties: result.ds.codes.length,
        nDates: result.ds.dates.length,
        nRebalances: result.strategy.rebalanceDates.length,
        nTrades: result.backtest.trades.length,
        nRolls: result.backtest.rolls.length,
        totalCost: result.backtest.summary.totalCost,
        totalRollCost: result.backtest.summary.totalRollCost,
        finalEquity: result.backtest.summary.finalEquity,
        initialCapital: result.backtest.summary.initialCapital,
      },
      report: result.report ? result.report.markdown : '',
    };
  }

  self.onmessage = function (e) {
    const config = e.data.config;
    try {
      const result = MT.runPipeline(
        Object.assign({}, config, {
          onProgress: function (step, frac) {
            self.postMessage({ type: 'progress', step: step, frac: frac });
          },
        })
      );
      self.postMessage({ type: 'result', result: serialize(result) });
    } catch (err) {
      self.postMessage({ type: 'error', message: String((err && err.message) || err) });
    }
  };
})();
