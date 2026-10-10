// ESLint for the shell extension. Mirrors the rules gnome-shell applies to its
// own JS: ES modules, GJS globals, no unused code.
import js from '@eslint/js';
import globals from 'globals';

export default [
    js.configs.recommended,
    {
        files: ['extension/**/*.js'],
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                ...globals.es2024,
                console: 'readonly',
                globalThis: 'readonly',
                global: 'readonly',
                imports: 'readonly',
                log: 'readonly',
                logError: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                TextDecoder: 'readonly',
                TextEncoder: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                _: 'readonly',
                C_: 'readonly',
                N_: 'readonly',
                ngettext: 'readonly',
            },
        },
        rules: {
            'no-unused-vars': ['error', {argsIgnorePattern: '^_', caughtErrors: 'none'}],
            'no-var': 'error',
            'prefer-const': 'error',
            'eqeqeq': ['error', 'smart'],
            'no-implicit-coercion': 'error',
            'indent': ['error', 4, {SwitchCase: 1}],
            'quotes': ['error', 'single', {avoidEscape: true}],
            'semi': ['error', 'always'],
            'comma-dangle': ['error', 'always-multiline'],
            'object-curly-spacing': ['error', 'never'],
            'no-trailing-spaces': 'error',
            'eol-last': 'error',
        },
    },
];
