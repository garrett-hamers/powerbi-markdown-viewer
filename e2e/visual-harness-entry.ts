/**
 * Visual harness entry — exposes window.__mountVisual contract and
 * bootstraps the markdown-viewer preview scenarios that the Playwright specs
 * assert on. Drives the real `Visual` class from ../src/visual so the preview
 * and production render paths are identical.
 */
import powerbi from "powerbi-visuals-api";
import { Visual } from "../src/visual";
import { Visual as __TooltipVisual } from "../src/visual";
import { createMockHost as __createTooltipMockHost, MockHost as __TooltipMockHost } from "./mocks/host";

type DataView = powerbi.DataView;
type IVisualHost = powerbi.extensibility.visual.IVisualHost;

export interface MountConfig {
    containerId: string;
    dataView: any;
    settings?: Record<string, any>;
    host?: any;
    dimensions?: { width: number; height: number };
}

export interface MountHandle {
    update: (config: Partial<MountConfig>) => void;
    unmount: () => void;
    getContainer: () => HTMLElement;
}

const sharedHost = __createTooltipMockHost();
(window as any).__host = sharedHost;

function buildDataView(markdown: string | null): DataView {
    const dv: any = {
        metadata: { columns: [], objects: {} }
    };
    if (markdown !== null) {
        dv.single = { value: markdown };
    }
    return dv;
}

const handles = new Map<string, { visual: Visual; element: HTMLElement; refresh: () => void }>();

export function mountVisual(config: MountConfig): MountHandle {
    const container = document.getElementById(config.containerId);
    if (!container) throw new Error(`Container #${config.containerId} not found`);

    let current: MountConfig = config;
    let visual: Visual;

    function ensure() {
        if (!visual) {
            visual = new Visual({
                host: current.host || sharedHost,
                element: container
            } as any);
        }
    }

    function render(cfg: MountConfig) {
        ensure();
        try {
            const dv = cfg.dataView as DataView;
            visual.update({
                dataViews: [dv],
                viewport: { width: cfg.dimensions?.width || container.clientWidth || 800, height: cfg.dimensions?.height || 200 },
                type: 2 /* VisualUpdateType.Data */,
                viewMode: 0,
                editMode: 0,
                isInFocus: false,
                operationKind: 0
            } as any);
        } catch (e) {
            console.error(cfg.containerId, e);
            const err = document.createElement("div");
            err.className = "error";
            err.textContent = "Error: " + (e as Error).message;
            container.appendChild(err);
        }
    }

    render(current);
    handles.set(current.containerId, { visual, element: container, refresh: () => render(current) });

    return {
        update(next) {
            current = { ...current, ...next };
            render(current);
        },
        unmount() {
            container.replaceChildren();
            handles.delete(current.containerId);
        },
        getContainer() { return container; }
    };
}

(window as any).__mountVisual = mountVisual;
(window as any).__refreshVisuals = () => {
    handles.forEach((handle) => handle.refresh());
};

/* ───── Bootstrap scenarios (matches existing playwright assertions) ───── */

const typical = `# Q3 Financial Report

## Revenue breakdown

| Region | Actual | Target |
|--------|--------|--------|
| NA     | $2.3M  | $2.0M  |
| EMEA   | $1.8M  | $1.9M  |
| APAC   | $0.9M  | $1.2M  |

See the [Q3 action plan](https://contoso.example/q3-plan) for owner assignments.

\`\`\`dax
Revenue Variance = [Actual Revenue] - [Target Revenue]
\`\`\`

**Key highlights:**
- NA exceeded target by 15%
- EMEA at 95% attainment
- APAC needs attention

> "A strong quarter overall." — CFO`;

const emoji = `:rocket: Launched Q3 initiative! :tada:

**Status:** :check: On track
**Risks:** :warning: 2 open items
**Momentum:** :chart_up: :fire: :100:`;

const code = `### Installation

\`\`\`javascript
function hello(name) {
  return \`Hello, \${name}!\`;
}
console.log(hello("Power BI"));
\`\`\`

\`\`\`python
def total(items):
    return sum(x["value"] for x in items)
\`\`\``;

const xss = `# This header is safe

<img src=x onerror="document.getElementById('xss-result').textContent='XSS FIRED (img/onerror)'" />

<a href="javascript:alert(1)">Click me (javascript: URL)</a>

<p id="xss-result" style="color:#b91c1c;font-weight:bold;">No XSS detected (yet).</p>

Raw HTML such as <b>this bold</b> and <u>this underline</u> is also rendered by default.`;

mountVisual({ containerId: "typical", dataView: buildDataView(typical) });
mountVisual({ containerId: "emoji",   dataView: buildDataView(emoji) });
mountVisual({ containerId: "code",    dataView: buildDataView(code) });
mountVisual({ containerId: "xss",     dataView: buildDataView(xss) });
mountVisual({ containerId: "landing", dataView: buildDataView("") }); // triggers landing page


/* ─────────────────────────────────────────────────────────────
 * Tooltip-test harness — mounts the REAL Visual class with
 * createMockHost() so tooltipService.show/move/hide are recorded
 * as spy calls. Used exclusively by tooltip.playwright.spec.ts.
 * ───────────────────────────────────────────────────────────── */
(window as any).__mockHosts = (window as any).__mockHosts || {};
(window as any).__mountWithHost = function(
    containerId: string,
    dataView: any,
    opts?: { width?: number; height?: number }
): __TooltipMockHost {
    let el = document.getElementById(containerId);
    if (!el) {
        el = document.createElement("div");
        el.id = containerId;
        el.style.position = "absolute";
        el.style.left = "0";
        el.style.top = "0";
        el.style.width = (opts?.width ?? 640) + "px";
        el.style.height = (opts?.height ?? 360) + "px";
        el.setAttribute("data-tooltip-host", "true");
        document.body.appendChild(el);
    } else {
        el.replaceChildren();
    }
    const host = __createTooltipMockHost();
    (window as any).__mockHosts[containerId] = host;
    const visual = new __TooltipVisual({ host, element: el } as any);
    visual.update({
        dataViews: [dataView],
        viewport: { width: opts?.width ?? 640, height: opts?.height ?? 360 },
        type: 2,
        viewMode: 0,
        editMode: 0,
        isInFocus: false,
        operationKind: 0,
        jsonFilters: []
    } as any);
    return host;
};

// Expose default dataView for selection tests
(window as any).__defaultDataView = buildDataView("# Hello World");

(window as any).__visualsReady = true;
document.body.setAttribute("data-rendered", "true");
