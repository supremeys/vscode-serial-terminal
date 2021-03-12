// eslint-disable-next-line no-undef
const vscode = acquireVsCodeApi();
// eslint-disable-next-line no-undef
const term = new Terminal();
// eslint-disable-next-line no-undef
const fitAddon = new FitAddon.FitAddon();
// eslint-disable-next-line no-undef
const ntc = new PcXtermLib.NrfTerminalCommander({
    completerFunction: function () {
        return [
            {
                value: 'my_custom_command',
                description: 'Does something interesting',
            }
        ];
    },
    commands: {},
    prompt: 'AT[:lineCount]>',
    showTimestamps: true,
});

term.loadAddon(fitAddon);
term.loadAddon(ntc);
term.open(document.getElementById('terminal'));
fitAddon.fit();

term.onData(function (data) {
    console.log(data);
});

window.addEventListener('resize', function () {
    fitAddon.fit();
    vscode.postMessage('Window resized!');
});

window.addEventListener('message', function (event) {
    switch (event.data.type) {
        case 'serial-data': {
            term.write(event.data.message);
            break;
        }
    }
});