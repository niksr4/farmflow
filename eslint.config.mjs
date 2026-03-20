import nextConfig from "eslint-config-next/core-web-vitals"

const config = [
  {
    ignores: [".next/**", ".next-e2e/**", ".next-e2e-manual/**", "playwright-report/**", "test-results/**", ".tmp/**"],
  },
  ...nextConfig,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]

export default config
