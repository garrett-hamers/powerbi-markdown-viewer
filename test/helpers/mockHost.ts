import powerbi from "powerbi-visuals-api";

import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionIdBuilder = powerbi.visuals.ISelectionIdBuilder;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;

export interface ContextMenuCall {
    selectionId: ISelectionId;
    position: { x: number; y: number };
}

export interface MockHostHarness {
    host: IVisualHost;
    contextMenuCalls: ContextMenuCall[];
    eventCalls: string[];
    failureReasons: string[];
    launchedUrls: string[];
    measureIds: string[];
    dataPointSelectionId: ISelectionId;
}

export interface MockHostOptions {
    failSelectionBuilder?: boolean;
    highContrast?: boolean;
}

export function createMockHost(options: MockHostOptions = {}): MockHostHarness {
    const contextMenuCalls: ContextMenuCall[] = [];
    const eventCalls: string[] = [];
    const failureReasons: string[] = [];
    const launchedUrls: string[] = [];
    const measureIds: string[] = [];

    const dataPointSelectionId = {
        equals: (other: ISelectionId) => other === dataPointSelectionId,
        includes: (other: ISelectionId) => other === dataPointSelectionId,
        getKey: () => "markdown-measure",
        getSelector: () => ({}),
        getSelectorsByColumn: () => ({}),
        hasIdentity: () => true
    } as ISelectionId;

    const selectionManager = {
        showContextMenu: (selectionId: ISelectionId, position: { x: number; y: number }) => {
            contextMenuCalls.push({ selectionId, position });
            return Promise.resolve({});
        }
    } as ISelectionManager;

    const eventService: IVisualEventService = {
        renderingStarted: () => {
            eventCalls.push("started");
        },
        renderingFinished: () => {
            eventCalls.push("finished");
        },
        renderingFailed: (_options, reason) => {
            eventCalls.push("failed");
            failureReasons.push(reason ?? "");
        }
    };

    const createSelectionIdBuilder = (): ISelectionIdBuilder => {
        const builder = {
            withMeasure: (measureId: string) => {
                measureIds.push(measureId);
                return builder;
            },
            createSelectionId: () => {
                if (options.failSelectionBuilder) {
                    throw new Error("selection builder failed");
                }
                return dataPointSelectionId;
            }
        };

        return builder as ISelectionIdBuilder;
    };

    const host = {
        colorPalette: {
            isHighContrast: options.highContrast ?? false,
            foreground: { value: "#FFFF00" },
            foregroundSelected: { value: "#00FF00" },
            background: { value: "#000000" },
            hyperlink: { value: "#00FFFF" },
            getColor: () => ({ value: "#118DFF" })
        },
        createSelectionManager: () => selectionManager,
        createSelectionIdBuilder,
        eventService,
        launchUrl: (url: string) => {
            launchedUrls.push(url);
        }
    } as IVisualHost;

    return {
        host,
        contextMenuCalls,
        eventCalls,
        failureReasons,
        launchedUrls,
        measureIds,
        dataPointSelectionId
    };
}
