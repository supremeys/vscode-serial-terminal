# serialterminal README

This is the README for your extension "serialterminal". After writing up a brief description, we recommend including the following sections.

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


## Known Issues

- Terminal input that covers more than the entire screen won't be properly rendered.
- Clear terminal will clear all text and scroll buffer, but not cursor position.

## Release Notes

No releases so far

