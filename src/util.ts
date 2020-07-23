
const escapeRe = /\\(.)/g;
const hexCharRe = /\\x([a-fA-F0-9]{2})/;
const uCharRe = /\\u([a-fA-F0-9]{4})/;

export function unescape(original: string): string {

    if (escapeRe.test(original)) {
        let lookup: { [key: string]: string } = {
            "\\\"": "\"",
            "\\\'": "\'",
            "\\b": "\b",
            "\\f": "\f",
            "\\n": "\n",
            "\\r": "\r",
            "\\t": "\t",
            "\\v": "\v",
            "\\0": "\0",
            "\\\\": "\\",
        };
        for (let exp in lookup) {
            original = original.replace(exp, lookup[exp]);
        }
    }
    let matches;
    while ((matches = hexCharRe.exec(original)) !== null) {
        original = original.replace(matches[0], String.fromCharCode(parseInt(matches[1], 16)));
    }
    while ((matches = uCharRe.exec(original)) !== null) {
        original = original.replace(matches[0], String.fromCharCode(parseInt(matches[1], 16)));
    }
    return original;
}
