
import * as serialPort from 'serialport';
import SerialPort = require('serialport');
import { TextDecoder } from 'util';
import * as vscode from 'vscode';
import { CommandLine } from './commandLine';

// Text manipulation sequences
const backspaceRegex: RegExp = /^\177/;
const enterRegex: RegExp = /^\r/;
const deleteRegex: RegExp = /^\033\[3~/;

// Navigation sequences
const arrowRegex: RegExp = /^\033\[([ABCD])/;
const gotoEndRegex: RegExp = /^\033\[([HF])/; //End and Home

const cursorReportRegex: RegExp = /^\033\[(\d+);(\d+)R/;

// Commands
interface Command {
    regex: RegExp;
    description?: string;
    func: (st: SerialTerminal) => any;
}

let commands: { [key: string]: Command } = {
    "clear": {
        regex: /^(?:clear|cls)$/,
        func: (st: SerialTerminal) => {
            st.clear();
        },
        description: "Clears the screen"
    }
};


export class SerialTerminal extends CommandLine {

    // serialPort specific variables
    private serial: serialPort;

    // Used to automatically attempt to reconnect when device is disconnected
    private reconnectInterval: NodeJS.Timeout | undefined;

    constructor(COMPort: string, baudRate: number, translateHex = true, lineEnd?: string, prompt?: string) {
        let serial: SerialPort = new serialPort(COMPort, {
            autoOpen: false,
            baudRate: baudRate,
        });
        super(serial, translateHex, lineEnd, prompt);
        this.serial = serial;
    }

    open(initialDimensions: vscode.TerminalDimensions | undefined): void {
        super.handleDataAsText(
            `\rSerial terminal
            \rPort: ${this.serial.path}
            \rBaud rate: ${this.serial.baudRate}\r\n\n`
        );
        if (!this.serial.isOpen) {
            this.serial.open(this.writeError);
        }
        this.serial.on('close', (err) => {
            this.handleDataAsText("\r\nPort closed.");
            if (Object.keys(err).includes("disconnected") && err.disconnected) { // Device was disconnected, attempt to reconnect
                this.handleDataAsText(" Device disconnected.");
                this.reconnectInterval = setInterval(async () => { // Attempt to reopen
                    let availablePorts = await serialPort.list();
                    for (let port of availablePorts) {
                        if (port.path === this.serial.path) {
                            if (!this.endsWithNewLine) { this.handleDataAsText("\r\n"); };
                            this.handleDataAsText(`Device reconnected at port ${this.serial.path}.\r\n`);
                            this.serial.open();
                            break;
                        }
                    }
                }, 1000);
            }
            this.handleDataAsText("\r\n");
        });
        this.serial.on('open', (err) => {
            if (this.reconnectInterval) {
                clearInterval(this.reconnectInterval);
            }
        });
        super.open(initialDimensions);
    }

    close(): void {
        if (this.serial.isOpen) {
            this.serial.close((err) => {
                if (err) {
                    throw new Error("Could not properly close serial terminal: " + err.message);
                }
            });
        }
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
        }
        super.close();
    }
}
