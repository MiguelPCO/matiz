import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    // El modelo se cambió a mano en cada ruta por separado (a69e691, 444180e)
    // y `temperature` rompió producción (8ab88f3): un solo dueño en lib/claude.ts.
    files: ["app/**/*.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='model'][value.type='Literal']",
          message: "Usa CLAUDE_MODEL de lib/claude.ts, no un modelo literal.",
        },
        {
          selector: "Property[key.name='temperature']",
          message: "Los modelos actuales rechazan temperature (8ab88f3). Quítalo.",
        },
        {
          selector: "NewExpression[callee.name='Anthropic']",
          message: "Usa el cliente `claude` de lib/claude.ts.",
        },
      ],
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
