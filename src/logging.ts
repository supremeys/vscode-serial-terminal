import * as vscode from 'vscode';
import * as Stream from 'stream';
import * as fs from 'fs';

export class Logger {
    #writableStream: Stream.Writable;
    public isPaused = false;

    constructor() {
        const workspacePath = vscode.workspace.workspaceFolders;
        if (!workspacePath) { throw new Error("No workspace open"); };
        const logPath = workspacePath[0].uri;
        const fullLogPath = vscode.Uri.joinPath(logPath, `${Date.now()}-log.txt`);
        this.#writableStream = fs.createWriteStream(fullLogPath.fsPath, { encoding: 'UTF8' });
    }

    public endStream(): void {
        this.#writableStream.end();
        this.#writableStream.on('finish', () => console.log("Stream finished"));
    }

    getWriteableStream(): Stream.Writable {
        return this.#writableStream;
    }
}
