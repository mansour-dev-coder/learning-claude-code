/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // the LLM prompts are read from disk at runtime by the API routes
  outputFileTracingIncludes: { '/api/**': ['./src/llm/prompts/**'] },
};
export default nextConfig;
