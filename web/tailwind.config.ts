import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    // Removed '../src/**/*' - all components now in web/components/
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
