
// eslint-disable-next-line no-undef
const term = new Terminal();
// eslint-disable-next-line no-undef
const fitAddon = new FitAddon.FitAddon();
// eslint-disable-next-line no-undef
const ntc = new PcXtermLib.NrfTerminalCommander({
    completions: [],
    commands: { },
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
});