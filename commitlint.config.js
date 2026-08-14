// commitlint 配置：Conventional Commits 强制（P2）
// 提交格式：type(scope): subject，如 feat(core): 新增 IC 加权
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'build',
        'ci',
        'chore',
        'revert',
      ],
    ],
    'subject-case': [0], // 允许中文 subject，不强制大小写
    'header-max-length': [2, 'always', 100],
  },
};
