import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'varshyl-blue':   '#2458ff',
        'varshyl-red':    '#d71920',
        'varshyl-green':  '#138a36',
        'varshyl-teal':   '#168c9a',
        'varshyl-purple': '#7a3cff',
        'varshyl-orange': '#f15a24',
      },
    },
  },
  plugins: [],
}
export default config
