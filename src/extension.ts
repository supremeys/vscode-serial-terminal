// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { SerialTerminal } from "./serialTerminal";
import SerialPort = require('serialport');
import { api } from './api';
import * as util from './util';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated

	let disposable = vscode.commands.registerCommand('serialterminal.openTerminal', async (portPath?: string, baudRate?: number, translateHex?: boolean, lineEnd?: string, prompt?: string) => {
		// Resolve port path
		let chosenPortPath: string | undefined = portPath;
		if (!chosenPortPath) {
			let ports = await SerialPort.list();
			let portPaths = ports.map(p => p.path);
			chosenPortPath = await vscode.window.showQuickPick(portPaths, { placeHolder: "Select port" });
			if (!chosenPortPath) { return; };
		}

		// Resolve baud rate
		let chosenBaud: number | undefined = baudRate;
		if (!chosenBaud) {
			let bauds: string[] = [110, 300, 600, 1200, 2400, 4800, 9600, 14400, 19200, 38400, 57600, 115200, 128000, 256000].reverse().map(b => b.toString());
			let chosenBaudString: string | undefined = await vscode.window.showQuickPick(["[Other]", ...bauds], { placeHolder: "Choose baud rate" });
			if (chosenBaudString === "[Other]") {
				chosenBaudString = await vscode.window.showInputBox({ placeHolder: "Enter baud rate" });
			}
			if (!chosenBaudString) { return; };
			try {
				chosenBaud = Number.parseInt(chosenBaudString);
			} catch {
				vscode.window.showErrorMessage(`Invalid baud rate ${chosenBaudString}. Must be an integer > 0`);
				return;
			}
		} if (chosenBaud <= 0 || !Number.isInteger(chosenBaud)) {
			vscode.window.showErrorMessage(`Invalid baud rate ${chosenBaud}. Must be an integer > 0`);
			return;
		}


		// Figure out if hex from the com port should be converted to text
		let wsConfig = vscode.workspace.getConfiguration();
		translateHex = translateHex ?? wsConfig.get('serialTerminal.translateHex') ?? true;

		// Resolve line terminator
		let configDLT: string | undefined = wsConfig.get("serialTerminal.defaultLineTerminator");
		if (configDLT !== undefined && lineEnd === undefined) {
			lineEnd = util.unescape(configDLT);
		}
		lineEnd = lineEnd ?? "\r\n";

		// Resolve prompt 
		let configPrompt: string | undefined = wsConfig.get('serialTerminal.defaultPrompt');
		if (configPrompt !== undefined && prompt === undefined) {
			prompt = util.unescape(configPrompt);
		}
		prompt = prompt ?? ">: ";
		let st = new SerialTerminal(chosenPortPath, chosenBaud, translateHex, lineEnd, prompt);
		let terminal = vscode.window.createTerminal({
			name: `${chosenPortPath} (Baud: ${chosenBaud})`,
			pty: st
		});
		terminal.show();
		return terminal;
	});

	context.subscriptions.push(disposable);
	//TODO: REMOVE
	vscode.commands.executeCommand('serialterminal.openTerminal', "COM9", 115200);

	//Export api defined in api.ts
	return api;
}

// this method is called when your extension is deactivated
export function deactivate() { }
