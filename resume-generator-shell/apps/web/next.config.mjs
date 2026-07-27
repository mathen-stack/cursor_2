/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@resume/contracts", "@resume/core", "@resume/engines", "@resume/rendering"],
};

export default nextConfig;
