import * as SerialPort from 'serialport';
import * as vscode from 'vscode';
import { CommandLine } from './commandLine';

export class SerialTerminal extends CommandLine {
    // serialPort specific variables
    private serial: SerialPort;

    // Used to automatically attempt to reconnect when device is disconnected
    private reconnectInterval: NodeJS.Timeout | undefined;

    constructor(
        COMPort: string,
        baudRate: number,
        translateHex = true,
        lineEnd?: string,
        prompt?: string
    ) {
        const serial: SerialPort = new SerialPort(COMPort, {
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
            if (!this.endsWithNewLine) {
                this.handleDataAsText('\r\n');
            }
            this.handleDataAsText('Port closed.');
            if (Object.keys(err).includes('disconnected') && err.disconnected) {
                // Device was disconnected, attempt to reconnect
                this.handleDataAsText(' Device disconnected.');
                this.reconnectInterval = setInterval(async () => {
                    // Attempt to reopen
                    const availablePorts = await SerialPort.list();
                    for (const port of availablePorts) {
                        if (port.path === this.serial.path) {
                            if (!this.endsWithNewLine) {
                                this.handleDataAsText('\r\n');
                            }
                            this.handleDataAsText(
                                `Device reconnected at port ${this.serial.path}.\r\n`
                            );
                            this.serial.open();
                            break;
                        }
                    }
                }, 1000);
            }
            this.handleDataAsText('\r\n');
        });
        this.serial.on('open', () => {
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
                    throw new Error('Could not properly close serial terminal: ' + err.message);
                }
            });
        }
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
        }
        super.close();
    }
}
