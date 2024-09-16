const vscode = require('vscode');
const { LanguageClient, TransportKind } = require('vscode-languageclient/node');
const path = require('path');
const { AzurePipelinesDebugSession } = require('../out/debugAdapter');
const { AzurePipelinesLanguageServer } = require('azure-pipelines-language-server');

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
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found. Please open an Azure Pipelines YAML file to debug.');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'yaml' || (!document.fileName.endsWith('.yml') && !document.fileName.endsWith('.yaml'))) {
            vscode.window.showErrorMessage('Please open an Azure Pipelines YAML file (.yml or .yaml) to debug.');
            return;
        }

        vscode.debug.startDebugging(undefined, {
            type: 'azurePipelines',
            name: 'Debug Azure Pipeline',
            request: 'launch',
            program: document.fileName
        });
    });

    context.subscriptions.push(disposable);

    // Set up the language server
    const serverModule = path.join(__dirname, '..', 'out', 'server.js');
    const debugOptions = { execArgv: ['--nolazy', '--inspect=6009'] };

    const serverOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
    };

    const clientOptions = {
        documentSelector: [{ scheme: 'file', language: 'yaml', pattern: '**/*.{yml,yaml}' }],
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

// The startGharunServer function has been removed as it's no longer needed
// with the Azure Pipelines Language Server integration.

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
