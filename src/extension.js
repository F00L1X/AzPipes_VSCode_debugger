const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "AzPipes_VSCode_debugger" is now active!');

    let disposable = vscode.commands.registerCommand('azpipes-vscode-debugger.debugPipeline', function () {
        vscode.window.showInformationMessage('Debugging Azure Pipeline YAML file...');
        // TODO: Implement debugging functionality
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
