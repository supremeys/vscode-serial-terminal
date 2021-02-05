const { spawn } = require('child_process');
const path = require('path');

const shouldFix = process.argv[2] === '--fix';

function spawnInPromise(command, argv) {
    const options = {
        env: process.env,
        shell: true,
        stdio: 'inherit',
    };

    return new Promise((resolve, reject) => {
        spawn(command, argv, options).on('exit', (code) => {
            if (code !== 0) {
                reject(code);
            } else {
                resolve();
            }
        });
    });
}

function runESLint() {
    const eslint = path.join('node_modules', '.bin', 'eslint');
    const configFile = `"${require.resolve('../.eslintrc.js')}"`;
    const args = ['src', '--ext', '.ts', '--config', configFile];

    if (shouldFix) {
        args.push('--fix');
    }

    return spawnInPromise(eslint, args);
}

function runPrettier() {
    const prettier = path.join('node_modules', '.bin', 'prettier');
    const configFile = `"${require.resolve('../.prettierrc.js')}"`;
    const args = [shouldFix ? '--write' : '--check', 'src/**/*.ts', '--config', configFile];
    return spawnInPromise(prettier, args);
}

function checkTypeScriptTypes() {
    const tsc = path.join('node_modules', '.bin', 'tsc');
    return spawnInPromise(tsc, ['--noEmit']);
}

runPrettier().then(runESLint).then(checkTypeScriptTypes).catch(process.exit);