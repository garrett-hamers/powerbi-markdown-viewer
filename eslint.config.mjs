import powerbiVisualsConfigs from "eslint-plugin-powerbi-visuals";

export default [
    powerbiVisualsConfigs.configs.recommended,
    {
        ignores: ["node_modules/**", "dist/**", ".vscode/**", ".tmp/**", "e2e/visual-harness-bundle.js"],
    },
    {
        rules: {
            "powerbi-visuals/no-inner-outer-html": "off"
        }
    },
    {
        files: ["e2e/**/*.ts", "test/**/*.ts"],
        rules: {
            "powerbi-visuals/non-literal-fs-path": "off",
            "powerbi-visuals/insecure-random": "off"
        }
    }
];
