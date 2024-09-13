const {
    createConnection,
    TextDocuments,
    ProposedFeatures,
    DiagnosticSeverity,
    CompletionItem,
    CompletionItemKind
} = require('vscode-languageserver/node');
const { TextDocument } = require('vscode-languageserver-textdocument');
const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

// Create a connection for the server. The connection uses Node's IPC as a transport.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

connection.onInitialize(() => {
    return {
        capabilities: {
            textDocumentSync: documents.syncKind,
            completionProvider: {
                resolveProvider: true,
                triggerCharacters: ['.', '-', '$']
            }
        }
    };
});

documents.onDidChangeContent(change => {
    validateTextDocument(change.document);
});

async function validateTextDocument(textDocument) {
    const text = textDocument.getText();
    const diagnostics = [];
    try {
        const parsedYaml = yaml.load(text);
        validateAzurePipelinesStructure(parsedYaml, diagnostics, textDocument);
    } catch (error) {
        const diagnostic = {
            severity: DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(error.mark ? error.mark.position : 0),
                end: textDocument.positionAt(error.mark ? error.mark.position + 1 : 1)
            },
            message: error.message,
            source: 'Azure Pipelines'
        };
        diagnostics.push(diagnostic);
    }
    connection.sendDiagnostics({ uri: textDocument.uri, diagnostics });
}

function validateAzurePipelinesStructure(yaml, diagnostics, textDocument) {
    if (!yaml.trigger && !yaml.pr && !yaml.schedules) {
        diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range: {
                start: textDocument.positionAt(0),
                end: textDocument.positionAt(1)
            },
            message: 'Pipeline is missing trigger, pr, or schedules section',
            source: 'Azure Pipelines'
        });
    }

    if (!yaml.jobs && !yaml.stages) {
        diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: {
                start: textDocument.positionAt(0),
                end: textDocument.positionAt(1)
            },
            message: 'Pipeline must contain either jobs or stages',
            source: 'Azure Pipelines'
        });
    }

    // Add more Azure Pipelines specific validations here
}

connection.onCompletion((textDocumentPosition) => {
    const document = documents.get(textDocumentPosition.textDocument.uri);
    const position = textDocumentPosition.position;

    const completionItems = [
        {
            label: 'trigger',
            kind: CompletionItemKind.Keyword,
            data: 1
        },
        {
            label: 'pr',
            kind: CompletionItemKind.Keyword,
            data: 2
        },
        {
            label: 'jobs',
            kind: CompletionItemKind.Keyword,
            data: 3
        },
        {
            label: 'stages',
            kind: CompletionItemKind.Keyword,
            data: 4
        },
        {
            label: 'pool',
            kind: CompletionItemKind.Keyword,
            data: 5
        },
        {
            label: 'steps',
            kind: CompletionItemKind.Keyword,
            data: 6
        }
    ];

    return completionItems;
});

connection.onCompletionResolve((item) => {
    if (item.data === 1) {
        item.detail = 'Specify when the pipeline should be triggered';
        item.documentation = 'The trigger keyword defines when the pipeline should automatically run.';
    }
    // Add more detailed information for other completion items
    return item;
});

connection.onDidChangeWatchedFiles(_change => {
    connection.console.log('We received a file change event');
});

documents.listen(connection);
connection.listen();
