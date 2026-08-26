import { pendingPutFile, pendingGetFile, pendingListFiles, pendingRemoveFile, pendingQueueDeletion, pendingListDeletions, pendingClearDeletion } from "/assets/pending.js?v=3";
import { getT } from "/assets/strings.js?v=3";
import { exportGedcom, importGedcom } from "/assets/gedcom.js?v=3";
import { computeVisible, computeHourglass, findAnchors, buildFamGraph, layoutGraph, computeGenerations } from "/assets/graph.js?v=3";
import { removePersonFromData, countSourceLinks, removeSourceLinks, mergeImportedPeople, absorbPerson } from "/assets/model.js?v=3";

let data = null;
let people = {};
// All serverless endpoints live behind this base path. A standalone
// server (server.mjs) or another hosting adapter mounts the same handlers here.
const API_BASE = "/.netlify/functions";
let currentView = "overview";
let strings = getT("de");
let config = { overview: { extraLines: [] } };
let treeIndex = { trees: [], defaultTree: "family" };
let activeTree = "family";
let isNewLocalTree = false;
let pendingFiles = [];      // filenames waiting for upload on sync
let pendingDeletions = [];  // filenames queued for repository deletion on sync
async function refreshPending() {
  try {
    pendingFiles = await pendingListFiles();
    pendingDeletions = await pendingListDeletions();
  } catch { pendingFiles = []; pendingDeletions = []; }
}
function hasPendingWork() { return draftActive || pendingFiles.length > 0 || pendingDeletions.length > 0; }
async function openSource(url) {
  const name = url.startsWith("/sources/") ? url.slice("/sources/".length) : null;
  const local = name ? await pendingGetFile(name) : null;
  if (local) {
    const blobUrl = URL.createObjectURL(new Blob([local.blob], { type: local.type || "application/octet-stream" }));
    window.open(blobUrl, "_blank", "noopener");
  } else {
    window.open(url, "_blank", "noopener");
  }
}
const draftKey = () => `familyTreeDraft:${activeTree}`;
function draftPersonCount(treeId) {
  if (treeId === activeTree) return Object.keys(people).length;
  try {
    const d = JSON.parse(localStorage.getItem(`familyTreeDraft:${treeId}`) || "null");
    if (d) return Object.keys(d.people || {}).length;
  } catch { /* corrupt draft – fall back to server count */ }
  return null;
}

function localOnlyTrees() {
  const known = new Set((treeIndex.trees || []).map(t => t.id));
  const out = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith("familyTreeDraft:")) {
      const id = k.slice("familyTreeDraft:".length);
      if (!known.has(id)) out.push(id);
    }
  }
  return out.sort();
}
const userRole = (document.cookie.match(/(?:^|;\s*)family_tree_role=([^;]+)/) || [])[1] || "admin";
const isAdmin = userRole === "admin";
let selectedPersonId = null;
let draftActive = false;
let expandedAnchors = new Set();
let pendingHighlight = null;

const app = document.getElementById("app");
const personDialog = document.getElementById("personDialog");
const personDialogContent = document.getElementById("personDialogContent");
const editDialog = document.getElementById("editDialog");
const editDialogContent = document.getElementById("editDialogContent");
const searchDialog = document.getElementById("searchDialog");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");

function esc(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function years(p) {
  if (!p) return "";
  const yr = (x) => (String(x || "").match(/\d{4}/) || [""])[0];
  const b = yr(p.birth);
  const d = yr(p.death);
  if (b && d) return `${b}–${d}`;
  if (b) return `geb. ${b}`;
  if (d) return `† ${d}`;
  return "";
}

function unique(ids = []) {
  return [...new Set((ids || []).filter(Boolean))];
}

const PARTNER_STATUS_LABELS = {
  verheiratet: "",
  geschieden: "geschieden",
  verwitwet: "verwitwet",
  partner: "Partner, unverheiratet"
};

function partnerLabel(ownerId, partnerId) {
  const name = people[partnerId]?.name || partnerId;
  const status = people[ownerId]?.partnerDetails?.[partnerId]?.status;
  const suffix = status && PARTNER_STATUS_LABELS[status] ? ` (${PARTNER_STATUS_LABELS[status]})` : "";
  return `${name}${suffix}`;
}

function saveDraft() {
  layoutCache.clear();
  localStorage.setItem(draftKey(), JSON.stringify(data));
  draftActive = true;
  updateDraftBadge();
}

function updateDraftBadge() {
  document.querySelectorAll(".draft-badge").forEach(el => el.hidden = !hasPendingWork());
}

function personButton(id) {
  const p = people[id];
  if (!p) return `<span class="muted">${esc(id)}</span>`;
  return `<button class="name" data-person="${esc(id)}">${esc(p.name)}</button>`;
}

function personCard(id, badge = "") {
  const p = people[id];
  if (!p) return "";
  return `
    <article class="person-card">
      ${personButton(id)}
      ${years(p) ? `<div class="years">${esc(years(p))}</div>` : ""}
      ${(p.partners || []).length ? `<div class="meta">⚭ ${unique(p.partners).map(x => esc(partnerLabel(id, x))).join(" · ")}</div>` : ""}
      ${p.occupation ? `<div class="meta">${esc(p.occupation)}</div>` : ""}
      ${badge ? `<span class="badge">${esc(badge)}</span>` : ""}
    </article>`;
}

function getSiblingIds(id) {
  const p = people[id];
  const explicit = p?.siblings || [];
  const viaParents = unique(
    (p?.parents || []).flatMap((parentId) => people[parentId]?.children || [])
  ).filter((x) => x !== id);
  return unique([...explicit, ...viaParents]);
}

/* ---------------- Overview: tree graph ---------------- */

function baseRootIds() {
  // Topmost known ancestors of the focus (up to great-grandparent level) incl. partners.
  const focusId = data.meta.focusPersonId;
  const tops = [];
  const up = (id, depth) => {
    const parents = (people[id]?.parents || []).filter(x => people[x]);
    if (!parents.length || depth >= (data.meta.defaultAncestorDepth ?? 3)) { tops.push(id); return; }
    parents.forEach(pid => up(pid, depth + 1));
  };
  (people[focusId]?.parents || []).filter(x => people[x]).forEach(pid => up(pid, 1));
  if (!tops.length) tops.push(focusId);
  return unique(tops);
}

function measureNode(n) {
  const lines = nodeLines(n);
  const maxLen = Math.max(...lines.map(l => l.text.length), 6);
  return { w: Math.min(340, maxLen * 7.6 + 48), h: lines.length * 17 + 16 };
}

function nodeLines(n) {
  if (n.type === "placeholder") return [{ text: n.label, person: null }];
  const first = n.persons[0];
  return n.persons.map((pid, i) => {
    const isPartnerOfFirst = i > 0 && (people[first]?.partners || []).includes(pid);
    const base = isPartnerOfFirst ? partnerLabel(first, pid) : (people[pid]?.name || pid);
    const yr = years(people[pid]);
    return {
      text: `${base}${yr ? `  ${yr}` : ""}`,
      person: pid
    };
  });
}

// Branch colouring is dataset-driven: define in the tree's meta, e.g.
// meta.branches: { paternal: { roots: [id, id], color: "#4c78a8", surname: "Bonaparte" } }
// Lines above these root couples stay uncoloured; without meta.branches everything is neutral.
const branchDefs = () => (data.meta && data.meta.branches) || {};
const rootBranchOf = (pid) => {
  for (const [branch, def] of Object.entries(branchDefs())) if ((def.roots || []).includes(pid)) return branch;
  return null;
};
// Branch colouring all the way down: each person inherits their parents' branch.
// At confluences the surname decides, otherwise the siblings of the same parents.
const branchMemo = new Map();
function resolveBranch(pid) {
  if (branchMemo.has(pid)) return branchMemo.get(pid);
  const result = resolveBranchInner(pid, new Set());
  branchMemo.set(pid, result);
  return result;
}
function resolveBranchInner(pid, seen) {
  if (branchMemo.has(pid)) return branchMemo.get(pid);
  if (seen.has(pid) || !people[pid]) return null;
  seen.add(pid);
  const direct = rootBranchOf(pid);
  if (direct) return direct;
  const parents = (people[pid].parents || []).filter(x => people[x]);
  const candidates = [...new Set(parents.map(par => resolveBranchInner(par, seen)).filter(Boolean))];
  let result = null;
  if (candidates.length === 1) result = candidates[0];
  else if (candidates.length > 1) {
    const byName = (name) => {
      let bestBranch = null, bestPos = Infinity;
      for (const b of candidates) {
        const pos = (name || "").indexOf(branchDefs()[b]?.surname || "\u0000");
        if (pos >= 0 && pos < bestPos) { bestPos = pos; bestBranch = b; }
      }
      return bestBranch;
    };
    result = byName(people[pid].name);
    if (!result) {
      // Geschwister derselben Eltern befragen
      const siblings = new Set();
      for (const par of parents) for (const c of people[par].children || []) if (c !== pid && people[c]) siblings.add(c);
      for (const sib of siblings) {
        const m = byName(people[sib].name);
        if (m) { result = m; break; }
      }
    }
    if (!result) result = candidates[0];
  }
  return result;
}
function branchColor(n) {
  const branches = [...new Set((n.persons || []).map(pid => resolveBranch(pid)).filter(Boolean))];
  if (branches.length === 1) return branchDefs()[branches[0]?.color];
  if (branches.length > 1) {
    // Couple from two branches: the branch the children carry on determines the colour
    for (const pid of n.persons || []) {
      for (const child of people[pid]?.children || []) {
        const cb = resolveBranch(child);
        if (cb && branches.includes(cb)) return branchDefs()[cb]?.color;
      }
    }
    return branchDefs()[branches[0]?.color];
  }
  return null;
}
function genLabel(diff) {
  return strings.getGenLabel(diff);
}

let descendantRoot = null;
let viewMode = localStorage.getItem("graphViewMode") || "hourglass";
let hourglassRoot = null;

function effectiveAnchors() {
  return new Set([...expandedAnchors, ...(data.meta.autoExpand || [])]);
}

const layoutCache = new Map();

// Full view: all historical lines always expanded – anchors accumulated step by step
function computeFullVisible(roots) {
  const acc = new Set();
  let vis = computeVisible(people, roots, acc, { includeOrphans: true });
  for (let i = 0; i < 40; i++) {
    const more = findAnchors(people, vis).filter(a => !acc.has(a));
    if (!more.length) break;
    more.forEach(a => acc.add(a));
    vis = computeVisible(people, roots, acc, { includeOrphans: true });
  }
  return vis;
}

function renderOverview() {
  branchMemo.clear();
  const roots = baseRootIds();
  const inDescMode = descendantRoot && people[descendantRoot];
  const hgRoot = (hourglassRoot && people[hourglassRoot]) ? hourglassRoot : data.meta.focusPersonId;
  const inHourglass = !inDescMode && viewMode === "hourglass";
  const visible = inDescMode
    ? computeVisible(people, [descendantRoot], new Set())
    : inHourglass
      ? computeHourglass(people, hgRoot)
      : computeFullVisible(roots);
  // Keep the focus family visible (full view only; hourglass/descendants show just the subtree)
  if (!inDescMode && !inHourglass) visible.add(data.meta.focusPersonId);
  const anchors = new Set();
  const toggles = new Set([...anchors, ...expandedAnchors]);
  const placeholderRoots = (people[data.meta.focusPersonId]?.parents || [])
    .filter(pid => people[pid] && !(people[pid].parents || []).some(x => people[x]));
  const graph = buildFamGraph(people, visible, { placeholderRoots });
  const personGen = computeGenerations(people, visible, inDescMode ? descendantRoot : (inHourglass ? hgRoot : data.meta.focusPersonId));
  const cacheKey = [...visible].sort().join(",");
  let laid = layoutCache.get(cacheKey);
  if (!laid) {
    laid = layoutGraph(graph, measureNode, personGen);
    layoutCache.set(cacheKey, laid);
    if (layoutCache.size > 30) layoutCache.delete(layoutCache.keys().next().value);
  }

  const highlightId = pendingHighlight;
  pendingHighlight = null;

  const nodeSvg = laid.nodes.map(n => {
    const lines = nodeLines(n);
    const x = n.x - n.w / 2, y = n.y;
    const isHl = highlightId && n.persons.includes(highlightId);
    const isFocus = n.persons.includes(data.meta.focusPersonId);
    return `
      <g class="gnode ${n.type} ${isFocus ? "focus" : ""} ${isHl ? "highlight" : ""}">
        <rect x="${x}" y="${y}" rx="8" width="${n.w}" height="${n.h}" ${n.type === "placeholder" ? 'stroke-dasharray="5,4"' : ""}/>
        ${lines.map((l, i) => {
          const lineY = y + 15 + i * 17;
          return `
          <text x="${n.x}" y="${lineY}" text-anchor="middle"
            ${l.person ? `class="gname" data-person="${esc(l.person)}"` : 'class="gmuted"'}>${esc(l.text)}</text>`;
        }).join("")}
      </g>`;
  }).join("");

  const nodeById = new Map(laid.nodes.map(n => [n.id, n]));
  const edgeSvg = laid.edges.map(e => {
    const a = nodeById.get(e.from), b = nodeById.get(e.to);
    const x1 = a.x, y1 = a.y + a.h, x2 = b.x, y2 = b.y;
    const my = (y1 + y2) / 2;
    return `<path class="gedge" ${e.dashed ? 'stroke-dasharray="5,4"' : ""}
      d="M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}"/>`;
  }).join("");

  // Generationen-Beschriftung am linken Rand
  const refPerson = inDescMode ? descendantRoot : (inHourglass ? hgRoot : data.meta.focusPersonId);
  const focusNode = laid.nodes.find(n => n.persons.includes(refPerson));
  const focusGen = focusNode ? focusNode.gen : 0;
  const genText = (diff) => {
    if (inDescMode && diff === "0") return "Stammeltern";
    if (inHourglass && diff === "0" && hgRoot !== data.meta.focusPersonId) return strings.get("genCenter");
    return genLabel(diff);
  };
  const genRows = new Map();
  for (const n of laid.nodes) {
    if (!genRows.has(n.gen) || n.y < genRows.get(n.gen)) genRows.set(n.gen, n.y);
  }
  const labelX = -30;
  const genLabelSvg = [...genRows.entries()].map(([g, y]) =>
    `<text class="glabel" x="${labelX}" y="${y + 16}" text-anchor="end">${esc(genText(String(g - focusGen)))}</text>`
  ).join("");

  const legendSvg = "";



  app.innerHTML = `
    <section class="view-header">
      <div>
        <h2>${esc(config.overview?.heading || "Stammbaum")}</h2>
        <p>${esc(config.overview?.intro || "")}</p>
        <p class="scope-note">${config.overview?.note || ""}</p>
        ${(config.overview?.extraLines || []).length ? `
        <h3 class="section-title">${esc(config.overview?.linesHeading || (config.language === "de" ? "Zusätzliche Linien" : "Additional lines"))}</h3>
        <table class="scope-table">
          ${config.overview.extraLines.map(l => `
          <tr>
            <td><button class="linklike" data-show-in-tree="${esc(l.person)}">${esc(l.label)}</button></td>
            <td>${esc(l.text)}${isAdmin && l.adminSuffix ? " " + esc(l.adminSuffix) : ""}</td>
          </tr>`).join("")}
        </table>` : ""}
      </div>
      <span class="draft-badge badge" hidden>${strings.get("draftBadge")}</span>
    </section>
    <div class="graph-controls">
      <span class="search-holder">
        <input id="graphSearch" placeholder="${strings.get('searchGraph')}" autocomplete="off" />
        <div id="graphSearchResults" class="search-suggest" hidden></div>
      </span>
      ${inDescMode ? `
      <span class="desc-banner">${strings.get("descendantsBanner")} <b>${esc(people[descendantRoot].name)}</b></span>
      <button class="ghost" id="exitDescendants">${strings.get("back")}</button>` : inHourglass ? `
      <span class="desc-banner">${strings.get("hourglassBanner")} <b>${esc(people[hgRoot].name)}</b></span>
      <button class="ghost" id="toFullView">${strings.get("viewFull")}</button>` : `
      <button class="ghost" id="toHourglass">${strings.get("viewHourglass")}</button>`}

    </div>
    ${legendSvg}
    <div class="graph-wrap" id="graphWrap">
      <svg id="graphSvg" preserveAspectRatio="xMidYMid meet">
        <g>${genLabelSvg}${edgeSvg}${nodeSvg}</g>
      </svg>
    </div>
  `;

  document.getElementById("exitDescendants")?.addEventListener("click", () => {
    descendantRoot = null;
    renderOverview();
  });
  document.getElementById("toFullView")?.addEventListener("click", () => {
    viewMode = "full";
    localStorage.setItem("graphViewMode", "full");
    renderOverview();
  });
  document.getElementById("toHourglass")?.addEventListener("click", () => {
    viewMode = "hourglass";
    hourglassRoot = null;
    localStorage.setItem("graphViewMode", "hourglass");
    renderOverview();
  });
  const gSearch = document.getElementById("graphSearch");
  const gResults = document.getElementById("graphSearchResults");
  gSearch?.addEventListener("input", () => {
    const q = gSearch.value.trim().toLowerCase();
    if (!q) { gResults.hidden = true; gResults.innerHTML = ""; return; }
    const hits = Object.entries(people)
      .filter(([, p]) => (p.name || "").toLowerCase().includes(q))
      .slice(0, 8);
    gResults.innerHTML = hits.map(([id, p]) =>
      `<button type="button" class="search-suggest-item" data-suggest="${esc(id)}">${esc(p.name)}${years(p) ? ` <span class="meta">${esc(years(p))}</span>` : ""}</button>`).join("") ||
      `<div class="search-suggest-empty">Keine Treffer</div>`;
    gResults.hidden = false;
  });
  gResults?.addEventListener("click", (e) => {
    const item = e.target.closest("[data-suggest]");
    if (!item) return;
    gSearch.value = "";
    gResults.hidden = true;
    showInTree(item.dataset.suggest);
  });
  updateDraftBadge();

  const svg = document.getElementById("graphSvg");
  const full = { x: -190, y: 0, w: laid.width + 190, h: laid.height };
  let vb = { ...full };

  if (highlightId) {
    const node = laid.nodes.find(n => n.persons.includes(highlightId));
    if (node) {
      const w = Math.min(laid.width, Math.max(600, node.w * 3.2));
      const h = w * 0.75;
      vb = { x: node.x - w / 2, y: node.y + node.h / 2 - h / 2, w, h };
    }
  } else if (full.w > 1800) {
    // Large graphs: zoom in on the reference person legibly instead of showing everything tiny
    const refNode = laid.nodes.find(n => n.persons.includes(refPerson));
    if (refNode) {
      const w = 1500, h = w * 0.75;
      vb = { x: refNode.x - w / 2, y: refNode.y + refNode.h / 2 - h / 2, w, h };
    }
  }
  const applyVb = () => svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  applyVb();

  // Zoom & Pan direkt auf dem SVG
  const wrap = document.getElementById("graphWrap");
  const clientToGraph = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    return { x: vb.x + (cx - r.left) / r.width * vb.w, y: vb.y + (cy - r.top) / r.height * vb.h };
  };
  const zoomAt = (factor, cx, cy) => {
    const pt = clientToGraph(cx, cy);
    const nw = Math.min(full.w * 1.2, Math.max(120, vb.w * factor));
    const scale = nw / vb.w;
    vb = { x: pt.x - (pt.x - vb.x) * scale, y: pt.y - (pt.y - vb.y) * scale, w: nw, h: vb.h * scale };
    applyVb();
  };
  wrap.addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.deltaY > 0 ? 1.12 : 0.89, e.clientX, e.clientY);
  }, { passive: false });

  let drag = null, pinch = null, moved = false;
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
  wrap.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") return; // touch is handled via touch events
    drag = { x: e.clientX, y: e.clientY, vb: { ...vb } };
    moved = false;
  });
  wrap.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const dx = (e.clientX - drag.x) / r.width * vb.w;
    const dy = (e.clientY - drag.y) / r.height * vb.h;
    if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) moved = true;
    vb.x = drag.vb.x - dx; vb.y = drag.vb.y - dy;
    applyVb();
  });
  window.addEventListener("pointerup", () => { drag = null; });

  wrap.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) pinch = { d: dist(e.touches), vb: { ...vb }, mid: mid(e.touches) };
    else if (e.touches.length === 1) drag = { x: e.touches[0].clientX, y: e.touches[0].clientY, vb: { ...vb } };
  }, { passive: true });
  wrap.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && pinch) {
      e.preventDefault();
      const factor = pinch.d / dist(e.touches);
      const nw = Math.min(full.w * 1.2, Math.max(120, pinch.vb.w * factor));
      const scale = nw / pinch.vb.w;
      const r = svg.getBoundingClientRect();
      const px = pinch.vb.x + (pinch.mid.x - r.left) / r.width * pinch.vb.w;
      const py = pinch.vb.y + (pinch.mid.y - r.top) / r.height * pinch.vb.h;
      vb = { x: px - (px - pinch.vb.x) * scale, y: py - (py - pinch.vb.y) * scale, w: nw, h: pinch.vb.h * scale };
      applyVb();
    } else if (e.touches.length === 1 && drag && !pinch) {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      vb.x = drag.vb.x - (e.touches[0].clientX - drag.x) / r.width * vb.w;
      vb.y = drag.vb.y - (e.touches[0].clientY - drag.y) / r.height * vb.h;
      applyVb();
    }
  }, { passive: false });
  wrap.addEventListener("touchend", () => { pinch = null; drag = null; });

  // Aufklapp-Anker
  // Click on a name (only if not dragged)
  svg.querySelectorAll(".gname").forEach(t => t.addEventListener("click", (e) => {
    if (moved) return;
    e.stopPropagation();
    openPerson(t.dataset.person);
  }));
}

function showInTree(personId) {
  descendantRoot = null;
  if (viewMode === "hourglass") {
    hourglassRoot = personId;
    pendingHighlight = personId;
    renderView("overview");
    return;
  }
  // Full view: highlight the person — everything is visible; safety net for unconnected persons
  const visible = computeFullVisible(baseRootIds());
  if (!visible.has(personId)) {
    viewMode = "hourglass";
    localStorage.setItem("graphViewMode", "hourglass");
    hourglassRoot = personId;
  }
  pendingHighlight = personId;
  renderView("overview");
}

/* ---------------- Persons (incl. data actions) ---------------- */

async function saveCentral() {
  const button = document.getElementById("adminSync");
  const oldText = button?.textContent;
  if (button) button.disabled = true;
  const setStatus = (t) => { if (button) button.textContent = t; };
  try {
    await refreshPending();
    // 1) pending file uploads
    for (let i = 0; i < pendingFiles.length; i++) {
      const name = pendingFiles[i];
      setStatus(strings.get("syncUploading", { i: i + 1, n: pendingFiles.length }));
      const entry = await pendingGetFile(name);
      if (!entry) continue;
      const contentBase64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result).split(",")[1]);
        r.onerror = rej;
        r.readAsDataURL(new Blob([entry.blob], { type: entry.type }));
      });
      const resp = await fetch(`${API_BASE}/upload-source`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: name, contentBase64 })
      });
      const result = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(result?.error || `Upload ${name} failed (${resp.status})`);
      await pendingRemoveFile(name);
    }
    // 2) queued deletions (missing files are fine)
    for (const name of pendingDeletions) {
      setStatus(strings.get("syncDeleting", { name }));
      const resp = await fetch(`${API_BASE}/delete-source`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: name })
      });
      if (!resp.ok && resp.status !== 404) {
        const result = await resp.json().catch(() => ({}));
        throw new Error(result?.error || `Delete ${name} failed (${resp.status})`);
      }
      await pendingClearDeletion(name);
    }
    // 3) dataset YAML
    setStatus(strings.get("saving"));
    const res = await fetch(`${API_BASE}/save-family`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({data, tree: activeTree, create: isNewLocalTree})
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || `Save failed (${res.status})`);
    localStorage.removeItem(draftKey());
    draftActive = false;
    isNewLocalTree = false;
    await refreshPending();
    updateDraftBadge();
    alert(strings.get("saved", { commit: result.commit || strings.get("savedFallback") }));
    if (currentView === "admin") renderView("admin");
  } catch (err) {
    await refreshPending();
    updateDraftBadge();
    alert(`${err.message}${strings.get("saveErrorHint")}`);
  } finally {
    if (button) { button.disabled = false; button.textContent = oldText; }
  }
}

/* ---------------- Sources ---------------- */

function renderAdmin() {
  app.innerHTML = `
    <section class="view-header">
      <div>
        <h2>${strings.get("adminTitle")}</h2>
        <p>${strings.get("adminSubtitle")}</p>
      </div>
    </section>
    <div class="card admin-card">
      <h3>${strings.get("draftCard")}</h3>
      <p class="muted">${strings.get(draftActive ? "draftActive" : "draftNone")}</p>
      ${pendingFiles.length || pendingDeletions.length ? `<p class="muted">${strings.get("pendingInfo", { u: pendingFiles.length, d: pendingDeletions.length })}</p>` : ""}
      <div class="toolbar">
        <button id="adminSync" class="primary" ${hasPendingWork() ? "" : "disabled"}>${strings.get("syncButton")}</button>
        <button id="adminDiscard" class="secondary" ${draftActive ? "" : "disabled"}>${strings.get("discardButton")}</button>
      </div>
    </div>
    <div class="card admin-card">
      <h3>${strings.get("datasetCard")}</h3>
      <p class="muted">${strings.get("datasetInfo", { tree: esc(activeTree), n: Object.keys(people).length, def: esc(treeIndex.defaultTree) })}</p>
      ${isNewLocalTree ? `<p class="muted">${strings.get("datasetLocal")}</p>` : ""}
      <div class="toolbar">
        <select id="treeSelect">
          ${(treeIndex.trees || []).map(t => `<option value="${esc(t.id)}" ${t.id === activeTree ? "selected" : ""}>${strings.get("datasetPersons", { id: esc(t.id), n: draftPersonCount(t.id) ?? t.people })}</option>`).join("")}
          ${localOnlyTrees().map(id => `<option value="${esc(id)}" ${id === activeTree ? "selected" : ""}>${strings.get("datasetNewLocal", { id: esc(id), n: draftPersonCount(id) ?? 0 })}</option>`).join("")}
        </select>
        <button id="treeCreate" class="secondary">${strings.get("datasetNew")}</button>
      </div>
    </div>
    <div class="card admin-card">
      <h3>${strings.get("importCard")}</h3>
      <p class="muted">${strings.get("importInfo")}</p>
      <div class="toolbar">
        <input id="gedImportFile" type="file" accept=".ged,.gedcom" />
        <button id="gedImportBtn" class="secondary">${strings.get("importButton")}</button>
      </div>
      <p class="muted" id="gedImportStatus"></p>
    </div>
    <div class="card admin-card">
      <h3>${strings.get("downloadsCard")}</h3>
      <p class="muted">${strings.get("downloadsInfo", { n: Object.keys(people).length, m: new Set(Object.values(people).flatMap(p => (p.sources || []).map(s => s.url))).size, draft: draftActive ? strings.get("downloadsDraftSuffix") : "" })}</p>
      <div class="toolbar">
        <button id="exportYaml" class="secondary">YAML</button>
        <button id="exportJson" class="secondary">JSON</button>
        <button id="exportGedcomBtn" class="secondary">GEDCOM</button>
        <button id="downloadSourcesZip" class="secondary">${strings.get("downloadsZip")}</button>
      </div>
    </div>
  `;
  document.getElementById("adminSync")?.addEventListener("click", saveCentral);
  document.getElementById("treeCreate")?.addEventListener("click", () => {
    const name = prompt(strings.get("newTreePrompt"));
    if (!name) return;
    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    if (!slug) { alert(strings.get("invalidName")); return; }
    if ((treeIndex.trees || []).some(t => t.id === slug) || localStorage.getItem(`familyTreeDraft:${slug}`)) {
      alert(strings.get("treeExists", { slug })); return;
    }
    const firstName = prompt(strings.get("firstPersonPrompt"), strings.get("firstPersonDefault"));
    if (!firstName) return;
    const pid = firstName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "person";
    const fresh = {
      meta: { title: name, focusPersonId: pid, defaultAncestorDepth: 3 },
      people: { [pid]: { name: firstName } }
    };
    localStorage.setItem(`familyTreeDraft:${slug}`, JSON.stringify(fresh));
    localStorage.setItem("activeTree", slug);
    location.reload();
  });
  document.getElementById("treeSelect")?.addEventListener("change", (e) => {
    localStorage.setItem("activeTree", e.target.value);
    location.reload();
  });
  document.getElementById("gedImportBtn")?.addEventListener("click", async () => {
    const status = document.getElementById("gedImportStatus");
    const file = document.getElementById("gedImportFile").files[0];
    if (!file) { status.textContent = strings.get("gedChooseFile"); return; }
    try {
      const text = await file.text();
      const parsed = importGedcom(text);
      const count = Object.keys(parsed.people || {}).length;
      if (!count) { status.textContent = strings.get("gedNoPersons"); return; }
      if (!confirm(strings.get("gedImportConfirm", { n: count, file: file.name, tree: activeTree }))) return;
      const result = mergeImportedPeople(data, parsed.people);
      saveDraft();
      let msg = strings.get("gedImported", { n: result.added });
      if (result.duplicates.length) {
        msg += strings.get("gedDuplicates", {
          n: result.duplicates.length,
          names: result.duplicates.slice(0, 8).map(d => d.name).join(", ") + (result.duplicates.length > 8 ? " …" : "")
        });
      }
      status.textContent = msg;
      renderView("admin");
      document.getElementById("gedImportStatus").textContent = msg;
    } catch (err) {
      status.textContent = strings.get("gedFailed", { err: err.message || err });
    }
  });
  document.getElementById("adminDiscard")?.addEventListener("click", async () => {
    if (!confirm(strings.get("discardConfirm"))) return;
    localStorage.removeItem(draftKey());
    location.reload();
  });
  document.getElementById("exportYaml")?.addEventListener("click", () => {
    downloadText(`${activeTree}.yaml`, (window.jsyaml ? jsyaml.dump(data, { lineWidth: -1 }) : JSON.stringify(data, null, 2)), "text/yaml");
  });
  document.getElementById("exportJson")?.addEventListener("click", () => {
    downloadText(`${activeTree}.json`, JSON.stringify(data, null, 2), "application/json");
  });
  document.getElementById("exportGedcomBtn")?.addEventListener("click", () => {
    downloadText(`${activeTree}.ged`, exportGedcom(data), "text/plain");
  });
  document.getElementById("downloadSourcesZip")?.addEventListener("click", async () => {
    const btn = document.getElementById("downloadSourcesZip");
    btn.disabled = true; btn.textContent = strings.get("zipCreating");
    try {
      const res = await fetch(`${API_BASE}/download-sources`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Fehler ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "stammbaum-quellen.zip"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      alert(strings.get("zipFailed", { err: err.message }));
    } finally {
      btn.disabled = false; btn.textContent = strings.get("zipButton");
    }
  });
}

function renderSources() {
  // Document-centric view: each source document once, with the persons it documents.
  const docs = new Map(); // url -> { labels: Map(label->count), persons: [] }
  for (const [id, p] of Object.entries(people)) {
    for (const s of (p.sources || [])) {
      if (!docs.has(s.url)) docs.set(s.url, { labels: new Map(), persons: [] });
      const d = docs.get(s.url);
      d.labels.set(s.label, (d.labels.get(s.label) || 0) + 1);
      if (!d.persons.includes(id)) d.persons.push(id);
    }
  }
  const entries = [...docs.entries()].map(([url, d]) => {
    const label = [...d.labels.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const persons = d.persons.sort((a, b) => (people[a].name || a).localeCompare(people[b].name || b, "de"));
    return { url, label, persons };
  }).sort((a, b) => a.label.localeCompare(b.label, "de"));

  app.innerHTML = `
    <section class="view-header">
      <div>
        <h2>${strings.get("sources")}</h2>
      </div>
    </section>
    ${entries.map(e => `
      <section class="card source-doc">
        <div class="source-doc-head">
          <h3>${esc(e.label)}</h3>
          <div class="toolbar compact">
            <button class="secondary small" data-open-source="${esc(e.url)}">${strings.get("openDocument")}</button>${pendingFiles.includes(e.url.replace("/sources/", "")) ? `<span class="muted small">${strings.get("sourcePendingTag")}</span>` : ""}
            ${isAdmin ? `<button class="danger small" data-delete-source="${esc(e.url)}">${strings.get("delete")}</button>` : ""}
          </div>
        </div>
        <div class="source-doc-persons">
          ${e.persons.map(id => `<button class="chip" data-open-person="${esc(id)}">${esc(people[id].name || id)}</button>`).join("")}
        </div>
      </section>
    `).join("")}
  `;
  app.querySelectorAll("[data-open-person]").forEach(btn => {
    btn.addEventListener("click", () => openPerson(btn.dataset.openPerson));
  });
  app.querySelectorAll("[data-delete-source]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const url = btn.dataset.deleteSource;
      const linked = countSourceLinks(people, url);
      const warn = linked
        ? strings.get("sourceDeleteLinked", { n: linked })
        : strings.get("sourceDeleteUnlinked");
      if (!confirm(warn)) return;
      removeSourceLinks(people, url);
      saveDraft();
      if (url.startsWith("/sources/")) {
        const name = url.replace("/sources/", "");
        if (pendingFiles.includes(name)) {
          await pendingRemoveFile(name);          // never synced – just drop the local blob
        } else if (confirm(strings.get("sourceDeleteFile"))) {
          await pendingQueueDeletion(name);       // executed on next sync
        }
        await refreshPending();
        updateDraftBadge();
      }
      renderView("sources");
    });
  });
}

document.addEventListener("click", (e) => {
  const src = e.target.closest("[data-open-source]");
  if (src) { e.preventDefault(); openSource(src.dataset.openSource); }
});

/* ---------------- YAML export helpers ---------------- */

function toYamlScalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

function toYaml(obj, indent = 0) {
  const pad = " ".repeat(indent);
  if (Array.isArray(obj)) {
    if (!obj.length) return "[]";
    return obj.map(item => {
      if (item && typeof item === "object") {
        const body = toYaml(item, indent + 2);
        const lines = body.split("\n");
        return `${pad}- ${lines[0].trimStart()}\n${lines.slice(1).join("\n")}`;
      }
      return `${pad}- ${toYamlScalar(item)}`;
    }).join("\n");
  }
  if (obj && typeof obj === "object") {
    return Object.entries(obj).map(([k,v]) => {
      if (v && typeof v === "object" && !(Array.isArray(v) && v.length === 0)) {
        return `${pad}${k}:\n${toYaml(v, indent + 2)}`;
      }
      return `${pad}${k}: ${Array.isArray(v) ? "[]" : toYamlScalar(v)}`;
    }).join("\n");
  }
  return `${pad}${toYamlScalar(obj)}`;
}

function downloadText(filename, text, mime="text/plain") {
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------- Edit dialog ---------------- */

function knownSourceDocs() {
  const docs = new Map();
  for (const p of Object.values(people)) {
    for (const s of (p.sources || [])) {
      if (!docs.has(s.url)) docs.set(s.url, new Map());
      const labels = docs.get(s.url);
      labels.set(s.label, (labels.get(s.label) || 0) + 1);
    }
  }
  return [...docs.entries()]
    .map(([url, labels]) => ({ url, label: [...labels.entries()].sort((a, b) => b[1] - a[1])[0][0] }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));
}

function createPerson(name) {
  let base = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"") || "person";
  let id = base, n = 2;
  while (people[id]) id = `${base}_${n++}`;
  people[id] = {name};
  return id;
}

function linkRelation(type, aId, bId) {
  const a = people[aId], b = people[bId];
  if (!a || !b) return;
  a[type] = unique([...(a[type] || []), bId]);
  if (type === "parents") b.children = unique([...(b.children || []), aId]);
  if (type === "children") b.parents = unique([...(b.parents || []), aId]);
  if (type === "partners") b.partners = unique([...(b.partners || []), aId]);
}

function openEditDialog(id) {
  if (!isAdmin) return;
  selectedPersonId = id;
  const p = people[id];
  if (!p) return;

  const relationPills = (arr = []) => arr.length
    ? arr.map(x => `<span class="pill">${esc(people[x]?.name || x)}</span>`).join("")
    : `<span class="empty">${strings.get("none")}</span>`;

  editDialogContent.innerHTML = `
    <h2>${strings.get("editTitle", { name: esc(p.name) })}</h2>
    <form id="personEditor" class="editor">
      <div class="editor-grid">
        <label>${strings.get("fieldName")}
          <input name="name" value="${esc(p.name || "")}" required />
        </label>
        <label>${strings.get("fieldBirth")}
          <input name="birth" value="${esc(p.birth || "")}" placeholder="${strings.get('fieldBirthHint')}" />
        </label>
        <label>${strings.get("fieldDeath")}
          <input name="death" value="${esc(p.death || "")}" placeholder="${strings.get('fieldDeathHint')}" />
        </label>
      </div>
      <label>${strings.get("fieldOccupation")}
        <input name="occupation" value="${esc(p.occupation || "")}" />
      </label>
      <label>${strings.get("fieldNotes")}
        <textarea name="notes">${esc((p.notes || []).join("\n"))}</textarea>
      </label>

      <div class="edit-relations">
        <div class="relation-box">
          <h4>${strings.get("relParents")}</h4>
          <div class="pill-list">${relationPills(p.parents)}</div>
          <button type="button" class="secondary small" data-add-relation="parents">${strings.get("addExistingParent")}</button>
          <button type="button" class="secondary small" data-create-relation="parents">${strings.get("addNewParent")}</button>
        </div>
        <div class="relation-box">
          <h4>${strings.get("relPartners")}</h4>
          <div class="pill-list">${(p.partners || []).length ? unique(p.partners).map(pid => `
            <span class="pill">${esc(people[pid]?.name || pid)}
              <select data-partner-status="${esc(pid)}" class="status-select">
                <option value="" ${!(p.partnerDetails?.[pid]?.status) || p.partnerDetails?.[pid]?.status === "verheiratet" ? "selected" : ""}>${strings.get("statusMarried")}</option>
                <option value="geschieden" ${p.partnerDetails?.[pid]?.status === "geschieden" ? "selected" : ""}>${strings.get("statusDivorced")}</option>
                <option value="verwitwet" ${p.partnerDetails?.[pid]?.status === "verwitwet" ? "selected" : ""}>${strings.get("statusWidowed")}</option>
                <option value="partner" ${p.partnerDetails?.[pid]?.status === "partner" ? "selected" : ""}>${strings.get("statusPartner")}</option>
              </select>
            </span>`).join("") : `<span class="empty">${strings.get("none")}</span>`}</div>
          <button type="button" class="secondary small" data-add-relation="partners">${strings.get("addExistingPartner")}</button>
          <button type="button" class="secondary small" data-create-relation="partners">${strings.get("addNewPartner")}</button>
        </div>
        <div class="relation-box">
          <h4>${strings.get("relChildren")}</h4>
          <div class="pill-list">${relationPills(p.children)}</div>
          <button type="button" class="secondary small" data-add-relation="children">${strings.get("addExistingChild")}</button>
          <button type="button" class="secondary small" data-create-relation="children">${strings.get("addNewChild")}</button>
        </div>
      </div>

      <div class="relation-box">
        <h4>${strings.get("sources")}</h4>
        <div class="pill-list">${(p.sources || []).length ? p.sources.map((src, i) => `
          <span class="pill">${esc(src.label)}
            <button type="button" class="pill-x" data-remove-source="${i}" title="${strings.get('removeSourceTitle')}">×</button>
          </span>`).join("") : `<span class="empty">${strings.get("none")}</span>`}</div>
        <div class="source-add">
          <select id="srcExisting">
            <option value="">${strings.get("srcExistingPlaceholder")}</option>
            ${knownSourceDocs().map(d => `<option value="${esc(d.url)}" data-label="${esc(d.label)}">${esc(d.label)}</option>`).join("")}
          </select>
          <button type="button" class="secondary small" id="srcLinkExisting">${strings.get("srcLink")}</button>
        </div>
        <div class="source-add">
          <input id="srcLabel" placeholder="${strings.get('srcLabelPlaceholder')}" />
          <input id="srcFile" type="file" accept=".pdf,.png,.jpg,.jpeg" />
          <button type="button" class="secondary small" id="srcUpload">${strings.get("srcUploadButton")}</button>
        </div>
        <p class="muted" id="srcStatus"></p>
      </div>

      <div class="toolbar">
        <button class="primary" type="submit">${strings.get("save")}</button>
        <button class="secondary" type="button" id="mergePersonBtn">${strings.get("mergeButton")}</button>
        <button class="danger" type="button" id="deletePersonBtn">${strings.get("deleteButton")}</button>
      </div>
      <p class="muted">${strings.get("editFooter")}</p>
    </form>
  `;
  if (!editDialog.open) editDialog.showModal();

  editDialogContent.querySelector("#mergePersonBtn").addEventListener("click", () => {
    const names = Object.entries(people)
      .filter(([x]) => x !== id)
      .map(([x, pp]) => `${pp.name} [${x}]`).join("\n");
    const answer = prompt(strings.get("mergePrompt", { name: p.name, names: names.slice(0, 1200) }));
    if (!answer) return;
    const match = answer.match(/\[([^\]]+)\]$/);
    const keepId = match ? match[1] : answer.trim();
    if (!people[keepId]) return alert(strings.get("idUnknown"));
    const result = absorbPerson(data, keepId, id);
    if (!result.ok) return alert(strings.get(result.reason === "focus" ? "mergeFocus" : "mergeFailed"));
    saveDraft();
    editDialog.close();
    renderView(currentView);
    openPerson(keepId);
  });

  editDialogContent.querySelector("#deletePersonBtn").addEventListener("click", () => {
    const links = ["parents", "children", "partners"].reduce((n, k) => n + (p[k] || []).length, 0);
    if (data.meta.focusPersonId === id) {
      alert(strings.get("deleteFocus"));
      return;
    }
    if (!confirm(strings.get("deleteConfirm", { name: p.name, n: links }))) return;
    const result = removePersonFromData(data, id);
    if (!result.ok) { alert(strings.get("deleteFailed")); return; }
    saveDraft();
    editDialog.close();
    renderView(currentView);
  });

  // --- Manage sources ---
  editDialogContent.querySelectorAll("[data-remove-source]").forEach(btn => {
    btn.addEventListener("click", () => {
      p.sources.splice(Number(btn.dataset.removeSource), 1);
      if (!p.sources.length) delete p.sources;
      saveDraft();
      openEditDialog(id);
    });
  });
  editDialogContent.querySelector("#srcLinkExisting")?.addEventListener("click", () => {
    const sel = editDialogContent.querySelector("#srcExisting");
    const url = sel.value;
    if (!url) return;
    const label = sel.selectedOptions[0].dataset.label;
    p.sources = [...(p.sources || []).filter(x => x.url !== url), { label, url }];
    saveDraft();
    openEditDialog(id);
  });
  editDialogContent.querySelector("#srcUpload")?.addEventListener("click", async () => {
    const status = editDialogContent.querySelector("#srcStatus");
    const label = editDialogContent.querySelector("#srcLabel").value.trim();
    const file = editDialogContent.querySelector("#srcFile").files[0];
    if (!label || !file) { status.textContent = strings.get("srcNeedBoth"); return; }
    if (file.size > 4 * 1024 * 1024) { status.textContent = strings.get("srcTooBig"); return; }
    if (!/\.(pdf|png|jpe?g)$/i.test(file.name)) { status.textContent = strings.get("srcBadType"); return; }
    try {
      const base = file.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9._-]+/g, "-").replace(/^[-.]+|-+$/g, "");
      let filename = base;
      let n = 2;
      const taken = new Set([...knownSourceDocs().map(d => d.url.replace("/sources/", "")), ...pendingFiles]);
      while (taken.has(filename)) filename = base.replace(/(\.[a-z0-9]+)$/i, `-${n++}$1`);
      await pendingPutFile(filename, file);
      await refreshPending();
      p.sources = [...(p.sources || []), { label, url: `/sources/${filename}` }];
      saveDraft();
      openEditDialog(id);
      editDialogContent.querySelector("#srcStatus").textContent = strings.get("srcStoredLocally");
    } catch (err) {
      status.textContent = String(err.message || err);
    }
  });

  const applyEditorForm = () => {
    const form = editDialogContent.querySelector("#personEditor");
    const fd = new FormData(form);
    p.name = String(fd.get("name") || "").trim() || p.name;
    const set = (key) => {
      const v = String(fd.get(key) || "").trim();
      if (v) p[key] = v; else delete p[key];
    };
    set("birth"); set("death"); set("occupation");
    const notes = String(fd.get("notes") || "").split("\n").map(x => x.trim()).filter(Boolean);
    if (notes.length) p.notes = notes; else delete p.notes;
    saveDraft();
  };
  editDialogContent.querySelector("#personEditor").addEventListener("submit", (e) => {
    e.preventDefault();
    applyEditorForm();
    editDialog.close();
    renderView(currentView);
  });

  editDialogContent.querySelectorAll("[data-add-relation]").forEach(btn => btn.addEventListener("click", () => {
    const type = btn.dataset.addRelation;
    const names = Object.entries(people)
      .filter(([x]) => x !== id)
      .map(([x,pp]) => `${pp.name} [${x}]`).join("\n");
    const answer = prompt(strings.get("relationPrompt", { names: names.slice(0, 1400) }));
    if (!answer) return;
    const match = answer.match(/\[([^\]]+)\]$/);
    const otherId = match ? match[1] : answer.trim();
    if (!people[otherId]) return alert(strings.get("idUnknown"));
    linkRelation(type, id, otherId);
    saveDraft();
    openEditDialog(id);
  }));

  editDialogContent.querySelectorAll("[data-create-relation]").forEach(btn => btn.addEventListener("click", () => {
    const type = btn.dataset.createRelation;
    const label = strings.get(type === "parents" ? "relParentNew" : type === "children" ? "relChildNew" : "relPartnerNew");
    const name = prompt(strings.get("newRelationPrompt", { label }));
    if (!name) return;
    const otherId = createPerson(name);
    linkRelation(type, id, otherId);
    saveDraft();
    openEditDialog(id);
  }));

  editDialogContent.querySelectorAll("[data-partner-status]").forEach(sel => sel.addEventListener("change", () => {
    const pid = sel.dataset.partnerStatus;
    const status = sel.value;
    for (const [holder, otherId] of [[people[id], pid], [people[pid], id]]) {
      if (!holder) continue;
      if (status) {
        holder.partnerDetails = holder.partnerDetails || {};
        holder.partnerDetails[otherId] = {...(holder.partnerDetails[otherId] || {}), status};
      } else if (holder.partnerDetails?.[otherId]) {
        delete holder.partnerDetails[otherId].status;
        if (!Object.keys(holder.partnerDetails[otherId]).length) delete holder.partnerDetails[otherId];
        if (!Object.keys(holder.partnerDetails).length) delete holder.partnerDetails;
      }
    }
    saveDraft();
  }));

}

/* ---------------- Person dialog ---------------- */

function openPerson(id) {
  const p = people[id];
  if (!p) return;
  const rel = (label, ids) => {
    if (!(ids || []).length) return "";
    return `
      <div class="detail-section">
        <h3>${esc(label)}</h3>
        <div class="detail-links">
          ${unique(ids).map(x => `<button data-person="${esc(x)}">${esc(people[x]?.name || x)}</button>`).join("")}
        </div>
      </div>`;
  };

  personDialogContent.innerHTML = `
    <article class="person-detail">
      <h2>${esc(p.name)}</h2>
      ${years(p) ? `<div class="muted">${esc(years(p))}</div>` : ""}
      ${p.occupation ? `<p>${esc(p.occupation)}</p>` : ""}
      ${rel("Eltern", p.parents)}
      ${(p.partners || []).length ? `
        <div class="detail-section">
          <h3>Partner</h3>
          <div class="detail-links">
            ${unique(p.partners).map(x => `<button data-person="${esc(x)}">${esc(partnerLabel(id, x))}</button>`).join("")}
          </div>
        </div>` : ""}
      ${rel(strings.get("relChildren"), p.children)}
      ${rel(strings.get("relSiblings"), getSiblingIds(id))}
      ${(p.notes || []).length ? `
        <div class="detail-section">
          <h3>${strings.get("notes")}</h3>
          ${(p.notes || []).map(n => `<p>${esc(n)}</p>`).join("")}
        </div>` : ""}
      ${(p.locations || []).length ? `
        <div class="detail-section">
          <h3>${strings.get("places")}</h3>
          ${(p.locations || []).map(l => `<p>${esc(l.label)}: ${esc(l.value)}</p>`).join("")}
        </div>` : ""}
      ${(p.sources || []).length ? `
        <div class="detail-section source-list">
          <h3>${strings.get("sources")}</h3>
          <ul>${p.sources.map(s => `<li><button class="linklike" data-open-source="${esc(s.url)}">${esc(s.label)}</button></li>`).join("")}</ul>
        </div>` : ""}
      <div class="toolbar">
        ${isAdmin ? `<button class="primary" data-edit-person="${esc(id)}">${strings.get("edit")}</button>` : ""}
        <button class="secondary" data-show-in-tree="${esc(id)}">${strings.get("showInTree")}</button>
      <button class="secondary" data-descendants="${esc(id)}">${strings.get("onlyDescendants")}</button>
      </div>
    </article>
  `;
  if (!personDialog.open) personDialog.showModal();
}

/* ---------------- Navigation / init ---------------- */

function renderView(view) {
  if (!isAdmin && view === "admin") view = "overview";
  currentView = view;
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.view === view));
  if (view === "overview") renderOverview();
  if (view === "sources") renderSources();
  if (view === "admin") renderAdmin();
}

document.addEventListener("click", (e) => {
  // Always open external links in a new tab/window (also in fullscreen/PWA mode on iOS)
  const ext = e.target.closest('a[target="_blank"]');
  if (ext) {
    e.preventDefault();
    window.open(ext.href, "_blank", "noopener");
    return;
  }
  const personEl = e.target.closest("[data-person]");
  if (personEl) {
    openPerson(personEl.dataset.person);
    return;
  }
  const jump = e.target.closest("[data-view-jump]");
  if (jump) {
    renderView(jump.dataset.viewJump);
    return;
  }
  const showTree = e.target.closest("[data-show-in-tree]");
  if (showTree) {
    personDialog.close();
    showInTree(showTree.dataset.showInTree);
    return;
  }
  const desc = e.target.closest("[data-descendants]");
  if (desc) {
    personDialog.close();
    descendantRoot = desc.dataset.descendants;
    renderView("overview");
    return;
  }

  const mapBtn = e.target.closest("[data-open-map]");
  if (mapBtn) {
    personDialog.close();
    renderView("map");
    return;
  }
  const edit = e.target.closest("[data-edit-person]");
  if (edit) {
    personDialog.close();
    openEditDialog(edit.dataset.editPerson);
  }
});

if (!isAdmin) {
  document.querySelectorAll('[data-view="admin"]').forEach(el => el.remove());
}
document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => renderView(tab.dataset.view));
});

document.querySelectorAll("dialog .dialog-close").forEach(btn => {
  btn.addEventListener("click", () => btn.closest("dialog").close());
});


searchInput.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) return searchResults.innerHTML = "";
  const matches = Object.entries(people)
    .filter(([,p]) => p.name.toLowerCase().includes(q))
    .slice(0,20);
  searchResults.innerHTML = matches.map(([id,p]) => `
    <div class="search-result" data-person="${esc(id)}">
      <strong>${esc(p.name)}</strong>
      ${years(p) ? `<div class="meta">${esc(years(p))}</div>` : ""}
    </div>`).join("") || `<p class="empty">Keine Treffer.</p>`;
});

async function loadData() {
  const [cfgRes, idxRes] = await Promise.all([
    fetch("/data/config.json", {cache:"no-store"}),
    fetch("/data/trees/index.json", {cache:"no-store"})
  ]);
  if (cfgRes.ok) config = await cfgRes.json();
  if (idxRes.ok) treeIndex = await idxRes.json();
  if (localStorage.getItem("activeTree") === (treeIndex.defaultTree || "family")) localStorage.removeItem("activeTree");
  const wanted = localStorage.getItem("activeTree") || treeIndex.defaultTree || "family";
  if ((treeIndex.trees || []).some(t => t.id === wanted)) {
    activeTree = wanted;
  } else if (localStorage.getItem(`familyTreeDraft:${wanted}`)) {
    // Newly created dataset, exists only as a local draft so far.
    activeTree = wanted;
    isNewLocalTree = true;
  } else {
    activeTree = treeIndex.defaultTree || "family";
  }
  if (isNewLocalTree) {
    data = JSON.parse(localStorage.getItem(draftKey()));
    people = data.people || {};
  } else {
    const res = await fetch(`/data/trees/${activeTree}.json`, {cache:"no-store"});
    if (!res.ok) throw new Error(strings.get("loadFailed", { status: res.status }));
    data = await res.json();
    people = data.people || {};
  }
  strings = getT(config.language === "en" ? "en" : "de");
  branchMemo.clear();
  if (config.title) document.title = config.title;
  const eyebrowEl = document.querySelector(".eyebrow");
  if (eyebrowEl && config.eyebrow) eyebrowEl.textContent = config.eyebrow;
  const chrome = [
    ['[data-view="overview"]', "tabOverview"],
    ['[data-view="sources"]', "tabSources"],
    ['[data-view="admin"]', "tabAdmin"],
    ['.header-actions .button-link', "logout"],
    ['.draft-badge', "draftBadge"]
  ];
  for (const [sel, key] of chrome) {
    const el = document.querySelector(sel);
    if (el) el.textContent = strings.get(key);
  }
  const logoutLink = document.querySelector(".header-actions .button-link");
  if (logoutLink) logoutLink.href = `${API_BASE}/logout`;
  const searchInputEl = document.getElementById("searchInput");
  if (searchInputEl) searchInputEl.placeholder = strings.get("searchDialog");
}

async function init() {
  await loadData();
  await refreshPending();
  if (isNewLocalTree) {
    draftActive = true;
    updateDraftBadge?.();
    renderView("overview");
    return;
  }
  const legacy = localStorage.getItem("familyTreeDraft");
  if (legacy && activeTree === "family" && !localStorage.getItem(draftKey())) {
    localStorage.setItem(draftKey(), legacy);
    localStorage.removeItem("familyTreeDraft");
  }
  const draft = JSON.parse(localStorage.getItem(draftKey()) || "null");
  if (draft?.people) {
    const missing = Object.keys(data.people).filter(id => !draft.people[id]);
    const missingFields = Object.entries(data.people).filter(([id, p]) =>
      draft.people[id] && ((p.birth && !draft.people[id].birth) || (p.death && !draft.people[id].death))).length;
    if ((missing.length || missingFields) &&
        confirm(strings.get("draftConflict", { missing: missing.length, fields: missingFields }))) {
      localStorage.removeItem(draftKey());
    } else {
      data = draft;
      people = data.people;
      draftActive = true;
    }
  }
  renderView("overview");
}

init().catch(err => {
  app.innerHTML = `<section class="notice"><strong>Fehler:</strong> ${esc(err.message)}</section>`;
});
