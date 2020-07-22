
import * as serialPort from 'serialport';
import { TextDecoder } from 'util';
import * as vscode from 'vscode';

// Text manipulation sequences
const backspaceRegex: RegExp = /^\177/;
const enterRegex: RegExp = /^\r/;
const deleteRegex: RegExp = /^\033\[3~/;

// Navigation sequences
const arrowRegex: RegExp = /^\033\[([ABCD])/;
const gotoEndRegex: RegExp = /^\033\[([HF])/; //End and Home

const cursorReportRegex: RegExp = /^\033\[(\d+);(\d+)R/;


export class SerialTerminal implements vscode.Pseudoterminal {

    private writeEmitter = new vscode.EventEmitter<string>();
    private closeEmitter = new vscode.EventEmitter<void>();
    onDidWrite: vscode.Event<string> = this.writeEmitter.event;
    onDidClose?: vscode.Event<number | void> | undefined = this.closeEmitter.event;

    private dimensionEmitter = new vscode.EventEmitter<vscode.TerminalDimensions>();
    //onDidOverrideDimensions = this.dimensionEmitter.event;

    // serialPort specific variables
    private serial: serialPort;
    public lineEnd: string;

    // Prompt to be placed before user written line
    public prompt: string;

    // Properties used for tracking and rendering terminal input
    private currentInputLine: string = "";
    private inputIndex: number = 0;

    // Properties used for tracking data
    private endsWithNewLine: boolean = false;

    private dimensions: vscode.TerminalDimensions | undefined;

    // Keeps track of already sent data to enable arrow up/down to scroll through it
    private prevCommands: string[] = [];
    private prevCommandsIndex: number = 0;

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
        SerialTerminal.handleData(this)(Buffer.from(
            `\rSerial terminal
            \rPort: ${this.serial.path}
            \rBaud rate: ${this.serial.baudRate}\r\n\n`
        ));
        if (!this.serial.isOpen) {
            this.serial.open(SerialTerminal.writeError(this));
        }
        this.serial.on('data', SerialTerminal.handleData(this));
        this.serial.on('error', SerialTerminal.writeError(this));
        this.updateInputArea();
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
            st.loadCursor();
            st.clearScreen();
            let stringRepr: string = new TextDecoder('utf-8').decode(data);

            // Checks if data ends on a clean line. Used for layout
            if (/(?:\r+\n+[\n\r]*)|(?:\n+\r+[\n\r]*)$/.test(stringRepr)) {
                st.endsWithNewLine = true;
            } else {
                st.endsWithNewLine = false;
            }

            st.writeEmitter.fire(stringRepr);
            st.saveCursor();
            st.updateInputArea();
        };
    }

    handleInput(data: string) {
        let codes = "";
        for (let c of data) {
            codes += c.charCodeAt(0) + " ";
        }

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
                this.serial.write(this.currentInputLine + this.lineEnd);
                this.serial.drain();
                if (this.currentInputLine && (this.prevCommands.length <= 0 || this.prevCommands[this.prevCommands.length - 1] !== this.currentInputLine)) {
                    this.prevCommands.push(this.currentInputLine);
                }
                if (!this.endsWithNewLine) {
                    SerialTerminal.handleData(this)(Buffer.from("\r\n"));
                }
                SerialTerminal.handleData(this)(Buffer.from(this.prompt + this.currentInputLine + "\r\n"));
                this.prevCommandsIndex = this.prevCommands.length;
                this.inputIndex = 0;
                this.currentInputLine = "";
                charsHandled = enterMatch[0].length;
                this.updateInputArea();
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
                    this.updateInputArea();
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
                    this.updateInputArea();
                }
                charsHandled = backspaceMatch[0].length;
                continue;
            }

            //// Handle arrows
            let arrowMatches: RegExpMatchArray = arrowRegex.exec(data) ?? [];
            for (let arrow of arrowMatches) {
                switch (arrow) {
                    case "A": { // Up
                        if (this.prevCommandsIndex > 0 && this.prevCommandsIndex <= this.prevCommands.length) {
                            this.prevCommandsIndex -= 1;
                            this.currentInputLine = this.prevCommands[this.prevCommandsIndex];
                            this.inputIndex = 0;
                            this.updateInputArea();
                        }
                        break;
                    } case "B": { // Down
                        if (this.prevCommandsIndex >= 0 && this.prevCommandsIndex < this.prevCommands.length) {
                            this.prevCommandsIndex += 1;
                            this.currentInputLine = this.prevCommands[this.prevCommandsIndex] ?? "";

                            this.inputIndex = 0;
                            this.updateInputArea();
                        }
                        break;
                    } case "C": { // Right
                        this.inputIndex++;
                        if (this.inputIndex >= this.currentInputLine.length) {
                            this.inputIndex = this.currentInputLine.length;
                        }
                        this.updateCursor(this.inputIndex);
                        break;
                    } case "D": { // Left
                        this.inputIndex--;
                        if (this.inputIndex < 0) {
                            this.inputIndex = 0;
                        }
                        this.updateCursor(this.inputIndex);
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
                        this.updateCursor(this.inputIndex);
                        break;
                    } case ("F"): { //End
                        this.inputIndex = this.currentInputLine.length;
                        this.updateCursor(this.inputIndex);
                        break;
                    }
                }
                continue;
            }

            //// Handle cursor position reports
            let crMatch = cursorReportRegex.exec(data);
            if (crMatch && crMatch.length >= 3) {
                console.log(`Line: ${crMatch[1]} Pos: ${crMatch[2]}`);
                charsHandled = crMatch[0].length;
                continue;
            }

            //// Handle all other characters
            let char: string = data.charAt(0);
            this.inputIndex++;
            this.currentInputLine = this.currentInputLine.substring(0, this.inputIndex - 1) + char + this.currentInputLine.substring(this.inputIndex - 1);
            this.updateInputArea();
            charsHandled = 1;
        }
    }

    private updateCursor(index: number) {
        index += this.prompt.length;
        this.loadCursor();
        this.writeEmitter.fire("\r");
        if (this.dimensions) {
            let lineDelta: number = Math.trunc(index / this.dimensions.columns);
            this.dimensionEmitter.fire({ columns: this.dimensions.columns, rows: this.dimensions.rows + lineDelta });
            this.moveCursor("d", lineDelta);
            this.moveCursor("r", index % this.dimensions.columns);
        } else {
            this.moveCursor("r", index);
        }
        this.writeEmitter.fire("\u001b[6n");
    }

    private moveCursor(direction: "u" | "d" | "l" | "r", amount: number = 1) {
        if (amount < 0) {
            throw new Error("Amount must be non-negative");
        }
        if (amount === 0) { return; }
        switch (direction) {
            case "u": {
                this.writeEmitter.fire(`\u001b[${amount}A`);
                break;
            } case "d": {
                this.writeEmitter.fire(`\u001b[${amount}B`);
                break;
            } case "r": {
                this.writeEmitter.fire(`\u001b[${amount}C`);
                break;
            } case "l": {
                this.writeEmitter.fire(`\u001b[${amount}D`);
                break;
            } default: {
                throw new Error("Invalid direction " + direction);
            }
        }
    }

    private updateInputArea() {
        this.loadCursor();
        if (!this.endsWithNewLine) {
            this.writeEmitter.fire("\r\n");
        }
        this.writeEmitter.fire("\u001b[6n");
        this.clearScreen();
        this.writeEmitter.fire(this.prompt + this.currentInputLine);
        this.updateCursor(this.inputIndex);
    }


    private saveCursor() {
        this.writeEmitter.fire("\u001b[s");
    }

    private loadCursor() {
        this.writeEmitter.fire("\u001b[u");
    }

    private clearScreen(level: number = 0) {
        this.writeEmitter.fire(`\u001b[${level}J`);
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
        this.updateInputArea();
    }
}
