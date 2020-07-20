
import * as serialPort from 'serialport';
import * as vscode from 'vscode';

// Text manipulation sequences
const backspaceRegex: RegExp = /^\177/;
const enterRegex: RegExp = /^\r/;
const deleteRegex: RegExp = /^\033\[3~/;

// Navigation sequences
const arrowRegex: RegExp = /^\033\[([ABCD])/;
const gotoEndRegex: RegExp = /^\033\[([HF])/; //End and Home


/**
 * Interface for keeping track of a simple cursor
 */
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

    // serialPort specific variables
    private serial: serialPort;
    public lineEnd: string;

    // Prompt to be placed before user written line
    public prompt: string;

    // Properties used for tracking and rendering terminal input
    private currentInputLine: string = "";
    private inputAreaLine: number = 5;
    private inputIndex: number = 0;

    // Properties used for tracking data
    private currentDataLine: string = "\n\r";

    private dimensions: vscode.TerminalDimensions | undefined;

    // Keeps track of already sent data to enable arrow up/down to scroll through it
    private sendBuffer: string[] = [];
    private sendBufferIndex: number = 0;

    constructor(COMPort: string, baudRate: number, lineEnd?: string, prompt?: string) {
        this.serial = new serialPort(COMPort, {
            autoOpen: false,
            baudRate: baudRate,
        });
        this.prompt = prompt ?? ">: ";
        this.lineEnd = lineEnd ?? "\r\n";
    }

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        this.dimensions = initialDimensions;
        this.writeEmitter.fire(`Serial terminal\r\nPort: ${this.serial.path}\r\nBaud rate: ${this.serial.baudRate}`);
        if (!this.serial.isOpen) {
            this.serial.open(SerialTerminal.writeError(this));
        }
        this.serial.on('data', SerialTerminal.handleData(this));
        this.serial.on('error', SerialTerminal.writeError(this));
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
            st.rawMoveCursor(0, st.inputAreaLine);
            st.clearLine();
            st.writeEmitter.fire(st.currentDataLine);
            for (let b of data) {
                let char: string = String.fromCharCode(b);
                st.writeEmitter.fire(char);
                if (char === "\n") {
                    st.clearLine();
                    st.writeEmitter.fire("\r");
                    st.increaseDataArea();
                    continue;
                }
                if (st.dimensions && st.currentDataLine.length > st.dimensions.columns) {
                    st.clearLine();
                    st.writeEmitter.fire("\r\n");
                    st.increaseDataArea();
                    continue;
                }
                st.currentDataLine += char;
            }
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
                let lineContent: string = this.currentInputLine.substring(this.prompt.length);
                this.serial.write(lineContent + this.lineEnd);
                if (lineContent && (this.sendBuffer.length <= 0 || this.sendBuffer[this.sendBuffer.length - 1] !== lineContent)) {
                    this.sendBuffer.push(this.currentInputLine);
                }
                this.sendBufferIndex = this.sendBuffer.length;
                this.inputAreaLine++;
                this.inputIndex = 0;
                this.writeEmitter.fire("\r\n");
                this.currentInputLine = "";
                this.printCurrentLine();
                charsHandled = enterMatch[0].length;
                continue;
            }


            //// Handle backspace
            let backspaceMatch: RegExpMatchArray = backspaceRegex.exec(data) ?? [];
            if (backspaceMatch.length > 0) {
                if (this.inputIndex > 0) {
                    let part1: string = this.currentInputLine.slice(0, this.inputIndex - 1);
                    let part2: string = this.currentInputLine.slice(this.inputIndex);
                    this.currentInputLine = part1 + part2;
                    this.inputIndex--;
                    this.printCurrentLine();
                }
                charsHandled = backspaceMatch[0].length;
                continue;
            }

            //// Handle delete
            let deleteMatch: RegExpMatchArray = deleteRegex.exec(data) ?? [];
            if (deleteMatch.length > 0) {
                if (this.inputIndex <= this.currentInputLine.length) {
                    let part1: string = this.currentInputLine.slice(0, this.inputIndex);
                    let part2: string = this.currentInputLine.slice(this.inputIndex + 1);
                    this.currentInputLine = part1 + part2;
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
                            this.currentInputLine = this.sendBuffer[this.sendBufferIndex];
                            this.inputIndex = 0;
                            this.printCurrentLine();
                        }
                        break;
                    } case "B": { // Down
                        if (this.sendBufferIndex <= this.sendBuffer.length) {
                            this.currentInputLine = this.prompt;
                            if (this.sendBufferIndex < this.sendBuffer.length - 1) {
                                this.sendBufferIndex += 1;
                                this.currentInputLine = this.sendBuffer[this.sendBufferIndex];
                            }
                            this.inputIndex = 0;
                            this.printCurrentLine();
                        }
                        break;
                    } case "C": { // Right
                        this.inputIndex++;
                        if (this.inputIndex >= this.currentInputLine.length) {
                            this.inputIndex = this.currentInputLine.length;
                        }
                        this.updateCursor(this.inputAreaLine, this.inputIndex);
                        break;
                    } case "D": { // Left
                        this.inputIndex--;
                        if (this.inputIndex < 0) {
                            this.inputIndex = 0;
                        }
                        this.updateCursor(this.inputAreaLine, this.inputIndex);
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
                        this.inputIndex = 0;
                        this.updateCursor(this.inputAreaLine, this.inputIndex);
                        break;
                    } case ("F"): { //End
                        this.inputIndex = this.currentInputLine.length;
                        this.updateCursor(this.inputAreaLine, this.inputIndex);
                        break;
                    }
                }
                continue;
            }

            //// Handle all other characters
            let char: string = data.charAt(0);
            this.inputIndex++;
            this.currentInputLine = this.currentInputLine.substring(0, this.inputIndex - 1) + char + this.currentInputLine.substring(this.inputIndex - 1);
            this.printCurrentLine();
            charsHandled = 1;
        }
    }


    private updateCursor(startLine: number, index: number) {
        index++;
        index += this.prompt.length;
        if (this.dimensions) {
            this.rawMoveCursor(index % this.dimensions.columns, startLine + Math.trunc(index / this.dimensions.columns));
        } else {
            index += this.prompt.length;
            this.rawMoveCursor(index, startLine);
        }
    }

    private rawMoveCursor(x: number, y: number) {
        this.writeEmitter.fire(`\u001b[${y};${x}H`);
    }


    private printCurrentLine() {
        this.rawMoveCursor(0, this.inputAreaLine);
        this.clearScreen();
        this.writeEmitter.fire(this.prompt + this.currentInputLine);
        this.updateCursor(this.inputAreaLine, this.inputIndex);
    }

    private clearScreen(level: number = 0) {
        this.writeEmitter.fire(`\u001b[${level}J`);
    }

    private clearLine(level: number = 2) {
        this.writeEmitter.fire(`\u001b[${level}K`);
    }

    private increaseDataArea() {
        this.currentDataLine = "";
        this.clearScreen();
        this.inputAreaLine++;
        this.printCurrentLine();
    }

    private static writeError(st: SerialTerminal) {
        return (err: Error | null | undefined) => {
            if (err) {
                st.writeEmitter.fire(("An error occured: " + err.message).replace('\n', '\r\n'));
                st.closeEmitter.fire();
            }
        };
    }

    setDimensions(newDims: vscode.TerminalDimensions) {
        this.dimensions = newDims;
        this.printCurrentLine();
    }
}