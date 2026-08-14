/**
 * types.js — 共享常量与枚举 (shared constants / enums).
 *
 * 约定 (bundler convention):
 *  - 仅使用命名导出 (inline named exports: export function/const/class)。
 *  - 仅使用 `import { ... } from './x.js';` 静态导入，无循环依赖、无 default export。
 */

/** 板块 (sectors) */
export const SECTORS = ['黑色', '有色', '能化', '农产品', '贵金属'];

/** 5 因子键 (factor keys) */
export const FACTOR_KEYS = ['momentum', 'liquidity', 'volume', 'skewness', 'rollYield'];

/** 因子中文名 */
export const FACTOR_NAMES = {
  momentum: '截面动量',
  liquidity: '流动性',
  volume: '成交量',
  skewness: '价格偏度',
  rollYield: '展期收益率',
};

/** 持仓方向 (position direction) */
export const DIRECTION = {
  LONG: 1,
  SHORT: -1,
  FLAT: 0,
};

/** 交易所集合 (exchanges) */
export const EXCHANGES = ['SHFE', 'DCE', 'CZCE', 'INE', 'GFEX'];
