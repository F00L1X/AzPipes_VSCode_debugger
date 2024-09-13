import {
    Logger,
    LoggingDebugSession,
    InitializedEvent,
    TerminatedEvent,
    Handles
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as vscode from 'vscode';

interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
    program: string;
    trace?: boolean;
    watch?: boolean;
    preview?: boolean;
    repositories?: string[];
    variables?: string[];
    parameters?: string[];
}

interface IAttachRequestArguments extends ILaunchRequestArguments { }

export class AzurePipelinesDebugAdapter extends LoggingDebugSession {
    private static THREAD_ID = 1;
    private watcher: vscode.FileSystemWatcher | undefined;
    private virtualFiles: { [key: string]: string } = {};
    private name: string;
    private expandAzurePipeline: (preview: boolean, repositories: string[] | undefined, variables: string[] | undefined, parameters: string[] | undefined, onSuccess: (result: string) => Promise<void>, filename: string, onError: (errmsg: string) => Promise<void>) => Promise<void>;
    private changed: (uri: vscode.Uri) => void;
    private disposables: vscode.Disposable[] = [];
    private _variableHandles = new Handles<string>();

    public constructor(name: string, expandAzurePipeline: any, changed: any) {
        super("azure-pipelines-debug.log");
        this.name = name;
        this.expandAzurePipeline = expandAzurePipeline;
        this.changed = changed;
    }

    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        response.body.supportsEvaluateForHovers = false;
        response.body.supportsStepBack = false;
        response.body.supportsDataBreakpoints = false;
        response.body.supportsCompletionsRequest = false;
        response.body.completionTriggerCharacters = [".", "["];
        response.body.supportsCancelRequest = false;
        response.body.supportsBreakpointLocationsRequest = false;
        response.body.supportsStepInTargetsRequest = false;
        response.body.supportsExceptionFilterOptions = false;
        response.body.exceptionBreakpointFilters = [];
        response.body.supportsExceptionInfoRequest = false;
        response.body.supportsSetVariable = false;
        response.body.supportsSetExpression = false;
        response.body.supportsDisassembleRequest = false;
        response.body.supportsSteppingGranularity = false;
        response.body.supportsInstructionBreakpoints = false;
        response.body.supportsReadMemoryRequest = false;
        response.body.supportsWriteMemoryRequest = false;
        response.body.supportSuspendDebuggee = false;
        response.body.supportTerminateDebuggee = true;
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsDelayedStackTraceLoading = false;

        this.sendResponse(response);
        this.sendEvent(new InitializedEvent());
    }

    protected async attachRequest(response: DebugProtocol.AttachResponse, args: IAttachRequestArguments) {
        return this.launchRequest(response, args);
    }

    protected async launchRequest(response: DebugProtocol.LaunchResponse, args: ILaunchRequestArguments) {

        let message: string | null = null;
        const run = async () => {
            let hasErrors = false;
            await this.expandAzurePipeline(
                args.preview || false,
                args.repositories,
                args.variables,
                args.parameters,
                async (result: string) => {
                    if (args.preview) {
                        this.virtualFiles[this.name] = result;
                        this.changed(vscode.Uri.file(this.name));
                    } else if (!hasErrors) {
                        vscode.window.showInformationMessage("No Issues found");
                    }
                },
                args.program,
                async (errmsg: string) => {
                    hasErrors = true;
                    if (args.preview) {
                        this.virtualFiles[this.name] = errmsg;
                        this.changed(vscode.Uri.file(this.name));
                    } else if (args.watch) {
                        vscode.window.showErrorMessage(errmsg);
                    } else {
                        message = errmsg;
                    }
                }
            );
        };

        try {
            await run();
        } catch (ex) {
            console.error(ex instanceof Error ? ex.toString() : "<??? error>");
        }

        if (args.watch) {
            this.watcher = vscode.workspace.createFileSystemWatcher("**/*.{yml,yaml}");
            this.watcher.onDidCreate(e => {
                console.log(`created: ${e.toString()}`);
                run();
            });
            this.watcher.onDidChange(e => {
                console.log(`changed: ${e.toString()}`);
                run();
            });
            this.watcher.onDidDelete(e => {
                console.log(`deleted: ${e.toString()}`);
                run();
            });
        } else {
            if (message) {
                this.sendErrorResponse(response, {
                    id: 1001,
                    format: message,
                    showUser: true
                });
            } else {
                this.sendResponse(response);
                this.sendEvent(new TerminatedEvent());
            }
        }
    }

    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        this.sendResponse(response);
    }

    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args: DebugProtocol.DisconnectArguments, request?: DebugProtocol.Request): void {
        console.log(`disconnectRequest suspend: ${args.suspendDebuggee}, terminate: ${args.terminateDebuggee}`);
        if (this.watcher) {
            this.watcher.dispose();
        }
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        delete this.virtualFiles[this.name];
        this.sendResponse(response);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(AzurePipelinesDebugAdapter.THREAD_ID, "Azure Pipelines Thread")
            ]
        };
        this.sendResponse(response);
    }

    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        response.body = {
            scopes: [
                new Scope("Local", this._variableHandles.create("local"), false)
            ]
        };
        this.sendResponse(response);
    }

    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments, request?: DebugProtocol.Request): void {
        const variables: DebugProtocol.Variable[] = [];
        // Add logic to populate variables based on the current state of the Azure Pipeline
        this.sendResponse(response);
    }
}

class Thread implements DebugProtocol.Thread {
    constructor(public id: number, public name: string) {}
}

class Scope implements DebugProtocol.Scope {
    constructor(public name: string, public variablesReference: number, public expensive: boolean) {}
}
