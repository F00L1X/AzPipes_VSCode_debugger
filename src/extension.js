const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');
const path = require('path');
const { AzurePipelinesDebugSession } = require('./debugAdapter');
const { spawn } = require('child_process');

let client;
let gharunServer;
let outputChannel;

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Congratulations, your extension "AzPipes_VSCode_debugger" is now active!');

    outputChannel = vscode.window.createOutputChannel('Azure Pipelines Debug');

    // Register the debug adapter
    const factory = new vscode.DebugAdapterDescriptorFactory();
    factory.createDebugAdapterDescriptor = (session) => {
        const virtualFiles = {};
        const debugSession = new AzurePipelinesDebugSession(
            virtualFiles,
            session.name,
            expandAzurePipeline,
            (uri) => vscode.workspace.openTextDocument(uri)
        );
        return new vscode.DebugAdapterInlineImplementation(debugSession);
    };
    context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('azurePipelines', factory));

    // Register the debug configuration provider
    const provider = new vscode.DebugConfigurationProvider();
    provider.provideDebugConfigurations = () => {
        return [
            {
                type: 'azurePipelines',
                name: 'Debug Azure Pipeline',
                request: 'launch',
                program: '${file}'
            }
        ];
    };
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('azurePipelines', provider));

    // Register the command to start debugging
    let disposable = vscode.commands.registerCommand('azpipes-vscode-debugger.debugPipeline', async function () {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const document = editor.document;
            if (document.languageId === 'yaml' && document.fileName.endsWith('.yml')) {
                await startGharunServer();
                vscode.debug.startDebugging(undefined, {
                    type: 'azurePipelines',
                    name: 'Debug Azure Pipeline',
                    request: 'launch',
                    program: document.fileName
                });
            } else {
                vscode.window.showErrorMessage('Please open an Azure Pipelines YAML file to debug.');
            }
        } else {
            vscode.window.showErrorMessage('No active editor found. Please open an Azure Pipelines YAML file to debug.');
        }
    });

    context.subscriptions.push(disposable);

    // Set up the language server
    const serverModule = context.asAbsolutePath(path.join('src', 'server.js'));
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'yaml' }],
        synchronize: {
            fileEvents: vscode.workspace.createFileSystemWatcher('**/*.{yml,yaml}')
        }
    };

    client = new LanguageClient(
        'azurePipelinesLanguageServer',
        'Azure Pipelines Language Server',
        serverOptions,
        clientOptions
    );

    client.start();
}

function deactivate() {
    if (client) {
        return client.stop();
    }
    if (gharunServer) {
        gharunServer.kill();
    }
}

async function startGharunServer() {
    if (gharunServer) {
        gharunServer.kill();
    }
    return new Promise((resolve, reject) => {
        gharunServer = spawn('node', ['path/to/gharun/server.js']);
        gharunServer.stdout.on('data', (data) => {
            outputChannel.appendLine(`Gharun Server: ${data}`);
        });
        gharunServer.stderr.on('data', (data) => {
            outputChannel.appendLine(`Gharun Server Error: ${data}`);
        });
        gharunServer.on('error', (err) => {
            outputChannel.appendLine(`Failed to start Gharun Server: ${err}`);
            reject(err);
        });
        gharunServer.on('close', (code) => {
            outputChannel.appendLine(`Gharun Server process exited with code ${code}`);
        });
        // Assume the server is ready after a short delay
        setTimeout(resolve, 1000);
    });
}

async function expandAzurePipeline(preview, repositories, variables, parameters, onSuccess, filename, onError) {
    try {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filename));
        const yamlContent = content.toString();

        // Here you would typically send the YAML content to the Gharun server for processing
        // For now, we'll just pass the content directly to onSuccess
        onSuccess(yamlContent);

        // TODO: Implement actual communication with Gharun server
        // const expandedYaml = await sendToGharunServer(yamlContent, preview, repositories, variables, parameters);
        // onSuccess(expandedYaml);
    } catch (error) {
        onError(`Error expanding Azure Pipeline: ${error.message}`);
    }
}

module.exports = {
    activate,
    deactivate
}
