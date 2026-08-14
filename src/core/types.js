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

/** 因子注册表（配置驱动：元数据集中登记，新增因子在此加一条即可被报告/UI 引用） */
export const FACTOR_REGISTRY = {
  momentum: {
    key: 'momentum',
    name: '截面动量',
    sign: 1,
    description: '过去 120 日收益，跳过近 1 月（12-1 动量）',
  },
  liquidity: {
    key: 'liquidity',
    name: '流动性',
    sign: 1,
    description: '-Amihud 非流动性（越高越流动）',
  },
  volume: {
    key: 'volume',
    name: '成交量',
    sign: 1,
    description: '量比 = 当日成交量 / 过去 20 日均量 - 1',
  },
  skewness: { key: 'skewness', name: '价格偏度', sign: 1, description: '20 日收益率偏度' },
  rollYield: {
    key: 'rollYield',
    name: '展期收益率',
    sign: 1,
    description: '(主力价 - 次主力价)/次主力价，年化',
  },
};

/** 持仓方向 (position direction) */
export const DIRECTION = {
  LONG: 1,
  SHORT: -1,
  FLAT: 0,
};

/** 交易所集合 (exchanges) */
export const EXCHANGES = ['SHFE', 'DCE', 'CZCE', 'INE', 'GFEX'];
