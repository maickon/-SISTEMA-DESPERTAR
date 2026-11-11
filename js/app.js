/* =========================================================
   DESPERTAR — aplicação (livro, ficha, árvores, mestre)
   ========================================================= */
(function () {
'use strict';

/* =========================================================
   UTILIDADES
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const d = n => 1 + Math.floor(Math.random() * n);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const mod = v => Math.floor((Number(v) - 10) / 2);
const fmt = n => { n = Math.round(n * 10) / 10; return String(n).replace('.', ','); };
const sinal = n => (n >= 0 ? '+' : '−') + fmt(Math.abs(n));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const HAB = Object.fromEntries(HABILIDADES.map(h => [h.id, h]));
const DESP = Object.fromEntries(DESPERTARES.map(x => [x.id, x]));
const ARV = Object.fromEntries(ARVORES.map(a => [a.id, a]));
const TIT = Object.fromEntries(TITULOS.map(t => [t.id, t]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
}
function rolarExp(exp) {
  const limpa = String(exp).toLowerCase().replace(/\s+/g, '').replace(/−/g, '-');
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(limpa)) return null;
  let total = 0; const partes = [];
  for (const t of limpa.match(/[+-]?[^+-]+/g)) {
    const s = t[0] === '-' ? -1 : 1; const corpo = t.replace(/^[+-]/, '');
    if (corpo.includes('d')) {
      let [q, f] = corpo.split('d'); q = Number(q || 1); f = Number(f);
      if (q > 200 || f < 1) return null;
      const rs = Array.from({ length: q }, () => d(f)); const soma = rs.reduce((a, b) => a + b, 0);
      total += s * soma; partes.push(`${s < 0 ? '−' : ''}${q}d${f}[${rs.join(',')}]`);
    } else { total += s * Number(corpo); partes.push(`${s < 0 ? '−' : '+'}${corpo}`); }
  }
  return { total, txt: partes.join(' ') };
}
const mediaDado = s => { const m = /^(\d*)d(\d+)/.exec(s || ''); return m ? Number(m[1] || 1) * (Number(m[2]) + 1) / 2 : 0; };

/* rolagens rápidas (canto da tela) */
function mostrarRolagem(titulo, total, detalhe, tipo = '') {
  const box = document.createElement('div'); box.className = 'rolagem ' + tipo;
  box.innerHTML = `<div class="rt">${esc(titulo)}</div><div class="rv">${total}</div><div class="rd">${esc(detalhe)}</div>`;
  box.addEventListener('click', () => box.remove());
  const cont = $('#rolagens'); cont.appendChild(box);
  while (cont.children.length > 4) cont.firstChild.remove();
  setTimeout(() => box.remove(), 7000);
}
function rolarD20(nome, bonus) {
  const r = d(20); const tot = r + bonus;
  mostrarRolagem(nome, tot, `d20 (${r}) ${sinal(bonus)}${r === 20 ? ' · 20 natural!' : r === 1 ? ' · 1 natural' : ''}`, r === 20 ? 'crit' : r === 1 ? 'falha' : '');
}
function rolarDanoExp(nome, exp) { const r = rolarExp(exp); if (r) mostrarRolagem('Dano · ' + nome, r.total, r.txt); }

/* =========================================================
   ARMAZENAMENTO — IndexedDB (com reserva em localStorage)
   ========================================================= */
const CHAVE_V1 = 'despertar.fichas.v1', CHAVE_LS = 'despertar.fichas.v2', CHAVE_ATUAL = 'despertar.atual';
const Armazem = {
  modo: 'idb', db: null,
  iniciar() {
    return new Promise(res => {
      if (!window.indexedDB) { this.modo = 'ls'; return res(); }
      let r; try { r = indexedDB.open('despertar', 1); } catch (e) { this.modo = 'ls'; return res(); }
      r.onupgradeneeded = () => r.result.createObjectStore('fichas', { keyPath: 'id' });
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => { this.modo = 'ls'; res(); };
      r.onblocked = () => { this.modo = 'ls'; res(); };
    });
  },
  tx(modo) { return this.db.transaction('fichas', modo).objectStore('fichas'); },
  todas() {
    if (this.modo === 'ls') { try { return Promise.resolve(JSON.parse(localStorage.getItem(CHAVE_LS) || '[]')); } catch (e) { return Promise.resolve([]); } }
    return new Promise(res => { const q = this.tx('readonly').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); });
  },
  salvar(p) {
    if (this.modo === 'ls') { try { localStorage.setItem(CHAVE_LS, JSON.stringify(FICHAS)); return Promise.resolve(true); } catch (e) { return Promise.resolve(false); } }
    return new Promise(res => { const q = this.tx('readwrite').put(clone(p)); q.onsuccess = () => res(true); q.onerror = () => res(false); });
  },
  apagar(id) {
    if (this.modo === 'ls') return this.salvar();
    return new Promise(res => { const q = this.tx('readwrite').delete(id); q.onsuccess = () => res(true); q.onerror = () => res(false); });
  }
};
let FICHAS = [], ATUAL = null;
const P = () => FICHAS.find(p => p.id === ATUAL);
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }

async function carregar() {
  await Armazem.iniciar();
  FICHAS = (await Armazem.todas()).map(normalizar);
  if (!FICHAS.length) {
    try { const v1 = JSON.parse(lsGet(CHAVE_V1) || 'null'); if (v1 && v1.lista) FICHAS = v1.lista.map(normalizar); } catch (e) { }
    if (!FICHAS.length) FICHAS = [novoPers()];
    for (const p of FICHAS) await Armazem.salvar(p);
  }
  ATUAL = lsGet(CHAVE_ATUAL);
  if (!P()) ATUAL = FICHAS[0].id;
}
let _saveT;
function salvar(p = P()) {
  clearTimeout(_saveT);
  _saveT = setTimeout(async () => {
    const ok = await Armazem.salvar(p);
    const el = $('#f-salvo'); if (el) el.textContent = ok ? (Armazem.modo === 'idb' ? '✓ salvo' : '✓ salvo (modo simples)') : '⚠ não salvou — exporte';
  }, 300);
}
function trocarFicha(id) { ATUAL = id; lsSet(CHAVE_ATUAL, id); prevFlat = null; }

/* =========================================================
   MODELO
   ========================================================= */
function itemBase(cat, nome, extra = {}) {
  return Object.assign({ uid: uid(), cat, nome, rank: 'E', rar: 'Comum', cor: '#9aa5b1', linhas: [], afixos: [], selos: [], sinc: 0, refino: 0, X: 1, equip: false }, extra);
}
function armaComum(nomeBase, rank = 'E') {
  const a = ARMAS.find(x => x.n === nomeBase) || ARMAS[3]; const br = RANKS[rank].br;
  return itemBase('arma', a.n, { base: a.n, dano: a.dano, atr: a.a, rank, X: 1 + br, dist: /distância/.test(a.tags), reqAtr: a.a,
    linhas: [`Dano ${a.dano} · Alcance ${a.alc} · ${a.a}${a.tags ? ' · ' + a.tags : ''}`] });
}
function armaduraComum(tipo, rank = 'E') {
  const a = ARMADURAS.find(x => x.tipo === tipo) || ARMADURAS[0]; const br = RANKS[rank].br;
  return itemBase('armadura', a.n, { base: a.n, armTipo: a.tipo, rank, X: 1 + br, reqAtr: a.tipo === 'Leve' ? null : 'FOR',
    linhas: [`Armadura ${a.tipo} · Defender +${a.def + br}${a.esq ? ' · Esquivar ' + a.esq : ''} · RD ${br}`] });
}
function novoPers() {
  const espada = armaComum('Espada'); espada.equip = true;
  const traje = armaduraComum('Leve'); traje.equip = true;
  const pocao = itemBase('consumivel', 'Poção de Cura (Rank E)', { qtd: 2, linhas: ['Recupera 2d8 PV.'], usoDado: '2d8', usoAlvo: 'pv' });
  return {
    id: uid(), versao: 2, nome: 'Novo Caçador', jogador: '', conceito: '', motivo: '', nivel: 1, xp: 0, rankOficial: 'E', potencial: 'Normal', ouro: 100,
    atr: { FOR: 10, AGI: 10, VIT: 10, INT: 10, PER: 10, PRE: 10 }, statusPend: 0,
    compPot: { ph: 0, st: 0 }, compDesp: { ph: 0, st: 0 }, phNiveis: 0, phExtra: 0,
    pericias: {}, despertar: { id: '', nv: 1 }, habs: [], titulo: '', pvAtual: null, pmAtual: null,
    bonus: { pv: 0, pm: 0, def: 0, esq: 0, atk: 0, dano: 0, rd: 0, desl: 0, ini: 0 },
    itens: [espada, traje, pocao], condicoes: '', notas: '', criado: Date.now()
  };
}
function acharBase(nome) {
  const todos = [...ARMAS.map(a => a.n), ...ARMADURAS.map(a => a.n), 'Escudo', ...ACESSORIOS].sort((a, b) => b.length - a.length);
  return todos.find(b => String(nome).startsWith(b)) || null;
}
function normalizar(p) {
  const base = novoPers();
  for (const k in base) if (p[k] === undefined) p[k] = k === 'itens' ? [] : base[k];
  for (const k in base.bonus) if (p.bonus[k] === undefined) p.bonus[k] = 0;
  for (const k in base.atr) if (p.atr[k] === undefined) p.atr[k] = 10;
  // migração da versão 1 (armas/armadura/escudo em campos próprios)
  if (p.armas || p.armadura || p.escudo) {
    (p.armas || []).forEach(a => {
      const it = armaComum(ARMAS.find(x => x.n === a.nome) ? a.nome : 'Espada', a.rank || 'E');
      Object.assign(it, { nome: a.nome || it.nome, dano: a.dano || it.dano, atr: a.atr || it.atr, refino: a.refino || 0, equip: true });
      if (a.atk || a.dmg) it.linhas.push(`Bônus manual antigo: +${a.atk || 0} ataque, +${a.dmg || 0} dano (some em Bônus manuais).`);
      p.itens.unshift(it);
    });
    if (p.armadura && p.armadura.tipo) { const it = armaduraComum(p.armadura.tipo, p.armadura.rank || 'E'); it.refino = p.armadura.refino || 0; it.equip = true; p.itens.unshift(it); }
    if (p.escudo && p.escudo.tem) { const br = RANKS[p.escudo.rank || 'E'].br; p.itens.unshift(itemBase('escudo', 'Escudo', { base: 'Escudo', rank: p.escudo.rank || 'E', refino: p.escudo.refino || 0, X: 1 + br, reqAtr: 'FOR', equip: true, linhas: [`Escudo · Defender +${2 + br} · RD ${br}`] })); }
    delete p.armas; delete p.armadura; delete p.escudo;
  }
  p.itens.forEach(it => {
    if (!it.uid) it.uid = uid();
    if (it.X == null) it.X = 1 + (RANKS[it.rank] ? RANKS[it.rank].br : 0);
    if (it.cat === 'arma' && !it.base) { it.base = acharBase(it.nome); const a = ARMAS.find(x => x.n === it.base); if (a) { it.dist = /distância/.test(a.tags); it.reqAtr = a.a; } }
    if (it.cat === 'armadura' && !it.armTipo) { const a = ARMADURAS.find(x => it.nome.startsWith(x.n)); it.armTipo = a ? a.tipo : 'Leve'; }
    if (!it.selos) it.selos = []; if (!it.afixos) it.afixos = []; if (!it.linhas) it.linhas = [];
  });
  p.versao = 2;
  return p;
}

/* =========================================================
   REGRAS CALCULADAS
   ========================================================= */
const EF_AFIXO = {
  'Veloz': X => ({ ini: X, desl: 1.5 }),
  'Robusta': X => ({ def: X }), 'Esguia': X => ({ esq: X, semPenEsq: 1 }), 'Vital': X => ({ pv: 5 * X }), 'Arcana': X => ({ pm: 5 * X }),
  'Firme': X => ({ 'res.FOR': X, 'res.VIT': X }), 'Sombria': X => ({ 'per.Furtividade': 2 * X }),
  'Forte': X => ({ FOR: 2 * X }), 'Ágil': X => ({ AGI: 2 * X }), 'Vigoroso': X => ({ VIT: 2 * X }), 'Sábio': X => ({ INT: 2 * X }),
  'Atento': X => ({ PER: 2 * X }), 'Imponente': X => ({ PRE: 2 * X }), 'Focado': X => ({ cd: X }), 'Profundo': X => ({ pm: 5 * X }),
  'Resiliente': X => ({ pv: 5 * X }), 'Ligeiro': X => ({ desl: X })
};
const ELEM = { 'Flamejante': 'fogo', 'Gélida': 'gelo', 'Trovejante': 'raio' };
const rankDoNivel = n => { let r = 'E'; for (const k of RANK_ORDEM) if (n >= RANKS[k].nivel) r = k; return r; };
function brItem(it, p) {
  const rank = it.rar === 'Relíquia' ? rankDoNivel(Number(p.nivel) || 1) : it.rank;
  const br = RANKS[rank] ? RANKS[rank].br : 0;
  if (br && it.reqAtr && Number(p.atr[it.reqAtr]) < 10 + 4 * br) return { br: 0, rank, semReq: true };
  return { br, rank, semReq: false };
}
const equipados = p => p.itens.filter(i => i.equip);
function bolsa(p) {
  const b = {};
  const add = o => { for (const k in o) { if (k === 'desarmado') { b.desarmado = o[k]; continue; } b[k] = (b[k] || 0) + Number(o[k] || 0); } };
  p.habs.forEach(x => { const f = EFEITOS_HAB[x.id]; if (f) add(f(x.nv, p)); });
  if (p.despertar.id && EFEITOS_DESP[p.despertar.id]) add(EFEITOS_DESP[p.despertar.id](p.despertar.nv, p));
  if (p.titulo && TIT[p.titulo]) add(TIT[p.titulo].ef);
  equipados(p).forEach(it => it.afixos.forEach(a => { const f = EF_AFIXO[a.n]; if (f) add(f(it.X || 1)); }));
  const m = p.bonus; add({ pv: m.pv, pm: m.pm, def: m.def, esq: m.esq, atk: m.atk, dano: m.dano, rd: m.rd, desl: m.desl, ini: m.ini });
  return b;
}
function computar(p) {
  const n = Math.max(1, Number(p.nivel) || 1); const b = bolsa(p);
  const atr = {}, m = {};
  for (const a of ATRIBUTOS) { atr[a.id] = Number(p.atr[a.id] || 0) + (b[a.id] || 0); m[a.id] = mod(atr[a.id]); }
  const eq = equipados(p);
  const arm = eq.find(i => i.cat === 'armadura'); const esc_ = eq.find(i => i.cat === 'escudo');
  let defArm = 0, pen = 0, rdArm = 0, defEsc = 0;
  if (arm) { const t = ARMADURAS.find(a => a.tipo === arm.armTipo) || ARMADURAS[0]; const { br } = brItem(arm, p); defArm = t.def + br + Number(arm.refino || 0); pen = b.semPenEsq ? 0 : t.esq; rdArm += br; }
  if (esc_) { const { br } = brItem(esc_, p); defEsc = 2 + br + Number(esc_.refino || 0); rdArm += br; }
  const res = {}, cd = {}, per = {};
  for (const a of ATRIBUTOS) { res[a.id] = n + m[a.id] + (b.res || 0) + (b['res.' + a.id] || 0); cd[a.id] = 10 + n + m[a.id] + (b.cd || 0); }
  for (const pc of PERICIAS) per[pc.n] = m[pc.a] + Number(p.pericias[pc.n] || 0) + (b['per.' + pc.n] || 0);
  const meioN = Math.floor(n / 2);
  const ataques = [{ id: 'desarmado', nome: 'Desarmado', atk: n + m.FOR + (b.atk || 0) + (b.atkCaC || 0), dado: b.desarmado || '1d4',
    bonus: m.FOR + meioN + (b.dano || 0) + (b.danoCaC || 0), extra: '', alc: '1,5 m' }];
  eq.filter(i => i.cat === 'arma').forEach(it => {
    const { br } = brItem(it, p); const mm = m[it.atr] || 0; const ref = Number(it.refino || 0); const dist = !!it.dist;
    const afx = n2 => it.afixos.some(a => a.n === n2);
    const X = it.X || 1;
    const extra = it.afixos.filter(a => ELEM[a.n]).map(a => `+${X}d4 ${ELEM[a.n]}`).join(' ');
    ataques.push({ id: it.uid, nome: it.nome, atk: n + mm + br + ref + (b.atk || 0) + (dist ? b.atkDist || 0 : b.atkCaC || 0) + (afx('Afiada') ? X : 0),
      dado: it.dano || '1d6', bonus: mm + meioN + 2 * br + ref + (b.dano || 0) + (dist ? b.danoDist || 0 : b.danoCaC || 0) + (afx('Brutal') ? 2 * X : 0),
      extra, dist });
  });
  return {
    n, rank: rankDoNivel(n), atr, m, b,
    pvMax: 10 + m.VIT + (n - 1) * Math.max(1, 5 + m.VIT) + (b.pv || 0),
    pmMax: 10 + m.INT + (n - 1) * Math.max(1, 4 + m.INT) + (b.pm || 0),
    desl: Math.max(1, 9 + Math.floor(m.AGI / 2) + (b.desl || 0)),
    acoes: 1 + Math.floor(n / 5), ini: m.AGI + (b.ini || 0),
    def: n + m.FOR + defArm + defEsc + (b.def || 0), esq: n + m.AGI + pen + (b.esq || 0),
    defPassiva: 10 + defArm, rd: rdArm + (b.rd || 0), res, cd, per, ataques,
    xpProx: n * 10, periciaMax: 2 + Math.floor(n / 2), periciaTotal: 4 + 2 * (n - 1)
  };
}
/* valores exibíveis, para comparar antes/depois */
function achatar(c) {
  const f = { 'PV máx': c.pvMax, 'PM máx': c.pmMax, 'Deslocamento': c.desl, 'Ações Principais': c.acoes, 'Iniciativa': c.ini,
    'Defender': c.def, 'Esquivar': c.esq, 'Defesa Passiva': c.defPassiva, 'RD': c.rd };
  for (const a of ATRIBUTOS) f[a.id] = c.atr[a.id];
  for (const a of ATRIBUTOS) f['Resist. ' + a.id] = c.res[a.id];
  for (const a of ATRIBUTOS) f['CD ' + a.id] = c.cd[a.id];
  for (const k in c.per) f['Perícia ' + k] = c.per[k];
  c.ataques.forEach(a => { f['Ataque · ' + a.nome] = a.atk; f['Dano · ' + a.nome] = a.bonus; if (a.id === 'desarmado') f['Dado desarmado'] = a.dado; });
  return f;
}
function diferenca(f1, f2) {
  const out = []; const chaves = new Set([...Object.keys(f1), ...Object.keys(f2)]);
  for (const k of chaves) {
    const a = f1[k], b = f2[k]; if (a === b) continue;
    if (typeof a === 'string' || typeof b === 'string') { const da = mediaDado(a), db = mediaDado(b); out.push({ k, txt: `${a || '—'} → ${b || '—'}`, up: db > da }); continue; }
    if (a == null) { out.push({ k, txt: 'novo', up: true }); continue; }
    if (b == null) { out.push({ k, txt: 'removido', up: false }); continue; }
    out.push({ k, d: b - a, up: b > a });
  }
  // compacta grupos iguais (todas as Resistências / todas as CDs)
  for (const g of ['Resist. ', 'CD ']) {
    const itens = out.filter(x => x.k.startsWith(g) && x.d != null);
    if (itens.length === 6 && itens.every(x => x.d === itens[0].d)) {
      itens.forEach(x => out.splice(out.indexOf(x), 1));
      out.push({ k: g === 'CD ' ? 'CDs de poder' : 'Resistências', d: itens[0].d, up: itens[0].d > 0 });
    }
  }
  return out;
}
const inverter = l => l.map(z => ({ ...z, d: z.d != null ? -z.d : null, up: !z.up, txt: z.txt ? z.txt.split(' → ').reverse().join(' → ') : z.txt }));
function prever(p, mutar) { const c = clone(p); mutar(c); return diferenca(achatar(computar(p)), achatar(computar(c))); }
function efeitosHTML(lista, titulo) {
  if (!lista.length) return '';
  return `<div class="efeitos"><div class="efeitos-t">${esc(titulo)}</div>${lista.map(x =>
    `<span class="ef ${x.up ? 'up' : 'down'}">${esc(x.k)} <b>${x.d != null ? sinal(x.d) : esc(x.txt)}</b> ${x.up ? '▲' : '▼'}</span>`).join('')}</div>`;
}

/* habilidades: custo e requisitos */
const afinidades = p => { const x = DESP[p.despertar.id]; return x ? x.afin : []; };
const custoAquis = (h, p) => { const c = RANKS[h.r].custo; return p && afinidades(p).includes(h.t) ? Math.max(1, c - 1) : c; };
const phRecebidos = p => 3 + Number(p.compPot.ph || 0) + Number(p.compDesp.ph || 0) + Number(p.phNiveis || 0) + Number(p.phExtra || 0);
const despGratis = p => Math.min(5, Math.floor((Number(p.nivel) || 1) / 5));
function phGasto(p) {
  let g = 0;
  for (const x of p.habs) { const h = HAB[x.id]; if (!h) continue; if (!x.gratis) g += custoAquis(h, p); for (let k = 2; k <= x.nv; k++) g += k; }
  if (p.despertar.id) { for (let k = 2 + despGratis(p); k <= p.despertar.nv; k++) g += k; }
  return g;
}
const phDisp = p => phRecebidos(p) - phGasto(p);
const possui = (p, id) => p.habs.find(x => x.id === id);
function checarReq(h, p) {
  const n = Number(p.nivel) || 1; const out = [];
  out.push({ ok: n >= RANKS[h.r].nivel, txt: `Nível ${RANKS[h.r].nivel}` });
  const atrs = h.attr.split('/');
  out.push({ ok: atrs.some(a => Number(p.atr[a]) >= RANKS[h.r].attr), txt: `${atrs.join(' ou ')} ${RANKS[h.r].attr}` });
  if (h.pre.length) {
    const r = h.pre.map(([id, nv]) => { const x = possui(p, id); return { ok: !!x && x.nv >= nv, txt: `${HAB[id].n} nv${nv}` }; });
    if (h.preAny) out.push({ ok: r.some(z => z.ok), txt: 'Um entre: ' + r.map(z => z.txt).join(' / ') }); else out.push(...r);
  }
  return out;
}
const reqOk = (h, p) => checarReq(h, p).every(r => r.ok);
function custoProximo(id, p) { const x = possui(p, id); return x ? (x.nv < 5 ? x.nv + 1 : null) : custoAquis(HAB[id], p); }

/* =========================================================
   CARTÕES
   ========================================================= */
function reqTexto(h) {
  const partes = [`${h.attr.split('/').join(' ou ')} ${RANKS[h.r].attr}`];
  if (h.pre.length) { const ps = h.pre.map(([id, nv]) => `${HAB[id].n} nv${nv}`); partes.push(h.preAny ? 'um entre: ' + ps.join(' / ') : ps.join(' · ')); }
  partes.push(`Nível ${RANKS[h.r].nivel}`);
  return partes.join(' · ');
}
function habCard(h, extra = '') {
  const a = ARV[h.t];
  return `<div class="hab-card" style="--cor:${a.cor}">
    <div class="hab-topo"><span class="rk rk-${h.r}">${h.r}</span><strong>${esc(h.n)}</strong>
      <span class="hab-tipo">${h.tipo}${h.acao !== '—' ? ' · ' + h.acao : ''}${h.pm ? ' · ' + h.pm + ' PM' : ''}</span></div>
    <div class="hab-req">${a.icone} ${a.nome} · Adquirir ${RANKS[h.r].custo} PH · Requisitos: ${esc(reqTexto(h))}</div>
    <div class="hab-meta">Alcance: ${esc(h.alc)} · Duração: ${esc(h.dur)}${h.freq ? ' · <b>' + esc(h.freq) + '</b>' : ''}</div>
    <p><b>Efeito:</b> ${esc(h.ef)}</p><p><b>Por nível:</b> ${esc(h.esc)}</p>
    <p><b>Nível 3:</b> ${esc(h.m3)}</p><p><b>Nível 5:</b> ${esc(h.m5)}</p>${extra}</div>`;
}
const faixa = x => x.d[0] === x.d[1] ? String(x.d[0]).padStart(2, '0') : `${String(x.d[0]).padStart(2, '0')}–${String(x.d[1]).padStart(2, '0')}`;
function despCard(x, extra = '') {
  const r = RARIDADE_DESPERTAR[x.rar];
  return `<div class="desp-card" style="--cor:${r.cor}">
    <div class="hab-topo"><span class="desp-d">${faixa(x)}</span><strong>${esc(x.n)}</strong><span class="hab-tipo" style="color:${r.cor}">${x.rar}</span></div>
    <div class="hab-req">Afinidades: ${x.afin.map(a => ARV[a].icone + ' ' + ARV[a].nome).join(' · ')}</div>
    <p><i>${esc(x.desc)}</i></p><p><b>Efeito:</b> ${esc(x.ef)}</p><p><b>Por nível:</b> ${esc(x.esc)}</p>
    <p><b>Nível 3:</b> ${esc(x.m3)}</p><p><b>Nível 5:</b> ${esc(x.m5)}</p>
    <p class="forma"><b>Forma Evoluída:</b> ${esc(x.forma)}</p>${extra}</div>`;
}
const ICONE_CAT = { arma: '⚔', armadura: '⛨', escudo: '◈', acessorio: '◇', consumivel: '⚗', outro: '✦' };
function itemCard(it, extra = '') {
  const qtd = it.qtd > 1 ? ` ×${it.qtd}` : '';
  return `<div class="item-card" style="--cor:${it.cor}">
    <div class="item-nome">${esc(it.nome)}${qtd}</div>
    <div class="item-sub">${it.rar} · Rank ${it.rank}${it.preco ? ' · ' + it.preco.toLocaleString('pt-BR') + ' Ouro' : ''}${it.refino ? ' · Refino +' + it.refino : ''}${it.selos.length ? ' · Sincronia ' + (it.sinc || 0) : ''}</div>
    ${it.linhas.map(l => `<div>${esc(l)}</div>`).join('')}
    ${it.afixos.length ? '<ul>' + it.afixos.map(a => `<li><b>${esc(a.n)}</b>: ${esc(a.t)}</li>`).join('') + '</ul>' : ''}
    ${it.selos.length ? `<details class="item-selos"><summary>${it.selos.length} Selo(s) — Sincronia 3 / 8 / 15</summary><ul>${it.selos.map((s, i) => {
      const aberto = Number(it.sinc || 0) >= [3, 8, 15][i];
      return `<li>${aberto ? '🔓' : '🔒'} <b>${esc(s.n)}</b> (Sinc. ${[3, 8, 15][i]}): ${esc(s.t)}</li>`; }).join('')}</ul></details>` : ''}
    ${extra}</div>`;
}
const tituloCard = t => `<div class="titulo-card"><b>${esc(t.n)}</b><span>${esc(t.txt)}</span><span class="c">Como obter: ${esc(t.cond)}</span></div>`;

/* =========================================================
   COMPONENTES: modal, select com busca, stepper
   ========================================================= */
let modalAoFechar = null;
function abrirModal(titulo, corpo, botoes = [], opc = {}) {
  $('#modal-titulo').textContent = titulo;
  $('#modal-corpo').innerHTML = corpo;
  const rod = $('#modal-rodape'); rod.innerHTML = '';
  botoes.forEach(bt => {
    const el = document.createElement('button'); el.className = 'btn ' + (bt.cls || ''); el.textContent = bt.label;
    if (bt.disabled) el.disabled = true;
    el.addEventListener('click', () => { const r = bt.onClick ? bt.onClick() : null; if (bt.fechar !== false && r !== false) fecharModal(); });
    rod.appendChild(el);
  });
  $('.modal').classList.toggle('largo', !!opc.largo);
  $('#modal-fundo').hidden = false; document.body.style.overflow = 'hidden';
  modalAoFechar = opc.aoFechar || null;
  ativarSelBuscas($('#modal-corpo'));
  $('#modal-corpo').scrollTop = 0;
  return $('#modal-corpo');
}
function fecharModal() {
  $('#modal-fundo').hidden = true; document.body.style.overflow = '';
  const f = modalAoFechar; modalAoFechar = null; if (f) f();
}
const modalAberto = () => !$('#modal-fundo').hidden;

const SB = new Map(); let sbN = 0;
function selBusca(cfg) {
  const id = 'sb' + (++sbN); SB.set(id, cfg);
  const o = cfg.opcoes.find(x => x.v === cfg.valor);
  return `<div class="sel-busca" data-sb="${id}"><button type="button" class="sel-busca-btn"><span class="rot">${esc(o ? o.l : (cfg.placeholder || 'Selecionar…'))}</span></button></div>`;
}
function ativarSelBuscas() { /* delegado em document; nada a fazer */ }
let popAtual = null;
function fecharPop() { if (popAtual) { popAtual.remove(); popAtual = null; } }
function abrirPop(wrap) {
  fecharPop();
  const cfg = SB.get(wrap.dataset.sb); if (!cfg) return;
  const pop = document.createElement('div'); pop.className = 'sel-pop';
  pop.innerHTML = `<input type="search" placeholder="Buscar…" aria-label="Buscar"><ul></ul>`;
  wrap.appendChild(pop); popAtual = pop;
  const inp = $('input', pop), ul = $('ul', pop); let foco = 0, vis = [];
  const desenhar = () => {
    const q = norm(inp.value.trim());
    vis = cfg.opcoes.filter(o => !q || norm(o.l + ' ' + (o.s || '')).includes(q));
    foco = Math.min(foco, Math.max(0, vis.length - 1));
    ul.innerHTML = vis.length ? vis.map((o, i) => `<li data-i="${i}" class="${o.v === cfg.valor ? 'sel' : ''} ${i === foco ? 'foco' : ''}">${esc(o.l)}${o.s ? `<small>${esc(o.s)}</small>` : ''}</li>`).join('') : '<div class="vazio">Nada encontrado.</div>';
  };
  const escolher = i => { const o = vis[i]; if (!o) return; cfg.valor = o.v; $('.rot', wrap).textContent = o.l; fecharPop(); cfg.onChange(o.v); };
  inp.addEventListener('input', () => { foco = 0; desenhar(); });
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { foco = Math.min(vis.length - 1, foco + 1); desenhar(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { foco = Math.max(0, foco - 1); desenhar(); e.preventDefault(); }
    else if (e.key === 'Enter') { escolher(foco); e.preventDefault(); }
    else if (e.key === 'Escape') { fecharPop(); e.stopPropagation(); }
  });
  ul.addEventListener('mousedown', e => { const li = e.target.closest('li'); if (li) { e.preventDefault(); escolher(Number(li.dataset.i)); } });
  desenhar(); inp.focus();
  const sel = $('li.sel', ul); if (sel) sel.scrollIntoView({ block: 'nearest' });
}
function numInp(path, valor, opc = {}) {
  const min = opc.min != null ? `min="${opc.min}"` : '', max = opc.max != null ? `max="${opc.max}"` : '';
  return `<div class="num ${opc.cls || ''}"><button type="button" tabindex="-1" data-step="-1" aria-label="Diminuir">−</button><input type="number" inputmode="numeric" ${path ? `data-bind="${path}"` : ''} ${opc.id ? `id="${opc.id}"` : ''} value="${esc(valor ?? 0)}" ${min} ${max}><button type="button" tabindex="-1" data-step="1" aria-label="Aumentar">+</button></div>`;
}
let viaStep = false;
document.addEventListener('click', e => {
  const st = e.target.closest('[data-step]');
  if (st) {
    const inp = $('input', st.parentElement); const passo = Number(st.dataset.step);
    let v = (Number(inp.value) || 0) + passo;
    if (inp.min !== '' && v < Number(inp.min)) v = Number(inp.min);
    if (inp.max !== '' && v > Number(inp.max)) v = Number(inp.max);
    inp.value = v; viaStep = true; inp.dispatchEvent(new Event('input', { bubbles: true })); viaStep = false;
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const sb = e.target.closest('.sel-busca-btn');
  if (sb) { const w = sb.parentElement; if (popAtual && popAtual.parentElement === w) fecharPop(); else abrirPop(w); return; }
  if (popAtual && !e.target.closest('.sel-pop')) fecharPop();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (popAtual) fecharPop(); else if (modalAberto()) fecharModal(); } });

/* =========================================================
   LIVRO
   ========================================================= */
function montarLivro() {
  $('#cat-atributos').innerHTML = ATRIBUTOS.map(a => `<div class="caixa attr-card"><b>${a.nome} (${a.id})</b><p>${a.desc}</p></div>`).join('');
  $('#cat-pericias').innerHTML = PERICIAS.map(p => `<div>${p.n}<span>${p.a}</span></div>`).join('');
  $('#cat-condicoes').innerHTML = CONDICOES.map(([n, t]) => `<div><b>${n}.</b> ${t}</div>`).join('');
  $('#cat-titulos').innerHTML = TITULOS.map(tituloCard).join('');
  $('#tab-req-rank').innerHTML = RANK_ORDEM.map(r => `<tr><td><span class="rk rk-${r}">${r}</span></td><td>${RANKS[r].nivel}</td><td>${RANKS[r].attr}</td><td>${RANKS[r].custo} PH</td></tr>`).join('');
  $('#cat-despertares').innerHTML = ['Comum', 'Raro', 'Épico', 'Lendário', 'Anomalia'].map(g => {
    const r = RARIDADE_DESPERTAR[g];
    return `<div class="desp-grupo" style="color:${r.cor}">${g} <span class="tag">${r.txt}</span></div>` + DESPERTARES.filter(x => x.rar === g).map(x => despCard(x)).join('');
  }).join('');
  $('#cat-habilidades').innerHTML = ARVORES.map(a => `<div class="arvore-cat">
      <h3 style="color:${a.cor}">${a.icone} ${a.nome} <span class="tag">${a.atr}</span></h3><p class="arvore-desc">${a.desc}</p>
      ${RANK_ORDEM.flatMap(r => HABILIDADES.filter(h => h.t === a.id && h.r === r)).map(h => habCard(h)).join('')}</div>`).join('');
  $('#cat-armas').innerHTML = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Arma</th><th>Dano</th><th>Alcance</th><th>Atributo</th><th>Propriedades</th></tr></thead><tbody>
    ${ARMAS.map(a => `<tr><td>${a.n}</td><td>${a.dano}</td><td>${a.alc}</td><td>${a.a}</td><td>${a.tags || '—'}</td></tr>`).join('')}</tbody></table></div>`;
  $('#tab-raridades').innerHTML = RARIDADES.map(r => `<tr><td>${r.max > 200 ? r.min + '+' : r.min + '–' + r.max}</td><td style="color:${r.cor};font-weight:700">${r.n}</td><td>${r.afx}</td><td>${r.selos}</td><td>×${r.mult}</td></tr>`).join('');
  const lst = arr => '<ul>' + arr.map(([p, s, t]) => `<li><b>${p}</b> / <i>${s}</i>: ${t}</li>`).join('') + '</ul>';
  $('#cat-afixos').innerHTML = `<div class="afixos-grade">
      <div class="caixa"><h4>Afixos de Arma</h4>${lst(AFIXOS.arma)}</div>
      <div class="caixa"><h4>Afixos de Armadura e Escudo</h4>${lst(AFIXOS.armadura)}</div>
      <div class="caixa"><h4>Afixos de Acessório</h4>${lst(AFIXOS.acessorio)}</div></div>
    <h4 style="margin-top:16px">Selos (propriedades ocultas, d12)</h4>
    <div class="tabela-wrap"><table class="tabela"><tbody>${SELOS.map(([n, t], i) => `<tr><td>${i + 1}</td><th>${n}</th><td>${t}</td></tr>`).join('')}</tbody></table></div>`;
  $('#cat-consumiveis').innerHTML = `<div class="tabela-wrap"><table class="tabela"><tbody>${CONSUMIVEIS.map(([n, t]) => `<tr><th>${n}</th><td>${t}</td></tr>`).join('')}</tbody></table></div>`;
  const t12 = (titulo, arr, f = x => x) => `<div class="caixa"><h4>${titulo}</h4><ol>${arr.map(x => `<li>${f(x)}</li>`).join('')}</ol></div>`;
  $('#cat-portal').innerHTML = `
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>d100</th><th>Rank</th><th>Nível das ameaças</th></tr></thead><tbody>
      ${PORTAL_RANK.map((r, i) => `<tr><td>${(i ? PORTAL_RANK[i - 1].max + 1 : 1)}–${r.max}</td><td><span class="rk rk-${r.r}">${r.r}</span></td><td>${PORTAL_NIVEL[r.r][0]}–${PORTAL_NIVEL[r.r][1]} (Chefe +2)</td></tr>`).join('')}</tbody></table></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>d20</th><th>Tipo</th><th>Efeito</th><th>XP</th><th>Raridade</th></tr></thead><tbody>
      ${PORTAL_TIPO.map((t, i) => { const lo = i ? PORTAL_TIPO[i - 1].max + 1 : 1; return `<tr><td>${lo}${t.max !== lo ? '–' + t.max : ''}</td><th>${t.n}</th><td>${t.d}</td><td>×${fmt(t.xp)}</td><td>+${t.raridade}</td></tr>`; }).join('')}</tbody></table></div>
    <div class="grade-2">${t12('Ambiente (d12)', PORTAL_AMBIENTE)}${t12('Criaturas (d12)', PORTAL_CRIATURAS, x => `<b>${x[0]}</b>: ${x[1]}`)}
      ${t12('Título do Chefe (d12)', CHEFE_TITULO)}${t12('Epíteto do Chefe (d12)', CHEFE_EPITETO)}${t12('Complicação (d12)', PORTAL_COMPLICACAO)}</div>`;
  renderAmeacas(); $('#amea-nivel').addEventListener('input', renderAmeacas);
  $('#cat-bestiario').innerHTML = BESTIARIO.map(b => {
    const s = statsAmeaca(b.L, b.cat);
    return `<div class="hab-card" style="--cor:${RANKS[b.r].cor}"><div class="hab-topo"><span class="rk rk-${b.r}">${b.r}</span><strong>${b.n}</strong><span class="hab-tipo">${b.cat} · Nível ${b.L}</span></div>
      <div class="hab-meta">PV ${s.pv} · Ataque +${s.atk} · Reação +${s.reac}${b.cat === 'Lacaio' ? ' (Defesa Fixa ' + s.defFixa + ')' : ''} · Dano ${s.dano} · Ações ${s.acoes} · RD ${s.rd} · CD ${s.cd} · Resistências +${s.res}</div><p>${b.tr}</p></div>`;
  }).join('');
  // sumário
  const sum = $('#sumario');
  sum.innerHTML = '<a href="#" data-topo>Capa</a>' + $$('.cap').map(c => {
    const subs = $$('h3', c); subs.forEach((h, i) => { if (!h.id) h.id = c.id + '-' + i; });
    return `<a href="#${c.id}" data-cap="${c.id}">${$('h2', c).textContent}</a>` + (['c-arvores', 'c-despertares'].includes(c.id) ? '' : subs.map(h => `<a class="sub" href="#${h.id}">${h.textContent}</a>`).join(''));
  }).join('');
  sum.addEventListener('click', e => {
    if (e.target.closest('[data-topo]')) { e.preventDefault(); window.scrollTo({ top: 0 }); }
    if (e.target.closest('a')) sum.classList.remove('aberto');
  });
  $('#sumario-toggle').addEventListener('click', () => sum.classList.toggle('aberto'));
  const obs = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) $$('.sumario a').forEach(a => a.classList.toggle('atual', a.dataset.cap === en.target.id)); }), { rootMargin: '-10% 0px -80% 0px' });
  $$('.cap').forEach(c => obs.observe(c));
}
function renderAmeacas() {
  const L = Math.max(1, Math.min(40, Number($('#amea-nivel').value) || 1)); const cats = ['Lacaio', 'Soldado', 'Elite', 'Chefe'];
  const linha = c => { const s = statsAmeaca(L, c); return `<tr><th>${c}</th><td>${s.pv}</td><td>+${s.atk}</td><td>+${s.reac}${c === 'Lacaio' ? ' (fixa ' + s.defFixa + ')' : ''}</td><td>${s.dano}</td><td>${s.acoes}</td><td>${s.rd}</td><td>${s.cd}</td><td>+${s.res}</td></tr>`; };
  const rows = []; for (let l = 1; l <= 30; l++) { const S = cats.map(c => statsAmeaca(l, c)); rows.push(`<tr><td>${l}</td><td>+${S[0].atk}</td><td>+${S[0].reac}</td><td>${S[0].cd}</td><td>${S.map(s => s.pv).join(' / ')}</td><td>${S.map(s => s.dano).join(' / ')}</td><td>${S.slice(1).map(s => s.acoes).join(' / ')}</td></tr>`); }
  $('#tab-ameacas').innerHTML = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nível ${L}</th><th>PV</th><th>Ataque</th><th>Reação</th><th>Dano</th><th>Ações</th><th>RD</th><th>CD</th><th>Resist.</th></tr></thead><tbody>${cats.map(linha).join('')}</tbody></table></div>
    <details><summary class="dica">Tabela completa, níveis 1–30 (Lacaio / Soldado / Elite / Chefe)</summary><div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Nv</th><th>Atq</th><th>Reação</th><th>CD</th><th>PV L/S/E/C</th><th>Dano L/S/E/C</th><th>Ações S/E/C</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
}

/* =========================================================
   ABAS
   ========================================================= */
function abrirAba(nome) {
  $$('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
  $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === 'aba-' + nome));
  if (nome === 'arvores') renderArvore();
  if (nome === 'ficha') renderFicha();
  try { sessionStorage.setItem('despertar.aba', nome); } catch (e) { }
  window.scrollTo({ top: 0 });
}

/* =========================================================
   HABILIDADES — detalhe e ações (usado em árvore e ficha)
   ========================================================= */
function habDetalheHTML(id) {
  const h = HAB[id]; const p = P(); const x = possui(p, id); const reqs = checarReq(h, p);
  const custo = custoProximo(id, p); const disp = phDisp(p);
  let efs = '';
  if (x) {
    efs += efeitosHTML(inverter(prever(p, c => { c.habs = c.habs.filter(y => y.id !== id); })), `Efeito atual na ficha (nv${x.nv})`);
    if (x.nv < 5) efs += efeitosHTML(prever(p, c => { possui(c, id).nv++; }), `Ao evoluir para nv${x.nv + 1}`);
  } else efs += efeitosHTML(prever(p, c => { c.habs.push({ id, nv: 1, gratis: true }); }), 'Ao adquirir');
  let bts = '';
  if (!x) {
    bts += `<button class="btn btn-ok" data-hacao="comprar" ${!reqs.every(r => r.ok) || disp < custo ? 'disabled' : ''}>Adquirir (${custo} PH)</button>`;
    bts += `<button class="btn btn-sec" data-hacao="gratis" title="Recebida pela Avaliação do Sistema, Pergaminho ou Missão">Receber grátis</button>`;
  } else {
    if (x.nv < 5) bts += `<button class="btn btn-ok" data-hacao="subir" ${disp < custo ? 'disabled' : ''}>Evoluir para nv${x.nv + 1} (${custo} PH)</button>`;
    bts += `<button class="btn btn-sec" data-hacao="descer">${x.nv > 1 ? 'Reduzir nível' : 'Remover da ficha'}</button>`;
  }
  return habCard(h) + efs + `<div class="det-status">${x ? `<b>Na ficha "${esc(p.nome)}": nível ${x.nv}${x.gratis ? ' (aquisição grátis)' : ''}</b><br>` : ''}
    ${reqs.map(r => `<span class="${r.ok ? 'ok' : 'no-ok'}">${r.ok ? '✓' : '✗'} ${esc(r.txt)}</span>`).join('<br>')}<br><span class="dica">PH disponíveis: ${disp}</span></div>
    <div class="det-acoes" data-hid="${id}">${bts}</div>`;
}
function acaoHab(id, acao) {
  const p = P(); const h = HAB[id]; const x = possui(p, id);
  if (acao === 'comprar') {
    if (!reqOk(h, p)) return toast('Requisitos não cumpridos.');
    if (phDisp(p) < custoAquis(h, p)) return toast('PH insuficientes.');
    p.habs.push({ id, nv: 1, gratis: false }); toast(`[SISTEMA] Habilidade adquirida: ${h.n}`);
  } else if (acao === 'gratis') {
    if (x) return toast('Você já possui esta habilidade.');
    p.habs.push({ id, nv: 1, gratis: true }); toast(`[SISTEMA] Habilidade recebida: ${h.n}`);
  } else if (acao === 'subir') {
    if (!x || x.nv >= 5) return; if (phDisp(p) < x.nv + 1) return toast('PH insuficientes.');
    x.nv++; toast(`[SISTEMA] ${h.n} alcançou o nível ${x.nv}!`);
  } else if (acao === 'descer') {
    if (!x) return; if (x.nv > 1) x.nv--; else p.habs = p.habs.filter(y => y.id !== id);
  }
  salvar();
}

/* =========================================================
   ÁRVORES
   ========================================================= */
let arvAtual = ARVORES[0].id, habSel = null;
function renderArvore() {
  const p = P(); const a = ARV[arvAtual]; const afin = afinidades(p);
  $('#arv-lista').innerHTML = ARVORES.map(z => `<button class="arv-btn ${z.id === arvAtual ? 'ativo' : ''}" style="--cor:${z.cor}" data-arv="${z.id}">${z.icone} ${z.nome}</button>`).join('');
  $('#arv-pers').innerHTML = `Ficha: <b>${esc(p.nome)}</b> · Nível ${p.nivel} · PH: <b>${phDisp(p)}</b>`;
  let html = `<h2 class="arv-titulo" style="color:${a.cor}">${a.icone} ${a.nome} <span class="tag">${a.atr}</span>${afin.includes(a.id) ? '<span class="tag" style="color:var(--ouro)">★ Afinidade (−1 PH)</span>' : ''}</h2>
    <p class="arv-sub">${a.desc}</p><div class="legenda"><span class="l-pos">Possui</span><span class="l-disp">Requisitos cumpridos</span><span class="l-bloq">Bloqueada</span></div>`;
  for (const r of RANK_ORDEM) {
    const hs = HABILIDADES.filter(h => h.t === a.id && h.r === r); if (!hs.length) continue;
    html += `<div class="arv-linha"><div class="arv-rank"><span class="rk rk-${r}">${r}</span>Nv ${RANKS[r].nivel}+<br>${RANKS[r].custo} PH</div><div class="arv-nos">` +
      hs.map(h => { const x = possui(p, h.id); const est = x ? 'possui' : reqOk(h, p) ? 'disponivel' : 'bloqueado';
        return `<div class="no ${est} ${afin.includes(h.t) ? 'afim' : ''} ${habSel === h.id ? 'sel' : ''}" style="--cor:${a.cor}" data-no="${h.id}">
          <div class="no-n">${esc(h.n)}</div><div class="no-t">${h.tipo}${h.pm ? ' · ' + h.pm + ' PM' : ''}</div>
          <div class="no-pips">${[1, 2, 3, 4, 5].map(i => `<i class="${x && x.nv >= i ? 'on' : ''}"></i>`).join('')}</div></div>`; }).join('') + `</div></div>`;
  }
  $('#arv-mapa').innerHTML = html + '<svg class="linhas"></svg>';
  aplicarBusca(); requestAnimationFrame(desenharLinhas);
  $('#arv-detalhe').innerHTML = habSel && HAB[habSel] && HAB[habSel].t === a.id ? habDetalheHTML(habSel) : '<p class="dica">Clique numa habilidade para ver os detalhes, o que ela muda na ficha e comprar.</p>';
}
function desenharLinhas() {
  const mapa = $('#arv-mapa'); const svg = $('svg.linhas', mapa); if (!svg) return;
  const base = mapa.getBoundingClientRect(); svg.setAttribute('width', mapa.scrollWidth); svg.setAttribute('height', mapa.scrollHeight);
  const a = ARV[arvAtual]; let out = '';
  for (const h of HABILIDADES.filter(z => z.t === arvAtual)) {
    const alvo = $(`[data-no="${h.id}"]`, mapa); if (!alvo || alvo.classList.contains('oculto')) continue;
    for (const [pid] of h.pre) {
      const orig = $(`[data-no="${pid}"]`, mapa); if (!orig || orig.classList.contains('oculto')) continue;
      const r1 = orig.getBoundingClientRect(), r2 = alvo.getBoundingClientRect();
      const x1 = r1.left + r1.width / 2 - base.left + mapa.scrollLeft, y1 = r1.bottom - base.top, x2 = r2.left + r2.width / 2 - base.left + mapa.scrollLeft, y2 = r2.top - base.top, my = (y1 + y2) / 2;
      const ativo = habSel && (habSel === h.id || habSel === pid);
      out += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" fill="none" stroke="${a.cor}" stroke-opacity="${ativo ? .95 : .35}" stroke-width="${ativo ? 2.5 : 1.5}" ${h.preAny ? 'stroke-dasharray="5 4"' : ''}/>`;
    }
  }
  svg.innerHTML = out;
}
function aplicarBusca() {
  const q = norm($('#arv-busca').value.trim());
  $$('.no').forEach(n => { const h = HAB[n.dataset.no]; n.classList.toggle('oculto', !!q && !norm(h.n + ' ' + h.ef).includes(q)); });
}

/* =========================================================
   GERADORES
   ========================================================= */
const GENERO = { 'Adaga': 'f', 'Espada Curta': 'f', 'Katana': 'f', 'Espada': 'f', 'Espada Pesada': 'f', 'Machado': 'm', 'Machado Pesado': 'm', 'Lança': 'f', 'Martelo': 'm', 'Martelo Pesado': 'm', 'Manoplas': 'f', 'Foice': 'f', 'Cajado': 'm', 'Arco': 'm', 'Arco Longo': 'm', 'Besta': 'f', 'Facas de Arremesso': 'f', 'Traje de Combate': 'm', 'Couraça de Couro de Besta': 'f', 'Armadura de Placas': 'f', 'Escudo': 'm', 'Anel': 'm', 'Colar': 'm', 'Brinco': 'm', 'Bracelete': 'm', 'Cinto': 'm', 'Manto': 'm', 'Botas': 'f', 'Luvas': 'f' };
const PLURAL = new Set(['Manoplas', 'Facas de Arremesso', 'Botas', 'Luvas']);
function flex(adj, base) {
  const g = GENERO[base] || 'm'; let a = adj;
  if (g === 'm') { if (/ora$/.test(a)) a = a.replace(/ora$/, 'or'); else if (/a$/.test(a)) a = a.replace(/a$/, 'o'); }
  else { if (/o$/.test(a)) a = a.replace(/o$/, 'a'); else if (/or$/.test(a)) a += 'a'; }
  if (PLURAL.has(base)) { if (/[aeiou]$/.test(a)) a += 's'; else if (/il$/.test(a)) a = a.replace(/il$/, 'eis'); else if (/l$/.test(a)) a = a.replace(/l$/, 'is'); else if (/[rz]$/.test(a)) a += 'es'; }
  return a;
}
function rolarConsumivel(rank, bonus) {
  const pesos = [['Poção de Cura', 30], ['Poção de Mana', 20], ['Antídoto', 10], ['Pedra de Retorno', 8], ['Cristal de Mana', 15], ['Pergaminho de Habilidade', 6],
    ['Elixir de Despertar', 2], ['Pó de Purificação', 4], ['Pergaminho de Selo', 5], ['Chave de Instância', 3], ['Núcleo de Chefe', bonus >= 10 ? 6 : 0]];
  let r = Math.random() * pesos.reduce((a, [, w]) => a + w, 0); let nome = pesos[0][0];
  for (const [n, w] of pesos) { if ((r -= w) < 0) { nome = n; break; } }
  const desc = CONSUMIVEIS.find(c => c[0] === nome)[1]; const br = RANKS[rank].br;
  const it = itemBase('consumivel', `${nome} (Rank ${rank})`, { rank, linhas: [desc], X: 1 + br });
  if (nome === 'Poção de Cura') { it.linhas = [`Recupera ${2 + 2 * br}d8 PV.`]; it.usoDado = `${2 + 2 * br}d8`; it.usoAlvo = 'pv'; }
  if (nome === 'Poção de Mana') { it.linhas = [`Recupera ${2 + 2 * br}d6 PM.`]; it.usoDado = `${2 + 2 * br}d6`; it.usoAlvo = 'pm'; }
  if (nome === 'Cristal de Mana') it.qtd = d(6);
  if (nome === 'Pergaminho de Habilidade') { const h = pick(HABILIDADES.filter(x => x.r === rank)); it.nome = `Pergaminho: ${h.n}`; it.linhas = [`Ensina ${h.n} (${ARV[h.t].nome}, Rank ${rank}) sem custo de aquisição.`]; it.ensina = h.id; }
  if (nome === 'Elixir de Despertar') { it.rar = 'Épico'; it.cor = '#b06cff'; }
  if (nome === 'Núcleo de Chefe' || nome === 'Chave de Instância') { it.rar = 'Raro'; it.cor = '#4aa8ff'; }
  const naoVende = ['Pergaminho de Habilidade', 'Elixir de Despertar', 'Núcleo de Chefe', 'Chave de Instância'].includes(nome);
  it.preco = naoVende ? null : Math.round(PRECO_BASE[rank] / 5) * (it.qtd || 1);
  return it;
}
function gerarItem(rank, tipo, bonus) {
  if (tipo === 'aleatorio') { const t = d(20); tipo = t <= 8 ? 'arma' : t <= 11 ? 'armadura' : t === 12 ? 'escudo' : t <= 15 ? 'acessorio' : 'consumivel'; }
  if (tipo === 'consumivel') return rolarConsumivel(rank, bonus);
  const br = RANKS[rank].br; const X = 1 + br; const v = d(100) + bonus;
  const r = RARIDADES.find(z => v >= z.min && v <= z.max) || RARIDADES[RARIDADES.length - 1];
  let it;
  if (tipo === 'arma') { it = armaComum(pick(ARMAS).n, rank); if (br) it.linhas.push(`Bônus de Rank: +${br} no ataque e +${2 * br} no dano.`); }
  else if (tipo === 'armadura') it = armaduraComum(pick(ARMADURAS).tipo, rank);
  else if (tipo === 'escudo') it = itemBase('escudo', 'Escudo', { base: 'Escudo', rank, reqAtr: 'FOR', linhas: [`Escudo · Defender +${2 + br} · RD ${br} · ocupa uma mão`] });
  else { const b = pick(ACESSORIOS); it = itemBase('acessorio', b, { base: b, rank, linhas: ['Acessório (até 4 equipados)'] }); }
  Object.assign(it, { rar: r.n, cor: r.cor, rolRar: v, X });
  const cat = tipo === 'arma' ? 'arma' : tipo === 'acessorio' ? 'acessorio' : 'armadura';
  const afx = shuffle(AFIXOS[cat]).slice(0, r.afx + (tipo === 'acessorio' ? 1 : 0));
  const fx = t => t.replace(/Xd(\d+)/g, `${X}d$1`).replace(/(\d+)X/g, (m0, k) => String(Number(k) * X)).replace(/\bX\b/g, String(X));
  it.afixos = afx.map(([p, s, t]) => ({ n: p, s, t: fx(t) }));
  it.selos = shuffle(SELOS).slice(0, r.selos).map(([n, t]) => ({ n, t: fx(t) }));
  const base = it.base;
  if (r.n === 'Relíquia') { it.nome = `${base} ${pick(NOMES_RELIQUIA)}`; it.linhas.push('Relíquia: usa sempre o Rank do portador. Possui uma Vontade (definida pelo Mestre).'); }
  else if (afx.length === 1) it.nome = `${base} ${flex(afx[0][0], base)}`;
  else if (afx.length >= 2) it.nome = `${base} ${flex(afx[0][0], base)} ${afx[1][1]}`;
  if (it.reqAtr && br) it.linhas.push(`Requisito: ${it.reqAtr} ${10 + 4 * br}`);
  it.preco = PRECO_BASE[rank] * r.mult;
  return it;
}
let itensMestre = [];
function gerarItensMestre() {
  const rk = $('#s-item-rank').value, tp = $('#s-item-tipo').value, bn = Number($('#s-item-bonus').value), q = Math.max(1, Math.min(10, Number($('#s-item-qtd').value) || 1));
  itensMestre = Array.from({ length: q }, () => gerarItem(rk, tp, bn));
  $('#o-item').innerHTML = itensMestre.map((it, i) => itemCard(it, `<div class="acoes"><button class="btn mini btn-sec" data-mestre-add="${i}">+ Mochila de ${esc(P().nome)}</button></div>`)).join('');
}
const janela = (titulo, corpo) => `<div class="res"><div class="res-t">[ ${titulo} ]</div>${corpo}</div>`;
function tabelaAmeacas(linhas) {
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Ameaça</th><th>PV</th><th>Atq</th><th>Reação</th><th>Dano</th><th>Ações</th><th>RD</th><th>CD</th></tr></thead><tbody>${linhas.map(([rot, c, l]) => {
    const s = statsAmeaca(l, c); return `<tr><th>${rot}</th><td>${s.pv}</td><td>+${s.atk}</td><td>+${s.reac}${c === 'Lacaio' ? ' / ' + s.defFixa : ''}</td><td>${s.dano}</td><td>${s.acoes}</td><td>${s.rd}</td><td>${s.cd}</td></tr>`; }).join('')}</tbody></table></div>`;
}
function gerarPortal() {
  let rk = $('#s-portal-rank').value, rolRk = null;
  if (!rk) { rolRk = d(100); rk = PORTAL_RANK.find(r => rolRk <= r.max).r; }
  const td = d(20); const tipo = PORTAL_TIPO.find(t => td <= t.max); let nota = '';
  if (tipo.n === 'Portal Instável') { const v2 = d(100); const r2 = PORTAL_RANK.find(r => v2 <= r.max).r; if (RANK_ORDEM.indexOf(r2) > RANK_ORDEM.indexOf(rk)) { nota = ` (medido como ${rk}, real: ${r2})`; rk = r2; } else nota = ' (a segunda rolagem não superou)'; }
  const [lo, hi] = PORTAL_NIVEL[rk]; const L = lo + Math.floor(Math.random() * (hi - lo + 1)); const LB = L + 2;
  const cri = pick(PORTAL_CRIATURAS); const chefe = `${pick(CHEFE_TITULO)} ${pick(CHEFE_EPITETO)}`;
  const xp = Math.round(5 * LB * tipo.xp), ouro = 4 * PRECO_BASE[rk];
  $('#o-portal').innerHTML = janela('PORTAL DETECTADO', `<p class="res-g"><span class="rk rk-${rk}">${rk}</span> ${tipo.n}${nota}</p><p>${tipo.d}</p>
    ${tipo.n === 'Ruptura Iminente' ? `<p><b>Prazo até a ruptura:</b> ${d(6) * 4} horas.</p>` : ''}
    <p><b>Ambiente:</b> ${pick(PORTAL_AMBIENTE)}${rolRk ? ` <span class="dica">(d100 = ${rolRk})</span>` : ''}</p>
    <p><b>Criaturas:</b> ${cri[0]}, ${cri[1]}. Nível ${L}.</p>
    <p><b>Chefe:</b> ${chefe} (${cri[0]}), nível ${LB}. Segunda fase aos 50% dos PV.</p>
    <p><b>Complicação:</b> ${pick(PORTAL_COMPLICACAO)}</p>
    ${tabelaAmeacas([[`Lacaio (nv ${L})`, 'Lacaio', L], [`Soldado (nv ${L})`, 'Soldado', L], [`Elite (nv ${L + 1})`, 'Elite', L + 1], [`Chefe (nv ${LB})`, 'Chefe', LB]])}
    <p><b>Recompensas:</b> ${xp} XP por Jogador · ${ouro.toLocaleString('pt-BR')} Ouro por Jogador · 1 item por Elite, 2 itens do Chefe (raridade +${10 + tipo.raridade}).</p>
    <div class="acoes"><button class="btn mini" data-portal-loot="${rk}|${10 + tipo.raridade}">Gerar saque do Chefe</button></div>`);
}
function gerarEncontro() {
  const N = Math.max(1, Number($('#s-enc-nivel').value) || 1), q = Math.max(1, Number($('#s-enc-qtd').value) || 4), dif = $('#s-enc-dif').value;
  const cri = pick(PORTAL_CRIATURAS); const grupos = clone(ENCONTROS[dif]);
  const ultimo = grupos[grupos.length - 1]; ultimo[2] = Math.max(1, ultimo[2] + (q - 4));
  const linhas = grupos.map(([c, mais, qt]) => [`${qt}× ${c} (nv ${N + mais})`, c, N + mais]);
  $('#o-enc').innerHTML = janela(`ENCONTRO ${dif.toUpperCase()}`, `<p><b>${cri[0]}</b>, ${cri[1]}.${dif === 'Chefe' ? ` Chefe: <b>${pick(CHEFE_TITULO)} ${pick(CHEFE_EPITETO)}</b>.` : ''}</p>${tabelaAmeacas(linhas)}`);
}
function rolarDado(exp) {
  const r = rolarExp(exp); const o = $('#o-dado');
  if (!r) { o.innerHTML = janela('ERRO', '<p>Expressão inválida. Use algo como 2d6+3.</p>'); return; }
  rolarDado.h = [`<div class="dados-hist">${esc(exp)} → <b>${r.total}</b> <span class="dica">${esc(r.txt)}</span></div>`, ...(rolarDado.h || [])].slice(0, 8);
  o.innerHTML = janela('ROLAGEM', rolarDado.h.join(''));
}

/* =========================================================
   FICHA
   ========================================================= */
const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
const campo = (rot, html, cls = '') => `<label class="campo ${cls}"><span title="${esc(rot)}">${esc(rot)}</span>${html}</label>`;
const txt = (path, ph = '') => `<input type="text" data-bind="${path}" value="${esc(getPath(P(), path) ?? '')}" placeholder="${esc(ph)}">`;
const sel = (path, opcoes) => `<select data-bind="${path}">${opcoes.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(getPath(P(), path)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
let prevFlat = null;

function renderFicha() {
  const p = P(); const c = computar(p);
  $('#f-nome-atual').textContent = `${p.nome || 'Sem nome'} · nv ${p.nivel}`;
  const despSel = selBusca({ valor: p.despertar.id, placeholder: 'Escolher Despertar…',
    opcoes: [{ v: '', l: '— nenhum —' }, ...DESPERTARES.map(x => ({ v: x.id, l: x.n, s: `${faixa(x)} · ${x.rar}` }))],
    onChange: v => { p.despertar = { id: v, nv: 1 }; salvar(); renderFicha(); } });
  const titSel = selBusca({ valor: p.titulo, placeholder: 'Nenhum',
    opcoes: [{ v: '', l: '— nenhum —' }, ...TITULOS.map(t => ({ v: t.id, l: t.n, s: t.txt }))],
    onChange: v => { p.titulo = v; salvar(); renderFichaDinamico(); } });
  $('#ficha').innerHTML = `
  <div class="f-bloco s8"><h3>JANELA DE STATUS <span class="extra" id="f-rank"></span></h3>
    <div class="campos">
      ${campo('Nome', txt('nome'), 'largo')}
      ${campo('Jogador(a)', txt('jogador'))}
      ${campo('Antes do despertar', txt('conceito', 'ex.: estudante'))}
      ${campo('Motivo', txt('motivo', 'por que caça?'))}
      ${campo('Nível', numInp('nivel', p.nivel, { min: 1, max: 60 }))}
      <div class="campo"><span>XP</span>${numInp('xp', p.xp, { min: 0 })}<div class="mini-barra"><i id="f-xp-b"></i></div><div class="mini-info" id="f-xp-i"></div></div>
      ${campo('Potencial', sel('potencial', ['Fraco', 'Normal', 'Forte']))}
      ${campo('Rank oficial', sel('rankOficial', RANK_ORDEM))}
      ${campo('Ouro', numInp('ouro', p.ouro, { min: 0 }))}
      ${campo('Título equipado', titSel)}
    </div>
  </div>
  <div class="f-bloco s4"><h3>DESPERTAR <span class="extra" id="f-desp-ctl"></span></h3>
    ${despSel}<div id="f-desp"></div>
  </div>

  <div class="f-bloco s5"><h3>ATRIBUTOS <span class="extra status-livre">Pontos livres ${numInp('statusPend', p.statusPend, { min: 0, cls: 'mini' })}</span></h3>
    <div class="f-atribs">${ATRIBUTOS.map(a => `<div class="f-atr"><span class="sigla">${a.id}</span><span class="nome">${a.nome}</span>
      ${numInp('atr.' + a.id, p.atr[a.id], { min: 1 })}<div class="mod" data-stat="${a.id}" data-roll="${a.nome}" id="f-mod-${a.id}"></div><div class="bon" id="f-bon-${a.id}"></div></div>`).join('')}</div>
    <p class="dica" style="margin:8px 0 0">Clique no modificador para rolar um teste do atributo.</p>
  </div>
  <div class="f-bloco s7"><h3>COMBATE <span class="extra dica">Clique num valor para rolar</span></h3>
    <div class="recurso"><span class="rot" id="f-pv-rot">PV</span><div class="barra"><i id="f-pv-b"></i><span id="f-pv-t"></span></div>
      <div class="rec-ctl"><button class="btn mini btn-sec" data-act="rec" data-k="pv" data-v="-5">−5</button>${numInp('', 0, { id: 'f-pv', cls: 'mini' })}<button class="btn mini btn-sec" data-act="rec" data-k="pv" data-v="5">+5</button><button class="btn mini btn-sec" data-act="rec" data-k="pv" data-v="max" title="Restaurar">⟲</button></div></div>
    <div class="recurso"><span class="rot" id="f-pm-rot">PM</span><div class="barra pm"><i id="f-pm-b"></i><span id="f-pm-t"></span></div>
      <div class="rec-ctl"><button class="btn mini btn-sec" data-act="rec" data-k="pm" data-v="-5">−5</button>${numInp('', 0, { id: 'f-pm', cls: 'mini' })}<button class="btn mini btn-sec" data-act="rec" data-k="pm" data-v="5">+5</button><button class="btn mini btn-sec" data-act="rec" data-k="pm" data-v="max" title="Restaurar">⟲</button></div></div>
    <div class="f-deriv" id="f-deriv"></div>
    <h3 style="margin:14px 0 8px;font-size:15px;color:var(--brilho2);letter-spacing:.1em">ATAQUES</h3>
    <div class="ataques" id="f-ataques"></div>
  </div>

  <div class="f-bloco s7"><h3>HABILIDADES <span class="extra ph-resumo" id="f-ph"></span></h3>
    <div class="campos" style="margin-bottom:10px">
      ${campo('PH de subidas de nível', numInp('phNiveis', p.phNiveis, { min: 0 }))}
      ${campo('PH extras (missões)', numInp('phExtra', p.phExtra))}
    </div>
    <div class="lista-f" id="f-habs"></div>
    <div class="f-rodape"><button class="btn mini" data-act="hab-add">＋ Adicionar habilidade</button><button class="btn mini btn-sec" data-act="ir" data-aba="arvores">Ver Árvores</button></div>
  </div>
  <div class="f-bloco s5"><h3>PERÍCIAS <span class="extra" id="f-per-res"></span></h3>
    <div class="f-pericias">${PERICIAS.map(pc => `<div class="f-per" id="f-per-${norm(pc.n).replace(/\s/g, '')}"><span class="n">${pc.n} <small>${pc.a}</small></span>
      ${numInp('pericias.' + pc.n, p.pericias[pc.n] || 0, { min: 0, max: c.periciaMax, cls: 'mini' })}<span class="t" data-stat="Perícia ${pc.n}" data-roll="${pc.n}"></span></div>`).join('')}</div>
  </div>

  <div class="f-bloco"><h3>INVENTÁRIO <span class="extra"><span id="f-inv-res"></span><button class="btn mini" data-modal="item">⚒ Gerar item</button><button class="btn mini btn-sec" data-act="item-custom">＋ Item próprio</button></span></h3>
    <div id="f-itens"></div>
  </div>

  <div class="f-bloco s6"><h3>CONDIÇÕES ATIVAS</h3><textarea data-bind="condicoes" placeholder="Ex.: Envenenado (1d6, 2 rodadas)">${esc(p.condicoes)}</textarea></div>
  <div class="f-bloco s6"><h3>NOTAS</h3><textarea data-bind="notas" placeholder="Guilda, contatos, missões do Sistema…">${esc(p.notas)}</textarea></div>
  <div class="f-bloco"><details><summary><b style="color:var(--brilho2);letter-spacing:.1em;font-family:var(--fonte-t)">BÔNUS MANUAIS</b> <span class="dica">· efeitos de habilidades ativas, condições ou do Mestre</span></summary>
    <div class="campos" style="margin-top:10px">${[['pv', 'PV máx'], ['pm', 'PM máx'], ['def', 'Defender'], ['esq', 'Esquivar'], ['atk', 'Ataque'], ['dano', 'Dano'], ['rd', 'RD'], ['desl', 'Deslocamento'], ['ini', 'Iniciativa']]
      .map(([k, n]) => campo(n, numInp('bonus.' + k, p.bonus[k]))).join('')}</div>
    <p class="dica">Passivas, Despertar, Título e itens equipados já são somados sozinhos. Use estes campos só para o resto.</p></details></div>`;
  renderFichaDinamico();
}
function stat(k, v, s = '', roll = null) {
  return `<div class="stat ${roll != null ? 'rolavel' : ''}" ${roll != null ? `data-roll="${esc(k)}" data-bonus="${roll}"` : ''} data-stat="${esc(k)}"><span class="k">${esc(k)}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
}
function renderFichaDinamico() {
  const p = P(); const c = computar(p); if (!$('#f-deriv')) return;
  $('#f-nome-atual').textContent = `${p.nome || 'Sem nome'} · nv ${p.nivel}`;
  $('#f-rank').innerHTML = `Rank <span class="rk rk-${c.rank}">${c.rank}</span>`;
  const xpPct = Math.min(100, (Number(p.xp) || 0) / c.xpProx * 100);
  $('#f-xp-b').style.width = xpPct + '%';
  $('#f-xp-i').textContent = Number(p.xp) >= c.xpProx ? `pronto para o nível ${c.n + 1}!` : `${p.xp || 0} / ${c.xpProx} para o nível ${c.n + 1}`;
  ATRIBUTOS.forEach(a => {
    const el = $('#f-mod-' + a.id); el.textContent = sinal(c.m[a.id]); el.dataset.bonus = c.m[a.id];
    const extra = c.atr[a.id] - Number(p.atr[a.id] || 0); $('#f-bon-' + a.id).textContent = extra ? `${sinal(extra)} itens = ${fmt(c.atr[a.id])}` : '';
  });
  // recursos
  const pv = p.pvAtual == null ? c.pvMax : p.pvAtual, pm = p.pmAtual == null ? c.pmMax : p.pmAtual;
  const fpv = $('#f-pv'), fpm = $('#f-pm');
  if (document.activeElement !== fpv) fpv.value = pv; if (document.activeElement !== fpm) fpm.value = pm;
  $('#f-pv-t').textContent = `${pv} / ${c.pvMax}`; $('#f-pm-t').textContent = `${pm} / ${c.pmMax}`;
  $('#f-pv-b').style.width = Math.max(0, Math.min(100, pv / c.pvMax * 100)) + '%';
  $('#f-pv-b').style.background = pv <= 0 ? 'var(--perigo)' : pv <= c.pvMax / 2 ? 'var(--ouro)' : 'var(--ok)';
  $('#f-pm-b').style.width = Math.max(0, Math.min(100, pm / c.pmMax * 100)) + '%';
  const estado = pv <= -c.pvMax ? 'MORTO' : pv <= 0 ? 'Incapacitado' : '';
  $('#f-deriv').innerHTML = [
    stat('PV máx', c.pvMax), stat('PM máx', c.pmMax), stat('Deslocamento', fmt(c.desl) + ' m', `Corrida ${fmt(c.desl * 4)} m`), stat('Ações Principais', c.acoes),
    stat('Iniciativa', sinal(c.ini), '', c.ini), stat('Defender', sinal(c.def), '', c.def), stat('Esquivar', sinal(c.esq), '', c.esq),
    stat('Defesa Passiva', c.defPassiva), stat('RD', c.rd),
    ...ATRIBUTOS.map(a => stat('Resist. ' + a.id, sinal(c.res[a.id]), `CD ${a.id} ${c.cd[a.id]}`, c.res[a.id])),
    estado ? `<div class="stat"><span class="k">Estado</span><span class="v estado">${estado}</span></div>` : ''
  ].join('');
  $('#f-ataques').innerHTML = c.ataques.map(a => `<div class="ataque"><span class="n">${esc(a.nome)} <small>${a.dist ? 'distância' : 'corpo a corpo'}</small></span>
    <span class="b" data-roll="Ataque · ${esc(a.nome)}" data-bonus="${a.atk}" data-stat="Ataque · ${esc(a.nome)}" title="Rolar ataque">d20${sinal(a.atk)}</span>
    <span class="b" data-dano="${esc(a.dado + (a.bonus ? (a.bonus > 0 ? '+' : '') + a.bonus : ''))}" data-nome="${esc(a.nome)}" data-stat="Dano · ${esc(a.nome)}" title="Rolar dano">${a.dado}${a.bonus ? sinal(a.bonus) : ''}${a.extra ? ' ' + esc(a.extra) : ''}</span></div>`).join('');
  // perícias
  let gasto = 0;
  PERICIAS.forEach(pc => { const g = Number(p.pericias[pc.n] || 0); gasto += g; const row = $('#f-per-' + norm(pc.n).replace(/\s/g, ''));
    if (!row) return; row.classList.toggle('zero', g === 0); const t = $('.t', row); t.textContent = sinal(c.per[pc.n]); t.dataset.bonus = c.per[pc.n];
    const inp = $('input', row); if (inp) inp.max = c.periciaMax; });
  $('#f-per-res').innerHTML = `<span class="${gasto > c.periciaTotal ? 'no-ok' : ''}">${gasto} / ${c.periciaTotal} pontos</span> · máx ${c.periciaMax}`;
  // PH
  const rec = phRecebidos(p), gas = phGasto(p);
  $('#f-ph').innerHTML = `PH ${gas} / ${rec} · disponíveis <b>${rec - gas}</b>`;
  // despertar
  const dsp = DESP[p.despertar.id];
  $('#f-desp-ctl').innerHTML = dsp ? `<span class="nv-ctl"><button class="btn-ghost" data-act="desp" data-v="-1" aria-label="Reduzir">−</button><b>nv ${p.despertar.nv}</b><button class="btn-ghost" data-act="desp" data-v="1" aria-label="Aumentar">+</button></span><button class="btn mini btn-sec" data-act="desp-info">Detalhes</button>` : '';
  $('#f-desp').innerHTML = dsp ? `<div class="dica" style="margin-top:8px"><span style="color:${RARIDADE_DESPERTAR[dsp.rar].cor}">${dsp.rar}</span> · Afinidades: ${dsp.afin.map(a => ARV[a].nome).join(', ')} · níveis grátis por Rank: ${despGratis(p)}</div>
    <p style="font-size:13px;margin:6px 0"><b>Efeito:</b> ${esc(dsp.ef)}</p><p style="font-size:13px;margin:6px 0"><b>Por nível:</b> ${esc(dsp.esc)}</p>
    ${p.despertar.nv >= 3 ? `<p style="font-size:13px;margin:6px 0"><b>Nv3:</b> ${esc(dsp.m3)}</p>` : ''}${p.despertar.nv >= 5 ? `<p style="font-size:13px;margin:6px 0"><b>Nv5:</b> ${esc(dsp.m5)}</p>` : ''}
    ${p.despertar.nv >= 5 && c.n >= 20 ? `<p class="forma" style="font-size:13px"><b>Forma Evoluída:</b> ${esc(dsp.forma)}</p>` : ''}` : '<p class="dica">Sem Despertar. Use o botão <b>✦ Despertar</b> no topo para rolar, ou escolha acima.</p>';
  // habilidades
  const ordem = p.habs.filter(x => HAB[x.id]).sort((a, b) => RANK_ORDEM.indexOf(HAB[a.id].r) - RANK_ORDEM.indexOf(HAB[b.id].r) || HAB[a.id].t.localeCompare(HAB[b.id].t));
  $('#f-habs').innerHTML = ordem.length ? ordem.map(x => { const h = HAB[x.id]; const a = ARV[h.t];
    return `<div class="lin"><span class="rk rk-${h.r}">${h.r}</span>
      <span class="meio" data-act="hab-info" data-id="${x.id}" title="Ver detalhes"><span class="t1" style="color:${a.cor}">${a.icone} ${esc(h.n)}</span><span class="t2">${h.tipo}${h.acao !== '—' ? ' · ' + h.acao : ''}${h.pm ? ' · ' + h.pm + ' PM' : ''}${x.gratis ? ' · grátis' : ''} — ${esc(h.ef)}</span></span>
      <span class="dir nv-ctl"><button class="btn-ghost" data-act="hab-menos" data-id="${x.id}" aria-label="Reduzir">−</button><b>nv${x.nv}</b><button class="btn-ghost" data-act="hab-mais" data-id="${x.id}" ${x.nv >= 5 ? 'disabled' : ''} aria-label="Evoluir">+</button><button class="btn-ghost" data-act="hab-info" data-id="${x.id}" aria-label="Detalhes">ⓘ</button></span></div>`; }).join('')
    : '<p class="vazio-msg">Nenhuma habilidade. Use <b>◈ Avaliação</b> no topo ou <b>＋ Adicionar habilidade</b>.</p>';
  // inventário
  renderInventario(p);
  // indicadores de mudança
  const flat = achatar(c); flat['PV atual'] = pv; flat['PM atual'] = pm;
  if (prevFlat) {
    const mud = diferenca(prevFlat, flat);
    const alvoMap = { 'PV atual': '#f-pv-rot', 'PM atual': '#f-pm-rot' };
    $$('#f-pv-rot .delta, #f-pm-rot .delta').forEach(x => x.parentNode.removeChild(x));
    mud.forEach(m => {
      const els = alvoMap[m.k] ? [$(alvoMap[m.k])] : $$(`[data-stat="${CSS.escape(m.k)}"]`);
      const keys = m.k === 'Resistências' ? ATRIBUTOS.map(a => 'Resist. ' + a.id) : null;
      const alvos = keys ? keys.flatMap(k => $$(`[data-stat="${CSS.escape(k)}"]`)) : els;
      alvos.forEach(el => { if (!el) return; const tgt = $('.v', el) || el; tgt.insertAdjacentHTML('beforeend', `<span class="delta ${m.up ? 'up' : 'down'}">${m.up ? '▲' : '▼'}${m.d != null ? fmt(Math.abs(m.d)) : ''}</span>`); });
    });
  }
  prevFlat = flat;
}
function renderInventario(p) {
  const eq = p.itens.filter(i => i.equip), mo = p.itens.filter(i => !i.equip);
  const linha = it => `<div class="lin" style="--cor:${it.cor}"><span class="icone-item">${ICONE_CAT[it.cat] || '✦'}</span>
    <span class="meio" data-act="item-info" data-uid="${it.uid}"><span class="t1" style="color:${it.cor}">${esc(it.nome)}${it.qtd > 1 ? ' ×' + it.qtd : ''}</span>
    <span class="t2">${it.rar} · Rank ${it.rank}${it.refino ? ' · +' + it.refino : ''}${it.afixos.length ? ' · ' + it.afixos.map(a => a.n).join(', ') : ''}${it.linhas[0] ? ' — ' + esc(it.linhas[0]) : ''}</span></span>
    <span class="dir">${['arma', 'armadura', 'escudo', 'acessorio'].includes(it.cat) ? `<button class="btn mini ${it.equip ? 'btn-ok' : 'btn-sec'}" data-act="item-equip" data-uid="${it.uid}">${it.equip ? 'Equipado' : 'Equipar'}</button>` : it.usoDado || it.ensina ? `<button class="btn mini btn-sec" data-act="item-usar" data-uid="${it.uid}">Usar</button>` : ''}
    <button class="btn-ghost" data-act="item-info" data-uid="${it.uid}" aria-label="Detalhes">ⓘ</button></span></div>`;
  $('#f-inv-res').textContent = `${p.itens.length} itens`;
  $('#f-itens').innerHTML = (eq.length ? `<div class="inv-grupo">Equipados</div><div class="lista-f">${eq.map(linha).join('')}</div>` : '') +
    `<div class="inv-grupo">Mochila (Inventário do Sistema)</div>` + (mo.length ? `<div class="lista-f">${mo.map(linha).join('')}</div>` : '<p class="vazio-msg">Vazia.</p>');
}

/* ---------- equipar ---------- */
function equiparMut(p, uid_, ligar = true) {
  const it = p.itens.find(i => i.uid === uid_); if (!it) return;
  if (!ligar) { it.equip = false; return; }
  const limite = { arma: 2, armadura: 1, escudo: 1, acessorio: 4 }[it.cat]; if (!limite) return;
  const mesmos = p.itens.filter(i => i.equip && i.cat === it.cat && i.uid !== it.uid);
  while (mesmos.length >= limite) mesmos.shift().equip = false;
  it.equip = true;
}

/* ---------- modais da ficha ---------- */
function modalHab(id, voltar) {
  const corpo = abrirModal(HAB[id].n, habDetalheHTML(id), voltar ? [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: voltar }] : [], { aoFechar: renderFichaDinamico });
  corpo.onclick = e => { const b = e.target.closest('[data-hacao]'); if (!b) return; acaoHab(id, b.dataset.hacao); corpo.innerHTML = habDetalheHTML(id); renderFichaDinamico(); };
}
function modalAddHab() {
  const p = P();
  const corpo = abrirModal('Adicionar habilidade', `<div class="modal-filtros">
      <input type="search" id="mh-q" placeholder="Buscar por nome ou efeito…">
      <select id="mh-arv"><option value="">Todas as árvores</option>${ARVORES.map(a => `<option value="${a.id}">${a.icone} ${a.nome}</option>`).join('')}</select>
      <select id="mh-rk"><option value="">Todos os Ranks</option>${RANK_ORDEM.map(r => `<option>${r}</option>`).join('')}</select>
      <label><input type="checkbox" id="mh-disp" checked> só disponíveis</label></div><div class="lista-f" id="mh-lista"></div>`, [], { largo: true, aoFechar: renderFichaDinamico });
  const desenhar = () => {
    const q = norm($('#mh-q').value.trim()), arv = $('#mh-arv').value, rk = $('#mh-rk').value, so = $('#mh-disp').checked;
    const lista = HABILIDADES.filter(h => !possui(p, h.id) && (!arv || h.t === arv) && (!rk || h.r === rk) && (!q || norm(h.n + ' ' + h.ef).includes(q)) && (!so || reqOk(h, p)));
    $('#mh-lista').innerHTML = lista.length ? lista.map(h => { const a = ARV[h.t]; const ok = reqOk(h, p);
      return `<div class="lin"><span class="rk rk-${h.r}">${h.r}</span><span class="meio" data-ver="${h.id}"><span class="t1" style="color:${a.cor}">${a.icone} ${esc(h.n)}</span><span class="t2">${a.nome} · ${h.tipo} — ${esc(h.ef)}</span></span>
        <span class="dir"><span class="dica">${custoAquis(h, p)} PH</span><button class="btn mini ${ok ? 'btn-ok' : 'btn-sec'}" data-ver="${h.id}">${ok ? 'Ver' : 'Ver'}</button></span></div>`; }).join('')
      : '<p class="vazio-msg">Nenhuma habilidade com esses filtros. Desmarque "só disponíveis" para ver todas.</p>';
  };
  ['mh-q', 'mh-arv', 'mh-rk', 'mh-disp'].forEach(i => $('#' + i).addEventListener('input', desenhar));
  corpo.onclick = e => { const v = e.target.closest('[data-ver]'); if (v) modalHab(v.dataset.ver, modalAddHab); };
  desenhar(); $('#mh-q').focus();
}
function modalItem(uid_) {
  const p = P(); const it = p.itens.find(i => i.uid === uid_); if (!it) return;
  const equipavel = ['arma', 'armadura', 'escudo', 'acessorio'].includes(it.cat);
  const montar = () => {
    let efs = '';
    if (equipavel) efs = it.equip ? efeitosHTML(inverter(prever(p, c => equiparMut(c, uid_, false))), 'Efeito atual na ficha')
      : efeitosHTML(prever(p, c => equiparMut(c, uid_, true)), 'Ao equipar (substitui o que estiver no lugar)');
    const { semReq } = brItem(it, p);
    const ctl = `<div class="campos" style="margin-top:12px">
      ${['arma', 'armadura', 'escudo'].includes(it.cat) ? campo('Refino', numInp('', it.refino || 0, { min: 0, max: 10, id: 'mi-ref' })) : ''}
      ${it.selos.length ? campo('Sincronia', numInp('', it.sinc || 0, { min: 0, id: 'mi-sinc' })) : ''}
      ${it.cat === 'consumivel' || it.qtd ? campo('Quantidade', numInp('', it.qtd || 1, { min: 1, id: 'mi-qtd' })) : ''}</div>`;
    return itemCard(it) + (semReq ? `<p class="no-ok" style="font-size:13px">Você não cumpre o requisito: o item funciona como Rank E.</p>` : '') + efs + ctl;
  };
  const corpo = abrirModal(it.nome, montar(), [
    { label: 'Descartar', cls: 'btn-perigo', onClick: () => { if (!confirm(`Descartar "${it.nome}"?`)) return false; p.itens = p.itens.filter(i => i.uid !== uid_); salvar(); } },
    ...(it.usoDado || it.ensina ? [{ label: 'Usar', cls: 'btn-sec', onClick: () => usarItem(uid_) }] : []),
    ...(equipavel ? [{ label: it.equip ? 'Desequipar' : 'Equipar', cls: it.equip ? 'btn-sec' : 'btn-ok', onClick: () => { equiparMut(p, uid_, !it.equip); salvar(); } }] : []),
    { label: 'Fechar', cls: 'btn-sec' }
  ], { aoFechar: renderFichaDinamico });
  corpo.oninput = e => {
    const id = e.target.id; const v = Number(e.target.value) || 0;
    if (id === 'mi-ref') it.refino = Math.max(0, Math.min(10, v)); if (id === 'mi-sinc') it.sinc = Math.max(0, v); if (id === 'mi-qtd') it.qtd = Math.max(1, v);
    salvar();
  };
  corpo.onchange = () => { const y = corpo.scrollTop; corpo.innerHTML = montar(); corpo.scrollTop = y; };
}
function usarItem(uid_) {
  const p = P(); const it = p.itens.find(i => i.uid === uid_); if (!it) return; const c = computar(p);
  if (it.ensina) {
    const h = HAB[it.ensina]; if (possui(p, h.id)) return toast('Você já possui esta habilidade.');
    if (c.n < RANKS[h.r].nivel) return toast(`Requer nível ${RANKS[h.r].nivel}.`);
    p.habs.push({ id: h.id, nv: 1, gratis: true }); toast(`[SISTEMA] Habilidade aprendida: ${h.n}`);
  } else if (it.usoDado) {
    const r = rolarExp(it.usoDado); const k = it.usoAlvo === 'pm' ? 'pmAtual' : 'pvAtual'; const max = it.usoAlvo === 'pm' ? c.pmMax : c.pvMax;
    const cur = p[k] == null ? max : p[k]; p[k] = Math.min(max, cur + r.total);
    mostrarRolagem(it.nome, `+${r.total} ${it.usoAlvo === 'pm' ? 'PM' : 'PV'}`, r.txt);
  }
  if (it.qtd > 1) it.qtd--; else p.itens = p.itens.filter(i => i.uid !== uid_);
  salvar(); renderFichaDinamico();
}
function modalItemProprio() {
  abrirModal('Item próprio', `<div class="campos">
    ${`<label class="campo largo"><span>Nome</span><input type="text" id="ip-n" placeholder="ex.: Amuleto da avó"></label>`}
    <label class="campo"><span>Tipo</span><select id="ip-c"><option value="outro">Outro</option><option value="consumivel">Consumível</option><option value="arma">Arma</option><option value="armadura">Armadura</option><option value="escudo">Escudo</option><option value="acessorio">Acessório</option></select></label>
    <label class="campo"><span>Rank</span><select id="ip-r">${RANK_ORDEM.map(r => `<option>${r}</option>`).join('')}</select></label>
    <label class="campo"><span>Dano (armas)</span><input type="text" id="ip-d" placeholder="1d8"></label>
    <label class="campo"><span>Atributo (armas)</span><select id="ip-a">${ATRIBUTOS.map(a => `<option>${a.id}</option>`).join('')}</select></label>
    <label class="campo"><span>Armadura</span><select id="ip-t">${ARMADURAS.map(a => `<option value="${a.tipo}">${a.tipo}</option>`).join('')}</select></label></div>
    <label class="campo" style="margin-top:10px"><span>Descrição</span><textarea id="ip-txt" placeholder="O que o item faz"></textarea></label>`, [
    { label: 'Cancelar', cls: 'btn-sec' },
    { label: 'Guardar na mochila', cls: 'btn-ok', onClick: () => {
      const nome = $('#ip-n').value.trim(); if (!nome) { toast('Dê um nome ao item.'); return false; }
      const cat = $('#ip-c').value, rank = $('#ip-r').value, br = RANKS[rank].br;
      const it = itemBase(cat, nome, { rank, X: 1 + br, linhas: $('#ip-txt').value.trim() ? [$('#ip-txt').value.trim()] : [] });
      if (cat === 'arma') Object.assign(it, { dano: $('#ip-d').value.trim() || '1d6', atr: $('#ip-a').value, dist: false });
      if (cat === 'armadura') it.armTipo = $('#ip-t').value;
      P().itens.push(it); salvar(); renderFichaDinamico(); toast(`Item guardado: ${nome}`);
    } }]);
}

/* ---------- modais de sorteio da ficha ---------- */
function modalAtrib() {
  const p = P();
  const dp = d(6); const pot = dp <= 2 ? { n: 'Fraco', b: 6, st: 6, ph: 2 } : dp <= 4 ? { n: 'Normal', b: 8, st: 3, ph: 1 } : { n: 'Forte', b: 10, st: 0, ph: 0 };
  const vals = {}, rol = {};
  ATRIBUTOS.forEach(a => { const r1 = d(6), r2 = d(6); rol[a.id] = [r1, r2]; vals[a.id] = pot.b + r1 + r2; });
  const aplicar = c => { c.atr = { ...vals }; c.potencial = pot.n; c.statusPend = Math.max(0, Number(c.statusPend || 0) - Number(c.compPot.st || 0) + pot.st); c.compPot = { ph: pot.ph, st: pot.st }; };
  const efs = prever(p, aplicar);
  abrirModal('🎲 Rolar atributos', janela('STATUS', `<p>Potencial (1d6 = ${dp}): <b>${pot.n}</b> · base ${pot.b}${pot.st ? ` · compensação +${pot.st} Pontos de Status e +${pot.ph} PH` : ''}</p>
    <div class="atrib-res">${ATRIBUTOS.map(a => { const dif = vals[a.id] - Number(p.atr[a.id]);
      return `<div><small>${a.id}</small><b>${vals[a.id]}</b><small>${sinal(mod(vals[a.id]))} · [${rol[a.id].join('+')}]</small>${dif ? `<small class="${dif > 0 ? 'ok' : 'no-ok'}">${dif > 0 ? '▲' : '▼'}${Math.abs(dif)}</small>` : ''}</div>`; }).join('')}</div>`) +
    efeitosHTML(efs, `Mudanças na ficha "${p.nome}"`) + `<p class="dica">Os atributos atuais da ficha serão substituídos.</p>`,
    [{ label: 'Cancelar', cls: 'btn-sec' }, { label: 'Aplicar à ficha', cls: 'btn-ok', onClick: () => { aplicar(p); salvar(); renderFicha(); toast('[SISTEMA] Atributos definidos.'); } }]);
}
function modalDesp(idInicial) {
  const p = P(); let rol = null; let x;
  if (idInicial) x = DESP[idInicial]; else { rol = d(100); x = DESPERTARES.find(z => rol >= z.d[0] && rol <= z.d[1]); }
  const aplicar = (c, z) => { const r = RARIDADE_DESPERTAR[z.rar]; c.despertar = { id: z.id, nv: 1 }; c.statusPend = Math.max(0, Number(c.statusPend || 0) - Number(c.compDesp.st || 0) + r.status); c.compDesp = { ph: r.ph, st: r.status }; };
  const montar = z => {
    const r = RARIDADE_DESPERTAR[z.rar]; const efs = prever(p, c => aplicar(c, z));
    const phAntes = phDisp(p); const tmp = clone(p); aplicar(tmp, z); const phDepois = phDisp(tmp);
    const phEf = phDepois !== phAntes ? [{ k: 'PH disponíveis', d: phDepois - phAntes, up: phDepois > phAntes }] : [];
    return (rol ? `<div class="res-t" style="margin-bottom:6px">[ d100 = ${rol} ]</div>` : '') + despCard(z) + `<p class="dica">Compensação: ${r.txt}</p>` +
      efeitosHTML([...efs, ...phEf], `Mudanças na ficha "${p.nome}"`) +
      `<div class="campo" style="margin-top:10px"><span>Escolha Guiada (opcional, com permissão do Mestre)</span>${selBusca({ valor: z.id, opcoes: DESPERTARES.map(y => ({ v: y.id, l: y.n, s: `${faixa(y)} · ${y.rar}` })), onChange: v => { x = DESP[v]; rol = null; corpo.innerHTML = montar(x); } })}</div>`;
  };
  const corpo = abrirModal('✦ Despertar', montar(x), [{ label: 'Cancelar', cls: 'btn-sec' }, { label: 'Aplicar à ficha', cls: 'btn-ok', onClick: () => { aplicar(p, x); salvar(); renderFicha(); toast(`[SISTEMA] Despertar: ${x.n}`); } }]);
}
function modalAval() {
  const p = P(); let rk = rankDoNivel(Number(p.nivel) || 1);
  const sortear = () => { let pool = HABILIDADES.filter(h => h.r === rk && !possui(p, h.id)); if (pool.length < 3) pool = HABILIDADES.filter(h => h.r === rk); return shuffle(pool).slice(0, 3); };
  let ops = sortear();
  const montar = () => `<div class="modal-filtros"><label>Rank da avaliação <select id="av-rk">${RANK_ORDEM.map(r => `<option ${r === rk ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <span class="dica">Escolha uma recompensa. Ela entra na ficha de graça, no nível 1.</span></div>
    <div class="aval-ops">${ops.map(h => habCard(h, efeitosHTML(prever(p, c => { if (!possui(c, h.id)) c.habs.push({ id: h.id, nv: 1, gratis: true }); }), 'Muda na ficha') +
      `<div class="acoes"><button class="btn btn-ok mini" data-escolher="${h.id}" ${possui(p, h.id) ? 'disabled' : ''}>${possui(p, h.id) ? 'Já possui' : 'Escolher esta'}</button></div>`)).join('')}</div>`;
  const corpo = abrirModal('◈ Avaliação do Sistema', montar(), [{ label: 'Cancelar', cls: 'btn-sec' }], { largo: true });
  corpo.onchange = e => { if (e.target.id === 'av-rk') { rk = e.target.value; ops = sortear(); corpo.innerHTML = montar(); } };
  corpo.onclick = e => { const b = e.target.closest('[data-escolher]'); if (!b) return; p.habs.push({ id: b.dataset.escolher, nv: 1, gratis: true }); salvar(); fecharModal(); renderFichaDinamico(); toast(`[SISTEMA] Recompensa recebida: ${HAB[b.dataset.escolher].n}`); };
}
function modalNivel() {
  const p = P();
  const rolar = () => { const a = d(6); if (a === 1) { const b = d(6); return { v: b, txt: `1 → rerrolado ${b}` }; } return { v: a, txt: String(a) }; };
  const st = rolar(), ph = rolar(); const novo = (Number(p.nivel) || 1) + 1;
  const aplicar = c => { c.nivel = novo; c.statusPend = Number(c.statusPend || 0) + st.v; c.phNiveis = Number(c.phNiveis || 0) + ph.v; c.xp = Math.max(0, Number(c.xp || 0) - (novo - 1) * 10); };
  const efs = prever(p, aplicar);
  const rankUp = novo % 5 === 0 && novo <= 25;
  abrirModal('▲ Subir de nível', janela('NÍVEL AUMENTADO', `<p class="res-g">Nível ${novo - 1} → ${novo}</p>
    <p>Pontos de Status: <b class="ok">+${st.v}</b> <span class="dica">(${st.txt})</span> · PH: <b class="ok">+${ph.v}</b> <span class="dica">(${ph.txt})</span> · Perícia: <b class="ok">+2</b></p>
    ${rankUp ? `<p style="color:var(--ouro)"><b>RANK ${rankDoNivel(novo)} ALCANÇADO!</b> Depois de aplicar, faça a <b>◈ Avaliação</b> do Rank ${rankDoNivel(novo)} e use o nível grátis do Despertar (botão + no Despertar).</p>` : ''}`) +
    efeitosHTML(efs, 'Mudanças na ficha') + `<p class="dica">A XP gasta (${(novo - 1) * 10}) é descontada. Distribua os Pontos de Status nos atributos depois.</p>`,
    [{ label: 'Cancelar', cls: 'btn-sec' }, { label: 'Aplicar', cls: 'btn-ok', onClick: () => { aplicar(p); salvar(); renderFicha(); toast(`[SISTEMA] Nível ${novo}!`); if (rankUp) setTimeout(modalAval, 400); } }]);
}
function modalGerarItem() {
  const p = P(); let item = null;
  const ctl = `<div class="modal-filtros">
    <label>Rank <select id="gi-rk">${RANK_ORDEM.map(r => `<option ${r === rankDoNivel(Number(p.nivel) || 1) ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label>Tipo <select id="gi-tp"><option value="aleatorio">Aleatório</option><option value="arma">Arma</option><option value="armadura">Armadura</option><option value="escudo">Escudo</option><option value="acessorio">Acessório</option><option value="consumivel">Consumível</option></select></label>
    <label>Origem <select id="gi-bn"><option value="0">Comum</option><option value="10">Chefe (+10)</option><option value="15">Portal Vermelho (+15)</option><option value="20">Masmorra Dupla (+20)</option></select></label>
    <button class="btn mini" id="gi-gerar">🎲 Gerar</button></div><div id="gi-out"></div>`;
  const corpo = abrirModal('⚒ Gerar item', ctl, [], { aoFechar: renderFichaDinamico });
  const guardar = equipar => { if (!item) return; const it = clone(item); p.itens.push(it); if (equipar) equiparMut(p, it.uid, true); salvar(); renderFichaDinamico(); toast(`[SISTEMA] Item obtido: ${it.nome}`); item = null; $('#gi-out').innerHTML = `<p class="ok">Guardado na ficha. Gere outro ou feche.</p>`; };
  const gerar = () => {
    item = gerarItem($('#gi-rk').value, $('#gi-tp').value, Number($('#gi-bn').value));
    const equipavel = ['arma', 'armadura', 'escudo', 'acessorio'].includes(item.cat);
    const efs = equipavel ? efeitosHTML(prever(p, c => { const it = clone(item); c.itens.push(it); equiparMut(c, it.uid, true); }), 'Se equipar agora') : '';
    $('#gi-out').innerHTML = itemCard(item) + efs + `<div class="acoes">
      <button class="btn btn-sec" data-gi="descartar">Descartar</button><button class="btn btn-ok" data-gi="mochila">Guardar na mochila</button>
      ${equipavel ? '<button class="btn btn-ok" data-gi="equipar">Guardar e equipar</button>' : ''}</div>`;
  };
  $('#gi-gerar').addEventListener('click', gerar);
  corpo.addEventListener('click', e => { const b = e.target.closest('[data-gi]'); if (!b) return;
    if (b.dataset.gi === 'descartar') { item = null; $('#gi-out').innerHTML = '<p class="dica">Item descartado.</p>'; } else guardar(b.dataset.gi === 'equipar'); });
  gerar();
}
function modalFichas() {
  let confirmar = null;
  const montar = () => `<div class="ficha-lista">${FICHAS.slice().sort((a, b) => (b.criado || 0) - (a.criado || 0)).map(f => { const dsp = DESP[f.despertar.id];
    return `<div class="ficha-item ${f.id === ATUAL ? 'atual' : ''}"><div><div class="t1">${esc(f.nome || 'Sem nome')}</div>
      <div class="t2">Nível ${f.nivel} · Rank ${rankDoNivel(Number(f.nivel) || 1)}${dsp ? ' · ' + dsp.n : ''}${f.jogador ? ' · ' + esc(f.jogador) : ''}</div></div>
      <div class="dir">${f.id === ATUAL ? '<span class="equip-tag">aberta</span>' : `<button class="btn mini" data-f="abrir" data-id="${f.id}">Abrir</button>`}
      <button class="btn mini btn-sec" data-f="dup" data-id="${f.id}">Duplicar</button><button class="btn mini btn-sec" data-f="exp" data-id="${f.id}">Exportar</button>
      <button class="btn mini btn-perigo" data-f="del" data-id="${f.id}">${confirmar === f.id ? 'Confirmar?' : 'Apagar'}</button></div></div>`; }).join('')}</div>
    <p class="dica" style="margin-top:12px">As fichas ficam salvas no banco de dados deste navegador (IndexedDB${Armazem.modo === 'idb' ? '' : ' indisponível: usando modo simples'}). Exporte para levar a outro aparelho.</p>
    <input type="file" id="mf-imp" accept=".json,application/json" hidden multiple>`;
  const corpo = abrirModal(`Fichas (${FICHAS.length})`, montar(), [
    { label: 'Importar JSON', cls: 'btn-sec', fechar: false, onClick: () => $('#mf-imp').click() },
    { label: 'Exportar todas', cls: 'btn-sec', fechar: false, onClick: () => baixar(FICHAS, 'despertar-fichas.json') },
    { label: '＋ Nova ficha', cls: 'btn-ok', onClick: async () => { const n = novoPers(); FICHAS.push(n); await Armazem.salvar(n); trocarFicha(n.id); renderFicha(); } }]);
  const redesenhar = () => { corpo.innerHTML = montar(); $('.modal-topo h3').textContent = `Fichas (${FICHAS.length})`; ligarImport(); };
  const ligarImport = () => $('#mf-imp').addEventListener('change', async e => {
    let n = 0;
    for (const f of e.target.files) { try { const dados = JSON.parse(await f.text()); for (const raw of (Array.isArray(dados) ? dados : [dados])) { const fx = normalizar(raw); fx.id = uid(); fx.criado = Date.now(); FICHAS.push(fx); await Armazem.salvar(fx); n++; } } catch (err) { toast('Arquivo inválido: ' + f.name); } }
    if (n) { toast(`${n} ficha(s) importada(s).`); redesenhar(); }
  });
  ligarImport();
  corpo.onclick = async e => {
    const b = e.target.closest('[data-f]'); if (!b) return; const f = FICHAS.find(x => x.id === b.dataset.id); if (!f) return;
    if (b.dataset.f === 'abrir') { trocarFicha(f.id); fecharModal(); renderFicha(); }
    if (b.dataset.f === 'dup') { const c = clone(f); c.id = uid(); c.nome += ' (cópia)'; c.criado = Date.now(); FICHAS.push(c); await Armazem.salvar(c); redesenhar(); }
    if (b.dataset.f === 'exp') baixar(f, `${(f.nome || 'cacador').replace(/[^\w\-]+/g, '_')}.json`);
    if (b.dataset.f === 'del') {
      if (confirmar !== f.id) { confirmar = f.id; redesenhar(); return; }
      FICHAS = FICHAS.filter(x => x.id !== f.id); await Armazem.apagar(f.id);
      if (!FICHAS.length) { const n = novoPers(); FICHAS.push(n); await Armazem.salvar(n); }
      if (!P()) trocarFicha(FICHAS[0].id);
      confirmar = null; redesenhar(); renderFicha();
    }
  };
}
function baixar(obj, nome) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* =========================================================
   EVENTOS
   ========================================================= */
function ligar() {
  $$('.aba').forEach(b => b.addEventListener('click', () => abrirAba(b.dataset.aba)));
  $('#btn-imprimir-livro').addEventListener('click', () => { abrirAba('livro'); document.body.classList.remove('imprimir-ficha'); $$('#livro details').forEach(x => x.open = true); setTimeout(() => window.print(), 100); });
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimir-ficha'));
  $('#modal-x').addEventListener('click', fecharModal);
  $('#modal-fundo').addEventListener('mousedown', e => { if (e.target.id === 'modal-fundo') fecharModal(); });

  // rolagens por clique (ficha)
  document.addEventListener('click', e => {
    const r = e.target.closest('[data-roll]'); if (r && r.dataset.bonus != null && !e.target.closest('.num')) { rolarD20(r.dataset.roll, Number(r.dataset.bonus)); return; }
    const dn = e.target.closest('[data-dano]'); if (dn) rolarDanoExp(dn.dataset.nome, dn.dataset.dano);
  });

  // árvores
  $('#arv-lista').addEventListener('click', e => { const b = e.target.closest('[data-arv]'); if (!b) return; arvAtual = b.dataset.arv; habSel = null; renderArvore(); });
  $('#arv-mapa').addEventListener('click', e => { const n = e.target.closest('[data-no]'); if (!n) return; habSel = n.dataset.no; $$('.no').forEach(x => x.classList.toggle('sel', x === n)); $('#arv-detalhe').innerHTML = habDetalheHTML(habSel); desenharLinhas();
    if (window.innerWidth <= 1000) $('#arv-detalhe').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#arv-detalhe').addEventListener('click', e => { const b = e.target.closest('[data-hacao]'); if (!b) return; acaoHab(b.parentElement.dataset.hid, b.dataset.hacao); renderArvore(); });
  $('#arv-busca').addEventListener('input', () => { aplicarBusca(); desenharLinhas(); });
  window.addEventListener('resize', () => { if ($('#aba-arvores').classList.contains('ativo')) desenharLinhas(); });

  // mestre
  const rkOpts = RANK_ORDEM.map(r => `<option>${r}</option>`).join('');
  $('#s-item-rank').innerHTML = rkOpts; $('#s-portal-rank').innerHTML += rkOpts;
  $('#s-item').addEventListener('click', gerarItensMestre);
  $('#s-portal').addEventListener('click', gerarPortal);
  $('#s-enc').addEventListener('click', gerarEncontro);
  $('#s-dado').addEventListener('click', () => rolarDado($('#s-dado-exp').value));
  $('#s-dado-exp').addEventListener('keydown', e => { if (e.key === 'Enter') rolarDado(e.target.value); });
  $$('[data-d]').forEach(b => b.addEventListener('click', () => { $('#s-dado-exp').value = b.dataset.d; rolarDado(b.dataset.d); }));
  $('#aba-sorteios').addEventListener('click', e => {
    const add = e.target.closest('[data-mestre-add]');
    if (add) { const it = itensMestre[Number(add.dataset.mestreAdd)]; if (it) { P().itens.push(clone(it)); salvar(); toast(`Item enviado para ${P().nome}.`); add.disabled = true; } }
    const loot = e.target.closest('[data-portal-loot]');
    if (loot) { const [rk, bn] = loot.dataset.portalLoot.split('|'); $('#s-item-rank').value = rk; $('#s-item-tipo').value = 'aleatorio'; $('#s-item-qtd').value = 2;
      const s = $('#s-item-bonus'); if (![...s.options].some(o => o.value === bn)) s.insertAdjacentHTML('beforeend', `<option value="${bn}">Chefe deste Portal (+${bn})</option>`);
      s.value = bn; gerarItensMestre(); $('#o-item').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });

  // ficha: barra
  $('#f-gerenciar').addEventListener('click', modalFichas);
  document.addEventListener('click', e => {
    const m = e.target.closest('[data-modal]'); if (!m) return;
    ({ atrib: modalAtrib, desp: () => modalDesp(), aval: modalAval, nivel: modalNivel, item: modalGerarItem })[m.dataset.modal]();
  });

  // ficha: campos
  const ficha = $('#ficha');
  ficha.addEventListener('input', e => {
    const el = e.target; const p = P();
    if (el.id === 'f-pv' || el.id === 'f-pm') { p[el.id === 'f-pv' ? 'pvAtual' : 'pmAtual'] = Number(el.value) || 0; salvar(); renderFichaDinamico(); return; }
    const path = el.dataset.bind; if (!path) return;
    let v = el.value;
    if (el.type === 'number') v = el.value === '' ? 0 : Number(el.value);
    if (path.startsWith('atr.') && viaStep) {
      const delta = v - Number(getPath(p, path) || 0);
      if (delta > 0 && p.statusPend > 0) p.statusPend = Math.max(0, p.statusPend - delta);
      else if (delta < 0) p.statusPend = Number(p.statusPend || 0) - delta;
      const sp = $('[data-bind="statusPend"]'); if (sp) sp.value = p.statusPend;
    }
    setPath(p, path, v); salvar();
    if (path === 'nivel') { ficha.querySelectorAll('[data-bind^="pericias."]').forEach(i => i.max = 2 + Math.floor((Number(v) || 1) / 2)); }
    renderFichaDinamico();
  });
  ficha.addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return; const p = P(); const c = computar(p); const a = b.dataset.act;
    if (a === 'rec') {
      const key = b.dataset.k === 'pv' ? 'pvAtual' : 'pmAtual', max = b.dataset.k === 'pv' ? c.pvMax : c.pmMax; const cur = p[key] == null ? max : p[key];
      p[key] = b.dataset.v === 'max' ? max : Math.min(max, cur + Number(b.dataset.v)); salvar(); renderFichaDinamico();
    }
    if (a === 'desp') {
      const nv = p.despertar.nv + Number(b.dataset.v); if (nv < 1 || nv > 5) return;
      if (Number(b.dataset.v) > 0) { const custo = nv - 1 <= despGratis(p) ? 0 : nv; if (phDisp(p) < custo) return toast('PH insuficientes.'); }
      p.despertar.nv = nv; salvar(); renderFichaDinamico();
    }
    if (a === 'desp-info') abrirModal(DESP[p.despertar.id].n, despCard(DESP[p.despertar.id]) + efeitosHTML(inverter(prever(p, z => { z.despertar = { id: '', nv: 1 }; })), 'Efeito atual na ficha'), [{ label: 'Fechar', cls: 'btn-sec' }]);
    if (a === 'hab-info') modalHab(b.dataset.id);
    if (a === 'hab-mais') { acaoHab(b.dataset.id, 'subir'); renderFichaDinamico(); }
    if (a === 'hab-menos') { acaoHab(b.dataset.id, 'descer'); renderFichaDinamico(); }
    if (a === 'hab-add') modalAddHab();
    if (a === 'item-info') modalItem(b.dataset.uid);
    if (a === 'item-equip') { const it = p.itens.find(i => i.uid === b.dataset.uid); equiparMut(p, it.uid, !it.equip); salvar(); renderFichaDinamico(); }
    if (a === 'item-usar') usarItem(b.dataset.uid);
    if (a === 'item-custom') modalItemProprio();
    if (a === 'ir') abrirAba(b.dataset.aba);
  });
}

/* =========================================================
   INÍCIO
   ========================================================= */
(async () => {
  montarLivro();
  ligar();
  await carregar();
  let aba = 'livro'; try { aba = sessionStorage.getItem('despertar.aba') || 'livro'; } catch (e) { }
  if (aba !== 'livro') abrirAba(aba);
  window.__despertar = { computar, P, FICHAS: () => FICHAS, modo: () => Armazem.modo };
})();
})();
