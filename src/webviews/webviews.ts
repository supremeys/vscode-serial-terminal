import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { extContext } from '../extension';

export function createSerialMonitorPanel(COMPort: string, baudRate: number): vscode.WebviewPanel {
    const resourceRoot = vscode.Uri.file(
        path.join(extContext.extensionPath, 'src', 'webviews', 'serialMonitor')
    );
    const scriptRoot = vscode.Uri.joinPath(resourceRoot, 'js');
    const nodeModulesRoot = vscode.Uri.file(path.join(extContext.extensionPath, 'node_modules'));
    const panel = vscode.window.createWebviewPanel(
        'SerialMonitor',
        `${COMPort} (Baud: ${baudRate})`,
        vscode.ViewColumn.One,
        {
            enableScripts: true,
        }
    );

    const jsImports: { [key: string]: vscode.Uri } = {
        xterm: panel.webview.asWebviewUri(
            vscode.Uri.joinPath(nodeModulesRoot, 'xterm', 'lib', 'xterm.js')
        ),
        fitAddon: panel.webview.asWebviewUri(
            vscode.Uri.joinPath(nodeModulesRoot, 'xterm-addon-fit', 'lib', 'xterm-addon-fit.js')
        ),
        // 'pc-xterm-lib': panel.webview.asWebviewUri(
        //     vscode.Uri.joinPath(nodeModulesRoot, 'pc-xterm-lib', 'dist', 'index.js')
        // )
    };

    const scriptUris: vscode.Uri[] = [
        panel.webview.asWebviewUri(
            vscode.Uri.joinPath(nodeModulesRoot, 'pc-xterm-lib', 'dist', 'index.js')
        ),
        panel.webview.asWebviewUri(vscode.Uri.joinPath(scriptRoot, 'script.js')),
    ];

    const cssUris: vscode.Uri[] = [
        panel.webview.asWebviewUri(vscode.Uri.joinPath(resourceRoot, 'base.css')),
        panel.webview.asWebviewUri(
            vscode.Uri.joinPath(nodeModulesRoot, 'xterm', 'css', 'xterm.css')
        ),
    ];

    const title = `${COMPort} (Baud: ${baudRate})`;
    panel.webview.html = getSerialMonitorHtml(
        title,
        panel.webview.cspSource,
        scriptUris,
        cssUris,
        jsImports
    );
    return panel;
}

function getSerialMonitorHtml(
    title: string,
    cspSource: string,
    scriptUris: vscode.Uri[],
    cssUris: vscode.Uri[],
    jsImports: { [key: string]: vscode.Uri }
): string {
    const htmlPathOnDisk: string = path.join(
        extContext.extensionPath,
        'src',
        'webviews',
        'serialMonitor',
        'serialMonitor.html'
    );
    const data: string = fs.readFileSync(htmlPathOnDisk, 'utf-8');

    let content: string = data.replace(/#\{title\}/g, title);
    content = content.replace(/#\{cspSource\}/g, cspSource);

    for (const scriptUri of scriptUris) {
        content = content.replace(
            /#\{scriptFiles\}/g,
            `<script src=${scriptUri}></script>
            #{scriptFiles}`
        );
    }
    content = content.replace(/#\{scriptFiles\}/g, '');

    for (const cssUri of cssUris) {
        content = content.replace(
            /#\{stylesheets\}/g,
            `<link rel="stylesheet" href=${cssUri}>
            #{stylesheets}`
        );
    }
    content = content.replace(/#\{stylesheets\}/g, '');

    for (const entry of Object.entries(jsImports)) {
        content = content.replace(
            /#\{jsImports\}/g,
            `<script src="${entry[1]}"></script>
            #{jsImports}`
        );
    }
    content = content.replace(/#\{jsImports\}/g, '');

    return content;
}
