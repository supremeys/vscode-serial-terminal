import * as stream from 'stream';
import { TextDecoder } from 'util';

/**
 * Stream that transforms raw data from a serial port into
 * webview messages.
 *
 * Message format:
 * ```javascript
 * {
 *  type: 'serial-data'
 *  message: whatever data the stream recieves
 * }
 * ```
 */
export class SerialDataStream extends stream.Transform {
    #dataType = 'serial-data';
    _transform(chunk: Buffer, encoding: string, callback: stream.TransformCallback): void {
        this.push({
            type: this.#dataType,
            message: new TextDecoder().decode(chunk),
        });
        callback();
    }
}
