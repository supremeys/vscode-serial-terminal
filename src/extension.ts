import * as vscode from 'vscode';
import { SerialTerminal } from './serialTerminal';
import SerialPort = require('serialport');
import { api } from './api';
import * as stringUtilities from './util';
import { createSerialMonitorPanel } from './webviews/webviews';

// Lookup table for linking vscode terminals to SerialTerminal instances
export const terminalRegistry: { [key: string]: SerialTerminal } = {};

export let extContext: vscode.ExtensionContext;

export async function activate(context: vscode.ExtensionContext): Promise<typeof api> {
    extContext = context;
    const openTerminalCommand = vscode.commands.registerCommand(
        'serialterminal.openTerminal',
        async (
            portPath?: string,
            baudRate?: number,
            translateHex?: boolean,
            lineEnd?: string,
            prompt?: string
        ) => {
            // Resolve port path
            let chosenPortPath: string | undefined = portPath;
            if (!chosenPortPath) {
                const ports = await SerialPort.list();
                const portPaths = ports.map((p) => p.path);
                if (portPaths.length < 1) {
                    vscode.window.showErrorMessage('No serial devices found');
                    return;
                }
                chosenPortPath = await vscode.window.showQuickPick(portPaths, {
                    placeHolder: 'Select port',
                });
                if (!chosenPortPath) {
                    return;
                }
            }

            // Resolve baud rate
            let chosenBaud: number | undefined = baudRate;
            if (!chosenBaud) {
                const bauds: string[] = [
                    110,
                    300,
                    600,
                    1200,
                    2400,
                    4800,
                    9600,
                    14400,
                    19200,
                    38400,
                    57600,
                    115200,
                    128000,
                    256000,
                ]
                    .reverse()
                    .map((b) => b.toString());
                let chosenBaudString: string | undefined = await vscode.window.showQuickPick(
                    ['[Other]', ...bauds],
                    { placeHolder: 'Choose baud rate' }
                );
                if (chosenBaudString === '[Other]') {
                    chosenBaudString = await vscode.window.showInputBox({
                        placeHolder: 'Enter baud rate',
                    });
                }
                if (!chosenBaudString) {
                    return;
                }
                try {
                    chosenBaud = Number.parseInt(chosenBaudString);
                } catch {
                    vscode.window.showErrorMessage(
                        `Invalid baud rate ${chosenBaudString}. Must be an integer > 0`
                    );
                    return;
                }
            }
            if (chosenBaud <= 0 || !Number.isInteger(chosenBaud)) {
                vscode.window.showErrorMessage(
                    `Invalid baud rate ${chosenBaud}. Must be an integer > 0`
                );
                return;
            }

            // Figure out if hex from the com port should be converted to text
            const wsConfig = vscode.workspace.getConfiguration();
            translateHex = translateHex ?? wsConfig.get('serialTerminal.translateHex') ?? true;

            // Resolve line terminator
            const configDLT: string | undefined = wsConfig.get(
                'serialTerminal.defaultLineTerminator'
            );
            if (configDLT !== undefined && lineEnd === undefined) {
                lineEnd = stringUtilities.unescape(configDLT);
            }
            lineEnd = lineEnd ?? '\r\n';

            // Resolve prompt
            const configPrompt: string | undefined = wsConfig.get('serialTerminal.defaultPrompt');
            if (configPrompt !== undefined && prompt === undefined) {
                prompt = stringUtilities.unescape(configPrompt);
            }
            prompt = prompt ?? '>: ';
            const st = new SerialTerminal(
                chosenPortPath,
                chosenBaud,
                translateHex,
                lineEnd,
                prompt
            );
            const terminal = vscode.window.createTerminal({
                name: `${chosenPortPath} (Baud: ${chosenBaud})`,
                pty: st,
            });
            createSerialMonitorPanel(chosenPortPath, chosenBaud);
            return terminal;
        }
    );

    const setPromptCommand = vscode.commands.registerCommand(
        'serialterminal.setPrompt',
        async function () {
            const st = getActiveSerial();
            if (st) {
                let newPrompt = await vscode.window.showInputBox({ placeHolder: 'New prompt' });
                if (newPrompt !== undefined) {
                    newPrompt = stringUtilities.unescape(newPrompt);
                    st.setPrompt(newPrompt);
                }
            }
        }
    );

    const setLineEndCommand = vscode.commands.registerCommand(
        'serialterminal.setLineEnd',
        async function () {
            const st = getActiveSerial();
            if (st) {
                let newLineEnd = await vscode.window.showInputBox({
                    placeHolder: 'New line terminator',
                });
                if (newLineEnd !== undefined) {
                    newLineEnd = stringUtilities.unescape(newLineEnd);
                    st.setLineEnd(newLineEnd);
                }
            }
        }
    );

    const toggleHexTranslationCommand = vscode.commands.registerCommand(
        'serialterminal.toggleHexTranslation',
        function () {
            const st = getActiveSerial();
            if (st) {
                st.toggleHexTranslate();
            }
        }
    );

    const clearCommand = vscode.commands.registerCommand('serialterminal.clearTerminal', () => {
        const st = getActiveSerial();
        if (st) {
            st.clear();
        }
    });

    context.subscriptions.push(
        openTerminalCommand,
        setPromptCommand,
        setLineEndCommand,
        toggleHexTranslationCommand,
        clearCommand
    );

    //Export api defined in api.ts
    return api;
}

function getActiveSerial(): SerialTerminal | undefined {
    const activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal === undefined) {
        vscode.window.showErrorMessage('No active terminal');
        return;
    }
    if (!Object.keys(terminalRegistry).includes(activeTerminal.name)) {
        vscode.window.showErrorMessage('Active terminal is not a registered serial terminal');
        return;
    }
    return terminalRegistry[activeTerminal.name];
}
