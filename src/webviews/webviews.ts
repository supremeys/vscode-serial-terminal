import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import SerialPort = require('serialport');

import { extContext } from '../extension';
import { WebviewStream } from '../util/webviewStream';
import { SerialDataStream } from '../util/toWvMsgStreams';

export class SerialMonitorPanel implements vscode.Disposable {
    #panel: vscode.WebviewPanel;
    #serialPort: SerialPort;
    #webviewStream: WebviewStream;
    #COMPort: string;
    #baudRate: number;
    #scriptUris: vscode.Uri[];
    #styleUris: vscode.Uri[];
    #jsImportUris: { [key: string]: vscode.Uri };

    #serialDataTranslateStream = new SerialDataStream({ objectMode: true });

    #disposables: vscode.Disposable[] = [];

    constructor(COMPort: string, baudRate: number) {
        this.#COMPort = COMPort;
        this.#baudRate = baudRate;
        this.#panel = vscode.window.createWebviewPanel(
            'SerialMonitor',
            `${COMPort} (Baud: ${baudRate})`,
            vscode.ViewColumn.One,
            { enableScripts: true }
        );
        this.#webviewStream = new WebviewStream(this.#panel.webview, { objectMode: true });
        const resourceRoot = vscode.Uri.file(
            path.join(extContext.extensionPath, 'src', 'webviews', 'serialMonitor')
        );
        const scriptRoot = vscode.Uri.joinPath(resourceRoot, 'js');
        const nodeModulesRoot = vscode.Uri.file(
            path.join(extContext.extensionPath, 'node_modules')
        );
        this.#scriptUris = [
            this.#panel.webview.asWebviewUri(
                vscode.Uri.joinPath(nodeModulesRoot, 'pc-xterm-lib', 'dist', 'index.js')
            ),
            this.#panel.webview.asWebviewUri(vscode.Uri.joinPath(scriptRoot, 'script.js')),
        ];
        this.#styleUris = [
            this.#panel.webview.asWebviewUri(vscode.Uri.joinPath(resourceRoot, 'base.css')),
            this.#panel.webview.asWebviewUri(
                vscode.Uri.joinPath(nodeModulesRoot, 'xterm', 'css', 'xterm.css')
            ),
            this.#panel.webview.asWebviewUri(
                vscode.Uri.joinPath(nodeModulesRoot, 'pc-xterm-lib', 'styles.css')
            ),
        ];
        this.#jsImportUris = {
            xterm: this.#panel.webview.asWebviewUri(
                vscode.Uri.joinPath(nodeModulesRoot, 'xterm', 'lib', 'xterm.js')
            ),
            fitAddon: this.#panel.webview.asWebviewUri(
                vscode.Uri.joinPath(nodeModulesRoot, 'xterm-addon-fit', 'lib', 'xterm-addon-fit.js')
            ),
        };
        this.#panel.webview.html = this.html;

        this.#disposables.push(this.#panel.onDidDispose(() => this._dispose()));

        this.#serialPort = new SerialPort(this.#COMPort, {
            autoOpen: false,
            baudRate: this.#baudRate,
        });
        this.initSerialPort();
    }

    get html(): string {
        const htmlPathOnDisk: string = path.join(
            extContext.extensionPath,
            'src',
            'webviews',
            'serialMonitor',
            'serialMonitor.html'
        );
        const data: string = fs.readFileSync(htmlPathOnDisk, 'utf-8');

        let content: string = data.replace(/#\{title\}/g, this.#panel.title);
        content = content.replace(/#\{cspSource\}/g, this.#panel.webview.cspSource);
        // Insert scripts
        for (const scriptUri of this.#scriptUris) {
            content = content.replace(
                /#\{scriptFiles\}/g,
                `<script src=${scriptUri}></script>
                #{scriptFiles}`
            );
        }
        content = content.replace(/#\{scriptFiles\}/g, '');
        // Insert stylesheets
        for (const cssUri of this.#styleUris) {
            content = content.replace(
                /#\{stylesheets\}/g,
                `<link rel="stylesheet" href=${cssUri}>
                #{stylesheets}`
            );
        }
        content = content.replace(/#\{stylesheets\}/g, '');
        // Insert imported js files
        for (const entry of Object.entries(this.#jsImportUris)) {
            content = content.replace(
                /#\{jsImports\}/g,
                `<script src="${entry[1]}"></script>
                #{jsImports}`
            );
        }
        content = content.replace(/#\{jsImports\}/g, '');
        return content;
    }

    private initSerialPort(): void {
        if (!this.#serialPort.isOpen) {
            this.#serialPort.open((err) => {
                this.writeSerialError(err?.message);
            });
        }
        this.#serialPort.pipe(this.#serialDataTranslateStream).pipe(this.#webviewStream);
        this.#webviewStream.on('data', function (message) {
            console.log(message);
        });
    }

    private writeSerialData(data: string): void {
        this.#webviewStream.write({
            type: 'serial-data',
            message: data,
        });
    }

    private writeSerialError(data: string | undefined): void {
        if (data) {
            this.#webviewStream.write({
                type: 'serial-error',
                message: data,
            });
        }
    }

    get COMPort(): string {
        return this.#COMPort;
    }

    get baudRate(): number {
        return this.#baudRate;
    }

    public dispose(): void {
        this.#panel.dispose();
        this._dispose();
    }

    private _dispose(): void {
        this.#disposables.forEach(function (x) {
            x.dispose();
        });
        this.#webviewStream.destroy();
        this.#serialPort.close();
        this.#serialPort.destroy();
    }
}
