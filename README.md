# Serial terminal for VSCode


## Features

Adds a simple serial terminal to vscode. Open by running
~~~
Serial Terminal: Open terminal
~~~
from the command palette.

## Requirements

### Dev
Depends on serialport. This module must be built for a specific node version. To get this right find out what node/electron version
vscode is running by checking ```Help/About``` and updating .npmrc accordingly.

## API
Exposed api can be accesed using the following code:
<!--TODO: Update extension ID-->
~~~typescript
let api = extensions.getExtension('serialterminal').exports;
~~~

This api exposes the SerialTerminal class which is an implementation of [vscode.Pseudoterminal](https://code.visualstudio.com/api/references/vscode-api#Pseudoterminal) with the constructor

~~~typescript
SerialTerminal(COMPort: string, baudRate: number, translateHex?:boolean, lineEnd?: string, prompt?: string)
~~~

## Known Issues

- Terminal input that covers more than the entire screen won't be properly rendered.
- Clear terminal will clear all text and scroll buffer, but not cursor position.
  - Cause found: VSCode uses Xterm.js' clear function. This removes all content and puts prompt line on top but doesn't send any obvious signals to the
    terminal. Workaround pending

## Release Notes

No releases so far

