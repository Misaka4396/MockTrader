// ESLint flat config（ESLint 9+）
// 质量规则：命名/风格/语言约束；格式统一交给 Prettier（职责分离）
import js from '@eslint/js';
import globals from 'globals';

export default [
  // 忽略构建产物与外部代码
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'data/**',
      'release/**',
      'cs/**',
      '.dotnet-home/**',
      '.nuget-packages/**',
    ],
  },

  js.configs.recommended,

  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
        // 打包器占位符（build-web.mjs 在打包期替换）
        __WORKER_SOURCE__: 'readonly',
        // 自研测试运行器注入的全局宏（test/run-tests.mjs）
        test: 'readonly',
        assert: 'readonly',
        assertClose: 'readonly',
        assertGt: 'readonly',
        assertLt: 'readonly',
        // Web 层：chart.js 在全局作用域声明的类
        LineChart: 'readonly',
      },
    },
    rules: {
      // ---- 语言约束（P1）----
      'no-var': 'error', // 禁用 var，统一 let/const
      'prefer-const': 'error', // 不被重新赋值时用 const
      // 注意：null 选项为 'ignore'，允许 `x == null`/`x != null`（JS 惯例：同时排除 null/undefined）。
      // 若用默认 'always'，`a != null` 会被自动"修复"成 `a !== null`，语义改变（undefined 不再被排除）。
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'], // 所有块必须带花括号
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'prefer-template': 'error', // 字符串拼接优先模板串
      'no-nested-ternary': 'warn',
      'no-multi-assign': 'warn',
      'no-undef': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }], // 生产代码禁 console.log（warn 提示）
      // ---- 风格（弱约束，行宽等格式一律以 Prettier printWidth=100 为准）----
      'no-multi-spaces': 'warn',
      'no-trailing-spaces': 'error',
    },
  },

  // 测试与工具脚本：允许 console 输出（测试报告/进度日志的合法用途）
  {
    files: ['test/**/*.mjs', 'tools/**/*.mjs'],
    rules: {
      'no-console': 'off',
    },
  },
];
