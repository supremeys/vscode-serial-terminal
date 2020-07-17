
import * as serialPort from 'serialport';
import * as vscode from 'vscode';

// Text manipulation sequences
const backspaceRegex: RegExp = /^\177/;
const enterRegex: RegExp = /^\r/;
const deleteRegex: RegExp = /^\033\[3~/;

// Navigation sequences
const arrowRegex: RegExp = /^\033\[([ABCD])/;
const gotoEndRegex: RegExp = /^\033\[([HF])/;

interface Cursor {
    x: number;
    y: number;
}

export class SerialTerminal implements vscode.Pseudoterminal {

    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<void>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    onDidClose?: vscode.Event<number | void> | undefined = this.closeEmitter.event;
    onDidOverrideDimensions?: vscode.Event<vscode.TerminalDimensions | undefined> | undefined;

    private serial: serialPort;
    public prompt: string;
    public lineEnd: string;

    private currentLine: string;
    private inputCursor: Cursor = {
        x: 1,
        y: 5,
    };
    private dataCursor: Cursor = {
        x: 1,
        y: 5,
    };
    private dimensions: vscode.TerminalDimensions | undefined;

    private sendBuffer: string[] = [];
    private sendBufferIndex: number = 0;

    constructor(COMPort: string, baudRate: number, lineEnd?: string, prompt?: string) {
        this.serial = new serialPort(COMPort, {
            autoOpen: false,
            baudRate: baudRate,
        });
        this.prompt = prompt ?? ">: ";
        this.lineEnd = lineEnd ?? "\r\n";
        this.currentLine = this.prompt;
    }
    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.dimensions = initialDimensions;
        this.writeEmitter.fire(`Serial terminal\r\nPort: ${this.serial.path}\r\nBaud rate: ${this.serial.baudRate}`);
        if (!this.serial.isOpen) {
            this.serial.open(SerialTerminal.writeError(this));
        }
        this.serial.on('data', SerialTerminal.handleData(this));
        this.serial.on('error', SerialTerminal.writeError(this));
        this.inputCursor.x = this.prompt.length + 1;
        this.printCurrentLine();
    }

    close(): void {
        if (this.serial.isOpen) {
            this.serial.close((err) => {
                if (err) {
                    throw new Error("Could not properly close serial terminal: " + err.message);
                }
            });
        }
        this.writeEmitter.dispose();
        this.closeEmitter.dispose();
    }

    private static handleData(st: SerialTerminal): (data: Buffer) => void {
        return (data: Buffer) => {
            let stringRepr: string = "";

            for (let b of data) {
                let char: string = String.fromCharCode(b);
                stringRepr += char;
            }
            console.log(stringRepr);
            st.writeEmitter.fire(stringRepr);
        };
    }

    handleInput(data: string) {
        let codes = "";
        for (let c of data) {
            codes += c.charCodeAt(0) + " ";
        } console.log(codes);
        console.log(data);

        let firstRun = true;
        let charsHandled: number = 0;
        while (data.length > 0) {
            // Remove handled data
            if (!firstRun && charsHandled === 0) { break; } //No data was handled, break to prevent infinite loop
            firstRun = false;
            data = data.substr(charsHandled);
            if (data.length <= 0) { break; }
            charsHandled = 0;

            //// Handle enter
            let enterMatch: RegExpMatchArray | null = enterRegex.exec(data);
            if (enterMatch) {
                this.printCurrentLine();
                let lineContent: string = this.currentLine.substring(this.prompt.length);
                this.serial.write(lineContent + this.lineEnd);
                if (lineContent && (this.sendBuffer.length <= 0 || this.sendBuffer[this.sendBuffer.length - 1] !== lineContent)) {
                    this.sendBuffer.push(this.currentLine.substring(this.prompt.length));
                }
                this.sendBufferIndex = this.sendBuffer.length;
                this.currentLine = this.prompt;
                this.inputCursor.y++;
                this.inputCursor.x = this.currentLine.length + 1;
                this.writeEmitter.fire("\r\n");
                this.printCurrentLine();
                charsHandled = enterMatch[0].length;
                continue;
            }


            //// Handle backspace
            let backspaceMatch: RegExpMatchArray = backspaceRegex.exec(data) ?? [];
            if (backspaceMatch.length > 0) {
                if (this.inputCursor.x > this.prompt.length + 1) {
                    let part1: string = this.currentLine.slice(0, this.inputCursor.x - 2);
                    let part2: string = this.currentLine.slice(this.inputCursor.x - 1);
                    this.currentLine = part1 + part2;
                    this.inputCursor.x--;
                    this.printCurrentLine();
                }
                charsHandled = backspaceMatch[0].length;
                continue;
            }

            //// Handle delete
            let deleteMatch: RegExpMatchArray = deleteRegex.exec(data) ?? [];
            if (deleteMatch.length > 0) {
                if (this.inputCursor.x <= this.currentLine.length) {
                    let part1: string = this.currentLine.slice(0, this.inputCursor.x - 1);
                    let part2: string = this.currentLine.slice(this.inputCursor.x);
                    this.currentLine = part1 + part2;
                    this.printCurrentLine();
                }
                charsHandled = backspaceMatch[0].length;
                continue;
            }

            //// Handle arrows
            let arrowMatches: RegExpMatchArray = arrowRegex.exec(data) ?? [];
            for (let arrow of arrowMatches) {
                switch (arrow) {
                    case "A": { // Up
                        if (this.sendBufferIndex > 0) {
                            this.sendBufferIndex -= 1;
                            this.currentLine = this.prompt + this.sendBuffer[this.sendBufferIndex];
                            this.inputCursor.x = this.currentLine.length + 1;
                            this.printCurrentLine();
                        }
                        break;
                    } case "B": { // Down
                        if (this.sendBufferIndex <= this.sendBuffer.length) {
                            this.currentLine = this.prompt;
                            if (this.sendBufferIndex < this.sendBuffer.length-1) {
                                this.sendBufferIndex += 1;
                                this.currentLine = this.prompt + this.sendBuffer[this.sendBufferIndex];
                            }
                            this.inputCursor.x = this.currentLine.length + 1;
                            this.printCurrentLine();
                        }
                        break;
                    } case "C": { // Right
                        this.inputCursor.x++;
                        if (this.inputCursor.x >= this.currentLine.length + 1) {
                            this.inputCursor.x = this.currentLine.length + 1;
                        }
                        this.moveCursor(this.inputCursor.x, this.inputCursor.y);
                        break;
                    } case "D": { // Left
                        this.inputCursor.x--;
                        if (this.inputCursor.x < this.prompt.length + 1) {
                            this.inputCursor.x = this.prompt.length + 1;
                        }
                        this.moveCursor(this.inputCursor.x, this.inputCursor.y);
                        break;
                    }
                }
            } if (arrowMatches.length > 0) {
                charsHandled = arrowMatches[0].length;
                continue;
            };

            //// Handle home and end
            let gotoEndMatch = gotoEndRegex.exec(data);
            if (gotoEndMatch && gotoEndMatch.length > 1) {
                switch (gotoEndMatch[1]) {
                    case ("H"): { //Home
                        this.inputCursor.x = this.prompt.length + 1;
                        this.moveCursor(this.inputCursor.x, this.inputCursor.y);
                        break;
                    } case ("F"): { //End
                        this.inputCursor.x = this.currentLine.length + 1;
                        this.moveCursor(this.inputCursor.x, this.inputCursor.y);
                        break;
                    }
                }
                continue;
            }

            //// Handle all other characters
            let char: string = data.charAt(0);
            this.inputCursor.x++;
            this.currentLine = this.currentLine.substring(0, this.inputCursor.x - 1) + char + this.currentLine.substring(this.inputCursor.x - 1);
            this.printCurrentLine();
            charsHandled = 1;
        }
    }


    private moveCursor(x: number, y: number) {
        this.writeEmitter.fire(`\u001b[${y};${x}H`);
    }

    private printCurrentLine() {
        this.moveCursor(0, this.inputCursor.y);
        this.clearLine();
        this.writeEmitter.fire(this.currentLine);
        this.moveCursor(this.inputCursor.x, this.inputCursor.y);
    }

    private clearLine(level: number = 2) {
        this.writeEmitter.fire(`\u001b[${level}K`);
    }

    private static writeError(st: SerialTerminal) {
        return (err: Error | null | undefined) => {
            if (err) {
                st.writeEmitter.fire(("An error occured: " + err.message).replace('\n', '\r\n'));
                st.closeEmitter.fire();
            }
        };
    }
}