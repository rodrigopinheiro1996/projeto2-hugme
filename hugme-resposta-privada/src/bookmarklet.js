/* HugMe · Resposta privada RA — bookmarklet v1.0. Lê a planilha no navegador, sem rede externa. */
(async function () {
'use strict';
if (location.origin !== 'https://app.hugme.com.br' || !/^\/app\.html$/.test(location.pathname)) return alert('Abra o HugMe (app.hugme.com.br) já autenticado e acione o favorito de novo.');
if (window.__hugmePrivada) { window.__hugmePrivada.focus(); return; }

// BEGIN CORE — lógica pura, sem DOM do HugMe.
// Os quatro JS Paths do mapa (docs/MAPA-JS.txt). Valor entregue a querySelector = texto entre as aspas externas do mapa,
// com o escape da camada JS do mapa desfeito. Aqui a string é delimitada por aspas simples, então só as aspas simples são escapadas.
const PATHS = Object.freeze({
 p1: '#input-id-reclamacao',
 p2: 'li.btn_resp_privada_tiqt > a.pointer',
 p3: 'ticket-view-response[type="\'ra-private-reply\'"] > div.response-container > div.response-btn-reply > button.btn-model:nth-child(3)',
 p4: 'ticket-view-response[type="\'ra-private-reply\'"] > div.response-container > div.buttons-response > button.btn-undo'
});
// Texto esperado em cada alvo (mapa). Confere o elemento sem trocar o seletor.
const PATH_TEXT = Object.freeze({ p2: 'Resposta privada', p3: 'Busca por contato', p4: 'Responder privado' });
// Escopo da área privada: o mesmo prefixo dos passos #3 e #4. Usado só para achar o editor (o mapa não traz o path do editor).
const PRIVATE_SCOPE = 'ticket-view-response[type="\'ra-private-reply\'"]';
const STEP_LABEL = { p1: 'Passo #1 · acesso rápido (id origem)', p2: 'Passo #2 · Resposta privada', p3: 'Passo #3 · Busca por contato', editor: 'Editor da mensagem (sem JS Path no mapa)', p4: 'Passo #4 · Responder privado', planilha: 'Planilha' };

// Contrato da planilha: posições físicas fixas. Nome = como foi informado; a grafia do arquivo é só exibida.
const FIELDS = Object.freeze([
 { key: 'name', letter: 'Q', informed: 'Nome', use: '[Nome do Cliente]' },
 { key: 'tags', letter: 'AA', informed: 'Tags', use: '{Especialista} (2×)' },
 { key: 'id', letter: 'C', informed: 'id origem', use: 'pesquisa no acesso rápido' },
 { key: 'phone', letter: 'W', informed: 'Telefone', use: '{xx xxxx-xxxx}' }
]);
// Coluna A (Id HugMe) é só evidência: é o número que o HugMe mostra na URL do ticket aberto.
const EVIDENCE = Object.freeze({ key: 'hugme', letter: 'A', informed: 'Id HugMe' });

const TEMPLATE = 'Olá, [Nome do Cliente]! Aqui é a {Especialista}, do Reclame Aqui.\n\nTentei falar com você agora pouco pelo WhatsApp, no número {xx xxxx-xxxx}, sem sucesso.\nSua reclamação já está comigo e quero resolvê-la o quanto antes, só preciso alinhar alguns pontos diretamente com você.\nPode me indicar o melhor contato e horário para essa conversa? Responder este e-mail já garante que eu avance com seu caso.\n\nFico no aguardo!\n{Especialista}';
const TEMPLATE_PARTS = TEMPLATE.split(/(\[Nome do Cliente\]|\{Especialista\}|\{xx xxxx-xxxx\})/);
// Substituição por partes (sem String.replace: valores com "$" ficam intactos).
function renderMessage(v) {
 const map = { '[Nome do Cliente]': v.name, '{Especialista}': v.specialist, '{xx xxxx-xxxx}': v.phone };
 return TEMPLATE_PARTS.map((p, i) => i % 2 ? map[p] : p).join('');
}
// Confere um texto contra o modelo literal: só os placeholders podem diferir, e com os valores da linha.
function checkMessage(text, v) {
 const want = renderMessage(v), got = String(text ?? '').replace(/\r\n?/g, '\n');
 if (got === want) return null;
 let i = 0; while (i < got.length && got[i] === want[i]) i++;
 const line = want.slice(0, i).split('\n').length;
 return 'Texto difere do modelo na linha ' + line + ' (posição ' + (i + 1) + '): esperado «' + want.slice(i, i + 30) + '», encontrado «' + got.slice(i, i + 30) + '»';
}

const norm = x => String(x ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
function colIndex(letter) { let n = 0; for (const c of letter) n = n * 26 + c.charCodeAt(0) - 64; return n - 1; }
const cellAt = (row, letter) => { const v = (row || [])[colIndex(letter)]; return v === undefined || v === null ? '' : String(v); };
const blankRow = r => !(r || []).some(v => v !== undefined && v !== null && String(v).trim() !== '');

// Linha de cabeçalho: a primeira em que C, Q, W e AA têm texto (no arquivo de referência, a 4).
function findHeaderRow(rows) {
 for (let i = 0; i < Math.min(rows.length, 60); i++) if (FIELDS.every(f => cellAt(rows[i], f.letter).trim())) return i + 1;
 return null;
}
function headerReport(rows, headerRow) {
 const r = rows[headerRow - 1] || [];
 return [...FIELDS, EVIDENCE].map(f => {
  const found = cellAt(r, f.letter);
  return { ...f, found, same: found === f.informed, similar: norm(found) === norm(f.informed) };
 });
}
// Tags: um nome só vira Especialista automaticamente. Separadores de lista tornam a linha ambígua (revisão manual).
// Na planilha de referência só há tags simples e "Quantidade de Tags" (Z) vale 0 mesmo com tag preenchida: Z não é evidência.
const TAG_SEPARATORS = /[;,|\/\n\r\t]/;
function tagsInfo(raw) {
 const text = String(raw ?? '').trim();
 if (!text) return { ambiguous: false, value: '', options: [] };
 if (TAG_SEPARATORS.test(text)) return { ambiguous: true, value: '', options: text.split(TAG_SEPARATORS).map(s => s.trim()).filter(Boolean) };
 return { ambiguous: false, value: text, options: [text] };
}

// Fila: uma entrada por linha da planilha. Nada aqui toca o HugMe.
// status: pendente | revisar | incompleta | duplicada | enviado | incerto (persistidos: enviado, incerto).
function buildQueue(rows, headerRow, history = {}, overrides = {}) {
 const jobs = [], seen = new Map();
 for (let i = headerRow; i < rows.length; i++) {
  const r = rows[i] || []; if (blankRow(r)) continue;
  const raw = { id: cellAt(r, 'C'), name: cellAt(r, 'Q'), phone: cellAt(r, 'W'), tags: cellAt(r, 'AA'), hugme: cellAt(r, 'A') };
  const j = { row: i + 1, id: raw.id.trim(), name: raw.name.trim(), phone: raw.phone.trim(), tags: raw.tags, hugme: raw.hugme.trim(), specialist: '', tagOptions: [], ambiguous: false, status: 'pendente', note: '' };
  const missing = FIELDS.filter(f => !raw[f.key].trim()).map(f => '"' + f.informed + '" (' + f.letter + ')');
  if (missing.length) { j.status = 'incompleta'; j.note = 'Vazio: ' + missing.join(', '); jobs.push(j); continue; }
  const t = tagsInfo(raw.tags); j.tagOptions = t.options; j.ambiguous = t.ambiguous;
  j.specialist = t.ambiguous ? String(overrides[j.id] ?? '').trim() : t.value;
  if (t.ambiguous && !j.specialist) { j.status = 'revisar'; j.note = 'Tags com mais de um nome: escolha o especialista desta linha'; }
  if (seen.has(j.id)) { j.status = 'duplicada'; j.note = 'id origem repetido (linha ' + seen.get(j.id) + ')'; jobs.push(j); continue; }
  seen.set(j.id, j.row);
  const h = history[j.id];
  if (h && (h.status === 'enviado' || h.status === 'incerto')) { j.status = h.status; j.note = h.status === 'enviado' ? 'Envio confirmado em ' + fmtDate(h.at) : 'Verificar envio: ' + (h.note || 'resultado incerto'); }
  if (j.specialist) j.message = renderMessage(j);
  jobs.push(j);
 }
 return jobs;
}
function fmtDate(iso) { try { return new Date(iso).toLocaleString('pt-BR'); } catch { return String(iso); } }
function summarize(jobs) { const s = {}; for (const j of jobs) s[j.status] = (s[j.status] || 0) + 1; return s; }
const STATUS_LABEL = { pendente: 'Pendente', revisar: 'Revisar especialista', incompleta: 'Incompleta', duplicada: 'Duplicada', enviado: 'Enviado (confirmado)', incerto: 'Verificar envio', simulado: 'Simulado', falha: 'Falha (não enviado)', pulada: 'Pulada' };
// END CORE

// BEGIN XLSX — leitor OOXML offline (adaptado do rod bot RA 2.0). Toda célula vira texto, como aparece no Excel para IDs e telefones.
async function readXlsx(buffer) {
 const bytes = new Uint8Array(buffer), view = new DataView(buffer), decoder = new TextDecoder('utf-8', { fatal: true });
 const limit = 64 * 1024 * 1024; let total = 0;
 const need = (o, n) => { if (o < 0 || o + n > bytes.length) throw Error('Arquivo XLSX truncado ou inválido'); };
 const u16 = o => { need(o, 2); return view.getUint16(o, true); }, u32 = o => { need(o, 4); return view.getUint32(o, true); };
 let end = -1; for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (u32(i) === 0x06054b50) { end = i; break; }
 if (end < 0) throw Error('Não é um XLSX válido. Salve como Pasta de Trabalho do Excel (.xlsx).');
 const count = u16(end + 10), central = u32(end + 16), entries = new Map(); let cur = central;
 for (let i = 0; i < count; i++) {
  if (u32(cur) !== 0x02014b50) throw Error('Diretório XLSX inválido');
  const flags = u16(cur + 8), method = u16(cur + 10), crc = u32(cur + 16), compressed = u32(cur + 20), size = u32(cur + 24), nl = u16(cur + 28), el = u16(cur + 30), cl = u16(cur + 32), offset = u32(cur + 42);
  const name = decoder.decode(bytes.subarray(cur + 46, cur + 46 + nl));
  if (flags & 1) throw Error('Planilha protegida por senha: salve uma cópia sem senha');
  if (size > limit) throw Error('Parte do XLSX acima do limite');
  entries.set(name, { method, crc, compressed, size, offset }); cur += 46 + nl + el + cl;
 }
 const crc32 = d => { let c = 0xffffffff; for (const n of d) { c ^= n; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; };
 async function xml(path, optional) {
  const e = entries.get(path); if (!e) { if (optional) return null; throw Error('Parte ausente no XLSX: ' + path); }
  if (u32(e.offset) !== 0x04034b50) throw Error('Cabeçalho ZIP inválido');
  const start = e.offset + 30 + u16(e.offset + 26) + u16(e.offset + 28); need(start, e.compressed);
  let data = bytes.subarray(start, start + e.compressed);
  if (e.method === 8) {
   let ds; try { ds = new DecompressionStream('deflate-raw'); } catch { throw Error('Navegador sem suporte à leitura de XLSX. Atualize o Chrome ou o Edge.'); }
   data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer());
  } else if (e.method !== 0) throw Error('Compressão XLSX não suportada');
  total += data.length; if (data.length !== e.size || total > 2 * limit || crc32(data) !== e.crc) throw Error('XLSX corrompido');
  const text = decoder.decode(data); if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw Error('Declarações XML não permitidas');
  const doc = new DOMParser().parseFromString(text, 'application/xml'); if (doc.getElementsByTagName('parsererror').length) throw Error('XML inválido em ' + path); return doc;
 }
 const els = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
 const resolve = (base, target) => { const parts = target.startsWith('/') ? [] : base.split('/').slice(0, -1); for (const p of target.split('/')) { if (p === '..') parts.pop(); else if (p && p !== '.') parts.push(p); } return parts.join('/'); };
 const bookRel = els(await xml('_rels/.rels'), 'Relationship').find(e => /\/officeDocument$/.test(e.getAttribute('Type')));
 if (!bookRel) throw Error('Pasta de trabalho não encontrada');
 const bookPath = resolve('', bookRel.getAttribute('Target')), book = await xml(bookPath);
 const rels = els(await xml(bookPath.replace(/([^/]+)$/, '_rels/$1.rels')), 'Relationship');
 const relOf = t => rels.find(e => new RegExp('/' + t + '$').test(e.getAttribute('Type')));
 const textOf = node => els(node, 't').filter(t => { let p = t.parentElement; while (p && p !== node) { if (p.localName === 'rPh') return false; p = p.parentElement; } return true; }).map(t => t.textContent).join('');
 const sharedRel = relOf('sharedStrings'), strings = sharedRel ? els(await xml(resolve(bookPath, sharedRel.getAttribute('Target'))), 'si').map(textOf) : [];
 // Estilos: só para saber se um número tem formato de zeros à esquerda (ex.: 00000000000).
 const stylesRel = relOf('styles'), zeroPad = [];
 if (stylesRel) {
  const st = await xml(resolve(bookPath, stylesRel.getAttribute('Target')), true);
  if (st) {
   const fmts = new Map(els(st, 'numFmt').map(n => [n.getAttribute('numFmtId'), n.getAttribute('formatCode') || '']));
   const xfs = els(st, 'cellXfs')[0]; if (xfs) [...xfs.children].filter(x => x.localName === 'xf').forEach((xf, i) => { const code = fmts.get(xf.getAttribute('numFmtId')) || ''; zeroPad[i] = /^0+$/.test(code) ? code.length : 0; });
  }
 }
 const numText = (v, pad) => { let s = v; if (/e/i.test(v) || /\.0+$/.test(v)) { const n = Number(v); if (Number.isSafeInteger(n)) s = String(n); else if (Number.isInteger(n)) s = BigInt(n).toString(); } return pad && /^\d+$/.test(s) ? s.padStart(pad, '0') : s; };
 const sheets = new Map();
 for (const sheet of els(book, 'sheet')) {
  const id = sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
  const rel = rels.find(e => e.getAttribute('Id') === id); if (!rel) continue;
  const doc = await xml(resolve(bookPath, rel.getAttribute('Target'))), rows = [];
  for (const row of els(doc, 'row')) {
   const ri = Number(row.getAttribute('r')) - 1; if (!Number.isInteger(ri) || ri < 0 || ri > 100000) throw Error('Linha fora do limite (100.001)');
   const values = rows[ri] || [];
   for (const c of els(row, 'c')) {
    const m = /^([A-Z]{1,3})(\d+)$/.exec(c.getAttribute('r') || ''); if (!m || Number(m[2]) !== ri + 1) throw Error('Referência de célula inválida');
    const t = c.getAttribute('t'), v = els(c, 'v')[0]?.textContent ?? '';
    let value = '';
    if (t === 's') value = strings[Number(v)] ?? '';
    else if (t === 'inlineStr') value = textOf(c);
    else if (t === 'b') value = v === '1' ? 'VERDADEIRO' : 'FALSO';
    else if (t === 'e') value = '';
    else if (t === 'str' || t === 'd') value = v;
    else if (v !== '') value = numText(v, zeroPad[Number(c.getAttribute('s') || 0)] || 0);
    values[colIndex(m[1])] = value; // posição física pela referência da célula, mesmo com colunas vazias no meio
   }
   rows[ri] = values;
  }
  sheets.set(sheet.getAttribute('name'), Array.from({ length: rows.length }, (_, i) => rows[i] || []));
 }
 if (!sheets.size) throw Error('Nenhuma aba encontrada no XLSX');
 return { names: [...sheets.keys()], sheets };
}
// END XLSX

// ---------- Estado persistido (localStorage do HugMe) ----------
const KEY = 'hugme-resposta-privada:v1';
const DEFAULTS = { timeout: 25, confirmTimeout: 30, betweenRows: 3, editorSelector: '', successSelector: '' };
let stored; try { stored = JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch { return alert('Histórico da Resposta privada ilegível no localStorage. Nada foi alterado.'); }
let cfg = { ...DEFAULTS, ...(stored.cfg || {}) }, history = stored.history || {};
function readHistory() { try { history = (JSON.parse(localStorage.getItem(KEY) || 'null') || {}).history || {}; } catch {} return history; }
function persist() { localStorage.setItem(KEY, JSON.stringify({ cfg, history })); }
function setHistory(id, entry) { readHistory(); history[id] = { ...(history[id] || {}), ...entry, at: new Date().toISOString() }; persist(); }

let workbook = null, rows = null, headerRow = null, jobs = [], overrides = {}, selected = null;
let busy = false, paused = false, stopped = false, mode = 'simular', diag = null;

// ---------- Painel ----------
const host = document.createElement('div'); host.id = 'hugme-privada-host';
host.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483646;';
const root = host.attachShadow({ mode: 'open' });
root.innerHTML = `<style>
:host{all:initial}
*{box-sizing:border-box}
.p{--bg:#101722;--card:#172231;--line:#33445a;--fg:#eef3f9;--mut:#a9b8ca;--acc:#73dfc6;--warn:#ffcf6b;--bad:#ff8b8b;--ok:#8be3a1;
width:460px;max-width:calc(100vw - 24px);max-height:calc(100vh - 24px);overflow:auto;background:var(--bg);color:var(--fg);font:13px/1.45 system-ui,sans-serif;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 40px #0008}
header{display:flex;align-items:center;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:2}
header b{flex:1;font-size:14px}.badge{font-size:11px;padding:2px 8px;border-radius:99px;background:#24405a;color:var(--acc)}.badge.real{background:#5a2424;color:#ffd0d0}
section{padding:10px 14px;border-bottom:1px solid var(--line)}h3{margin:0 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--acc)}
button{font:inherit;cursor:pointer;border:1px solid var(--line);background:var(--card);color:var(--fg);padding:6px 10px;border-radius:8px}button:hover{border-color:var(--acc)}button:disabled{opacity:.45;cursor:not-allowed}
button.pri{background:var(--acc);color:#082019;border-color:var(--acc);font-weight:700}button.danger{background:#7a2b2b;border-color:#a33;color:#fff;font-weight:700}
input,select{font:inherit;background:#0c1420;color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:4px 6px}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:4px 5px;border-bottom:1px solid #26354a;vertical-align:top;word-break:break-word}th{color:var(--mut);font-weight:600;white-space:nowrap;word-break:normal}
tr.sel td{background:#1d3048}tbody tr{cursor:pointer}.scroll{max-height:220px;overflow:auto;border:1px solid #26354a;border-radius:8px}
.mut{color:var(--mut)}.ok{color:var(--ok)}.warn{color:var(--warn)}.bad{color:var(--bad)}.row{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin:6px 0}
pre{white-space:pre-wrap;background:#0c1420;border:1px solid var(--line);border-radius:8px;padding:8px;margin:6px 0;font:12px/1.45 system-ui}
.diag{border:1px solid var(--bad);background:#2a1414;border-radius:8px;padding:8px;margin-top:6px}.diag.warn{border-color:var(--warn);background:#2a2414}
#log{max-height:120px;overflow:auto;font:11px/1.4 ui-monospace,monospace;color:var(--mut);white-space:pre-wrap}
details summary{cursor:pointer;color:var(--mut)}label{display:inline-flex;gap:4px;align-items:center}
.seg label{border:1px solid var(--line);padding:4px 8px;border-radius:8px}.seg input{margin:0}
</style>
<div class="p" role="dialog" aria-label="HugMe Resposta privada">
<header><b>HugMe · Resposta privada RA</b><span id="modeBadge" class="badge">Simulação</span><button id="close" aria-label="Fechar painel">×</button></header>
<section><h3>1 · Planilha</h3>
<div class="row"><input id="file" type="file" accept=".xlsx"><select id="sheet" hidden aria-label="Aba"></select></div>
<div class="row"><label>Linha do cabeçalho <input id="headerRow" type="number" min="1" style="width:64px"></label><span id="fileInfo" class="mut"></span></div>
<div id="cols"></div></section>
<section><h3>2 · Prévia</h3><div id="summary" class="mut">Importe a planilha.</div>
<div class="scroll" id="tableWrap" hidden><table><thead><tr><th>Linha</th><th>id origem</th><th>Nome</th><th>Especialista</th><th>Telefone</th><th>Situação</th></tr></thead><tbody id="tbody"></tbody></table></div>
<div id="detail"></div></section>
<section><h3>3 · Execução</h3>
<div class="row seg" role="radiogroup" aria-label="Modo"><label><input type="radio" name="mode" value="simular" checked> Simulação (não clica em “Responder privado”)</label><label><input type="radio" name="mode" value="enviar"> Envio real</label></div>
<div class="row"><button id="start" class="pri">Simular fila</button><button id="pause" disabled>Pausar</button><button id="stop" disabled>Parar</button></div>
<div id="status" class="mut">Pronto.</div><div id="diag"></div></section>
<section><h3>4 · Histórico deste navegador</h3><div id="hist" class="mut"></div>
<div class="row"><button id="csv">Baixar relatório (CSV)</button><button id="clearHist">Limpar histórico</button></div></section>
<section><details><summary>Ajustes avançados</summary>
<div class="row"><label>Tempo limite por passo (s) <input id="timeout" type="number" min="5" style="width:60px"></label><label>Confirmação do envio (s) <input id="confirmTimeout" type="number" min="5" style="width:60px"></label></div>
<div class="row"><label>Pausa entre linhas (s) <input id="betweenRows" type="number" min="0" style="width:60px"></label></div>
<div class="row"><label>Seletor do editor (só com captura) <input id="editorSelector" placeholder="vazio = detectar na área privada" style="width:220px"></label></div>
<div class="row"><label>Seletor do sinal de sucesso (só com captura) <input id="successSelector" placeholder="vazio = texto enviado no ticket" style="width:200px"></label></div>
<div class="row"><button id="saveCfg">Salvar ajustes</button></div></details></section>
<section><h3>Registro</h3><div id="log"></div></section>
</div>`;
document.documentElement.append(host);
const $ = id => root.getElementById(id);
const h = (tag, props = {}, ...kids) => { const e = document.createElement(tag); Object.assign(e, props); e.append(...kids.flat().filter(k => k !== null && k !== undefined && k !== false)); return e; };
window.__hugmePrivada = { focus() { host.style.display = ''; $('file').focus(); } };

function log(text) { const line = new Date().toLocaleTimeString('pt-BR') + '  ' + text; const el = $('log'); el.textContent = (line + '\n' + el.textContent).slice(0, 20000); }
function status(text, cls = 'mut') { $('status').className = cls; $('status').textContent = text; }
const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { status(e.message, 'bad'); log('Erro: ' + e.message); } };

for (const k of Object.keys(DEFAULTS)) $(k).value = cfg[k];
$('saveCfg').onclick = guard(() => {
 if (busy) throw Error('Pare a execução antes de mudar os ajustes');
 for (const k of Object.keys(DEFAULTS)) cfg[k] = typeof DEFAULTS[k] === 'number' ? Math.max(0, Number($(k).value) || DEFAULTS[k]) : $(k).value.trim();
 if (cfg.editorSelector) document.querySelectorAll(cfg.editorSelector); if (cfg.successSelector) document.querySelectorAll(cfg.successSelector); // valida a sintaxe
 persist(); log('Ajustes salvos'); status('Ajustes salvos', 'ok');
});

$('file').onchange = guard(async () => {
 if (busy) throw Error('Pare a execução antes de trocar a planilha');
 const f = $('file').files[0]; if (!f) return;
 if (f.size > 20 * 1024 * 1024) throw Error('Limite: 20 MB');
 status('Lendo a planilha neste navegador…');
 workbook = await readXlsx(await f.arrayBuffer());
 $('sheet').replaceChildren(...workbook.names.map(n => h('option', { value: n, textContent: n })));
 $('sheet').hidden = workbook.names.length < 2;
 $('fileInfo').textContent = f.name;
 overrides = {}; loadSheet(); log('Planilha importada: ' + f.name + ' · aba ' + $('sheet').value);
});
$('sheet').onchange = guard(() => { if (busy) throw Error('Pare a execução antes'); loadSheet(); });
$('headerRow').onchange = guard(() => { if (!rows) return; const n = Number($('headerRow').value); if (!Number.isInteger(n) || n < 1 || n > rows.length) throw Error('Linha de cabeçalho inválida'); headerRow = n; refresh(); });

function loadSheet() {
 rows = workbook.sheets.get($('sheet').value); headerRow = findHeaderRow(rows);
 if (!headerRow) { $('cols').replaceChildren(h('div', { className: 'bad', textContent: 'Não achei uma linha com C, Q, W e AA preenchidas. Informe a linha do cabeçalho.' })); headerRow = 1; }
 $('headerRow').value = headerRow; selected = null; refresh();
 status('Planilha carregada · confira colunas e prévia', 'ok');
}
function refresh() {
 renderCols(); jobs = buildQueue(rows, headerRow, readHistory(), overrides); renderTable(); renderDetail(); renderHistory(); updateControls();
}
function renderCols() {
 const rep = headerReport(rows, headerRow);
 $('cols').replaceChildren(h('table', {}, h('thead', {}, h('tr', {}, ['Informado', 'Coluna', 'Grafia no arquivo', 'Uso'].map(t => h('th', { textContent: t })))),
  h('tbody', {}, rep.map(c => h('tr', {}, h('td', { textContent: c.informed }), h('td', { textContent: c.letter }),
   h('td', { className: c.same ? 'ok' : 'warn', textContent: (c.found || '(vazio)') + (c.same ? '' : ' · grafia diferente; vínculo mantido pela coluna ' + c.letter) }),
   h('td', { className: 'mut', textContent: c.use || 'confirmação do ticket (URL)' }))))));
}
function cellSpecialist(j) {
 if (!j.ambiguous) return j.specialist;
 return (j.specialist ? '✎ ' + j.specialist : '⚠ escolher') ;
}
function renderTable() {
 const s = summarize(jobs);
 $('summary').textContent = jobs.length + ' linha(s) · ' + Object.entries(s).map(([k, n]) => n + ' ' + (STATUS_LABEL[k] || k).toLowerCase()).join(' · ');
 $('tableWrap').hidden = !jobs.length;
 $('tbody').replaceChildren(...jobs.map((j, i) => {
  const cls = { enviado: 'ok', simulado: 'ok', incerto: 'warn', revisar: 'warn', incompleta: 'bad', duplicada: 'bad', falha: 'bad', pulada: 'mut' }[j.status] || '';
  const tr = h('tr', { className: selected === i ? 'sel' : '', tabIndex: 0 }, h('td', { textContent: j.row }), h('td', { textContent: j.id }), h('td', { textContent: j.name }),
   h('td', { className: j.ambiguous && !j.specialist ? 'warn' : '', textContent: cellSpecialist(j) }), h('td', { textContent: j.phone }), h('td', { className: cls, textContent: STATUS_LABEL[j.status] || j.status }));
  tr.onclick = () => { selected = i; renderTable(); renderDetail(); };
  tr.onkeydown = e => { if (e.key === 'Enter') tr.onclick(); };
  return tr;
 }));
}
function renderDetail() {
 const j = jobs[selected]; const box = $('detail');
 if (!j) { box.replaceChildren(h('p', { className: 'mut', textContent: jobs.length ? 'Clique numa linha para ver a mensagem completa.' : '' })); return; }
 const kids = [h('div', { className: 'mut', textContent: 'Linha ' + j.row + ' · id origem ' + j.id + (j.hugme ? ' · Id HugMe ' + j.hugme : '') }),
  h('div', {}, 'Nome: ', h('b', { textContent: j.name || '(vazio)' }), ' · Telefone: ', h('b', { textContent: j.phone || '(vazio)' })),
  h('div', {}, 'Tags (AA): ', h('b', { textContent: j.tags || '(vazio)' }))];
 if (j.note) kids.push(h('div', { className: j.status === 'incompleta' || j.status === 'duplicada' ? 'bad' : 'warn', textContent: j.note }));
 if (j.ambiguous && !busy && !['enviado', 'incerto'].includes(j.status)) {
  const sel = h('select', { ariaLabel: 'Especialista desta linha' }, h('option', { value: '', textContent: '— escolher especialista —' }), j.tagOptions.map(o => h('option', { value: o, textContent: o })), h('option', { value: '__outro', textContent: 'Outro nome…' }));
  const other = h('input', { placeholder: 'nome do especialista', hidden: true });
  sel.value = j.tagOptions.includes(j.specialist) ? j.specialist : j.specialist ? '__outro' : '';
  if (sel.value === '__outro') { other.hidden = false; other.value = j.specialist; }
  sel.onchange = () => { other.hidden = sel.value !== '__outro'; };
  const apply = h('button', { textContent: 'Aplicar a esta linha' });
  apply.onclick = guard(() => { const v = (sel.value === '__outro' ? other.value : sel.value).trim(); if (!v) throw Error('Escolha ou digite o especialista desta linha'); overrides[j.id] = v; log('Linha ' + j.row + ': especialista revisado → ' + v); refresh(); });
  kids.push(h('div', { className: 'row' }, 'Especialista:', sel, other, apply));
 }
 kids.push(j.message ? h('pre', { textContent: j.message }) : h('p', { className: 'mut', textContent: 'Mensagem indisponível até a linha ficar completa.' }));
 box.replaceChildren(...kids);
}
function renderHistory() {
 readHistory(); const list = Object.entries(history);
 const env = list.filter(([, e]) => e.status === 'enviado').length, inc = list.filter(([, e]) => e.status === 'incerto');
 const kids = [h('div', { textContent: env + ' envio(s) confirmado(s) · ' + inc.length + ' a verificar' })];
 for (const [id, e] of inc) {
  const ok = h('button', { textContent: 'Conferi: foi enviado' }), no = h('button', { textContent: 'Conferi: NÃO foi enviado' });
  ok.onclick = guard(() => { if (busy) throw Error('Pare a execução antes'); setHistory(id, { status: 'enviado', note: 'confirmado manualmente pelo operador' }); log('id ' + id + ': marcado como enviado (conferência manual)'); refresh(); });
  no.onclick = guard(() => { if (busy) throw Error('Pare a execução antes'); if (!confirm('Liberar o id origem ' + id + ' para novo envio? Confira antes no ticket que a resposta privada NÃO aparece.')) return; readHistory(); delete history[id]; persist(); log('id ' + id + ': liberado para reenvio (conferência manual)'); refresh(); });
  kids.push(h('div', { className: 'diag warn' }, h('div', { textContent: 'Verificar envio · linha ' + (e.row || '?') + ' · id origem ' + id + ' · ' + fmtDate(e.at) }), h('div', { className: 'mut', textContent: e.note || '' }), h('div', { className: 'row' }, ok, no)));
 }
 $('hist').replaceChildren(...kids);
}
$('csv').onclick = guard(() => {
 readHistory(); const lines = [['linha', 'id origem', 'situacao', 'quando', 'observacao'].join(';')];
 const ids = new Set(); for (const j of jobs) { ids.add(j.id); lines.push([j.row, j.id, STATUS_LABEL[j.status] || j.status, history[j.id]?.at || '', (j.note || '').replace(/[;\n]/g, ',')].join(';')); }
 for (const [id, e] of Object.entries(history)) if (!ids.has(id)) lines.push([e.row || '', id, STATUS_LABEL[e.status] || e.status, e.at || '', (e.note || '').replace(/[;\n]/g, ',')].join(';'));
 const a = h('a', { href: URL.createObjectURL(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv' })), download: 'resposta-privada-relatorio.csv' }); a.click();
});
$('clearHist').onclick = guard(() => { if (busy) throw Error('Pare a execução antes'); if (!confirm('Apagar o histórico de envios deste navegador? Linhas já enviadas poderão ser enviadas de novo.')) return; history = {}; persist(); log('Histórico apagado pelo operador'); if (rows) refresh(); else renderHistory(); });
for (const r of root.querySelectorAll('input[name=mode]')) r.onchange = guard(() => {
 if (busy) { root.querySelector('input[value=' + mode + ']').checked = true; throw Error('Pare a execução antes de trocar o modo'); }
 mode = root.querySelector('input[name=mode]:checked').value; updateControls();
});
function updateControls() {
 $('modeBadge').textContent = mode === 'enviar' ? 'ENVIO REAL' : 'Simulação'; $('modeBadge').className = 'badge' + (mode === 'enviar' ? ' real' : '');
 $('start').textContent = busy ? (paused ? 'Retomar' : 'Em execução…') : mode === 'enviar' ? 'Iniciar envio' : 'Simular fila';
 $('start').className = mode === 'enviar' ? 'danger' : 'pri';
 $('start').disabled = busy && !paused || !rows;
 $('pause').disabled = !busy || paused; $('stop').disabled = !busy;
 $('file').disabled = busy; $('headerRow').disabled = busy; $('sheet').disabled = busy;
}
$('close').onclick = () => { if (busy && !confirm('A fila está em execução. Parar e fechar o painel?')) return; stopped = true; host.remove(); delete window.__hugmePrivada; };
$('pause').onclick = () => { paused = true; status('Pausado · clique em Retomar', 'warn'); log('Pausado pelo operador'); updateControls(); };
$('stop').onclick = () => { stopped = true; paused = false; status('Parando…', 'warn'); log('Parada solicitada'); updateControls(); };
$('start').onclick = guard(async () => {
 if (busy && paused) { paused = false; status('Retomando…'); log('Retomado'); updateControls(); return; }
 if (busy || !rows) return;
 const queue = jobs.filter(j => j.status === 'pendente' || j.status === 'falha');
 const review = jobs.filter(j => j.status === 'revisar').length;
 if (!queue.length) throw Error(review ? 'Nenhuma linha pronta: ' + review + ' linha(s) aguardam a escolha do especialista' : 'Nenhuma linha pendente na fila');
 if (mode === 'enviar' && !confirm('ENVIO REAL: enviar ' + queue.length + ' resposta(s) privada(s), uma por ticket?' + (review ? '\n' + review + ' linha(s) em revisão ficarão de fora.' : '') + '\nVocê pode pausar ou parar a qualquer momento.')) return;
 await runQueue(queue);
});

// ---------- Adaptador do HugMe ----------
class StepError extends Error { constructor(step, msg, extra = {}) { super(msg); this.step = step; Object.assign(this, extra); } }
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
async function gate(step) { while (paused && !stopped) await sleep(200); if (stopped) throw new StepError(step, 'Execução interrompida pelo operador', { stopped: true }); }
async function wait(fn, ms, step, what) {
 let left = ms;
 while (true) {
  await gate(step); const t0 = performance.now(); let v;
  try { v = fn(); } catch (e) { if (e instanceof StepError) throw e; throw new StepError(step, e.message); }
  if (v) return v;
  left -= performance.now() - t0; if (left <= 0) throw new StepError(step, 'Tempo esgotado aguardando ' + what, { timeout: true });
  const t1 = performance.now(); await sleep(Math.min(150, left)); left -= performance.now() - t1;
 }
}
function visible(e) { return !!e && e.isConnected && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden'; }
// Usa o JS Path exatamente como no mapa. Exige um único alvo visível: não escolhe o primeiro de uma lista.
function one(key) {
 const list = [...document.querySelectorAll(PATHS[key])].filter(visible);
 if (list.length > 1) throw new StepError(key, list.length + ' elementos visíveis para o JS Path do ' + STEP_LABEL[key] + '. Nada foi clicado.');
 const e = list[0] || null;
 if (e && PATH_TEXT[key] && !norm(e.textContent).includes(norm(PATH_TEXT[key]))) throw new StepError(key, 'O JS Path do ' + STEP_LABEL[key] + ' encontrou um elemento com texto «' + e.textContent.trim().slice(0, 40) + '», esperado «' + PATH_TEXT[key] + '». Nada foi clicado.');
 return e;
}
const enabled = e => !e.disabled && e.getAttribute('aria-disabled') !== 'true' && !e.classList.contains('disabled');
function describe(e) { return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + [...e.classList].slice(0, 4).map(c => '.' + c).join('') + (e.getAttribute('ng-model') ? '[ng-model="' + e.getAttribute('ng-model') + '"]' : ''); }
function ticketInUrl() { const m = /\/(\d{5,})\/?$/.exec(location.hash.split('?')[0]); return m ? m[1] : ''; }
function setNative(el, value) { const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); }
function typeInto(el, value) { el.focus(); setNative(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
function pressEnter(el) { for (const type of ['keydown', 'keypress', 'keyup']) { const ev = new KeyboardEvent(type, { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }); for (const p of ['keyCode', 'which']) Object.defineProperty(ev, p, { get: () => 13 }); el.dispatchEvent(ev); } }
// Texto exibido na página fora de campos de digitação e do painel.
function pageShowsText(text) {
 if (!text) return false;
 for (const e of document.body.querySelectorAll('*')) {
  if (e === host || ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION'].includes(e.tagName) || e.isContentEditable) continue;
  if (e.textContent.includes(text) && ![...e.children].some(c => c.textContent.includes(text)) && visible(e)) return true;
 }
 return false;
}
// Elementos visíveis (fora de editores) que mostram o trecho: usado como sinal da resposta publicada no ticket.
function evidenceCount(snippet) {
 let n = 0;
 for (const e of document.body.querySelectorAll('*')) {
  if (e === host || ['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION'].includes(e.tagName) || e.isContentEditable) continue;
  if (e.textContent.includes(snippet) && ![...e.children].some(c => c.textContent.includes(snippet)) && visible(e)) n++;
 }
 return n;
}
// Editor: o mapa não traz o path. Sem seletor salvo, procura um único textarea/contenteditable visível dentro da área privada (mesmo escopo dos passos #3 e #4).
function editorCandidates() {
 if (cfg.editorSelector) return [...document.querySelectorAll(cfg.editorSelector)].filter(visible);
 const scopes = [...document.querySelectorAll(PRIVATE_SCOPE)].filter(visible);
 if (scopes.length !== 1) return [];
 const list = [...scopes[0].querySelectorAll('textarea, [contenteditable="true"], [contenteditable=""]')].filter(visible);
 return list.filter(e => !list.some(o => o !== e && o.contains(e)));
}
function findEditor() {
 const list = editorCandidates();
 if (list.length > 1) throw new StepError('editor', 'Mais de um editor possível na área privada: ' + list.map(describe).join(' | ') + '. Envie a captura do campo da mensagem.', { capture: true });
 return list[0] || null;
}
function readEditor(e) { return (e.tagName === 'TEXTAREA' || e.tagName === 'INPUT' ? e.value : e.innerText).replace(/\r\n?/g, '\n').replace(/\n$/, ''); }
function writeEditor(e, text) {
 e.focus();
 if (e.tagName === 'TEXTAREA' || e.tagName === 'INPUT') { setNative(e, text); }
 else { e.replaceChildren(...text.split('\n').flatMap((l, i) => i ? [document.createElement('br'), document.createTextNode(l)] : [document.createTextNode(l)])); }
 for (const t of ['input', 'change', 'keyup']) e.dispatchEvent(new Event(t, { bubbles: true }));
 e.dispatchEvent(new Event('blur')); // AngularJS ng-model com updateOn blur
}

// Uma linha, do passo #1 ao #4. Lança StepError com o passo afetado. after=true: o clique final já aconteceu.
async function processJob(j) {
 const T = cfg.timeout * 1000;
 // Passo #1 · pesquisa pelo id origem
 const before = ticketInUrl();
 let oldP2 = null; try { oldP2 = one('p2'); } catch {}
 status('Linha ' + j.row + ' · ' + STEP_LABEL.p1);
 const input = await wait(() => one('p1'), T, 'p1', 'o campo de acesso rápido');
 typeInto(input, j.id); pressEnter(input);
 log('Linha ' + j.row + ': pesquisado id origem ' + j.id + (before ? ' (ticket anterior ' + before + ')' : ''));
 // Confirmação: a URL do ticket aberto mostra o Id HugMe (coluna A). Sem A, exige troca de ticket e o id origem visível na tela.
 const confirmed = () => {
  const now = ticketInUrl();
  if (j.hugme) return now === j.hugme;
  return now && now !== before && pageShowsText(j.id);
 };
 try { await wait(confirmed, T, 'p1', 'o ticket da linha abrir'); }
 catch (e) {
  if (!e.timeout) throw e; const now = ticketInUrl();
  throw new StepError('p1', j.hugme ? 'Ticket não confirmado: a tela mostra ' + (now ? 'o ticket ' + now : 'nenhum ticket na URL') + ', a linha espera o Id HugMe ' + j.hugme + ' (coluna A)' + (now === before && now ? ' — ainda é o ticket anterior' : '') + '. Nada foi clicado.'
   : 'Ticket não confirmado: sem Id HugMe na coluna A, esperava a URL mudar e o id origem ' + j.id + ' aparecer na tela. URL atual: ' + (now || '—') + '. Nada foi clicado.');
 }
 // Troca em andamento: a URL pode mudar antes do conteúdo. Exige a URL estável e o botão do passo #2 renderizado de novo
 // (elemento diferente do que estava na tela antes da pesquisa) ou o id origem exibido na tela. O ticket anterior visível não confirma.
 const sameTicket = !!before && before === ticketInUrl();
 let stableSince = 0, last = '';
 await wait(() => {
  const now = ticketInUrl(); if (now !== last) { last = now; stableSince = performance.now(); }
  if (j.hugme && now !== j.hugme) throw new StepError('p1', 'O ticket mudou para ' + now + ' durante o carregamento; a linha espera ' + j.hugme + '. Nada foi clicado.');
  if (performance.now() - stableSince < 800) return false;
  const p2 = one('p2'); if (!p2) return false;
  return sameTicket || p2 !== oldP2 || pageShowsText(j.id);
 }, T, 'p1', 'o conteúdo do ticket ' + (j.hugme || j.id) + ' substituir o anterior');
 log('Linha ' + j.row + ': ticket confirmado ' + (j.hugme ? '(Id HugMe ' + j.hugme + ' na URL)' : '(id origem na tela)'));

 // Passo #2 · Resposta privada
 status('Linha ' + j.row + ' · ' + STEP_LABEL.p2);
 const priv = await wait(() => one('p2'), T, 'p2', 'o link "Resposta privada"');
 priv.click();
 await wait(() => one('p3'), T, 'p2', 'a área de resposta privada abrir');

 // Passo #3 · Busca por contato (modelo)
 status('Linha ' + j.row + ' · ' + STEP_LABEL.p3);
 const model = one('p3'); if (!enabled(model)) await wait(() => enabled(model), T, 'p3', 'o botão "Busca por contato" habilitar');
 let edBefore = ''; try { const e0 = findEditor(); if (e0) edBefore = readEditor(e0); } catch {}
 model.click();
 let editor;
 try {
  editor = await wait(() => { const e = findEditor(); return e && readEditor(e).trim() && readEditor(e) !== edBefore ? e : null; }, T, 'p3', 'o modelo "Busca por contato" carregar no editor');
 } catch (e) {
  if (!e.timeout) throw e;
  const now = findEditor();
  if (!now) throw new StepError('editor', 'Não encontrei o editor da mensagem dentro de ' + PRIVATE_SCOPE + (cfg.editorSelector ? ' com o seletor salvo «' + cfg.editorSelector + '»' : '') + '. Envie a captura do campo da mensagem. Nada foi enviado.', { capture: true });
  if (!readEditor(now).trim()) throw new StepError('p3', 'O modelo não carregou no editor (' + describe(now) + ' continua vazio). Nada foi enviado.');
  editor = now; log('Linha ' + j.row + ': o editor já tinha o mesmo texto antes do clique no modelo');
 }

 // Editor · substitui todo o conteúdo pelo texto da linha e confere depois do ciclo da interface
 status('Linha ' + j.row + ' · ' + STEP_LABEL.editor);
 writeEditor(editor, j.message);
 await sleep(600); await gate('editor');
 const ed = findEditor();
 if (!ed) throw new StepError('editor', 'O editor sumiu depois do preenchimento. Nada foi enviado.', { capture: true });
 const diff = checkMessage(readEditor(ed), j);
 if (diff) throw new StepError('editor', diff + '. O componente não aceitou o texto (' + describe(ed) + '); envie a captura do campo. Nada foi enviado.', { capture: true });
 if (!readEditor(ed).includes(j.phone)) throw new StepError('editor', 'Telefone ausente no editor. Nada foi enviado.');
 log('Linha ' + j.row + ': mensagem conferida no editor (' + describe(ed) + ')');

 // Passo #4 · Responder privado
 const send = await wait(() => one('p4'), T, 'p4', 'o botão "Responder privado"');
 await wait(() => enabled(send), T, 'p4', 'o botão "Responder privado" habilitar');
 if (mode !== 'enviar') { log('Linha ' + j.row + ': SIMULAÇÃO · "Responder privado" não clicado'); return 'simulado'; }
 if (j.hugme && ticketInUrl() !== j.hugme) throw new StepError('p4', 'O ticket mudou antes do envio (' + ticketInUrl() + '). Nada foi enviado.');
 if (checkMessage(readEditor(findEditor() || ed), j)) throw new StepError('p4', 'A mensagem mudou no editor antes do envio. Nada foi enviado.');
 readHistory(); const prev = history[j.id]; if (prev && ['enviado', 'incerto'].includes(prev.status)) throw new StepError('p4', 'Este id origem já está no histórico como ' + STATUS_LABEL[prev.status] + ' (outra aba?). Nada foi enviado.');
 const snippet = 'no número ' + j.phone + ', sem sucesso';
 const evBefore = evidenceCount(snippet), okBefore = cfg.successSelector ? [...document.querySelectorAll(cfg.successSelector)].filter(visible).length : 0;
 setHistory(j.id, { status: 'incerto', row: j.row, hugme: j.hugme, note: 'clique em "Responder privado" feito; aguardando confirmação' });
 status('Linha ' + j.row + ' · ' + STEP_LABEL.p4 + ' · aguardando confirmação');
 send.click(); // um único clique
 log('Linha ' + j.row + ': "Responder privado" clicado uma vez');
 try {
  await wait(() => evidenceCount(snippet) > evBefore || (cfg.successSelector && [...document.querySelectorAll(cfg.successSelector)].filter(visible).length > okBefore), cfg.confirmTimeout * 1000, 'p4', 'a confirmação do envio');
 } catch (e) {
  const why = e.stopped ? 'execução interrompida depois do clique' : e.timeout ? 'sem sinal de sucesso em ' + cfg.confirmTimeout + ' s' : e.message;
  setHistory(j.id, { status: 'incerto', note: why + '. Confira o ticket antes de reenviar.' });
  throw new StepError('p4', 'Verificar envio: ' + why + '. A linha foi pausada e não será reenviada automaticamente.', { after: true });
 }
 setHistory(j.id, { status: 'enviado', note: 'resposta exibida no ticket' });
 log('Linha ' + j.row + ': envio confirmado (resposta exibida no ticket)');
 return 'enviado';
}

async function runQueue(queue) {
 busy = true; paused = false; stopped = false; diag = null; $('diag').replaceChildren(); updateControls(); renderDetail();
 const lock = 'hugme-resposta-privada:lock', me = Math.random().toString(36).slice(2);
 try {
  const other = JSON.parse(localStorage.getItem(lock) || 'null');
  if (other && other.id !== me && Date.now() - other.at < 15000) throw Error('Outra aba do HugMe está executando a fila. Pare-a antes.');
  localStorage.setItem(lock, JSON.stringify({ id: me, at: Date.now() }));
  const beat = setInterval(() => localStorage.setItem(lock, JSON.stringify({ id: me, at: Date.now() })), 5000);
  log((mode === 'enviar' ? 'ENVIO REAL' : 'Simulação') + ' iniciada · ' + queue.length + ' linha(s)');
  try {
   for (let k = 0; k < queue.length; k++) {
    const j = queue[k];
    if (j.status !== 'pendente' && j.status !== 'falha') continue;
    try {
     j.status = await processJob(j); j.note = j.status === 'simulado' ? 'Simulação completa até o passo #4 (sem clique)' : 'Envio confirmado';
    } catch (e) {
     if (e.stopped && !e.after) { log('Interrompido na linha ' + j.row); break; }
     const step = e.step || 'p1';
     j.status = e.after ? 'incerto' : 'falha'; j.note = STEP_LABEL[step] + ': ' + e.message;
     diag = { row: j.row, id: j.id, step, msg: e.message, after: !!e.after, capture: !!e.capture, job: j };
     showDiag(); renderTable();
     if (e.after) { paused = false; break; }
     paused = true; updateControls();
     const choice = await waitChoice();
     if (choice === 'stop') break;
     if (choice === 'retry') { j.status = 'falha'; k--; } else { j.status = 'pulada'; j.note = 'Pulada pelo operador · ' + j.note; }
     $('diag').replaceChildren(); diag = null; continue;
    } finally { renderTable(); renderHistory(); }
    if (k < queue.length - 1 && cfg.betweenRows) { status('Aguardando ' + cfg.betweenRows + ' s antes da próxima linha'); await sleep(cfg.betweenRows * 1000); if (stopped) break; await gate('p1').catch(() => {}); if (stopped) break; }
   }
  } finally { clearInterval(beat); if (JSON.parse(localStorage.getItem(lock) || 'null')?.id === me) localStorage.removeItem(lock); }
 } finally {
  busy = false; paused = false; const s = summarize(jobs);
  const doneMsg = stopped ? 'Parado pelo operador.' : diag?.after ? 'Fila pausada: verificar envio da linha ' + diag.row + '.' : 'Fila concluída.';
  status(doneMsg + ' ' + Object.entries(s).map(([k, n]) => n + ' ' + (STATUS_LABEL[k] || k).toLowerCase()).join(' · '), diag?.after ? 'warn' : stopped ? 'warn' : 'ok');
  log(doneMsg); stopped = false; updateControls(); renderDetail(); renderHistory();
 }
}
let resolveChoice = null;
function waitChoice() { return new Promise(ok => { resolveChoice = c => { resolveChoice = null; paused = false; ok(c); }; const iv = setInterval(() => { if (stopped && resolveChoice) { clearInterval(iv); resolveChoice('stop'); } else if (!resolveChoice) clearInterval(iv); }, 200); }); }
function showDiag() {
 const d = diag; if (!d) return;
 const kids = [h('b', { textContent: d.after ? 'Verificar envio' : 'Diagnóstico' }),
  h('div', { textContent: 'Linha ' + d.row + ' · id origem ' + d.id + ' · ' + STEP_LABEL[d.step] }), h('div', { textContent: d.msg })];
 if (d.capture) kids.push(h('div', { className: 'warn', textContent: 'Captura necessária: no HugMe, abra a Resposta privada, clique com o botão direito no campo onde fica o texto da mensagem → Inspecionar → no elemento destacado, botão direito → Copy → Copy JS path e Copy outerHTML. Envie os dois.' }));
 if (d.after) kids.push(h('div', { className: 'mut', textContent: 'Abra o ticket e confira se a resposta privada aparece. Depois use os botões do Histórico. Ao retomar, as demais linhas pendentes seguem; esta não é reenviada automaticamente.' }));
 else {
  const retry = h('button', { className: 'pri', textContent: 'Tentar esta linha de novo' }), skip = h('button', { textContent: 'Pular esta linha' }), stop = h('button', { textContent: 'Parar a fila' });
  retry.onclick = () => resolveChoice?.('retry'); skip.onclick = () => resolveChoice?.('skip'); stop.onclick = () => { stopped = true; resolveChoice?.('stop'); };
  kids.push(h('div', { className: 'row' }, retry, skip, stop));
 }
 $('diag').replaceChildren(h('div', { className: 'diag' + (d.after ? ' warn' : '') }, kids));
 status('Linha ' + d.row + ' · ' + STEP_LABEL[d.step] + ' · ' + (d.after ? 'verificar envio' : 'aguardando decisão'), d.after ? 'warn' : 'bad');
 log('Linha ' + d.row + ' (id ' + d.id + ') · ' + STEP_LABEL[d.step] + ': ' + d.msg);
}

// Exposto só para os testes automatizados (somente leitura das funções puras).
window.__hugmePrivada.core = { PATHS, TEMPLATE, renderMessage, checkMessage, buildQueue, findHeaderRow, headerReport, tagsInfo, readXlsx };
renderHistory(); updateControls(); log('Painel pronto. Importe a planilha (.xlsx). Nada é enviado sem o modo Envio real.');
})().catch(e => alert('Resposta privada HugMe: ' + e.message));
