import * as stream from 'stream';
import * as vscode from 'vscode';

export class WebviewStream extends stream.Duplex {
    #webview: vscode.Webview;
    #disposables: vscode.Disposable[] = [];

    constructor(webview: vscode.Webview, options: stream.DuplexOptions) {
        super(options);
        this.#webview = webview;
        this.#disposables.push(
            this.#webview.onDidReceiveMessage((message) => {
                this.push(message);
            })
        );
    }

    /**
     * Internal destroy method. Frees all resources allocated by the stream.
     * @param error Ignored
     * @param callback Ignored
     */
    _destroy(error: Error | null, callback: (error: Error | null) => void): void {
        super.destroy();
        this.#disposables.forEach(function (x) {
            x.dispose();
        });
        callback(null);
    }

    /**
     * Sends provided chunk to webview
     * @param chunk Data to be sent to be posted to webview. Must be a string.
     * @param encoding Ignored.
     * @param callback Called without paramteres when transfer is complete.
     */
    _write(
        chunk: string,
        encoding: unknown | undefined,
        callback: (error?: Error | null) => void
    ): void {
        this.#webview.postMessage(chunk);
        callback();
    }

    /**
     * NO-OP
     * Required for API to work
     */
    // eslint-disable-next-line
    _read(_size: number) {}
}
