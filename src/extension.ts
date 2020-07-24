import * as vscode from 'vscode';
import { SerialTerminal } from "./serialTerminal";
import SerialPort = require('serialport');
import { api } from './api';
import * as util from './stringUtilities';

// Lookup table for linking vscode terminals to SerialTerminal instances
export let terminalRegistry: { [key: string]: SerialTerminal } = {};

export async function activate(context: vscode.ExtensionContext) {

	let openTerminalCommand = vscode.commands.registerCommand('serialterminal.openTerminal', async (portPath?: string, baudRate?: number, translateHex?: boolean, lineEnd?: string, prompt?: string) => {
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
		terminalRegistry[terminal.name] = st;
		return terminal;
	});

	let setPromptCommand = vscode.commands.registerCommand('serialterminal.setPrompt', async () => {
		let st = getActiveSerial();
		if (st) {
			let newPrompt = await vscode.window.showInputBox({ placeHolder: "New prompt" });
			if (newPrompt !== undefined) {
				newPrompt = util.unescape(newPrompt);
				st.setPrompt(newPrompt);
			}
		}
	});

	let setLineEndCommand = vscode.commands.registerCommand('serialterminal.setLineEnd', async () => {
		let st = getActiveSerial();
		if (st) {
			let newLineEnd = await vscode.window.showInputBox({ placeHolder: "New line terminator" });
			if (newLineEnd !== undefined) {
				newLineEnd = util.unescape(newLineEnd);
				st.setLineEnd(newLineEnd);
			}
		}
	});

	let toggleHexTranslationCommand = vscode.commands.registerCommand('serialterminal.toggleHexTranslation', () => {
		let st = getActiveSerial();
		if (st) {
			st.toggleHexTranslate();
		}
	});

	let clearCommand = vscode.commands.registerCommand('serialterminal.clearTerminal', () => {
		let st = getActiveSerial();
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

// this method is called when your extension is deactivated
export function deactivate() { }

function getActiveSerial(): SerialTerminal | undefined {
	let activeTerminal = vscode.window.activeTerminal;
	if (activeTerminal === undefined) {
		vscode.window.showErrorMessage("No active terminal");
		return;
	};
	if (!Object.keys(terminalRegistry).includes(activeTerminal.name)) {
		vscode.window.showErrorMessage("Active terminal is not a registered serial terminal");
		return;
	};
	return terminalRegistry[activeTerminal.name];
}
