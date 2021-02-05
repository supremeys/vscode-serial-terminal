import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import * as Stream from 'stream';

// Text manipulation sequences
const backspaceRegex = /^\177/;
const enterRegex = /^\r/;
const deleteRegex = /^\033\[3~/;

// Navigation sequences
const arrowRegex = /^\033\[([ABCD])/;
const gotoEndRegex = /^\033\[([HF])/; //End and Home

const cursorReportRegex = /^\033\[(\d+);(\d+)R/;

// Commands
interface Command {
    regex: RegExp;
    description?: string;
    func: (...args: any) => void;
}

export abstract class CommandLine implements vscode.Pseudoterminal {
    // Fire to write to terminal
    protected writeEmitter = new vscode.EventEmitter<string>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;

    // Fire to close terminal
    protected closeEmitter = new vscode.EventEmitter<void>();
    onDidClose?: vscode.Event<number | void> | undefined = this.closeEmitter.event;

    // Properties used for tracking and rendering terminal input
    private currentInputLine = '';
    private inputIndex = 0;

    // Properties used for tracking data
    protected endsWithNewLine = false;

    // Current size of terminal. Used for detecting line wraps to allow multi-line input
    private dimensions: vscode.TerminalDimensions | undefined;

    // Keeps track of already sent data to enable arrow up/down to scroll through it
    private prevCommands: string[] = [];
    private prevCommandsIndex = 0;

    constructor(
        private backendStream: Stream.Duplex,
        private translateHex: boolean = true,
        private lineEnd: string = '\r\n',
        private prompt: string = '>: '
    ) {}

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.dimensions = initialDimensions;
        this.backendStream.on('data', this.handleData);
        this.backendStream.on('error', this.writeError);
        this.updateInputArea();
    }

    close(): void {
        this.writeEmitter.dispose();
        this.closeEmitter.dispose();
    }

    protected handleData: (data: Buffer) => void = (data: Buffer) => {
        // Can be used as callback
        this.loadCursor();
        this.clearScreen();
        let stringRepr = '';
        if (this.translateHex) {
            stringRepr = new TextDecoder('utf-8').decode(data);
        } else {
            for (const byte of data) {
                if (this.dimensions && stringRepr.length >= this.dimensions.columns - 3) {
                    this.writeEmitter.fire('\r\n');
                }
                this.writeEmitter.fire(byte.toString(16).padStart(2, '0') + ' ');
            }
        }

        // Checks if data ends on a clean line. Used for layout
        if (/(?:\r+\n+[\n\r]*)|(?:\n+\r+[\n\r]*)$/.test(stringRepr)) {
            this.endsWithNewLine = true;
        } else {
            this.endsWithNewLine = false;
        }
        this.writeEmitter.fire(stringRepr);
        this.saveCursor();
        this.updateInputArea();
    };

    protected handleDataAsText(data: string): void {
        const thOld = this.translateHex;
        this.translateHex = true;
        this.handleData(Buffer.from(data));
        this.translateHex = thOld;
    }

    handleInput(data: string): void {
        let firstRun = true;
        let charsHandled = 0;
        while (data.length > 0) {
            // Remove handled data
            if (!firstRun && charsHandled === 0) {
                break;
            } //No data was handled, break to prevent infinite loop
            firstRun = false;
            data = data.substr(charsHandled);
            if (data.length <= 0) {
                break;
            }
            charsHandled = 0;

            //// Handle enter
            const enterMatch: RegExpMatchArray | null = enterRegex.exec(data);
            if (enterMatch) {
                if (
                    this.currentInputLine &&
                    (this.prevCommands.length <= 0 ||
                        this.prevCommands[this.prevCommands.length - 1] !== this.currentInputLine)
                ) {
                    this.prevCommands.push(this.currentInputLine);
                    if (this.prevCommands.length > 1000) {
                        this.prevCommands.shift();
                    }
                }
                if (!this.endsWithNewLine) {
                    this.handleDataAsText('\r\n');
                }
                this.handleDataAsText(this.prompt + this.currentInputLine + '\r\n');

                this.backendStream.write(this.currentInputLine + this.lineEnd);

                this.prevCommandsIndex = this.prevCommands.length;
                this.inputIndex = 0;
                this.currentInputLine = '';
                charsHandled = enterMatch[0].length;
                this.updateInputArea();
                continue;
            }

            //// Handle backspace
            const backspaceMatch: RegExpMatchArray = backspaceRegex.exec(data) ?? [];
            if (backspaceMatch.length > 0) {
                if (this.inputIndex > 0) {
                    const part1: string = this.currentInputLine.slice(0, this.inputIndex - 1);
                    const part2: string = this.currentInputLine.slice(this.inputIndex);
                    this.currentInputLine = part1 + part2;
                    this.inputIndex--;
                    this.updateInputArea();
                }
                charsHandled = backspaceMatch[0].length;
                continue;
            }

            //// Handle delete
            const deleteMatch: RegExpMatchArray = deleteRegex.exec(data) ?? [];
            if (deleteMatch.length > 0) {
                if (this.inputIndex <= this.currentInputLine.length) {
                    const part1: string = this.currentInputLine.slice(0, this.inputIndex);
                    const part2: string = this.currentInputLine.slice(this.inputIndex + 1);
                    this.currentInputLine = part1 + part2;
                    this.updateInputArea();
                }
                charsHandled = deleteMatch[0].length;
                continue;
            }

            //// Handle arrows
            const arrowMatches: RegExpMatchArray = arrowRegex.exec(data) ?? [];
            for (const arrow of arrowMatches) {
                switch (arrow) {
                    case 'A': {
                        // Up
                        if (
                            this.prevCommandsIndex > 0 &&
                            this.prevCommandsIndex <= this.prevCommands.length
                        ) {
                            this.prevCommandsIndex -= 1;
                            this.currentInputLine = this.prevCommands[this.prevCommandsIndex];
                            this.inputIndex = this.currentInputLine.length;
                            this.updateInputArea();
                        }
                        break;
                    }
                    case 'B': {
                        // Down
                        if (
                            this.prevCommandsIndex >= 0 &&
                            this.prevCommandsIndex < this.prevCommands.length
                        ) {
                            this.prevCommandsIndex += 1;
                            this.currentInputLine = this.prevCommands[this.prevCommandsIndex] ?? '';

                            this.inputIndex = this.currentInputLine.length;
                            this.updateInputArea();
                        }
                        break;
                    }
                    case 'C': {
                        // Right
                        this.inputIndex++;
                        if (this.inputIndex >= this.currentInputLine.length) {
                            this.inputIndex = this.currentInputLine.length;
                        }
                        this.updateCursor(this.inputIndex);
                        break;
                    }
                    case 'D': {
                        // Left
                        this.inputIndex--;
                        if (this.inputIndex < 0) {
                            this.inputIndex = 0;
                        }
                        this.updateCursor(this.inputIndex);
                        break;
                    }
                }
            }
            if (arrowMatches.length > 0) {
                charsHandled = arrowMatches[0].length;
                continue;
            }

            //// Handle home and end
            const gotoEndMatch = gotoEndRegex.exec(data);
            if (gotoEndMatch && gotoEndMatch.length > 1) {
                switch (gotoEndMatch[1]) {
                    case 'H': {
                        //Home
                        this.inputIndex = 0;
                        this.updateCursor(this.inputIndex);
                        break;
                    }
                    case 'F': {
                        //End
                        this.inputIndex = this.currentInputLine.length;
                        this.updateCursor(this.inputIndex);
                        break;
                    }
                }
                continue;
            }

            //// Handle cursor position reports
            const crMatch = cursorReportRegex.exec(data);
            if (crMatch && crMatch.length >= 3) {
                //console.log(`Line: ${crMatch[1]} Pos: ${crMatch[2]}`);
                charsHandled = crMatch[0].length;
                continue;
            }

            //// Handle all other characters
            const char: string = data.charAt(0);
            this.inputIndex++;
            this.currentInputLine =
                this.currentInputLine.substring(0, this.inputIndex - 1) +
                char +
                this.currentInputLine.substring(this.inputIndex - 1);
            this.updateInputArea();
            charsHandled = char.length;
        }
    }

    private updateCursor(index: number): void {
        index += this.prompt.length;
        this.loadCursor();
        if (!this.endsWithNewLine) {
            this.moveCursor('d', 1);
        }
        this.writeEmitter.fire('\r');
        if (this.dimensions) {
            const lineDelta: number = Math.trunc(index / this.dimensions.columns);
            this.moveCursor('d', lineDelta);
            this.moveCursor('r', index % this.dimensions.columns);
        } else {
            this.moveCursor('r', index);
        }
    }

    private moveCursor(direction: 'u' | 'd' | 'l' | 'r', amount = 1): void {
        if (amount < 0) {
            throw new Error('Amount must be non-negative');
        }
        if (amount === 0) {
            return;
        }
        switch (direction) {
            case 'u': {
                this.writeEmitter.fire(`\u001b[${amount}A`);
                break;
            }
            case 'd': {
                this.writeEmitter.fire(`\u001b[${amount}B`);
                break;
            }
            case 'r': {
                this.writeEmitter.fire(`\u001b[${amount}C`);
                break;
            }
            case 'l': {
                this.writeEmitter.fire(`\u001b[${amount}D`);
                break;
            }
            default: {
                throw new Error('Invalid direction ' + direction);
            }
        }
    }

    private updateInputArea(): void {
        this.loadCursor();
        if (!this.endsWithNewLine) {
            this.writeEmitter.fire('\r\n');
        }

        this.clearScreen();
        this.writeEmitter.fire(this.prompt + this.currentInputLine);
        this.updateCursor(this.inputIndex);
    }

    private saveCursor(): void {
        this.writeEmitter.fire('\u001b[s');
    }

    private loadCursor(): void {
        this.writeEmitter.fire('\u001b[u');
    }

    private clearScreen(level = 0): void {
        this.writeEmitter.fire(`\u001b[${level}J`);
    }

    public clear(): void {
        this.prevCommandsIndex = this.prevCommands.length;
        this.inputIndex = 0;
        this.currentInputLine = '';
        this.writeEmitter.fire('\u001bc');
        this.saveCursor();
        this.updateInputArea();
    }

    protected writeError = (err: Error | null | undefined): void => {
        if (err) {
            this.writeEmitter.fire(('An error occured: ' + err.message).replace('\n', '\r\n'));
            console.log(err);
        }
    };

    setDimensions(newDims: vscode.TerminalDimensions): void {
        this.dimensions = newDims;
        this.updateInputArea();
    }

    public getDimensions(): vscode.TerminalDimensions | undefined {
        return this.dimensions;
    }

    public setPrompt(prompt: string): void {
        this.prompt = prompt;
        this.updateInputArea();
    }

    public setLineEnd(le: string): void {
        this.lineEnd = le;
    }

    public setHexTranslate(state: boolean): void {
        this.translateHex = state;
    }

    public toggleHexTranslate(): void {
        this.setHexTranslate(!this.translateHex);
    }
}
