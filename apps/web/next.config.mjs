/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@oaw/shared-types', '@oaw/acp-client'],
  webpack: (config) => {
    // 工作区内的包使用 NodeNext 风格的 `.js` 后缀 import 指向 `.ts` 源码，
    // 让 webpack 能把 `.js` 解析回 `.ts`/`.tsx`。
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };
    return config;
  },
};

export default nextConfig;
