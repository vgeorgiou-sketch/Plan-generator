/*
  Provenance grid renderer — emits a self-contained HTML page driven by the
  model's own output (deriveGridCells / convergence / orderedSignals), so what
  you see is exactly what the model computes. No mock data: it renders the real
  confirmed Opportunity from seed.ts.

  Run: node --experimental-strip-types signal-model/render-grid.ts > out.html
*/

import { convergenceOf, deriveGridCells } from './convergence.ts'
import { SBR_PRESS_BASELINE, SOUTHWARK_BRIDGE_ROAD_SEED } from './seed.ts'
import { LAYER_CATEGORY, LAYER_LABEL, SIGNAL_LAYERS, type Opportunity, type Signal } from './types.ts'

const BUILDINGS: Opportunity[] = [SOUTHWARK_BRIDGE_ROAD_SEED]

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

const FACT_MARK: Record<string, string> = { filed: '●', derived: '◐', inferred: '○', empty: '·' }

function gridRow(opp: Opportunity): string {
  const cells = deriveGridCells(opp)
  return SIGNAL_LAYERS.map((layer) => {
    const cell = cells.find((c) => c.layer === layer)!
    const cat = LAYER_CATEGORY[layer]
    const badge = cell.count ? `<span class="ct">${cell.count}</span>` : ''
    const inner = `<span class="lyr">${esc(LAYER_LABEL[layer])}</span>${badge}`
    const title = esc(cell.tooltip)
    return `<div class="cell cat-${cat} st-${cell.state}" title="${title}">${inner}</div>`
  }).join('')
}

function evidenceRows(opp: Opportunity): string {
  const ordered = [...opp.signals].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
  return ordered
    .map((s: Signal) => {
      const cat = LAYER_CATEGORY[s.layer]
      const todo = s.sourceUrl.endsWith('/') ? '<span class="todo">deep-link TODO</span>' : ''
      const note = s.note ? `<div class="note">${esc(s.note)}</div>` : ''
      return `
      <li class="ev cat-${cat}">
        <span class="ev-date">${shortDate(s.observedAt)}</span>
        <span class="ev-mark st-${s.factType}" title="${s.factType}">${FACT_MARK[s.factType]}</span>
        <span class="ev-body">
          <span class="ev-layer">${esc(LAYER_LABEL[s.layer])}</span>
          <a class="ev-label" href="${esc(s.sourceUrl)}" target="_blank" rel="noreferrer">${esc(String(s.label))}</a> ${todo}
          ${note}
        </span>
      </li>`
    })
    .join('')
}

function card(opp: Opportunity): string {
  const c = convergenceOf(opp, SBR_PRESS_BASELINE)
  const conv = c.isConverged
    ? `<span class="chip chip-on">Converged</span>`
    : `<span class="chip chip-off">Not converged yet</span>`
  return `
  <section class="card">
    <div class="card-head">
      <div>
        <h2>${esc(opp.address)}</h2>
        <div class="sub">${esc(opp.postcode)} · ${esc(opp.borough)} · <span class="status">${esc(opp.status)}</span></div>
      </div>
    </div>

    <div class="conv">
      ${conv}
      <span class="chip">Pressure ${c.pressureLayers}</span>
      <span class="chip">Kinetic ${c.kineticLayers}</span>
      <span class="chip">Weakest signal ${c.minConfidence.toFixed(1)}</span>
      <span class="chip chip-lead">${c.leadTimeDays}d lead <em>incorporation → press</em></span>
    </div>
    <p class="honest">Kinetic-only until EPC/VOA (pressure) is pulled against this building — shown honestly, not forced to “converged”.</p>

    <div class="grid" role="img" aria-label="Signal layers by provenance">${gridRow(opp)}</div>

    <h3>Evidence — every row links to its source record</h3>
    <ul class="evlist">${evidenceRows(opp)}</ul>

    <div class="seq">
      <strong>Control sequence (not one event, four):</strong> the two PSC entries are a relationship ending and a
      different entity’s control being confirmed — rendered distinctly, six days apart, because the sequence is the insight.
    </div>
  </section>`
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Signal grid — provenance view</title>
<style>
  :root{
    --page:#f4f4f1; --card:#fcfcfb; --ink:#151513; --ink2:#55534c; --ink3:#8b897f;
    --hair:#e4e3dc; --hair2:#d3d1c8;
    --kinetic:#2a78d6; --pressure:#5b7a8c; --context:#8b897f;
    --kinetic-wash:rgba(42,120,214,.10); --pressure-wash:rgba(91,122,140,.12); --context-wash:rgba(139,137,127,.12);
  }
  @media (prefers-color-scheme:dark){
    :root{ --page:#0d0d0c; --card:#191917; --ink:#f4f3ee; --ink2:#c3c2b7; --ink3:#8f8d84;
      --hair:#2b2b28; --hair2:#3a3a37; --kinetic:#3987e5; --pressure:#7ea0b3; --context:#a3a196;
      --kinetic-wash:rgba(57,135,229,.16); --pressure-wash:rgba(126,160,179,.16); --context-wash:rgba(163,161,150,.14);}
  }
  :root[data-theme="dark"]{ --page:#0d0d0c; --card:#191917; --ink:#f4f3ee; --ink2:#c3c2b7; --ink3:#8f8d84; --hair:#2b2b28; --hair2:#3a3a37; --kinetic:#3987e5; --pressure:#7ea0b3; --context:#a3a196; --kinetic-wash:rgba(57,135,229,.16); --pressure-wash:rgba(126,160,179,.16); --context-wash:rgba(163,161,150,.14);}
  :root[data-theme="light"]{ --page:#f4f4f1; --card:#fcfcfb; --ink:#151513; --ink2:#55534c; --ink3:#8b897f; --hair:#e4e3dc; --hair2:#d3d1c8; --kinetic:#2a78d6; --pressure:#5b7a8c; --context:#8b897f; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--page);color:var(--ink);font:14px/1.5 "Geist Sans","Inter",-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;-webkit-font-smoothing:antialiased}
  .wrap{max-width:920px;margin:0 auto;padding:32px 24px 64px}
  .top h1{font-size:19px;font-weight:600;letter-spacing:-.01em;margin:0}
  .top .sub{color:var(--ink3);font-size:12.5px;margin-top:2px}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin:16px 0 22px;font-size:11.5px;color:var(--ink2)}
  .legend .k{display:inline-flex;align-items:center;gap:6px}
  .sw{width:22px;height:12px;border-radius:3px;display:inline-block;border:1px solid var(--hair2)}
  .sw.filed{background:var(--ink)}
  .sw.derived{background:repeating-linear-gradient(45deg,var(--ink3),var(--ink3) 2px,transparent 2px,transparent 5px)}
  .sw.inferred{background:transparent;border:1.5px solid var(--ink3)}
  .sw.empty{background:transparent;border:1px dotted var(--hair2)}
  .cdot{width:9px;height:9px;border-radius:50%;display:inline-block}
  .card{background:var(--card);border:1px solid var(--hair);border-radius:8px;padding:18px 20px;margin-bottom:16px}
  .card-head h2{margin:0;font-size:16.5px;font-weight:600}
  .card-head .sub{color:var(--ink3);font-size:12.5px;margin-top:2px}
  .status{text-transform:capitalize;color:var(--ink2)}
  .conv{display:flex;flex-wrap:wrap;gap:8px;margin:14px 0 6px}
  .chip{font-size:11.5px;padding:3px 9px;border-radius:999px;border:1px solid var(--hair2);color:var(--ink2);white-space:nowrap}
  .chip em{font-style:normal;color:var(--ink3)}
  .chip-on{background:var(--ink);color:#fff;border-color:var(--ink)}
  .chip-off{border-style:dashed;color:var(--ink2)}
  .chip-lead{border-color:var(--kinetic);color:var(--ink)}
  .honest{font-size:12px;color:var(--ink3);margin:6px 0 16px}
  .grid{display:grid;grid-template-columns:repeat(11,1fr);gap:4px;margin:6px 0 22px}
  .cell{position:relative;min-height:52px;border-radius:6px;display:flex;align-items:flex-end;padding:6px;overflow:hidden}
  .cell .lyr{font-size:9.5px;line-height:1.15;letter-spacing:.01em}
  .cell .ct{position:absolute;top:4px;right:5px;font-size:10px;font-weight:600;background:var(--card);border:1px solid currentColor;border-radius:999px;min-width:15px;height:15px;display:flex;align-items:center;justify-content:center}
  /* category = hue */
  .cat-kinetic{color:var(--kinetic)} .cat-pressure{color:var(--pressure)} .cat-context{color:var(--context)}
  /* factType = fill treatment */
  .st-empty{background:transparent;border:1px dotted var(--hair2);color:var(--ink3)}
  .st-empty .lyr{color:var(--ink3);opacity:.6}
  .st-filled{}
  .cell.st-filed{background:var(--kinetic);border:1px solid var(--kinetic)}
  .cell.cat-pressure.st-filed{background:var(--pressure);border-color:var(--pressure)}
  .cell.cat-context.st-filed{background:var(--context);border-color:var(--context)}
  .cell.st-filed .lyr{color:#fff}
  .cell.st-derived{background:var(--kinetic-wash);border:1px dashed currentColor}
  .cell.cat-pressure.st-derived{background:var(--pressure-wash)} .cell.cat-context.st-derived{background:var(--context-wash)}
  .cell.st-derived .lyr{color:var(--ink2)}
  .cell.st-inferred{background:transparent;border:1.5px solid currentColor}
  .cell.st-inferred .lyr{color:var(--ink2)}
  h3{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ink2);margin:18px 0 8px}
  .evlist{list-style:none;margin:0;padding:0}
  .ev{display:grid;grid-template-columns:64px 16px 1fr;gap:10px;padding:9px 0;border-bottom:1px solid var(--hair)}
  .ev:last-child{border-bottom:0}
  .ev-date{font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums}
  .ev-mark{font-size:12px}
  .cat-kinetic .ev-mark{color:var(--kinetic)} .cat-pressure .ev-mark{color:var(--pressure)} .cat-context .ev-mark{color:var(--context)}
  .ev-layer{display:inline-block;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink3);margin-right:8px}
  .ev-label{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--hair2)}
  .ev-label:hover{border-color:var(--ink)}
  .todo{font-size:10px;color:var(--ink3);border:1px dashed var(--hair2);border-radius:4px;padding:0 4px;margin-left:4px}
  .note{font-size:11.5px;color:var(--ink2);margin-top:3px}
  .seq{margin-top:14px;font-size:12px;color:var(--ink2);border-left:3px solid var(--kinetic);padding:8px 12px;background:var(--kinetic-wash);border-radius:0 6px 6px 0}
  .seq strong{color:var(--ink)}
  .foot{margin-top:20px;font-size:11.5px;color:var(--ink3)}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <h1>Signal grid — provenance view</h1>
    <div class="sub">Real, cited evidence · ${BUILDINGS.length} building · every number traces to a source record</div>
  </div>
  <div class="legend">
    <span class="k"><span class="cdot" style="background:var(--kinetic)"></span>Kinetic</span>
    <span class="k"><span class="cdot" style="background:var(--pressure)"></span>Pressure</span>
    <span class="k"><span class="cdot" style="background:var(--context)"></span>Context</span>
    <span class="k"><span class="sw filed"></span>Filed</span>
    <span class="k"><span class="sw derived"></span>Derived</span>
    <span class="k"><span class="sw inferred"></span>Inferred</span>
    <span class="k"><span class="sw empty"></span>No record</span>
  </div>
  ${BUILDINGS.map(card).join('')}
  <div class="foot">Grid and figures computed by signal-model (deriveGridCells / convergence); no mock data. Two source links are marked TODO until the exact deep-link is to hand — not fabricated.</div>
</div>
</body>
</html>`

process.stdout.write(html)
