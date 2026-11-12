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
  return itemBase('arma', a.n, { base: a.n, dano: a.dano, atr: a.a, rank, X: 1 + br, dist: /distância/.test(a.tags), reqAtr: a.a, maos: /duas mãos/.test(a.tags) ? 2 : 1,
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
    itens: [espada, traje, pocao], condicoes: '', notas: '', criado: Date.now(), hist: [], passos: {}
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
    delete it.rachado; if (it.cat === 'acessorio' && !ACESSORIOS.includes(it.base)) it.base = tipoAce(it);
    if (it.cat === 'arma' && !it.base) { it.base = acharBase(it.nome); const a = ARMAS.find(x => x.n === it.base); if (a) { it.dist = /distância/.test(a.tags); it.reqAtr = a.a; } }
    if (it.cat === 'arma' && !it.maos) { const a = ARMAS.find(x => x.n === it.base); it.maos = a && /duas mãos/.test(a.tags) ? 2 : 1; }
    if (it.cat === 'consumivel' && !it.mat) { if (/^Cristal de Mana/.test(it.nome)) it.mat = 'cristal'; else if (/^Núcleo de Chefe/.test(it.nome)) it.mat = 'nucleo'; }
    if (it.cat === 'armadura' && !it.armTipo) { const a = ARMADURAS.find(x => it.nome.startsWith(x.n)); it.armTipo = a ? a.tipo : 'Leve'; }
    if (!it.selos) it.selos = []; if (!it.afixos) it.afixos = []; if (!it.linhas) it.linhas = [];
  });
  if (!Array.isArray(p.hist)) p.hist = []; if (!p.passos) p.passos = {};
  p.versao = 3;
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
  'Resiliente': X => ({ pv: 5 * X }), 'Ligeiro': X => ({ desl: X }), 'Vigilante': X => ({ ini: X }), 'Silenciosa': X => ({ 'per.Furtividade': 2 * X })
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
  const maiorX = {}; equipados(p).forEach(it => it.afixos.forEach(a => { if (EF_AFIXO[a.n]) maiorX[a.n] = Math.max(maiorX[a.n] || 0, it.X || 1); }));
  for (const n in maiorX) add(EF_AFIXO[n](maiorX[n])); // o mesmo afixo em dois itens não se soma
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
  if (esc_) { const { br } = brItem(esc_, p); defEsc = 2 + br; rdArm += br + Number(esc_.refino || 0); } // escudo: Refino dá RD, não Defender
  const res = {}, cd = {}, per = {};
  for (const a of ATRIBUTOS) { res[a.id] = n + m[a.id] + (b.res || 0) + (b['res.' + a.id] || 0); cd[a.id] = 10 + n + m[a.id] + (b.cd || 0); }
  for (const pc of PERICIAS) per[pc.n] = m[pc.a] + Number(p.pericias[pc.n] || 0) + (b['per.' + pc.n] || 0);
  const meioN = Math.floor(n / 2);
  const ataques = [{ id: 'desarmado', nome: 'Desarmado', atk: n + m.FOR + (b.atk || 0) + (b.atkCaC || 0), dado: b.desarmado || '1d4',
    bonus: m.FOR + meioN + (b.dano || 0) + (b.danoCaC || 0), extra: '', alc: '1,5 m' }];
  eq.filter(i => i.cat === 'arma').forEach(it => {
    const { br } = brItem(it, p); const mm = m[it.atr] || 0; const ref = Number(it.refino || 0); const dist = !!it.dist;
    const mmDano = it.maos === 2 && !dist && mm > 0 ? Math.floor(mm * 1.5) : mm; // duas mãos corpo a corpo: 1,5 × mod
    const afx = n2 => it.afixos.some(a => a.n === n2);
    const X = it.X || 1;
    const extra = it.afixos.filter(a => ELEM[a.n]).map(a => `+${X}d4 ${ELEM[a.n]}`).join(' ');
    ataques.push({ id: it.uid, nome: it.nome, atk: n + mm + br + ref + (b.atk || 0) + (dist ? b.atkDist || 0 : b.atkCaC || 0) + (afx('Afiada') ? X : 0),
      dado: it.dano || '1d6', bonus: mmDano + meioN + 2 * br + ref + (b.dano || 0) + (dist ? b.danoDist || 0 : b.danoCaC || 0) + (afx('Brutal') ? 2 * X : 0),
      extra, dist, maos: it.maos || 1 });
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
const inverter = l => l.map(z => ({ ...z, d: z.d != null ? -z.d : null, up: !z.up, txt: z.txt === 'removido' ? 'concede' : z.txt === 'novo' ? 'perde' : z.txt ? z.txt.split(' → ').reverse().join(' → ') : z.txt }));
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
  const preco = precoItem(it);
  return `<div class="item-card" style="--cor:${it.cor}">
    <div class="item-nome">${esc(it.nome)}${qtd}</div>
    <div class="item-sub">${it.rar} · Rank ${it.rank}${it.cat === 'arma' ? (it.maos === 2 ? ' · duas mãos' : ' · uma mão') : ''}${preco ? ' · ' + preco.toLocaleString('pt-BR') + ' Ouro' : ''}${it.refino ? ' · Refino +' + it.refino : ''}${it.selos.length ? ' · Sincronia ' + (it.sinc || 0) : ''}${it.rachado ? ' · <span class="no-ok">RACHADO</span>' : ''}</div>
    ${it.linhas.map(l => `<div>${esc(l)}</div>`).join('')}
    ${it.afixos.length ? '<ul>' + it.afixos.map(a => `<li><b>${esc(a.n)}</b>: ${esc(a.t)}</li>`).join('') + '</ul>' : ''}
    ${it.selos.length ? `<details class="item-selos"><summary>${it.selos.length} Selo(s) — Sincronia 3 / 8 / 15</summary><ul>${it.selos.map((s, i) => {
      const aberto = Number(it.sinc || 0) >= [3, 8, 15][i];
      return `<li>${aberto ? '🔓' : '🔒'} <b>${esc(s.n)}</b> (Sinc. ${[3, 8, 15][i]}): ${esc(s.t)}</li>`; }).join('')}</ul></details>` : ''}
    ${extra}</div>`;
}
const precoItem = it => it.precoUn ? it.precoUn * (it.qtd || 1) : it.preco || 0;
const tituloCard = t => `<div class="titulo-card"><b>${esc(t.n)}</b><span>${esc(t.txt)}</span><span class="c">Como obter: ${esc(t.cond)}</span></div>`;

/* =========================================================
   COMPONENTES: modal, select com busca, stepper
   ========================================================= */
let modalAoFechar = null;
function abrirModal(titulo, corpo, botoes = [], opc = {}) {
  fecharPop();
  // troca o corpo por um nó novo: assim nenhum ouvinte de um modal anterior sobrevive
  const velho = $('#modal-corpo'); const novo = velho.cloneNode(false); velho.parentNode.replaceChild(novo, velho);
  $('#modal-titulo').innerHTML = esc(titulo) + (opc.ajuda ? ' ' + ajudaBtn(opc.ajuda) : '');
  novo.innerHTML = corpo;
  const rod = $('#modal-rodape'); rod.innerHTML = '';
  botoes.forEach(bt => {
    const el = document.createElement('button'); el.className = 'btn ' + (bt.cls || ''); el.textContent = bt.label;
    if (bt.disabled) el.disabled = true; if (bt.id) el.id = bt.id;
    el.addEventListener('click', () => { const r = bt.onClick ? bt.onClick() : null; if (bt.fechar !== false && r !== false) fecharModal(); });
    rod.appendChild(el);
  });
  $('#modal-fundo .modal').classList.toggle('largo', !!opc.largo);
  $('#modal-fundo').hidden = false; document.body.style.overflow = 'hidden';
  modalAoFechar = opc.aoFechar || null;
  novo.scrollTop = 0;
  return novo;
}
function fecharModal() {
  $('#modal-fundo').hidden = true; document.body.style.overflow = ''; guiaAtivo = false;
  const f = modalAoFechar; modalAoFechar = null; if (f) f();
}
const modalAberto = () => !$('#modal-fundo').hidden;

const SB = new Map(); let sbN = 0;
function selBusca(cfg) {
  const id = 'sb' + (++sbN); SB.set(id, cfg);
  const o = cfg.opcoes.find(x => x.v === cfg.valor);
  return `<div class="sel-busca" data-sb="${id}"><button type="button" class="sel-busca-btn"><span class="rot">${esc(o ? o.l : (cfg.placeholder || 'Selecionar…'))}</span></button></div>`;
}
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
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (popAtual) fecharPop(); else if (!$('#ajuda-fundo').hidden) fecharAjuda(); else if (modalAberto()) fecharModal(); } });

/* ---------- ajuda "?" ---------- */
ATRIBUTOS.forEach(a => { AJUDA['atr_' + a.id] = { t: `${a.nome} (${a.id})`, liv: 'c-atributos', txt: `<p>${a.desc}</p><p>Modificador = (valor − 10) ÷ 2, arredondado para baixo. Ele soma em testes, ataques e Reações ligados a ${a.nome}. Clique no modificador da ficha para rolar um teste.</p>` }; });
['FOR', 'AGI', 'VIT', 'INT', 'PER', 'PRE'].forEach(id => { AJUDA['Resist. ' + id] = AJUDA.resist; });
function ajudaBtn(k, cls = '') { return AJUDA[k] ? `<button type="button" class="ajuda-btn ${cls}" data-ajuda="${esc(k)}" aria-label="Ajuda: ${esc(AJUDA[k].t)}" title="O que é isso?">?</button>` : ''; }
function abrirAjuda(k) {
  const a = AJUDA[k]; if (!a) return;
  $('#ajuda-titulo').textContent = a.t; $('#ajuda-corpo').innerHTML = a.txt;
  $('#ajuda-rodape').innerHTML = (a.liv ? `<button class="btn btn-sec" data-ler="${a.liv}">Ler no livro →</button>` : '') + '<button class="btn" data-fechar-ajuda>Entendi</button>';
  $('#ajuda-fundo').hidden = false;
}
function fecharAjuda() { $('#ajuda-fundo').hidden = true; }
document.addEventListener('click', e => {
  const b = e.target.closest('[data-ajuda]');
  if (b) { e.preventDefault(); e.stopPropagation(); abrirAjuda(b.dataset.ajuda); return; }
  if (e.target.closest('[data-fechar-ajuda]') || e.target.id === 'ajuda-x' || e.target.id === 'ajuda-fundo') { fecharAjuda(); return; }
  const ler = e.target.closest('[data-ler]');
  if (ler) { fecharAjuda(); if (modalAberto()) fecharModal(); abrirAba('livro'); const alvo = document.getElementById(ler.dataset.ler); if (alvo) setTimeout(() => alvo.scrollIntoView({ block: 'start' }), 60); }
}, true);

/* ---------- notificações no estilo da Janela do Sistema ---------- */
function sistema(msg, titulo = 'SISTEMA', tipo = '') {
  const el = document.createElement('div'); el.className = 'notif ' + tipo;
  el.innerHTML = `<div class="notif-t">[ ${esc(titulo)} ]</div><div class="notif-m">${esc(msg)}</div>`;
  el.addEventListener('click', () => el.remove());
  const c = $('#notifs'); c.appendChild(el); while (c.children.length > 3) c.firstChild.remove();
  setTimeout(() => { el.classList.add('sai'); setTimeout(() => el.remove(), 400); }, 4200);
}

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
  const tabAfx = (titulo, cat) => `<h4 class="afx-titulo">${titulo} <span class="tag">d${DADO_AFIXO[cat]}</span></h4><div class="tabela-wrap"><table class="tabela afx-tab"><thead><tr><th>d${DADO_AFIXO[cat]}</th><th>Afixo</th><th>Efeito</th></tr></thead><tbody>${AFIXOS[cat].map(([p, s, t], i) => `<tr><td>${i + 1}</td><td class="afx-nome"><b>${p}</b> <i class="dica">${s}</i></td><td>${t}</td></tr>`).join('')}</tbody></table></div>`;
  $('#cat-afixos').innerHTML = `<div class="afixos-grade">${tabAfx('Afixos de Arma', 'arma')}${tabAfx('Afixos de Armadura e Escudo', 'armadura')}${tabAfx('Afixos de Acessório', 'acessorio')}</div>
    <p class="dica">O primeiro afixo dá o adjetivo do nome (Espada <b>Afiada</b>) e o segundo, o complemento (Espada Afiada <i>da Ruína</i>).</p>
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
  if (nome === 'ficha') { renderFicha(); const p = P(); if (!lsGet('despertar.guia') && p.nome === 'Novo Caçador' && !p.despertar.id && !p.habs.length) setTimeout(modalGuia, 350); }
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
    if (h.tipo === 'Ativa') bts += `<button class="btn btn-ok" data-hacao="usar">⚡ Usar (${h.pm} PM)</button>`;
    if (x.nv < 5) bts += `<button class="btn btn-ok" data-hacao="subir" ${disp < custo ? 'disabled' : ''}>Evoluir para nv${x.nv + 1} (${custo} PH)</button>`;
    bts += `<button class="btn btn-sec" data-hacao="descer">${x.nv > 1 ? 'Reduzir nível' : 'Remover da ficha'}</button>`;
  }
  return habCard(h) + efs + `<div class="det-status">${x ? `<b>Na ficha "${esc(p.nome)}": nível ${x.nv}${x.gratis ? ' (aquisição grátis)' : ''}</b><br>` : ''}
    ${x && x.gratis ? '<span class="ok">✓ Recebida pelo Sistema: requisitos dispensados. Pode evoluir e serve de pré-requisito.</span>' : reqs.map(r => `<span class="${r.ok ? 'ok' : 'no-ok'}">${r.ok ? '✓' : '✗'} ${esc(r.txt)}</span>`).join('<br>')}<br><span class="dica">PH disponíveis: ${disp}</span></div>
    <div class="det-acoes" data-hid="${id}">${bts}</div>`;
}
function acaoHab(id, acao) {
  const p = P(); const h = HAB[id]; const x = possui(p, id);
  if (acao === 'comprar') {
    if (!reqOk(h, p)) return toast('Requisitos não cumpridos.');
    if (phDisp(p) < custoAquis(h, p)) return toast('PH insuficientes.');
    mudar(`Adquiriu ${h.n} (${custoAquis(h, p)} PH)`, q => { q.habs.push({ id, nv: 1, gratis: false }); }); sistema(`Habilidade adquirida: ${h.n}`, 'HABILIDADE');
  } else if (acao === 'usar') { usarHabilidade(id); return;
  } else if (acao === 'gratis') {
    if (x) return toast('Você já possui esta habilidade.');
    mudar(`Recebeu ${h.n} de graça`, q => { q.habs.push({ id, nv: 1, gratis: true }); }); sistema(`Habilidade recebida: ${h.n}`, 'HABILIDADE');
  } else if (acao === 'subir') {
    if (!x || x.nv >= 5) return; if (phDisp(p) < x.nv + 1) return toast('PH insuficientes.');
    mudar(`${h.n} subiu para o nível ${x.nv + 1}`, () => { x.nv++; }); sistema(`${h.n} alcançou o nível ${x.nv}!`, 'HABILIDADE');
  } else if (acao === 'descer') {
    if (!x) return; mudar(x.nv > 1 ? `${h.n} reduzida para o nível ${x.nv - 1}` : `Removeu ${h.n}`, q => { if (x.nv > 1) x.nv--; else q.habs = q.habs.filter(y => y.id !== id); });
  }
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
  const it = consumivel(nome, rank); if (nome === 'Cristal de Mana') it.qtd = d(6); return it;
}
/* cria um consumível do Rank pedido (saque e Loja) */
function consumivel(nome, rank) {
  const desc = CONSUMIVEIS.find(c => c[0] === nome)[1]; const br = RANKS[rank].br;
  const it = itemBase('consumivel', `${nome} (Rank ${rank})`, { rank, linhas: [desc], X: 1 + br });
  if (nome === 'Poção de Cura') { it.linhas = [`Recupera ${2 + 2 * br}d8 PV.`]; it.usoDado = `${2 + 2 * br}d8`; it.usoAlvo = 'pv'; }
  if (nome === 'Poção de Mana') { it.linhas = [`Recupera ${2 + 2 * br}d6 PM.`]; it.usoDado = `${2 + 2 * br}d6`; it.usoAlvo = 'pm'; }
  if (nome === 'Cristal de Mana') it.mat = 'cristal';
  if (nome === 'Núcleo de Chefe') it.mat = 'nucleo';
  if (nome === 'Pergaminho de Habilidade') { const h = pick(HABILIDADES.filter(x => x.r === rank)); it.nome = `Pergaminho: ${h.n}`; it.linhas = [`Ensina ${h.n} (${ARV[h.t].nome}, Rank ${rank}) sem custo de aquisição.`]; it.ensina = h.id; }
  if (nome === 'Elixir de Despertar') { it.rar = 'Épico'; it.cor = '#b06cff'; }
  if (nome === 'Núcleo de Chefe' || nome === 'Chave de Instância') { it.rar = 'Raro'; it.cor = '#4aa8ff'; }
  const naoVende = ['Pergaminho de Habilidade', 'Elixir de Despertar', 'Núcleo de Chefe', 'Chave de Instância'].includes(nome);
  it.precoUn = naoVende ? null : Math.round(PRECO_BASE[rank] / 5); it.preco = null;
  return it;
}
const fxX = (t, X) => t.replace(/Xd(\d+)/g, `${X}d$1`).replace(/(\d+)X/g, (m0, k) => String(Number(k) * X)).replace(/\bX\b/g, String(X));
const catAfixo = it => it.cat === 'arma' ? 'arma' : it.cat === 'acessorio' ? 'acessorio' : 'armadura';
function criarMat(mat, rank, qtd = 1) {
  if (mat === 'cristal') return itemBase('consumivel', `Cristal de Mana (Rank ${rank})`, { rank, mat, qtd, X: 1 + RANKS[rank].br, linhas: [CONSUMIVEIS.find(c => c[0] === 'Cristal de Mana')[1]], precoUn: Math.round(PRECO_BASE[rank] / 5) });
  return itemBase('consumivel', `Núcleo de Chefe (Rank ${rank})`, { rank, mat, qtd, rar: 'Raro', cor: '#4aa8ff', X: 1 + RANKS[rank].br, linhas: [CONSUMIVEIS.find(c => c[0] === 'Núcleo de Chefe')[1]] });
}
const contarMat = (p, mat, rank) => p.itens.filter(i => i.mat === mat && i.rank === rank).reduce((a, i) => a + (Number(i.qtd) || 1), 0);
function gastarMat(p, mat, rank, n) {
  for (const i of p.itens.filter(x => x.mat === mat && x.rank === rank)) {
    if (n <= 0) break; const q = Number(i.qtd) || 1; const usa = Math.min(q, n); i.qtd = q - usa; n -= usa;
  }
  p.itens = p.itens.filter(i => !(i.mat && (Number(i.qtd) || 0) <= 0));
}
/* reescreve as linhas de um item gerado (após Ascensão) */
function linhasBase(it) {
  const br = RANKS[it.rank].br; const L = [];
  if (it.cat === 'arma') { const a = ARMAS.find(x => x.n === it.base); if (!a) return null; L.push(`Dano ${a.dano} · Alcance ${a.alc} · ${a.a}${a.tags ? ' · ' + a.tags : ''}`); if (br) L.push(`Bônus de Rank: +${br} no ataque e +${2 * br} no dano.`); }
  else if (it.cat === 'armadura') { const t = ARMADURAS.find(x => x.tipo === it.armTipo); if (!t || !it.base) return null; L.push(`Armadura ${t.tipo} · Defender +${t.def + br}${t.esq ? ' · Esquivar ' + t.esq : ''} · RD ${br}`); }
  else if (it.cat === 'escudo') { if (!it.base) return null; L.push(`Escudo · Defender +${2 + br} · RD ${br} · ocupa uma mão`); }
  else return null;
  if (it.rar === 'Relíquia') L.push('Relíquia: usa sempre o Rank do portador. Possui uma Vontade (definida pelo Mestre).');
  if (it.reqAtr && br) L.push(`Requisito: ${it.reqAtr} ${10 + 4 * br}`);
  return L;
}
function recalcularX(it) {
  const X = 1 + RANKS[it.rank].br; it.X = X; const cat = catAfixo(it);
  it.afixos.forEach(a => { const t = AFIXOS[cat].find(z => z[0] === a.n); if (t) a.t = fxX(t[2], X); });
  it.selos.forEach(s0 => { const t = SELOS.find(z => z[0] === s0.n); if (t) s0.t = fxX(t[1], X); });
  const L = linhasBase(it); if (L) it.linhas = L;
}
const seloAberto = (it, nome) => it.selos.some((s0, i) => s0.n === nome && Number(it.sinc || 0) >= [3, 8, 15][i]);
function gerarItem(rank, tipo, bonus) {
  if (tipo === 'aleatorio') { const t = d(20); tipo = t <= 8 ? 'arma' : t <= 11 ? 'armadura' : t === 12 ? 'escudo' : t <= 15 ? 'acessorio' : 'consumivel'; }
  if (tipo === 'consumivel') return rolarConsumivel(rank, bonus);
  const v = d(100) + bonus; const r = RARIDADES.find(z => v >= z.min && v <= z.max) || RARIDADES[RARIDADES.length - 1];
  const base = tipo === 'arma' ? pick(ARMAS).n : tipo === 'armadura' ? pick(ARMADURAS).tipo : tipo === 'escudo' ? 'Escudo' : pick(ACESSORIOS);
  const it = montarItem(tipo, base, rank, r); it.rolRar = v; return it;
}
/* monta um equipamento de tipo, base, Rank e raridade definidos (saque e Loja); afixos e Selos sorteados */
function montarItem(tipo, baseNome, rank, r) {
  const br = RANKS[rank].br; const X = 1 + br;
  let it;
  if (tipo === 'arma') { it = armaComum(baseNome, rank); if (br) it.linhas.push(`Bônus de Rank: +${br} no ataque e +${2 * br} no dano.`); }
  else if (tipo === 'armadura') it = armaduraComum(baseNome, rank);
  else if (tipo === 'escudo') it = itemBase('escudo', 'Escudo', { base: 'Escudo', rank, reqAtr: 'FOR', maos: 1, linhas: [`Escudo · Defender +${2 + br} · RD ${br} · ocupa uma mão`] });
  else it = itemBase('acessorio', baseNome, { base: baseNome, rank, linhas: ['Acessório (até 4 equipados: no máximo 2 anéis e 1 de cada outro tipo)'] });
  Object.assign(it, { rar: r.n, cor: r.cor, X });
  const cat = tipo === 'arma' ? 'arma' : tipo === 'acessorio' ? 'acessorio' : 'armadura';
  const afx = shuffle(AFIXOS[cat]).slice(0, r.afx + (tipo === 'acessorio' ? 1 : 0));
  const fx = t => fxX(t, X);
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
let itensMestre = [], pacoteInfo = null, ultimoPortal = null;
function gerarItensMestre() {
  const rk = $('#s-item-rank').value, tp = $('#s-item-tipo').value, bn = Number($('#s-item-bonus').value), q = Math.max(1, Math.min(10, Number($('#s-item-qtd').value) || 1));
  itensMestre = Array.from({ length: q }, () => gerarItem(rk, tp, bn));
  $('#o-item').innerHTML = (pacoteInfo ? `<div class="res" style="grid-column:1/-1"><div class="res-t">[ SAQUE DO PORTAL ]</div><p>${esc(pacoteInfo.titulo)} · o pacote leva também <b>+${pacoteInfo.xp} XP</b> e <b>+${pacoteInfo.ouro.toLocaleString('pt-BR')} Ouro</b> por Jogador.</p></div>` : '') +
    itensMestre.map((it, i) => itemCard(it, `<div class="acoes"><button class="btn mini btn-sec" data-mestre-env="${i}">📤 Enviar</button><button class="btn mini btn-sec" data-mestre-add="${i}">+ Ficha de ${esc(P().nome)}</button></div>`)).join('');
  $('#s-item-pacote').hidden = !itensMestre.length;
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
  ultimoPortal = { titulo: `Portal Rank ${rk} · ${tipo.n} · Chefe ${chefe}`, xp, ouro, rk };
  $('#o-portal').innerHTML = janela('PORTAL DETECTADO', `<p class="res-g"><span class="rk rk-${rk}">${rk}</span> ${tipo.n}${nota}</p><p>${tipo.d}</p>
    ${tipo.n === 'Ruptura Iminente' ? `<p><b>Prazo até a ruptura:</b> ${d(6) * 4} horas.</p>` : ''}
    <p><b>Ambiente:</b> ${pick(PORTAL_AMBIENTE)}${rolRk ? ` <span class="dica">(d100 = ${rolRk})</span>` : ''}</p>
    <p><b>Criaturas:</b> ${cri[0]}, ${cri[1]}. Nível ${L}.</p>
    <p><b>Chefe:</b> ${chefe} (${cri[0]}), nível ${LB}. Segunda fase aos 50% dos PV.</p>
    <p><b>Complicação:</b> ${pick(PORTAL_COMPLICACAO)}</p>
    ${tabelaAmeacas([[`Lacaio (nv ${L})`, 'Lacaio', L], [`Soldado (nv ${L})`, 'Soldado', L], [`Elite (nv ${L + 1})`, 'Elite', L + 1], [`Chefe (nv ${LB})`, 'Chefe', LB]])}
    <p><b>Recompensas por Jogador:</b> ${xp} XP · ${ouro.toLocaleString('pt-BR')} Ouro · 1d6 Cristais de Mana Rank ${rk}.</p>
    <p><b>Para o grupo:</b> 1 item por Elite, 2 itens do Chefe (raridade +${10 + tipo.raridade}) e ${/Vermelho|Dupla/.test(tipo.n) ? '2 Núcleos' : '1 Núcleo'} de Chefe Rank ${rk}.</p>
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
  const r = rolarExp(exp);
  if (!r) { $('#o-dado-ult').innerHTML = '<span class="no-ok">Expressão inválida. Use algo como 2d6+3.</span>'; return; }
  rolarDado.h = [{ exp: String(exp).trim(), total: r.total, txt: r.txt, t: new Date() }, ...(rolarDado.h || [])].slice(0, 20);
  desenharDados();
}
function desenharDados() {
  const h = rolarDado.h || [];
  $('#o-dado-ult').innerHTML = h.length ? `<span class="dg-exp">${esc(h[0].exp)}</span><span class="dg-v">${h[0].total}</span><span class="dg-d">${esc(h[0].txt)}</span>` : '<span class="dica">Nenhuma rolagem ainda.</span>';
  $('#o-dado').innerHTML = h.slice(1).map(x => `<div class="dados-hist"><span class="dica">${x.t.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span> ${esc(x.exp)} → <b>${x.total}</b> <span class="dica">${esc(x.txt)}</span></div>`).join('');
}

/* =========================================================
   FICHA
   ========================================================= */
const getPath = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
const campo = (rot, html, cls = '', aj = '') => `<label class="campo ${cls}"><span title="${esc(rot)}">${esc(rot)}${aj ? ajudaBtn(aj, 'in') : ''}</span>${html}</label>`;
const txt = (path, ph = '') => `<input type="text" data-bind="${path}" value="${esc(getPath(P(), path) ?? '')}" placeholder="${esc(ph)}">`;
const sel = (path, opcoes) => `<select data-bind="${path}">${opcoes.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(getPath(P(), path)) === String(v) ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));
const h3t = (titulo, aj, extra = '') => `<h3><span class="h3t">${titulo}${aj ? ajudaBtn(aj, 'in') : ''}</span>${extra}</h3>`;
let prevFlat = null;

/* ---------- limites, histórico e inventário ---------- */
const CAP_INV = 20;
const EQUIPAVEL = ['arma', 'armadura', 'escudo', 'acessorio'];
const maosItem = it => it.cat === 'escudo' ? 1 : it.cat === 'arma' ? (it.maos || 1) : 0;
const naMochila = p => p.itens.filter(i => !i.equip).length;
const usavel = it => !!(it.usoDado || it.ensina || /^Pó de Purificação/.test(it.nome));
function semSnaps(p) { const c = clone(p); c.hist = []; return c; }
function mudar(msg, fn, p = P()) {
  const snap = clone(p); delete snap.hist;
  const r = fn(p); if (r === false) return false;
  if (!Array.isArray(p.hist)) p.hist = [];
  p.hist.unshift({ t: Date.now(), msg, snap });
  p.hist.forEach((h, i) => { if (i >= 30) delete h.snap; });
  if (p.hist.length > 150) p.hist.length = 150;
  salvar(p); return true;
}
function empilhar(p, it) {
  const igual = it.cat === 'consumivel' && p.itens.find(i => i.cat === 'consumivel' && !i.equip && i.nome === it.nome);
  if (igual) { igual.qtd = (Number(igual.qtd) || 1) + (Number(it.qtd) || 1); return igual; }
  p.itens.push(it); return it;
}
function guardarItem(p, it, opc = {}, depois) {
  mudar(opc.msg || `Item obtido: ${it.nome}`, q => { if (opc.antes) opc.antes(q); const x = empilhar(q, it); if (opc.equipar && x === it) equiparMut(q, it.uid, true); }, p);
  if (p === P()) renderFichaDinamico();
  if (opc.notificar !== false) sistema(`${it.nome}${it.qtd > 1 ? ' ×' + it.qtd : ''}`, (opc.msg || 'Item obtido').toUpperCase());
  setTimeout(() => checarCapacidade(p, depois), 60);
}
function checarCapacidade(p, depois) { if (naMochila(p) > CAP_INV) modalExcesso(p, depois); else if (depois) depois(); }
function equiparMut(p, uid_, ligar = true) {
  const it = p.itens.find(i => i.uid === uid_); if (!it) return [];
  if (!ligar) { it.equip = false; return []; }
  const tirados = [];
  if (maosItem(it)) {
    const outros = p.itens.filter(i => i.equip && i.uid !== it.uid && maosItem(i));
    let usadas = outros.reduce((a, i) => a + maosItem(i), 0);
    while (usadas + maosItem(it) > 2 && outros.length) { const t = outros.shift(); t.equip = false; usadas -= maosItem(t); tirados.push(t); }
  } else {
    const limite = { armadura: 1, acessorio: 4 }[it.cat]; if (!limite) return [];
    if (it.cat === 'acessorio') { // no máximo 2 anéis e 1 de cada outro tipo
      const tipo = tipoAce(it); const lim = tipo === 'Anel' ? 2 : 1;
      const doTipo = p.itens.filter(i => i.equip && i.cat === 'acessorio' && i.uid !== it.uid && tipoAce(i) === tipo);
      while (doTipo.length >= lim) { const t = doTipo.shift(); t.equip = false; tirados.push(t); }
    }
    const mesmos = p.itens.filter(i => i.equip && i.cat === it.cat && i.uid !== it.uid);
    while (mesmos.length >= limite) { const t = mesmos.shift(); t.equip = false; tirados.push(t); }
  }
  it.equip = true; return tirados;
}
function tipoAce(it) { if (ACESSORIOS.includes(it.base)) return it.base; const n = (it.nome || '').toLowerCase(); return ACESSORIOS.find(a => n.startsWith(a.toLowerCase())) || 'Outro'; }
function slots(p) {
  const eq = p.itens.filter(i => i.equip);
  return { maos: eq.reduce((a, i) => a + maosItem(i), 0), arm: eq.filter(i => i.cat === 'armadura').length, ace: eq.filter(i => i.cat === 'acessorio').length, mochila: naMochila(p) };
}
function modalExcesso(p, depois) {
  const marc = new Set();
  const sobra = () => naMochila(p) - marc.size - CAP_INV;
  const montar = () => { const mo = p.itens.filter(i => !i.equip);
    return `<p>O Inventário do Sistema de <b>${esc(p.nome)}</b> guarda <b>${CAP_INV}</b> itens e agora tem <b class="no-ok">${mo.length}</b>. Marque o que vai deixar para trás (descartar, vender ou entregar a alguém).</p>
    <p class="${sobra() > 0 ? 'no-ok' : 'ok'}"><b>${sobra() > 0 ? `Marque mais ${sobra()}.` : 'Pronto: o resto cabe.'}</b></p>
    <div class="lista-f">${mo.map(it => `<label class="lin sel-desc ${marc.has(it.uid) ? 'marcado' : ''}"><input type="checkbox" data-desc="${it.uid}" ${marc.has(it.uid) ? 'checked' : ''}>
      <span class="meio"><span class="t1" style="color:${it.cor}">${ICONE_CAT[it.cat] || '✦'} ${esc(it.nome)}${it.qtd > 1 ? ' ×' + it.qtd : ''}</span><span class="t2">${it.rar} · Rank ${it.rank}${precoItem(it) ? ' · vale ' + precoItem(it).toLocaleString('pt-BR') + ' Ouro' : ''}</span></span><span></span></label>`).join('')}</div>`; };
  const corpo = abrirModal('Inventário cheio', montar(), [
    { label: 'Manter assim (o Mestre permitiu)', cls: 'btn-sec', onClick: () => { if (depois) setTimeout(depois, 60); } },
    { label: 'Descartar marcados', cls: 'btn-perigo', id: 'mx-ok', onClick: () => {
      if (sobra() > 0) return false;
      const nomes = p.itens.filter(i => marc.has(i.uid)).map(i => i.nome);
      mudar(`Descartado por falta de espaço: ${nomes.join(', ')}`, q => { q.itens = q.itens.filter(i => !marc.has(i.uid)); }, p);
      if (p === P()) renderFichaDinamico(); if (depois) setTimeout(depois, 60); } }], { ajuda: 'inventario' });
  const atualizar = () => { $('#mx-ok').disabled = sobra() > 0; };
  corpo.addEventListener('change', e => { const c = e.target.closest('[data-desc]'); if (!c) return; if (c.checked) marc.add(c.dataset.desc); else marc.delete(c.dataset.desc); const y = corpo.scrollTop; corpo.innerHTML = montar(); corpo.scrollTop = y; atualizar(); });
  atualizar();
}

/* ---------- render ---------- */
function renderFicha() {
  const p = P(); const c = computar(p);
  $('#f-nome-atual').textContent = `${p.nome || 'Sem nome'} · nv ${p.nivel}`;
  const despSel = selBusca({ valor: p.despertar.id, placeholder: 'Escolher Despertar…',
    opcoes: [{ v: '', l: '— nenhum —' }, ...DESPERTARES.map(x => ({ v: x.id, l: x.n, s: `${faixa(x)} · ${x.rar}` }))],
    onChange: v => { mudar(v ? `Despertar escolhido: ${DESP[v].n}` : 'Despertar removido', q => { q.despertar = { id: v, nv: 1 }; }); renderFicha(); } });
  const titSel = selBusca({ valor: p.titulo, placeholder: 'Nenhum',
    opcoes: [{ v: '', l: '— nenhum —' }, ...TITULOS.map(t => ({ v: t.id, l: t.n, s: t.txt }))],
    onChange: v => { mudar(v ? `Título equipado: ${TIT[v].n}` : 'Título removido', q => { q.titulo = v; }); renderFichaDinamico(); } });
  $('#ficha').innerHTML = `
  <div class="f-bloco s8">${h3t('JANELA DE STATUS', 'status', '<span class="extra" id="f-rank"></span>')}
    <div class="campos">
      ${campo('Nome', txt('nome'), 'largo')}
      ${campo('Jogador(a)', txt('jogador'))}
      ${campo('Antes do despertar', txt('conceito', 'ex.: estudante'))}
      ${campo('Motivo', txt('motivo', 'por que caça?'))}
      ${campo('Nível', numInp('nivel', p.nivel, { min: 1, max: 60 }), '', 'nivel')}
      <div class="campo"><span>XP${ajudaBtn('xp', 'in')}</span>${numInp('xp', p.xp, { min: 0 })}<div class="mini-barra"><i id="f-xp-b"></i></div><div class="mini-info" id="f-xp-i"></div></div>
      ${campo('Potencial', sel('potencial', ['Fraco', 'Normal', 'Forte']), '', 'potencial')}
      ${campo('Rank oficial', sel('rankOficial', RANK_ORDEM), '', 'rankOficial')}
      ${campo('Ouro', numInp('ouro', p.ouro, { min: 0 }), '', 'ouro')}
      ${campo('Título equipado', titSel, '', 'titulo')}
    </div>
  </div>
  <div class="f-bloco s4">${h3t('DESPERTAR', 'despertar', '<span class="extra" id="f-desp-ctl"></span>')}
    ${despSel}<div id="f-desp"></div>
  </div>

  <div class="f-bloco s5">${h3t('ATRIBUTOS', 'atributos', `<span class="extra status-livre">Pontos livres${ajudaBtn('statusPend', 'in')} ${numInp('statusPend', p.statusPend, { min: 0, cls: 'mini' })}</span>`)}
    <div class="f-atribs">${ATRIBUTOS.map(a => `<div class="f-atr">${ajudaBtn('atr_' + a.id, 'canto')}<span class="sigla">${a.id}</span><span class="nome">${a.nome}</span>
      ${numInp('atr.' + a.id, p.atr[a.id], { min: 1 })}<div class="mod" data-stat="${a.id}" data-roll="${a.nome}" id="f-mod-${a.id}" title="Rolar teste"></div><div class="bon" id="f-bon-${a.id}"></div></div>`).join('')}</div>
    <p class="dica" style="margin:8px 0 0">Clique no modificador para rolar um teste do atributo.</p>
  </div>
  <div class="f-bloco s7">${h3t('COMBATE', 'combate', '<span class="extra dica">Clique num valor para rolar</span>')}
    <div class="recurso"><span class="rot" id="f-pv-rot">PV${ajudaBtn('pv', 'in')}</span><div class="barra"><i id="f-pv-b"></i><span id="f-pv-t"></span></div>
      <div class="rec-ctl"><button class="btn mini btn-sec" data-act="rec" data-k="pv" data-v="-5">−5</button>${numInp('', 0, { id: 'f-pv', cls: 'mini' })}<button class="btn mini btn-sec" data-act="rec" data-k="pv" data-v="5">+5</button><button class="btn mini btn-sec" data-act="rec" data-k="pv" data-v="max" title="Restaurar">⟲</button></div></div>
    <div class="recurso"><span class="rot" id="f-pm-rot">PM${ajudaBtn('pm', 'in')}</span><div class="barra pm"><i id="f-pm-b"></i><span id="f-pm-t"></span></div>
      <div class="rec-ctl"><button class="btn mini btn-sec" data-act="rec" data-k="pm" data-v="-5">−5</button>${numInp('', 0, { id: 'f-pm', cls: 'mini' })}<button class="btn mini btn-sec" data-act="rec" data-k="pm" data-v="5">+5</button><button class="btn mini btn-sec" data-act="rec" data-k="pm" data-v="max" title="Restaurar">⟲</button></div></div>
    <div class="f-deriv" id="f-deriv"></div>
    <h3 class="sub-h3"><span class="h3t">ATAQUES${ajudaBtn('ataques', 'in')}</span></h3>
    <div class="ataques" id="f-ataques"></div>
  </div>

  <div class="f-bloco s7">${h3t('HABILIDADES', 'habilidades', '<span class="extra ph-resumo" id="f-ph"></span>')}
    <div class="campos" style="margin-bottom:10px">
      ${campo('PH de subidas de nível', numInp('phNiveis', p.phNiveis, { min: 0 }), '', 'habilidades')}
      ${campo('PH extras (missões)', numInp('phExtra', p.phExtra))}
    </div>
    <div class="lista-f" id="f-habs"></div>
    <div class="f-rodape"><button class="btn mini" data-act="hab-add">＋ Adicionar habilidade</button><button class="btn mini btn-sec" data-act="ir" data-aba="arvores">Ver Árvores</button></div>
  </div>
  <div class="f-bloco s5">${h3t('PERÍCIAS', 'pericias', '<span class="extra" id="f-per-res"></span>')}
    <div class="f-pericias">${PERICIAS.map(pc => `<div class="f-per" id="f-per-${norm(pc.n).replace(/\s/g, '')}"><span class="n">${pc.n} <small>${pc.a}</small></span>
      ${numInp('pericias.' + pc.n, p.pericias[pc.n] || 0, { min: 0, max: c.periciaMax, cls: 'mini' })}<span class="t" data-stat="Perícia ${pc.n}" data-roll="${pc.n}"></span></div>`).join('')}</div>
  </div>

  <div class="f-bloco">${h3t('INVENTÁRIO', 'inventario', '<span class="extra"><button class="btn mini" data-modal="item">⚒ Gerar item</button><button class="btn mini btn-sec" data-act="loja">🛒 Loja</button><button class="btn mini btn-sec" data-act="item-custom">＋ Item próprio</button></span>')}
    <div class="slots" id="f-slots"></div>
    <div id="f-itens"></div>
  </div>

  <div class="f-bloco s6">${h3t('CONDIÇÕES ATIVAS', 'condicoes')}<textarea data-bind="condicoes" placeholder="Ex.: Envenenado (1d6, 2 rodadas)">${esc(p.condicoes)}</textarea></div>
  <div class="f-bloco s6">${h3t('NOTAS', 'notas')}<textarea data-bind="notas" placeholder="Guilda, contatos, missões do Sistema…">${esc(p.notas)}</textarea></div>
  <div class="f-bloco"><details><summary><b style="color:var(--brilho2);letter-spacing:.1em;font-family:var(--fonte-t)">BÔNUS MANUAIS</b>${ajudaBtn('bonus', 'in')} <span class="dica">· efeitos de habilidades ativas, condições ou do Mestre</span></summary>
    <div class="campos" style="margin-top:10px">${[['pv', 'PV máx'], ['pm', 'PM máx'], ['def', 'Defender'], ['esq', 'Esquivar'], ['atk', 'Ataque'], ['dano', 'Dano'], ['rd', 'RD'], ['desl', 'Deslocamento'], ['ini', 'Iniciativa']]
      .map(([k, n]) => campo(n, numInp('bonus.' + k, p.bonus[k]))).join('')}</div>
    <p class="dica">Passivas, Despertar, Título e itens equipados já são somados sozinhos. Use estes campos só para o resto.</p></details></div>`;
  renderFichaDinamico();
}
function stat(k, v, s = '', roll = null) {
  return `<div class="stat ${roll != null ? 'rolavel' : ''}" ${roll != null ? `data-roll="${esc(k)}" data-bonus="${roll}"` : ''} data-stat="${esc(k)}">${ajudaBtn(k, 'canto')}<span class="k">${esc(k)}</span><span class="v">${v}</span>${s ? `<span class="s">${s}</span>` : ''}</div>`;
}
const avisoNivel = new Set();
function renderFichaDinamico() {
  const p = P(); const c = computar(p); if (!$('#f-deriv')) return;
  $('#f-nome-atual').textContent = `${p.nome || 'Sem nome'} · nv ${p.nivel}`;
  $('#f-rank').innerHTML = `Rank <span class="rk rk-${c.rank}">${c.rank}</span>`;
  const xpPct = Math.min(100, (Number(p.xp) || 0) / c.xpProx * 100); const pronto = Number(p.xp) >= c.xpProx;
  $('#f-xp-b').style.width = xpPct + '%';
  $('#f-xp-i').textContent = pronto ? `pronto para o nível ${c.n + 1}!` : `${p.xp || 0} / ${c.xpProx} para o nível ${c.n + 1}`;
  if (pronto && !avisoNivel.has(p.id + ':' + c.n)) { avisoNivel.add(p.id + ':' + c.n); sistema(`XP suficiente para o nível ${c.n + 1}. Use ▲ Nível.`, 'NÍVEL DISPONÍVEL'); }
  // barra de ações: destaca o que faz sentido agora
  const bt = k => $(`.ficha-barra [data-modal="${k}"]`);
  if (bt('nivel')) { bt('nivel').classList.toggle('pulsa', pronto); bt('atrib').classList.toggle('apagado', !!p.passos.atr); bt('desp').classList.toggle('apagado', !!p.despertar.id); }
  ATRIBUTOS.forEach(a => {
    const el = $('#f-mod-' + a.id); el.textContent = sinal(c.m[a.id]); el.dataset.bonus = c.m[a.id];
    const extra = c.atr[a.id] - Number(p.atr[a.id] || 0); $('#f-bon-' + a.id).textContent = extra ? `${sinal(extra)} itens = ${fmt(c.atr[a.id])}` : '';
  });
  const pv = p.pvAtual == null ? c.pvMax : p.pvAtual, pm = p.pmAtual == null ? c.pmMax : p.pmAtual;
  const fpv = $('#f-pv'), fpm = $('#f-pm');
  if (document.activeElement !== fpv) fpv.value = pv; if (document.activeElement !== fpm) fpm.value = pm;
  $('#f-pv-t').textContent = `${pv} / ${c.pvMax}`; $('#f-pm-t').textContent = `${pm} / ${c.pmMax}`;
  $('#f-pv-b').style.width = Math.max(0, Math.min(100, pv / c.pvMax * 100)) + '%';
  $('#f-pv-b').style.background = pv <= 0 ? 'var(--perigo)' : pv <= c.pvMax / 2 ? 'var(--ouro)' : 'var(--ok)';
  $('#f-pm-b').style.width = Math.max(0, Math.min(100, pm / c.pmMax * 100)) + '%';
  const estado = pv <= -c.pvMax ? 'MORTO' : pv <= 0 ? 'NO LIMITE · 1 Ação Principal' : '';
  $('#f-deriv').innerHTML = [
    stat('PV máx', c.pvMax), stat('PM máx', c.pmMax), stat('Deslocamento', fmt(c.desl) + ' m', `Corrida ${fmt(c.desl * 4)} m`), stat('Ações Principais', c.acoes),
    stat('Iniciativa', sinal(c.ini), '', c.ini), stat('Defender', sinal(c.def), '', c.def), stat('Esquivar', sinal(c.esq), '', c.esq),
    stat('Defesa Passiva', c.defPassiva), stat('RD', c.rd),
    ...ATRIBUTOS.map(a => stat('Resist. ' + a.id, sinal(c.res[a.id]), `CD ${a.id} ${c.cd[a.id]}`, c.res[a.id])),
    estado ? `<div class="stat"><span class="k">Estado</span><span class="v estado">${estado}</span></div>` : ''
  ].join('');
  $('#f-ataques').innerHTML = c.ataques.map(a => `<div class="ataque"><span class="n">${esc(a.nome)} <small>${a.dist ? 'distância' : 'corpo a corpo'}${a.maos === 2 ? ' · duas mãos' : ''}</small></span>
    <span class="b" data-roll="Ataque · ${esc(a.nome)}" data-bonus="${a.atk}" data-stat="Ataque · ${esc(a.nome)}" title="Rolar ataque">d20${sinal(a.atk)}</span>
    <span class="b" data-dano="${esc(a.dado + (a.bonus ? (a.bonus > 0 ? '+' : '') + a.bonus : ''))}" data-nome="${esc(a.nome)}" data-stat="Dano · ${esc(a.nome)}" title="Rolar dano">${a.dado}${a.bonus ? sinal(a.bonus) : ''}${a.extra ? ' ' + esc(a.extra) : ''}</span></div>`).join('');
  let gasto = 0;
  PERICIAS.forEach(pc => { const g = Number(p.pericias[pc.n] || 0); gasto += g; const row = $('#f-per-' + norm(pc.n).replace(/\s/g, ''));
    if (!row) return; row.classList.toggle('zero', g === 0); const t = $('.t', row); t.textContent = sinal(c.per[pc.n]); t.dataset.bonus = c.per[pc.n];
    const inp = $('input', row); if (inp) inp.max = c.periciaMax; });
  $('#f-per-res').innerHTML = `<span class="${gasto > c.periciaTotal ? 'no-ok' : ''}">${gasto} / ${c.periciaTotal} pontos</span> · máx ${c.periciaMax}`;
  const rec = phRecebidos(p), gas = phGasto(p);
  $('#f-ph').innerHTML = `PH ${gas} / ${rec} · disponíveis <b>${rec - gas}</b>`;
  const dsp = DESP[p.despertar.id];
  $('#f-desp-ctl').innerHTML = dsp ? `<span class="nv-ctl"><button class="btn-ghost" data-act="desp" data-v="-1" aria-label="Reduzir">−</button><b>nv ${p.despertar.nv}</b><button class="btn-ghost" data-act="desp" data-v="1" aria-label="Aumentar">+</button></span><button class="btn mini btn-sec" data-act="desp-info">Detalhes</button>` : '';
  $('#f-desp').innerHTML = dsp ? `<div class="dica" style="margin-top:8px"><span style="color:${RARIDADE_DESPERTAR[dsp.rar].cor}">${dsp.rar}</span> · Afinidades: ${dsp.afin.map(a => ARV[a].nome).join(', ')} · níveis grátis por Rank: ${despGratis(p)}</div>
    <p style="font-size:13px;margin:6px 0"><b>Efeito:</b> ${esc(dsp.ef)}</p><p style="font-size:13px;margin:6px 0"><b>Por nível:</b> ${esc(dsp.esc)}</p>
    ${p.despertar.nv >= 3 ? `<p style="font-size:13px;margin:6px 0"><b>Nv3:</b> ${esc(dsp.m3)}</p>` : ''}${p.despertar.nv >= 5 ? `<p style="font-size:13px;margin:6px 0"><b>Nv5:</b> ${esc(dsp.m5)}</p>` : ''}
    ${p.despertar.nv >= 5 && c.n >= 20 ? `<p class="forma" style="font-size:13px"><b>Forma Evoluída:</b> ${esc(dsp.forma)}</p>` : ''}${usosHTML(p)}` : '<p class="dica">Sem Despertar. Use o botão <b>✦ Despertar</b> no topo para rolar, ou escolha acima.</p>';
  const ordem = p.habs.filter(x => HAB[x.id]).sort((a, b) => RANK_ORDEM.indexOf(HAB[a.id].r) - RANK_ORDEM.indexOf(HAB[b.id].r) || HAB[a.id].t.localeCompare(HAB[b.id].t));
  $('#f-habs').innerHTML = ordem.length ? ordem.map(x => { const h = HAB[x.id]; const a = ARV[h.t];
    return `<div class="lin"><span class="rk rk-${h.r}">${h.r}</span>
      <span class="meio" data-act="hab-info" data-id="${x.id}" title="Ver detalhes"><span class="t1" style="color:${a.cor}">${a.icone} ${esc(h.n)}</span><span class="t2">${h.tipo}${h.acao !== '—' ? ' · ' + h.acao : ''}${h.pm ? ' · ' + h.pm + ' PM' : ''}${x.gratis ? ' · grátis' : ''} — ${esc(h.ef)}</span></span>
      <span class="dir nv-ctl"><button class="btn-ghost" data-act="hab-menos" data-id="${x.id}" aria-label="Reduzir">−</button><b>nv${x.nv}</b><button class="btn-ghost" data-act="hab-mais" data-id="${x.id}" ${x.nv >= 5 ? 'disabled' : ''} aria-label="Evoluir">+</button>${h.tipo === 'Ativa' ? `<button class="btn-ghost hab-usar" data-act="hab-usar" data-id="${x.id}" aria-label="Usar" title="Usar ${esc(h.n)}">⚡</button>` : ''}<button class="btn-ghost" data-act="hab-info" data-id="${x.id}" aria-label="Detalhes">ⓘ</button></span></div>`; }).join('')
    : '<p class="vazio-msg">Nenhuma habilidade. Use <b>◈ Avaliação</b> no topo ou <b>＋ Adicionar habilidade</b>.</p>';
  renderInventario(p);
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
  const eq = p.itens.filter(i => i.equip), mo = p.itens.filter(i => !i.equip); const s = slots(p);
  const chip = (rot, v, max, aj) => `<span class="slot ${v > max ? 'excede' : v === max ? 'cheio' : ''}">${rot} <b>${v}/${max}</b></span>`;
  $('#f-slots').innerHTML = chip('✋ Mãos', s.maos, 2) + chip('⛨ Armadura', s.arm, 1) + chip('◇ Acessórios', s.ace, 4) + chip('🎒 Inventário', s.mochila, CAP_INV);
  const linha = it => `<div class="lin" style="--cor:${it.cor}"><span class="icone-item">${ICONE_CAT[it.cat] || '✦'}</span>
    <span class="meio" data-act="item-info" data-uid="${it.uid}"><span class="t1" style="color:${it.cor}">${esc(it.nome)}${it.qtd > 1 ? ' ×' + it.qtd : ''}${it.rachado ? ' <span class="no-ok">(rachado)</span>' : ''}</span>
    <span class="t2">${it.rar} · Rank ${it.rank}${it.cat === 'arma' && it.maos === 2 ? ' · 2 mãos' : ''}${it.refino ? ' · +' + it.refino : ''}${it.selos.length ? ' · Sinc. ' + (it.sinc || 0) : ''}${it.afixos.length ? ' · ' + it.afixos.map(a => a.n).join(', ') : ''}${it.linhas[0] ? ' — ' + esc(it.linhas[0]) : ''}</span></span>
    <span class="dir">${EQUIPAVEL.includes(it.cat) ? `<button class="btn mini ${it.equip ? 'btn-ok' : 'btn-sec'}" data-act="item-equip" data-uid="${it.uid}">${it.equip ? 'Equipado' : 'Equipar'}</button>` : usavel(it) ? `<button class="btn mini btn-sec" data-act="item-usar" data-uid="${it.uid}">Usar</button>` : ''}
    <button class="btn-ghost" data-act="item-info" data-uid="${it.uid}" aria-label="Detalhes">ⓘ</button></span></div>`;
  $('#f-itens').innerHTML = (eq.length ? `<div class="inv-grupo">Equipados</div><div class="lista-f">${eq.map(linha).join('')}</div>` : '') +
    `<div class="inv-grupo">Inventário do Sistema (${mo.length}/${CAP_INV})</div>` + (mo.length ? `<div class="lista-f">${mo.map(linha).join('')}</div>` : '<p class="vazio-msg">Vazio.</p>');
}
function alternarEquip(p, uid_) {
  const it = p.itens.find(i => i.uid === uid_); if (!it) return;
  let tirados = [];
  mudar(it.equip ? `Desequipou ${it.nome}` : `Equipou ${it.nome}`, q => { tirados = equiparMut(q, uid_, !it.equip); });
  if (tirados.length) toast(`Sem espaço: ${tirados.map(t => t.nome).join(', ')} voltou para o inventário.`);
  renderFichaDinamico(); setTimeout(() => checarCapacidade(p), 60);
}

/* ---------- habilidades ---------- */
function modalHab(id, voltar) {
  const corpo = abrirModal(HAB[id].n, habDetalheHTML(id), voltar ? [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: voltar }] : [], { aoFechar: renderFichaDinamico });
  corpo.addEventListener('click', e => { const b = e.target.closest('[data-hacao]'); if (!b) return; acaoHab(id, b.dataset.hacao); corpo.innerHTML = habDetalheHTML(id); renderFichaDinamico(); });
}
const addHab = { arv: '', q: '', so: false };
function modalAddHab() {
  const p = P();
  const corpo = abrirModal('Adicionar habilidade', `<div class="ah-topo"><span class="ah-ph">PH disponíveis: <b id="ah-ph"></b></span>
      <input type="search" id="ah-q" placeholder="Buscar por nome ou efeito…" value="${esc(addHab.q)}">
      <label class="ah-so"><input type="checkbox" id="ah-so" ${addHab.so ? 'checked' : ''}> só o que posso pegar agora</label></div>
    <div class="ah-tabs" id="ah-tabs"></div>
    <div class="legenda"><span class="l-pos">Você tem</span><span class="l-disp">Pode adquirir</span><span class="l-caro">Falta PH</span><span class="l-bloq">Falta requisito</span></div>
    <div id="ah-lista"></div>`, [], { largo: true, ajuda: 'habilidades', aoFechar: renderFichaDinamico });
  const estado = h => {
    const x = possui(p, h.id); if (x) return { cls: 'possui', txt: `Você tem · nv${x.nv}` };
    const falta = checarReq(h, p).find(r => !r.ok); if (falta) return { cls: 'bloq', txt: 'Falta: ' + falta.txt };
    const c = custoAquis(h, p); if (phDisp(p) < c) return { cls: 'caro', txt: `Custa ${c} PH (você tem ${phDisp(p)})` };
    return { cls: 'pode', txt: `Pode adquirir · ${c} PH` };
  };
  const desenhar = () => {
    $('#ah-ph').textContent = phDisp(p);
    const q = norm(addHab.q.trim()); const afin = afinidades(p);
    const filtra = h => (!q || norm(h.n + ' ' + h.ef).includes(q)) && (!addHab.so || estado(h).cls === 'pode');
    $('#ah-tabs').innerHTML = [{ id: '', icone: '✦', nome: 'Todas', cor: 'var(--brilho)' }, ...ARVORES].map(a => {
      const n = HABILIDADES.filter(h => (!a.id || h.t === a.id) && estado(h).cls === 'pode').length;
      return `<button class="arv-btn ${addHab.arv === a.id ? 'ativo' : ''}" style="--cor:${a.cor}" data-tab="${a.id}">${a.icone} ${a.nome}${a.id && afin.includes(a.id) ? ' <span class="ah-afim" title="Afinidade do seu Despertar: −1 PH">★</span>' : ''}${n ? ` <span class="ah-n">${n}</span>` : ''}</button>`; }).join('');
    let html = '';
    for (const r of RANK_ORDEM) {
      const hs = HABILIDADES.filter(h => h.r === r && (!addHab.arv || h.t === addHab.arv) && filtra(h)); if (!hs.length) continue;
      html += `<div class="ah-rank"><span class="rk rk-${r}">${r}</span> Rank ${r} · a partir do nível ${RANKS[r].nivel} · adquirir ${RANKS[r].custo} PH${Number(p.nivel) < RANKS[r].nivel ? ' <span class="no-ok">· seu nível ainda não alcança</span>' : ''}</div><div class="ah-grade">` +
        hs.map(h => { const a = ARV[h.t]; const e = estado(h);
          return `<button type="button" class="ah-card ${e.cls}" style="--cor:${a.cor}" data-ver="${h.id}"><span class="ah-n1">${a.icone} ${esc(h.n)}</span><span class="ah-n2">${a.nome} · ${h.tipo}${h.pm ? ' · ' + h.pm + ' PM' : ''}</span><span class="ah-ef">${esc(h.ef)}</span><span class="ah-st">${esc(e.txt)}</span></button>`; }).join('') + '</div>';
    }
    $('#ah-lista').innerHTML = html || '<p class="vazio-msg">Nenhuma habilidade com esses filtros.</p>';
  };
  corpo.addEventListener('input', e => { if (e.target.id === 'ah-q') { addHab.q = e.target.value; desenhar(); } if (e.target.id === 'ah-so') { addHab.so = e.target.checked; desenhar(); } });
  corpo.addEventListener('click', e => { const t = e.target.closest('[data-tab]'); if (t) { addHab.arv = t.dataset.tab; desenhar(); return; } const v = e.target.closest('[data-ver]'); if (v) modalHab(v.dataset.ver, modalAddHab); });
  desenhar(); if (window.innerWidth > 760) $('#ah-q').focus();
}

/* ---------- itens ---------- */
function evoHTML(p, x) {
  const refinavel = ['arma', 'armadura', 'escudo'].includes(x.cat);
  if (!refinavel && !x.selos.length) return '';
  let h = '<div class="evo"><div class="evo-t">EVOLUÇÃO DO ITEM</div>';
  if (refinavel) {
    const ref = Number(x.refino || 0); const N = ref + 1;
    const tem = contarMat(p, 'cristal', x.rank); const custoN = custoRefino(p, N);
    h += `<div class="evo-lin"><span class="evo-k">Refino${ajudaBtn('refino', 'in')}</span>${numInp('', ref, { min: 0, max: 10, id: 'mi-ref', cls: 'mini' })}
      ${ref < 10 ? `<button class="btn mini btn-ok" data-evo="refino">Refinar para +${N}</button>` : '<span class="ok"><b>+10: máximo</b></span>'}</div>`;
    if (ref < 10) h += `<div class="evo-info">Próximo: <b>${custoN} Cristais Rank ${x.rank}</b> (você tem <b class="${tem >= custoN ? 'ok' : 'no-ok'}">${tem}</b>) · sem teste: sobe na hora${x.cat === 'escudo' ? ' · no escudo, cada nível dá +1 de RD' : ''}</div>`;
    if (x.rar !== 'Relíquia') {
      const prox = RANK_ORDEM[RANK_ORDEM.indexOf(x.rank) + 1];
      if (prox) { const nuc = contarMat(p, 'nucleo', prox);
        h += `<div class="evo-lin"><span class="evo-k">Ascensão${ajudaBtn('ascensao', 'in')}</span><span class="evo-info" style="margin:0;flex:1">Rank ${x.rank} → ${prox}: precisa de Refino +10${ref >= 10 ? ' ✓' : ` (está em +${ref})`} e 1 Núcleo Rank ${prox} (você tem <b class="${nuc ? 'ok' : 'no-ok'}">${nuc}</b>)</span>
          <button class="btn mini ${ref >= 10 ? 'btn-ok' : 'btn-sec'}" data-evo="ascender" ${ref >= 10 ? '' : 'disabled'}>Ascender</button></div>`; }
      else h += `<div class="evo-info">Rank S: o máximo.</div>`;
    } else h += `<div class="evo-info">Relíquia: acompanha o Rank do portador e não precisa Ascender.</div>`;
  }
  if (x.selos.length) {
    const sc = Number(x.sinc || 0); const prox = [3, 8, 15, ...(x.rar === 'Lendário' ? [25] : [])].find(v => v > sc);
    h += `<div class="evo-lin"><span class="evo-k">Sincronia${ajudaBtn('sincronia', 'in')}</span>${numInp('', sc, { min: 0, id: 'mi-sinc', cls: 'mini' })}<span class="evo-info" style="margin:0">${prox ? `próximo despertar em ${prox} · +1 a cada Chefe derrotado com o item equipado` : 'todos os Selos abertos'}</span></div>`;
  }
  return h + '</div>';
}
function avisarSelos(it, antes) {
  if (!it) return; const agora = Number(it.sinc || 0);
  [3, 8, 15].forEach((v, i) => { if (antes < v && agora >= v && it.selos[i]) sistema(`${it.nome}: ${it.selos[i].n}. ${it.selos[i].t}`, 'SELO DESPERTADO', 'ouro'); });
  if (it.rar === 'Lendário' && antes < 25 && agora >= 25) sistema(`${it.nome} despertou seu poder único. Fale com o Mestre!`, 'DESPERTAR DO ITEM', 'ouro');
}
function modalItem(uid_) {
  const p = P(); const pega = () => p.itens.find(i => i.uid === uid_); const it = pega(); if (!it) return;
  const equipavel = EQUIPAVEL.includes(it.cat);
  const montar = () => {
    const x = pega(); if (!x) return '<p class="vazio-msg">Este item não está mais na ficha.</p>';
    let efs = '';
    if (equipavel) efs = x.equip ? efeitosHTML(inverter(prever(p, c => equiparMut(c, uid_, false))), 'Efeito atual na ficha')
      : efeitosHTML(prever(p, c => equiparMut(c, uid_, true)), 'Ao equipar (o que estiver no lugar volta para o inventário)');
    const { semReq } = brItem(x, p);
    const ctlQtd = x.cat === 'consumivel' || x.qtd ? `<div class="campos" style="margin-top:12px">${campo('Quantidade', numInp('', x.qtd || 1, { min: 1, id: 'mi-qtd' }), '', x.mat === 'cristal' ? 'cristal' : x.mat === 'nucleo' ? 'nucleo' : '')}</div>` : '';
    const extraAj = x.afixos.length || x.selos.length ? `<div class="dica" style="margin-top:6px">${x.afixos.length ? `Afixos${ajudaBtn('afixos', 'in')}` : ''} ${x.selos.length ? `· Selos${ajudaBtn('selos', 'in')}` : ''} ${x.mat ? '' : ''}</div>` : x.mat ? `<div class="dica" style="margin-top:6px">O que é isso?${ajudaBtn(x.mat === 'cristal' ? 'cristal' : 'nucleo', 'in')}</div>` : '';
    return itemCard(x) + extraAj + (semReq ? `<p class="no-ok" style="font-size:13px">Você não cumpre o requisito de atributo: o item funciona como Rank E.</p>` : '') + efs + evoHTML(p, x) + ctlQtd;
  };
  const corpo = abrirModal(it.nome, montar(), [
    { label: 'Descartar', cls: 'btn-perigo', onClick: () => { if (!confirm(`Descartar "${it.nome}"?`)) return false; mudar(`Descartou ${it.nome}`, q => { q.itens = q.itens.filter(i => i.uid !== uid_); }); } },
    { label: '📤 Enviar', cls: 'btn-sec', fechar: false, onClick: () => compartilharItem(pega(), { remover: () => { mudar(`Entregou ${it.nome}`, q => { q.itens = q.itens.filter(i => i.uid !== uid_); }); renderFichaDinamico(); }, voltar: () => modalItem(uid_) }) },
    ...(usavel(it) ? [{ label: 'Usar', cls: 'btn-sec', fechar: false, onClick: () => usarItem(uid_) }] : []),
    ...(equipavel ? [{ label: it.equip ? 'Desequipar' : 'Equipar', cls: it.equip ? 'btn-sec' : 'btn-ok', onClick: () => alternarEquip(p, uid_) }] : []),
    { label: 'Fechar', cls: 'btn-sec' }
  ], { aoFechar: renderFichaDinamico });
  const redesenhar = () => { const y = corpo.scrollTop; corpo.innerHTML = montar(); corpo.scrollTop = y; };
  corpo.addEventListener('change', e => {
    const x = pega(); if (!x) return; const id = e.target.id; const v = Number(e.target.value) || 0;
    if (id === 'mi-ref') { const n = clampInt(v, 0, 10); if (n !== Number(x.refino || 0)) mudar(`Refino de ${x.nome} ajustado à mão: +${n}`, () => { x.refino = n; }); }
    if (id === 'mi-sinc') { const antes = Number(x.sinc || 0); const n = Math.max(0, Math.round(v)); if (n !== antes) { mudar(`Sincronia de ${x.nome}: ${antes} → ${n}`, () => { x.sinc = n; }); avisarSelos(x, antes); } }
    if (id === 'mi-qtd') { const n = Math.max(1, Math.round(v)); if (n !== Number(x.qtd || 1)) mudar(`Quantidade de ${x.nome}: ${n}`, () => { x.qtd = n; }); }
    redesenhar(); renderFichaDinamico();
  });
  corpo.addEventListener('click', e => {
    const b = e.target.closest('[data-evo]'); if (!b) return;
    if (b.dataset.evo === 'refino') modalRefino(uid_);
    if (b.dataset.evo === 'ascender') modalAscensao(uid_);
  });
}
function custoRefino(p, N) { return p.despertar.id === 'd16' ? Math.max(1, N - 1) : N; } // Mestre das Runas: 1 cristal a menos por nível
function modalRefino(uid_) {
  const p = P(); const x = p.itens.find(i => i.uid === uid_); if (!x) return;
  const N = Number(x.refino || 0) + 1; if (N > 10) return; const custo = custoRefino(p, N); const tem = contarMat(p, 'cristal', x.rank);
  const ganho = x.cat === 'arma' ? '+1 no ataque e +1 no dano' : x.cat === 'escudo' ? '+1 de RD' : '+1 em Defender';
  abrirModal(`Refino: ${x.nome}`, `<div class="intro"><p>Levar o item de <b>+${N - 1}</b> para <b>+${N}</b> (${ganho}).</p>
    <ul><li><b>Custo:</b> ${custo} Cristais de Mana Rank ${x.rank}${custo < N ? ' (Mestre das Runas: 1 a menos)' : ''}. Você tem <b class="${tem >= custo ? 'ok' : 'no-ok'}">${tem}</b> na ficha.</li>
    <li><b>Sem teste:</b> o item sobe na hora. Feito fora de combate, em 1 minuto.</li></ul></div>
    <label class="chk"><input type="checkbox" id="rf-gastar" ${tem >= custo ? 'checked' : ''}> Descontar os ${custo} cristais da ficha</label>
    ${tem < custo ? '<p class="dica">Você não tem cristais suficientes na ficha. Deixe desmarcado só se o Mestre entregou os cristais por fora.</p>' : ''}`,
    [{ label: '← Voltar ao item', cls: 'btn-sec', fechar: false, onClick: () => modalItem(uid_) },
     { label: `Refinar para +${N}`, cls: 'btn-ok', fechar: false, onClick: resolver }], { ajuda: 'refino' });
  function resolver() {
    const gastar = $('#rf-gastar').checked; const antes = clone(p);
    mudar(`Refino +${N} em ${x.nome}${gastar ? ` (${custo} Cristais Rank ${x.rank})` : ''}`, q => { if (gastar) gastarMat(q, 'cristal', x.rank, custo); x.refino = N; });
    sistema(`Refino +${N} concluído: ${x.nome}`, 'REFINO');
    const efs = diferenca(achatar(computar(antes)), achatar(computar(p)));
    abrirModal(`Refino: ${x.nome}`, janela(`REFINO +${N}`, `<p class="res-g ok">${esc(x.nome)} agora está +${N}.</p>`) + efeitosHTML(efs, 'Mudanças na ficha') +
      (x.refino >= 10 ? '<p class="ok">Refino +10! Agora o item pode <b>Ascender</b> com um Núcleo de Chefe do Rank seguinte.</p>' : ''),
      [{ label: '← Voltar ao item', cls: 'btn-sec', fechar: false, onClick: () => modalItem(uid_) }, ...(x.refino < 10 ? [{ label: `Refinar para +${x.refino + 1}`, cls: 'btn-ok', fechar: false, onClick: () => modalRefino(uid_) }] : [])], { aoFechar: renderFichaDinamico });
    renderFichaDinamico();
  }
}
function modalAscensao(uid_) {
  const p = P(); const x = p.itens.find(i => i.uid === uid_); if (!x) return;
  const prox = RANK_ORDEM[RANK_ORDEM.indexOf(x.rank) + 1]; if (!prox) return;
  const cat = catAfixo(x); const tab = AFIXOS[cat]; const dado = DADO_AFIXO[cat]; const tem = contarMat(p, 'nucleo', prox);
  let escolhido = null, rolTxt = '';
  const repetido = a => x.afixos.some(z => z.n === a[0]);
  const aplicar = (c, eu) => { const y = c.itens.find(i => i.uid === uid_); if (eu && $('#as-gastar') && $('#as-gastar').checked) gastarMat(c, 'nucleo', prox, 1);
    y.rank = prox; y.refino = 5; if (escolhido) y.afixos.push({ n: escolhido[0], s: escolhido[1], t: '' }); recalcularX(y); };
  const montar = () => { const brA = RANKS[x.rank].br, brB = RANKS[prox].br;
    return `<div class="intro">${AJUDA.ascensao.txt}</div>
    <div class="evo"><div class="evo-t">REQUISITOS</div>
      <div class="${Number(x.refino) >= 10 ? 'ok' : 'no-ok'}">${Number(x.refino) >= 10 ? '✓' : '✗'} Refino +10 (está em +${x.refino || 0})</div>
      <div class="${tem ? 'ok' : 'no-ok'}">${tem ? '✓' : '✗'} 1 Núcleo de Chefe Rank ${prox} na ficha (você tem ${tem})</div>
      <label class="chk"><input type="checkbox" id="as-gastar" ${tem ? 'checked' : 'disabled'}> Descontar 1 Núcleo Rank ${prox} da ficha</label>
      ${tem ? '' : `<label class="chk"><input type="checkbox" id="as-fora"> O Núcleo está fora da ficha ou o Mestre autorizou</label>`}</div>
    <div class="evo"><div class="evo-t">NOVO AFIXO (role 1d${dado} na tabela de ${cat === 'arma' ? 'armas' : cat === 'acessorio' ? 'acessórios' : 'armaduras e escudos'})</div>
      <div class="acoes" style="margin:0 0 8px"><button class="btn mini btn-ok" data-as="rolar">🎲 Sortear no sistema</button>
        <span class="lado">${numInp('', '', { min: 1, max: dado, id: 'as-num', cls: 'mini' })}<button class="btn mini btn-sec" data-as="num">✎ Usar número da mesa</button></span></div>
      ${rolTxt ? `<p class="dica">${esc(rolTxt)}</p>` : ''}
      <div class="tab-afx">${tab.map((a, i) => `<button type="button" class="afx-l ${repetido(a) ? 'tem' : ''} ${escolhido === a ? 'sel' : ''}" data-afx="${i}" ${repetido(a) ? 'disabled' : ''}><b>${i + 1}</b> ${esc(a[0])}<span>${esc(fxX(a[2], 1 + brB))}</span></button>`).join('')}</div></div>
    <div class="evo"><div class="evo-t">RESULTADO</div><p>Rank <b>${x.rank} → ${prox}</b> · Bônus de Rank ${brA} → <b>${brB}</b> · X ${1 + brA} → <b>${1 + brB}</b> · Refino +${x.refino || 0} → <b>+5</b>${escolhido ? ` · novo afixo <b>${esc(escolhido[0])}</b>` : ' · <span class="no-ok">escolha o afixo</span>'}</p>
    ${x.equip ? efeitosHTML(prever(p, c => aplicar(c, false)), 'Mudanças na ficha') : '<p class="dica">O item não está equipado: a ficha só muda quando você equipá-lo.</p>'}</div>`; };
  const corpo = abrirModal(`Ascensão: ${x.nome}`, montar(), [
    { label: '← Voltar ao item', cls: 'btn-sec', fechar: false, onClick: () => modalItem(uid_) },
    { label: 'Confirmar Ascensão', cls: 'btn-ok', id: 'as-ok', fechar: false, onClick: () => {
      if (!podeConfirmar()) return;
      mudar(`Ascensão: ${x.nome} Rank ${x.rank} → ${prox} (+ ${escolhido[0]})`, q => aplicar(q, true));
      sistema(`${x.nome} ascendeu ao Rank ${prox}! Novo afixo: ${escolhido[0]}.`, 'ASCENSÃO', 'ouro');
      renderFichaDinamico(); modalItem(uid_); } }], { ajuda: 'ascensao', largo: true, aoFechar: renderFichaDinamico });
  const podeConfirmar = () => !!escolhido && Number(x.refino) >= 10 && (($('#as-gastar') && $('#as-gastar').checked) || ($('#as-fora') && $('#as-fora').checked));
  const atualizar = () => { const y = corpo.scrollTop; const g = $('#as-gastar') && $('#as-gastar').checked, f = $('#as-fora') && $('#as-fora').checked; corpo.innerHTML = montar(); if ($('#as-gastar') && !$('#as-gastar').disabled) $('#as-gastar').checked = g; if ($('#as-fora')) $('#as-fora').checked = f; corpo.scrollTop = y; $('#as-ok').disabled = !podeConfirmar(); };
  corpo.addEventListener('click', e => {
    const a = e.target.closest('[data-afx]'); if (a) { escolhido = tab[Number(a.dataset.afx)]; rolTxt = 'Escolhido na lista.'; atualizar(); return; }
    const b = e.target.closest('[data-as]'); if (!b) return;
    if (b.dataset.as === 'rolar') { if (!tab.some(z => !repetido(z))) return toast('O item já tem todos os afixos da tabela.'); const hist = []; let n; do { n = d(dado); hist.push(n); } while (repetido(tab[n - 1])); escolhido = tab[n - 1]; rolTxt = `1d${dado}: ${hist.join(' → repetido, de novo: ')} = ${escolhido[0]}`; atualizar(); }
    if (b.dataset.as === 'num') { const n = Number($('#as-num').value); if (!(n >= 1 && n <= dado)) return toast(`Informe um número de 1 a ${dado}.`); if (repetido(tab[n - 1])) return toast(`${tab[n - 1][0]} já está no item: role de novo.`); escolhido = tab[n - 1]; rolTxt = `Número da mesa: ${n} = ${escolhido[0]}`; atualizar(); }
  });
  corpo.addEventListener('change', e => { if (e.target.id === 'as-gastar' || e.target.id === 'as-fora') $('#as-ok').disabled = !podeConfirmar(); });
  $('#as-ok').disabled = !podeConfirmar();
}
function usarItem(uid_) {
  const p = P(); const it = p.itens.find(i => i.uid === uid_); if (!it) return; const c = computar(p);
  const consumir = q => { const y = q.itens.find(i => i.uid === uid_); if (y.qtd > 1) y.qtd--; else q.itens = q.itens.filter(i => i.uid !== uid_); };
  if (/^Pó de Purificação/.test(it.nome)) {
    const rach = p.itens.filter(i => ['arma', 'armadura', 'escudo', 'acessorio'].includes(i.cat));
    if (!rach.length) { toast('Nenhum equipamento na ficha.'); return; }
    const corpo = abrirModal('Pó de Purificação', `<p>Escolha o item amaldiçoado. A maldição some e o afixo invertido volta ao normal (ajuste o texto do item se precisar).</p><div class="lista-f">${rach.map(i => `<button type="button" class="lin" data-pur="${i.uid}" style="text-align:left"><span class="icone-item" style="--cor:${i.cor}">${ICONE_CAT[i.cat]}</span><span class="meio"><span class="t1">${esc(i.nome)}</span></span><span></span></button>`).join('')}</div>`, [{ label: 'Cancelar', cls: 'btn-sec' }]);
    corpo.addEventListener('click', e => { const b = e.target.closest('[data-pur]'); if (!b) return; const alvo = p.itens.find(i => i.uid === b.dataset.pur);
      mudar(`Purificou ${alvo.nome} (maldição removida)`, q => { const y = q.itens.find(i => i.uid === alvo.uid); if (y) y.maldito = false; consumir(q); }); sistema(`Purificação concluída: ${alvo.nome}`); fecharModal(); renderFichaDinamico(); });
    return;
  }
  if (it.ensina) {
    const h = HAB[it.ensina]; if (possui(p, h.id)) return toast('Você já possui esta habilidade.');
    if (c.n < RANKS[h.r].nivel) return toast(`Requer nível ${RANKS[h.r].nivel}.`);
    mudar(`Aprendeu ${h.n} com um Pergaminho`, q => { q.habs.push({ id: h.id, nv: 1, gratis: true }); consumir(q); }); sistema(`Habilidade aprendida: ${h.n}`);
  } else if (it.usoDado) {
    const r = rolarExp(it.usoDado); const k = it.usoAlvo === 'pm' ? 'pmAtual' : 'pvAtual'; const max = it.usoAlvo === 'pm' ? c.pmMax : c.pvMax;
    mudar(`Usou ${it.nome} (+${r.total} ${it.usoAlvo === 'pm' ? 'PM' : 'PV'})`, q => { const cur = q[k] == null ? max : q[k]; q[k] = Math.min(max, cur + r.total); consumir(q); });
    mostrarRolagem(it.nome, `+${r.total} ${it.usoAlvo === 'pm' ? 'PM' : 'PV'}`, r.txt);
  }
  if (modalAberto()) fecharModal();
  renderFichaDinamico();
}
function modalItemProprio() {
  abrirModal('Item próprio', `<p class="dica" style="margin-top:0">Use para registrar um item que veio da mesa (rolado com dados físicos, comprado, dado pelo Mestre).</p><div class="campos">
    <label class="campo largo"><span>Nome</span><input type="text" id="ip-n" placeholder="ex.: Amuleto da avó"></label>
    <label class="campo"><span>Tipo</span><select id="ip-c"><option value="outro">Outro</option><option value="consumivel">Consumível</option><option value="arma">Arma</option><option value="armadura">Armadura</option><option value="escudo">Escudo</option><option value="acessorio">Acessório</option></select></label>
    <label class="campo"><span>Rank</span><select id="ip-r">${RANK_ORDEM.map(r => `<option>${r}</option>`).join('')}</select></label>
    <label class="campo"><span>Raridade</span><select id="ip-rar">${RARIDADES.map(r => `<option>${r.n}</option>`).join('')}</select></label>
    <label class="campo"><span>Dano (armas)</span><input type="text" id="ip-d" placeholder="1d8"></label>
    <label class="campo"><span>Atributo (armas)</span><select id="ip-a">${ATRIBUTOS.map(a => `<option>${a.id}</option>`).join('')}</select></label>
    <label class="campo"><span>Mãos (armas)</span><select id="ip-m"><option value="1">Uma mão</option><option value="2">Duas mãos</option></select></label>
    <label class="campo"><span>Acessório (tipo)</span><select id="ip-ac">${ACESSORIOS.map(a => `<option>${a}</option>`).join('')}</select></label>
    <label class="campo"><span>Armadura</span><select id="ip-t">${ARMADURAS.map(a => `<option value="${a.tipo}">${a.tipo}</option>`).join('')}</select></label>
    ${campo('Refino', numInp('', 0, { min: 0, max: 10, id: 'ip-ref' }))}
    ${campo('Quantidade', numInp('', 1, { min: 1, id: 'ip-q' }))}</div>
    <label class="campo" style="margin-top:10px"><span>Descrição e afixos</span><textarea id="ip-txt" placeholder="O que o item faz"></textarea></label>`, [
    { label: 'Cancelar', cls: 'btn-sec' },
    { label: 'Guardar na ficha', cls: 'btn-ok', onClick: () => {
      const nome = $('#ip-n').value.trim(); if (!nome) { toast('Dê um nome ao item.'); return false; }
      const cat = $('#ip-c').value, rank = $('#ip-r').value, br = RANKS[rank].br; const rar = RARIDADES.find(r => r.n === $('#ip-rar').value);
      const it = itemBase(cat, nome, { rank, X: 1 + br, rar: rar.n, cor: rar.cor, refino: Number($('#ip-ref').value) || 0, linhas: $('#ip-txt').value.trim() ? [$('#ip-txt').value.trim()] : [] });
      const q = Number($('#ip-q').value) || 1; if (q > 1 || cat === 'consumivel') it.qtd = q;
      if (cat === 'arma') Object.assign(it, { dano: $('#ip-d').value.trim() || '1d6', atr: $('#ip-a').value, dist: false, maos: Number($('#ip-m').value) });
      if (cat === 'armadura') it.armTipo = $('#ip-t').value;
      if (cat === 'acessorio') it.base = $('#ip-ac').value;
      if (/^Cristal de Mana/i.test(nome)) it.mat = 'cristal'; if (/^Núcleo de Chefe/i.test(nome)) it.mat = 'nucleo';
      guardarItem(P(), it, { msg: 'Item registrado' });
    } }]);
}

/* ---------- telas de contexto dos botões da ficha ---------- */
function modalIntro(cfg) {
  return abrirModal(cfg.titulo, `<div class="intro">${AJUDA[cfg.ajuda].txt}</div>${cfg.contexto ? `<div class="contexto">${cfg.contexto}</div>` : ''}${cfg.html || ''}`, [
    { label: 'Cancelar', cls: 'btn-sec' },
    ...(cfg.informar ? [{ label: cfg.rotInformar || '✎ Já rolei na mesa', cls: 'btn-sec', fechar: false, onClick: cfg.informar }] : []),
    { label: cfg.rotRolar || '🎲 Rolar no sistema', cls: 'btn-ok', fechar: false, onClick: cfg.rolar }], { ajuda: cfg.ajuda, largo: cfg.largo });
}
let guiaAtivo = false;
function voltarGuia() { if (guiaAtivo) setTimeout(modalGuia, 450); }
function modalAtrib() {
  const p = P();
  const ctx = p.passos.atr || Number(p.nivel) > 1 ? `<p class="aviso">⚠ Esta ficha já tem atributos${Number(p.nivel) > 1 ? ' e já passou do nível 1' : ''}. Rolar de novo substitui os valores atuais. Normalmente isso só acontece na criação.</p>` : '<p class="ok">Ficha nova: é hora de rolar os atributos.</p>';
  modalIntro({ titulo: '🎲 Rolar atributos', ajuda: 'm_atrib', contexto: ctx, rotInformar: '✎ Já rolei na mesa',
    rolar: () => { const rol = {}; ATRIBUTOS.forEach(a => { rol[a.id] = [d(6), d(6)]; }); resultadoAtrib(d(6), rol); },
    informar: formAtrib });
}
function formAtrib() {
  abrirModal('🎲 Informar atributos', `<p>Digite o que saiu nos dados físicos: o d6 do Potencial e a <b>soma dos 2d6</b> de cada atributo.</p>
    <div class="campos">${campo('Potencial (1d6)', numInp('', 4, { min: 1, max: 6, id: 'fa-pot' }))}
    ${ATRIBUTOS.map(a => campo(`${a.id} (2d6)`, numInp('', 7, { min: 2, max: 12, id: 'fa-' + a.id }))).join('')}</div>`,
    [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: modalAtrib },
     { label: 'Ver resultado', cls: 'btn-ok', fechar: false, onClick: () => { const rol = {}; ATRIBUTOS.forEach(a => { rol[a.id] = [clampInt($('#fa-' + a.id).value, 2, 12)]; }); resultadoAtrib(clampInt($('#fa-pot').value, 1, 6), rol, true); } }], { ajuda: 'm_atrib' });
}
function resultadoAtrib(dp, rol, manual) {
  const p = P();
  const pot = dp <= 2 ? { n: 'Fraco', b: 6, st: 6, ph: 2 } : dp <= 4 ? { n: 'Normal', b: 8, st: 3, ph: 1 } : { n: 'Forte', b: 10, st: 0, ph: 0 };
  const vals = {}; ATRIBUTOS.forEach(a => { vals[a.id] = pot.b + rol[a.id].reduce((x, y) => x + y, 0); });
  const aplicar = c => { c.atr = { ...vals }; c.potencial = pot.n; c.statusPend = Math.max(0, Number(c.statusPend || 0) - Number(c.compPot.st || 0) + pot.st); c.compPot = { ph: pot.ph, st: pot.st }; c.passos.atr = true; };
  const efs = prever(p, aplicar);
  abrirModal('🎲 Atributos', janela(manual ? 'STATUS (valores da mesa)' : 'STATUS', `<p>Potencial (1d6 = ${dp}): <b>${pot.n}</b> · base ${pot.b}${pot.st ? ` · compensação +${pot.st} Pontos de Status e +${pot.ph} PH` : ''}</p>
    <div class="atrib-res">${ATRIBUTOS.map(a => { const dif = vals[a.id] - Number(p.atr[a.id]);
      return `<div><small>${a.id}</small><b>${vals[a.id]}</b><small>${sinal(mod(vals[a.id]))} · [${rol[a.id].join('+')}]</small>${dif ? `<small class="${dif > 0 ? 'ok' : 'no-ok'}">${dif > 0 ? '▲' : '▼'}${Math.abs(dif)}</small>` : ''}</div>`; }).join('')}</div>`) +
    efeitosHTML(efs, `Mudanças na ficha "${p.nome}"`) + `<p class="dica">Os atributos atuais da ficha serão substituídos.</p>`,
    [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: modalAtrib }, { label: 'Aplicar à ficha', cls: 'btn-ok', onClick: () => { mudar(`Atributos rolados (Potencial ${pot.n})`, aplicar); renderFicha(); sistema('Atributos definidos.'); voltarGuia(); } }], { ajuda: 'm_atrib' });
}
function modalDesp() {
  const p = P(); const atual = DESP[p.despertar.id];
  const corpo = modalIntro({ titulo: '✦ Despertar', ajuda: 'm_desp',
    contexto: atual ? `<p class="aviso">⚠ Você já tem o Despertar <b>${esc(atual.n)}</b>. Rolar de novo troca o Despertar e só deve acontecer com permissão do Mestre.</p>` : '<p class="ok">Você ainda não Despertou.</p>',
    html: `<div class="lado" style="flex-wrap:wrap;gap:12px"><div class="campo" style="width:220px"><span>Já rolou na mesa? d100</span>${numInp('', '', { min: 1, max: 100, id: 'dp-d100' })}</div>
      <button class="btn btn-sec" data-dp="lista" style="align-self:end">📖 Escolher da lista (Escolha Guiada)</button></div>`,
    rotInformar: '✎ Usar o d100 informado', informar: () => { const v = Number($('#dp-d100').value); if (!(v >= 1 && v <= 100)) { toast('Informe um valor de 1 a 100.'); return; } resultadoDesp(v); },
    rolar: () => resultadoDesp(d(100)) });
  corpo.addEventListener('click', e => { if (e.target.closest('[data-dp="lista"]')) resultadoDesp(null, p.despertar.id || DESPERTARES[0].id); });
}
function resultadoDesp(rol, idInicial) {
  const p = P(); let x = idInicial ? DESP[idInicial] : DESPERTARES.find(z => rol >= z.d[0] && rol <= z.d[1]); let r0 = rol;
  const aplicar = (c, z) => { const r = RARIDADE_DESPERTAR[z.rar]; c.despertar = { id: z.id, nv: 1 }; c.statusPend = Math.max(0, Number(c.statusPend || 0) - Number(c.compDesp.st || 0) + r.status); c.compDesp = { ph: r.ph, st: r.status }; };
  const montar = z => {
    const r = RARIDADE_DESPERTAR[z.rar]; const efs = prever(p, c => aplicar(c, z));
    const phAntes = phDisp(p); const tmp = clone(p); aplicar(tmp, z); const phDepois = phDisp(tmp);
    const phEf = phDepois !== phAntes ? [{ k: 'PH disponíveis', d: phDepois - phAntes, up: phDepois > phAntes }] : [];
    return (r0 ? `<div class="res-t" style="margin-bottom:6px">[ d100 = ${r0} ]</div>` : '<div class="res-t" style="margin-bottom:6px">[ ESCOLHA GUIADA ]</div>') + despCard(z) + `<p class="dica">Compensação: ${r.txt}</p>` +
      efeitosHTML([...efs, ...phEf], `Mudanças na ficha "${p.nome}"`) +
      `<div class="campo" style="margin-top:10px"><span>Escolha Guiada (opcional, com permissão do Mestre)</span>${selBusca({ valor: z.id, opcoes: DESPERTARES.map(y => ({ v: y.id, l: y.n, s: `${faixa(y)} · ${y.rar}` })), onChange: v => { x = DESP[v]; r0 = null; corpo.innerHTML = montar(x); } })}</div>`;
  };
  const corpo = abrirModal('✦ Despertar', montar(x), [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: modalDesp }, { label: 'Aplicar à ficha', cls: 'btn-ok', onClick: () => { mudar(`Despertar: ${x.n}${r0 ? ` (d100 = ${r0})` : ''}`, c => aplicar(c, x)); renderFicha(); sistema(`Despertar: ${x.n}`, 'DESPERTAR'); voltarGuia(); } }], { ajuda: 'm_desp' });
}
function modalAval(direto) {
  const p = P(); const rk = rankDoNivel(Number(p.nivel) || 1);
  if (direto) return sorteioAval(rk);
  modalIntro({ titulo: '◈ Avaliação do Sistema', ajuda: 'm_aval',
    contexto: `<p>Seu Rank atual é <b>${rk}</b>${p.habs.some(x => x.gratis) ? '' : ' e você ainda não recebeu nenhuma habilidade de graça'}.</p>`,
    html: `<label class="campo" style="max-width:220px"><span>Rank da Avaliação</span><select id="av-rk0">${RANK_ORDEM.map(r => `<option ${r === rk ? 'selected' : ''}>${r}</option>`).join('')}</select></label>`,
    rotRolar: '🎲 Sortear 3 opções', rotInformar: '✎ Escolher na lista', informar: () => escolhaAval($('#av-rk0').value), rolar: () => sorteioAval($('#av-rk0').value) });
}
function receberAval(id) { mudar(`Avaliação do Sistema: ${HAB[id].n}`, q => { q.habs.push({ id, nv: 1, gratis: true }); }); renderFichaDinamico(); sistema(`Recompensa recebida: ${HAB[id].n}`, 'AVALIAÇÃO'); voltarGuia(); }
function sorteioAval(rk) {
  const p = P();
  const sortear = () => { let pool = HABILIDADES.filter(h => h.r === rk && !possui(p, h.id)); if (pool.length < 3) pool = HABILIDADES.filter(h => h.r === rk); return shuffle(pool).slice(0, 3); };
  const ops = sortear();
  const corpo = abrirModal(`◈ Avaliação do Sistema · Rank ${rk}`, `<p class="dica" style="margin-top:0">Escolha uma. Ela entra na ficha de graça, no nível 1.</p>
    <div class="aval-ops">${ops.map(h => habCard(h, efeitosHTML(prever(p, c => { if (!possui(c, h.id)) c.habs.push({ id: h.id, nv: 1, gratis: true }); }), 'Muda na ficha') +
      `<div class="acoes"><button class="btn btn-ok mini" data-escolher="${h.id}" ${possui(p, h.id) ? 'disabled' : ''}>${possui(p, h.id) ? 'Já possui' : 'Escolher esta'}</button></div>`)).join('')}</div>`,
    [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: () => modalAval() }], { largo: true, ajuda: 'm_aval' });
  corpo.addEventListener('click', e => { const b = e.target.closest('[data-escolher]'); if (!b) return; receberAval(b.dataset.escolher); fecharModal(); });
}
function escolhaAval(rk) {
  const p = P(); const lista = HABILIDADES.filter(h => h.r === rk && !possui(p, h.id)); let sel = lista[0] ? lista[0].id : null;
  const montar = () => `<p class="dica" style="margin-top:0">Use quando o sorteio foi feito na mesa ou quando o Mestre deu uma habilidade específica.</p>
    <div class="campo"><span>Habilidade Rank ${rk}</span>${selBusca({ valor: sel, opcoes: lista.map(h => ({ v: h.id, l: h.n, s: ARV[h.t].nome })), onChange: v => { sel = v; corpo.innerHTML = montar(); } })}</div>
    <div style="margin-top:10px">${sel ? habCard(HAB[sel], efeitosHTML(prever(p, c => { c.habs.push({ id: sel, nv: 1, gratis: true }); }), 'Muda na ficha')) : '<p class="vazio-msg">Nada disponível neste Rank.</p>'}</div>`;
  const corpo = abrirModal(`◈ Avaliação · escolher Rank ${rk}`, montar(), [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: () => modalAval() }, { label: 'Receber de graça', cls: 'btn-ok', onClick: () => { if (!sel) return false; receberAval(sel); } }], { ajuda: 'm_aval' });
}
function modalNivel() {
  const p = P(); const c = computar(p); const pronto = Number(p.xp) >= c.xpProx;
  const rolar = () => { const a = d(6); if (a === 1) { const b = d(6); return { v: b, txt: `1 → rerrolado ${b}` }; } return { v: a, txt: String(a) }; };
  const st = { v: 2, txt: 'fixo' };
  modalIntro({ titulo: '▲ Subir de nível', ajuda: 'm_nivel',
    contexto: pronto ? `<p class="ok">XP ${p.xp}/${c.xpProx}: pronto para o nível ${c.n + 1}!</p>` : `<p class="aviso">⚠ XP ${p.xp || 0}/${c.xpProx}: ainda faltam ${c.xpProx - (Number(p.xp) || 0)} XP. Suba só se o Mestre mandou (regra de marcos).</p>`,
    html: `<div class="campos" style="max-width:440px">${campo('Já rolou? d6 de PH', numInp('', '', { min: 1, max: 6, id: 'nv-ph' }))}</div><p class="dica">Pontos de Status são sempre 2 por nível. No d6 de PH, um 1 é rerrolado uma vez (Bênção do Sistema): informe o resultado final.</p>`,
    rotInformar: '✎ Usar o valor informado', informar: () => { const b = Number($('#nv-ph').value); if (!(b >= 1 && b <= 6)) { toast('Informe o d6 de PH (1 a 6).'); return; } resultadoNivel(st, { v: b, txt: 'mesa' }); },
    rolar: () => resultadoNivel(st, rolar()) });
}
function resultadoNivel(st, ph) {
  const p = P(); const novo = (Number(p.nivel) || 1) + 1;
  const aplicar = c => { c.nivel = novo; c.statusPend = Number(c.statusPend || 0) + st.v; c.phNiveis = Number(c.phNiveis || 0) + ph.v; c.xp = Math.max(0, Number(c.xp || 0) - (novo - 1) * 10); };
  const efs = prever(p, aplicar); const rankUp = novo % 5 === 0 && novo <= 25;
  abrirModal('▲ Subir de nível', janela('NÍVEL AUMENTADO', `<p class="res-g">Nível ${novo - 1} → ${novo}</p>
    <p>Pontos de Status: <b class="ok">+${st.v}</b> <span class="dica">(${st.txt})</span> · PH: <b class="ok">+${ph.v}</b> <span class="dica">(${ph.txt})</span> · Perícia: <b class="ok">+2</b></p>
    ${rankUp ? `<p style="color:var(--ouro)"><b>RANK ${rankDoNivel(novo)} ALCANÇADO!</b> Depois de aplicar, a Avaliação do Rank ${rankDoNivel(novo)} abre sozinha. Use também o nível grátis do Despertar (botão + no Despertar).</p>` : ''}`) +
    efeitosHTML(efs, 'Mudanças na ficha') + `<p class="dica">A XP gasta (${(novo - 1) * 10}) é descontada. Distribua os Pontos de Status nos atributos depois.</p>`,
    [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: modalNivel }, { label: 'Aplicar', cls: 'btn-ok', onClick: () => { mudar(`Subiu para o nível ${novo} (+${st.v} Status, +${ph.v} PH)`, aplicar); renderFicha(); sistema(`Nível ${novo}!`, 'NÍVEL AUMENTADO'); if (rankUp) setTimeout(() => { sistema(`Rank ${rankDoNivel(novo)} alcançado!`, 'RANK'); modalAval(true); }, 450); } }], { ajuda: 'm_nivel' });
}
function modalPortalConcluido() {
  const p = P(); const c = computar(p); const eqSinc = p.itens.filter(i => i.equip && i.selos.length);
  const corpo = abrirModal('⛩ Portal concluído', `<div class="intro">${AJUDA.m_portal.txt}</div>
    <div class="campos">
      <label class="campo"><span>Rank do Portal</span><select id="pc-rk">${RANK_ORDEM.map(r => `<option ${r === c.rank ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
      <label class="campo"><span>Tipo de Portal</span><select id="pc-tp">${PORTAL_TIPO.map((t, i) => `<option value="${i}">${t.n} (×${fmt(t.xp)})</option>`).join('')}</select></label>
      ${campo('Nível do Chefe', numInp('', c.n + 2, { min: 1, max: 60, id: 'pc-lb' }))}
      ${campo('XP recebida', numInp('', 0, { min: 0, id: 'pc-xp' }), '', 'xp')}
      ${campo('Ouro recebido', numInp('', 0, { min: 0, id: 'pc-ouro' }), '', 'ouro')}
      <div class="campo"><span>Cristais de Mana (1d6)${ajudaBtn('cristal', 'in')}</span><div class="lado">${numInp('', 0, { min: 0, id: 'pc-cri' })}<button class="btn mini btn-sec" id="pc-cri-rol" type="button" title="Rolar 1d6">🎲</button></div></div>
    </div>
    <p class="dica" id="pc-calc"></p>
    <label class="chk"><input type="checkbox" id="pc-nuc"> Fiquei com o Núcleo do Chefe <span id="pc-nuc-rk"></span>${ajudaBtn('nucleo', 'in')}</label>
    ${eqSinc.length ? `<div class="evo"><div class="evo-t">+1 DE SINCRONIA${ajudaBtn('sincronia', 'in')}</div><div class="dica">Itens Raros ou melhores que ficaram equipados durante todo o combate contra o Chefe:</div>${eqSinc.map(i => `<label class="chk"><input type="checkbox" data-sinc="${i.uid}" checked> ${esc(i.nome)} <span class="dica">(Sincronia ${i.sinc || 0} → ${(i.sinc || 0) + 1})</span></label>`).join('')}</div>` : '<p class="dica">Nenhum item Raro ou melhor equipado: não há Sincronia para ganhar.</p>'}`,
    [{ label: 'Cancelar', cls: 'btn-sec' }, { label: 'Aplicar à ficha', cls: 'btn-ok', onClick: () => aplicar() }], { ajuda: 'm_portal' });
  let xpManual = false, ouroManual = false;
  const calc = () => {
    const rk = $('#pc-rk').value; const t = PORTAL_TIPO[$('#pc-tp').value]; const lb = Number($('#pc-lb').value) || 1;
    let xp = Math.round(5 * lb * t.xp); const dif = RANK_ORDEM.indexOf(c.rank) - RANK_ORDEM.indexOf(rk); let nota = `XP = 5 × ${lb} × ${fmt(t.xp)} = ${xp}`;
    if (dif > 0) { xp = Math.round(xp / 2 ** dif); nota += `; o Portal está ${dif} Rank(s) abaixo do seu, então vale ${xp}`; }
    if (!xpManual) $('#pc-xp').value = xp; if (!ouroManual) $('#pc-ouro').value = 4 * PRECO_BASE[rk];
    $('#pc-calc').textContent = `${nota} · Ouro = 4 × ${PRECO_BASE[rk].toLocaleString('pt-BR')} (preço base Rank ${rk})`;
    $('#pc-nuc-rk').textContent = `(Rank ${rk}${/Vermelho|Dupla/.test(t.n) ? ', este tipo de Portal deixa 2' : ''})`;
  };
  corpo.addEventListener('input', e => { if (e.target.id === 'pc-xp') xpManual = true; if (e.target.id === 'pc-ouro') ouroManual = true; calc(); });
  corpo.addEventListener('change', calc);
  corpo.addEventListener('click', e => { if (e.target.id === 'pc-cri-rol') { const v = d(6); $('#pc-cri').value = v; mostrarRolagem('Cristais de Mana', v, '1d6'); } });
  calc();
  function aplicar() {
    const rk = $('#pc-rk').value, t = PORTAL_TIPO[$('#pc-tp').value]; const xp = Math.max(0, Number($('#pc-xp').value) || 0), ouro = Math.max(0, Number($('#pc-ouro').value) || 0), cri = Math.max(0, Number($('#pc-cri').value) || 0);
    const nuc = $('#pc-nuc').checked ? (/Vermelho|Dupla/.test(t.n) ? 2 : 1) : 0; const ids = $$('[data-sinc]', corpo).filter(x => x.checked).map(x => x.dataset.sinc); const antes = {};
    mudar(`Portal Rank ${rk} concluído: +${xp} XP, +${ouro} Ouro${cri ? `, ${cri} Cristais` : ''}${nuc ? `, ${nuc} Núcleo(s)` : ''}${ids.length ? `, +1 Sincronia em ${ids.length} item(ns)` : ''}`, q => {
      q.xp = (Number(q.xp) || 0) + xp; q.ouro = (Number(q.ouro) || 0) + ouro;
      if (cri) empilhar(q, criarMat('cristal', rk, cri)); if (nuc) empilhar(q, criarMat('nucleo', rk, nuc));
      ids.forEach(id => { const it = q.itens.find(i => i.uid === id); if (it) { antes[id] = Number(it.sinc || 0); it.sinc = antes[id] + 1; } });
    });
    sistema(`Portal concluído! +${xp} XP · +${ouro.toLocaleString('pt-BR')} Ouro`, 'MISSÃO CONCLUÍDA');
    ids.forEach(id => avisarSelos(p.itens.find(i => i.uid === id), antes[id]));
    renderFicha(); setTimeout(() => checarCapacidade(p), 80);
  }
}
function modalGerarItem() {
  const p = P(); let item = null;
  const ctl = `<div class="intro">${AJUDA.m_item.txt}</div><div class="modal-filtros">
    <label>Rank <select id="gi-rk">${RANK_ORDEM.map(r => `<option ${r === rankDoNivel(Number(p.nivel) || 1) ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
    <label>Tipo <select id="gi-tp"><option value="aleatorio">Aleatório</option><option value="arma">Arma</option><option value="armadura">Armadura</option><option value="escudo">Escudo</option><option value="acessorio">Acessório</option><option value="consumivel">Consumível</option></select></label>
    <label>Origem <select id="gi-bn"><option value="0">Comum</option><option value="10">Chefe (+10)</option><option value="15">Portal Vermelho (+15)</option><option value="20">Masmorra Dupla (+20)</option></select></label>
    <button class="btn" id="gi-gerar">🎲 Gerar</button></div>
    <p class="dica">Rolou o item na mesa? Use <b>✎ Item da mesa</b> para registrar à mão.</p><div id="gi-out"></div>`;
  const corpo = abrirModal('⚒ Gerar item', ctl, [{ label: '✎ Item da mesa', cls: 'btn-sec', fechar: false, onClick: modalItemProprio }, { label: 'Fechar', cls: 'btn-sec' }], { aoFechar: renderFichaDinamico, ajuda: 'm_item' });
  const gerar = () => {
    item = gerarItem($('#gi-rk').value, $('#gi-tp').value, Number($('#gi-bn').value));
    const equipavel = EQUIPAVEL.includes(item.cat);
    const efs = equipavel ? efeitosHTML(prever(p, c => { const it = clone(item); c.itens.push(it); equiparMut(c, it.uid, true); }), 'Se equipar agora') : '';
    $('#gi-out').innerHTML = itemCard(item) + efs + `<p class="dica">Inventário: ${naMochila(p)}/${CAP_INV}</p><div class="acoes">
      <button class="btn btn-sec" data-gi="descartar">Descartar</button><button class="btn btn-sec" data-gi="enviar">📤 Enviar a alguém</button><button class="btn btn-ok" data-gi="mochila">Guardar no inventário</button>
      ${equipavel ? '<button class="btn btn-ok" data-gi="equipar">Guardar e equipar</button>' : ''}</div>`;
  };
  corpo.addEventListener('click', e => {
    if (e.target.id === 'gi-gerar') { gerar(); return; }
    const b = e.target.closest('[data-gi]'); if (!b || !item) return;
    if (b.dataset.gi === 'descartar') { item = null; $('#gi-out').innerHTML = '<p class="dica">Item descartado.</p>'; }
    else if (b.dataset.gi === 'enviar') { const it = item; compartilharItem(it, { voltar: modalGerarItem }); }
    else { const it = clone(item); item = null; $('#gi-out').innerHTML = '<p class="ok">Guardado na ficha. Gere outro ou feche.</p>'; guardarItem(p, it, { equipar: b.dataset.gi === 'equipar' }); }
  });
}
function modalArmaInicial() {
  const p = P(); const atual = p.itens.find(i => i.cat === 'arma' && i.equip && i.rar === 'Comum' && i.rank === 'E'); let escolha = atual ? atual.base : 'Espada';
  const montar = () => { const nova = armaComum(escolha); nova.equip = true;
    return `<p>Todo Caçador começa com uma arma Comum Rank E à escolha.</p><div class="campo"><span>Arma</span>${selBusca({ valor: escolha, opcoes: ARMAS.map(a => ({ v: a.n, l: a.n, s: `${a.dano} · ${a.a}${a.tags ? ' · ' + a.tags : ''}` })), onChange: v => { escolha = v; corpo.innerHTML = montar(); } })}</div>
      <div style="margin-top:10px">${itemCard(nova)}</div>${efeitosHTML(prever(p, c => { if (atual) c.itens = c.itens.filter(i => i.uid !== atual.uid); const n2 = clone(nova); c.itens.unshift(n2); equiparMut(c, n2.uid, true); }), 'Mudanças na ficha')}`; };
  const corpo = abrirModal('⚔ Arma inicial', montar(), [{ label: 'Cancelar', cls: 'btn-sec' }, { label: 'Trocar', cls: 'btn-ok', onClick: () => {
    mudar(`Arma inicial: ${escolha}`, q => { if (atual) q.itens = q.itens.filter(i => i.uid !== atual.uid); const n2 = armaComum(escolha); q.itens.unshift(n2); equiparMut(q, n2.uid, true); q.passos.arma = true; });
    renderFichaDinamico(); voltarGuia(); } }]);
}

/* ---------- guia, histórico, texto, impressão ---------- */
function passosGuia(p) {
  const c = computar(p); const gastoPer = Object.values(p.pericias).reduce((a, b) => a + (Number(b) || 0), 0);
  const ir = sel => () => { guiaAtivo = false; fecharModal(); const el = $(sel); if (el) { el.scrollIntoView({ block: 'center' }); if (el.focus) el.focus(); } };
  return [
    { t: 'Nome e conceito', d: 'Quem era o personagem antes de Despertar? Preencha nome, "Antes do despertar" e "Motivo".', ok: !!p.nome && p.nome !== 'Novo Caçador', f: ir('[data-bind="nome"]') },
    { t: 'Rolar atributos', d: 'Potencial (1d6) e 2d6 por atributo.', ok: !!p.passos.atr, f: modalAtrib },
    { t: 'Despertar', d: 'A sua Habilidade Única, em d100.', ok: !!p.despertar.id, f: modalDesp },
    { t: 'Avaliação do Sistema', d: 'Escolha 1 de 3 habilidades Rank E, de graça.', ok: p.habs.some(x => x.gratis), f: () => modalAval() },
    { t: 'Gastar os PH', d: `Compre ou evolua habilidades. PH disponíveis: ${phDisp(p)}.`, ok: phDisp(p) <= 0, f: modalAddHab },
    { t: 'Perícias', d: `Distribua ${c.periciaTotal} pontos (máximo ${c.periciaMax} por perícia). Já usou ${gastoPer}.`, ok: gastoPer >= c.periciaTotal, f: ir('.f-pericias input') },
    { t: 'Arma inicial', d: 'Troque a Espada por qualquer arma Comum Rank E, se quiser.', ok: !!p.passos.arma, f: modalArmaInicial },
    { t: 'Pontos de Status livres', d: 'Se sobrou algum ponto (compensação), gaste com o + dos atributos.', ok: !(Number(p.statusPend) > 0), f: ir('.f-atribs') }
  ];
}
function modalGuia() {
  const p = P(); lsSet('despertar.guia', '1');
  const ps = passosGuia(p); const feitos = ps.filter(x => x.ok).length;
  const corpo = abrirModal('🧭 Guia de criação', `<p style="margin-top:0">Siga os passos na ordem. Cada botão abre a tela certa e, ao terminar, você volta para cá. <b>${feitos}/${ps.length}</b> feitos.</p>
    <div class="guia">${ps.map((x, i) => `<div class="guia-p ${x.ok ? 'feito' : ''}"><span class="guia-n">${x.ok ? '✓' : i + 1}</span><div class="guia-tx"><b>${x.t}</b><div class="dica">${x.d}</div></div><button class="btn mini ${x.ok ? 'btn-sec' : 'btn-ok'}" data-passo="${i}">${x.ok ? 'Refazer' : 'Fazer'}</button></div>`).join('')}</div>
    ${feitos === ps.length ? '<p class="ok"><b>Ficha pronta!</b> Bom raide, Caçador.</p>' : ''}`,
    [{ label: 'Fechar guia', cls: 'btn-sec' }]);
  guiaAtivo = true;
  corpo.addEventListener('click', e => { const b = e.target.closest('[data-passo]'); if (b) { guiaAtivo = true; ps[Number(b.dataset.passo)].f(); } });
}
function modalHist() {
  const p = P();
  const montar = () => (p.hist || []).length ? `<div class="hist">${p.hist.map((h, i) => `<div class="hist-l"><span class="hist-d">${new Date(h.t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span><span class="hist-m">${esc(h.msg)}</span>${h.snap ? `<button class="btn mini btn-sec" data-desf="${i}">Desfazer</button>` : '<span></span>'}</div>`).join('')}</div>`
    : '<p class="vazio-msg">Nada registrado ainda. Sorteios, itens, Refino, níveis e habilidades aparecem aqui.</p>';
  const corpo = abrirModal(`📜 Histórico · ${p.nome}`, montar(), [{ label: 'Fechar', cls: 'btn-sec' }], { ajuda: 'historico' });
  corpo.addEventListener('click', e => {
    const b = e.target.closest('[data-desf]'); if (!b) return; const i = Number(b.dataset.desf); const h = p.hist[i]; if (!h || !h.snap) return;
    if (b.dataset.conf !== '1') { b.dataset.conf = '1'; b.textContent = i ? `Desfazer isto e as ${i} mais recentes?` : 'Confirmar'; b.classList.add('btn-perigo'); return; }
    const resto = p.hist.slice(i + 1); const snap = clone(h.snap);
    Object.keys(p).forEach(k => { delete p[k]; }); Object.assign(p, snap); normalizar(p);
    p.hist = [{ t: Date.now(), msg: `Desfeito: ${h.msg}` }, ...resto];
    salvar(p); renderFicha(); sistema('Mudança desfeita.'); corpo.innerHTML = montar();
  });
}
function fichaTexto(p) {
  const c = computar(p); const dsp = DESP[p.despertar.id]; const L = [];
  L.push(`══ ${p.nome || 'Sem nome'} ══`, `Nível ${c.n} · Rank ${c.rank} (oficial ${p.rankOficial}) · XP ${p.xp || 0}/${c.xpProx} · Ouro ${p.ouro || 0}`);
  if (p.jogador || p.conceito) L.push(`Jogador(a): ${p.jogador || '—'} · Antes do despertar: ${p.conceito || '—'} · Motivo: ${p.motivo || '—'}`);
  if (p.titulo && TIT[p.titulo]) L.push(`Título: ${TIT[p.titulo].n} (${TIT[p.titulo].txt})`);
  L.push('', '— ATRIBUTOS —', ATRIBUTOS.map(a => `${a.id} ${fmt(c.atr[a.id])} (${sinal(c.m[a.id])})`).join(' · '));
  L.push('', '— COMBATE —', `PV ${p.pvAtual == null ? c.pvMax : p.pvAtual}/${c.pvMax} · PM ${p.pmAtual == null ? c.pmMax : p.pmAtual}/${c.pmMax} · Deslocamento ${fmt(c.desl)} m · Ações Principais ${c.acoes} · Iniciativa ${sinal(c.ini)}`,
    `Defender ${sinal(c.def)} · Esquivar ${sinal(c.esq)} · Defesa Passiva ${c.defPassiva} · RD ${c.rd}`,
    'Resistências: ' + ATRIBUTOS.map(a => `${a.id} ${sinal(c.res[a.id])}`).join(' · '), 'CDs: ' + ATRIBUTOS.map(a => `${a.id} ${c.cd[a.id]}`).join(' · '));
  c.ataques.forEach(a => L.push(`Ataque ${a.nome}: d20${sinal(a.atk)} · dano ${a.dado}${a.bonus ? sinal(a.bonus) : ''}${a.extra ? ' ' + a.extra : ''}`));
  const per = PERICIAS.filter(pc => Number(p.pericias[pc.n] || 0) > 0).map(pc => `${pc.n} ${sinal(c.per[pc.n])}`);
  L.push('', '— PERÍCIAS —', per.length ? per.join(' · ') : '(nenhuma treinada)');
  L.push('', '— DESPERTAR —', dsp ? `${dsp.n} nv${p.despertar.nv} (${dsp.rar}): ${dsp.ef}` : '(nenhum)');
  L.push('', `— HABILIDADES (PH disponíveis: ${phDisp(p)}) —`);
  p.habs.filter(x => HAB[x.id]).forEach(x => { const h = HAB[x.id]; L.push(`• ${h.n} nv${x.nv} [${h.r} · ${ARV[h.t].nome} · ${h.tipo}${h.pm ? ' · ' + h.pm + ' PM' : ''}]: ${h.ef}`); });
  const itl = it => `• ${it.nome}${it.qtd > 1 ? ' ×' + it.qtd : ''} (${it.rar}, Rank ${it.rank}${it.refino ? ', +' + it.refino : ''}${it.selos.length ? ', Sinc. ' + (it.sinc || 0) : ''})${it.afixos.length ? ': ' + it.afixos.map(a => `${a.n} (${a.t})`).join('; ') : ''}`;
  L.push('', '— EQUIPADO —', ...p.itens.filter(i => i.equip).map(itl), '', `— INVENTÁRIO (${naMochila(p)}/${CAP_INV}) —`, ...p.itens.filter(i => !i.equip).map(itl));
  if (p.condicoes) L.push('', '— CONDIÇÕES —', p.condicoes); if (p.notas) L.push('', '— NOTAS —', p.notas);
  return L.join('\n');
}
async function copiar(t) {
  try { await navigator.clipboard.writeText(t); toast('Copiado!'); return true; } catch (e) { }
  const ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch (e) { } document.body.removeChild(ta); toast(ok ? 'Copiado!' : 'Não consegui copiar: selecione e copie à mão.'); return ok;
}
function baixarTexto(t, nome) { const blob = new Blob([t], { type: 'text/plain;charset=utf-8' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }
function modalTextoFicha() {
  const p = P(); const t = fichaTexto(p);
  abrirModal('📄 Ficha em texto', `<p class="dica" style="margin-top:0">Para jogar com ficha de papel, guardar uma cópia ou mandar ao Mestre.</p><textarea class="texto-ficha" readonly>${esc(t)}</textarea>`,
    [{ label: 'Baixar .txt', cls: 'btn-sec', fechar: false, onClick: () => baixarTexto(t, `${(p.nome || 'cacador').replace(/[^\w\-]+/g, '_')}.txt`) }, { label: '📋 Copiar', cls: 'btn-ok', fechar: false, onClick: () => copiar(t) }, { label: 'Fechar', cls: 'btn-sec' }], { largo: true });
}
function imprimirFicha() { if (modalAberto()) fecharModal(); abrirAba('ficha'); document.body.classList.add('imprimir-ficha'); setTimeout(() => window.print(), 150); }
function modalMais() {
  const p = P();
  const corpo = abrirModal(`⋯ ${p.nome || 'Ficha'}`, `<div class="mais-grade">
    <button class="mais-op" data-mais="loja"><b>🛒 Loja do Sistema</b><span>Comprar e vender com Ouro, pelos preços do livro</span></button>
    <button class="mais-op" data-mais="hist"><b>📜 Histórico</b><span>Veja e desfaça mudanças recentes</span></button>
    <button class="mais-op" data-mais="link"><b>📤 Compartilhar ficha</b><span>Link, WhatsApp ou Telegram: o Mestre abre e vê</span></button>
    <button class="mais-op" data-mais="texto"><b>📄 Ficha em texto</b><span>Para copiar, guardar ou passar para o papel</span></button>
    <button class="mais-op" data-mais="imprimir"><b>⎙ Imprimir ficha</b><span>Papel ou PDF</span></button>
    <button class="mais-op" data-mais="guia"><b>🧭 Guia de criação</b><span>Passo a passo de uma ficha nova</span></button>
    <button class="mais-op" data-mais="fichas"><b>☰ Gerenciar fichas</b><span>Criar, duplicar, importar, exportar</span></button>
    <button class="mais-op" data-mais="instalar"><b>📲 Instalar aplicativo</b><span>Ícone na tela inicial e uso sem internet</span></button></div>`, [{ label: 'Fechar', cls: 'btn-sec' }]);
  corpo.addEventListener('click', e => { const b = e.target.closest('[data-mais]'); if (!b) return;
    ({ loja: modalLoja, hist: modalHist, link: () => compartilharFicha(P()), texto: modalTextoFicha, imprimir: imprimirFicha, guia: modalGuia, fichas: modalFichas, instalar: modalInstalar })[b.dataset.mais](); });
}

/* ---------- Pagar custo em PM (com Exaustão de Mana e Hemomancia) ---------- */
function opcoesPagamento(p, custo) {
  const c = computar(p); const pm = p.pmAtual == null ? c.pmMax : p.pmAtual; const pv = p.pvAtual == null ? c.pvMax : p.pvAtual;
  const ops = [];
  if (custo <= 0) ops.push({ modo: 'livre', txt: 'Usar (sem custo)' });
  else {
    if (pm >= custo) ops.push({ modo: 'pm', txt: `Usar: −${custo} PM` });
    else { const falta = custo - pm; ops.push(pv - 2 * falta > 0 ? { modo: 'exa', txt: `Exaustão de Mana: −${pm} PM e −${2 * falta} PV, e fica Exausto` } : { modo: 'nao', txt: `Faltam ${falta} PM e os PV não bastam para a Exaustão de Mana (precisa sobrar mais de 0 PV).` }); }
    if (p.despertar.id === 'd28') ops.push(pv - custo > 0 ? { modo: 'pv', txt: `Hemomancia: −${custo} PV (sem ficar Exausto)` } : { modo: 'nao', txt: 'PV insuficientes para pagar com Hemomancia.' });
  }
  return { ops, pm, pv };
}
function pagarCusto(p, custo, rotulo, modo) {
  const c = computar(p); const pm = p.pmAtual == null ? c.pmMax : p.pmAtual; const pv = p.pvAtual == null ? c.pvMax : p.pvAtual;
  if (modo === 'livre') mudar(rotulo, () => {});
  if (modo === 'pm') mudar(`${rotulo} (−${custo} PM)`, q => { q.pmAtual = pm - custo; });
  if (modo === 'pv') mudar(`${rotulo} (−${custo} PV, Hemomancia)`, q => { q.pvAtual = pv - custo; });
  if (modo === 'exa') {
    const falta = custo - pm;
    mudar(`${rotulo} (−${pm} PM e −${2 * falta} PV: Exaustão de Mana)`, q => {
      q.pmAtual = 0; q.pvAtual = pv - 2 * falta;
      if (!/Exausto/.test(q.condicoes || '')) q.condicoes = [(q.condicoes || '').trim(), 'Exausto (−2 em todos os testes, deslocamento pela metade; sai com descanso longo)'].filter(Boolean).join('\n');
    });
  }
}

/* ---------- Habilidades: botão Usar ---------- */
function formasUso(p, id) {
  const h = HAB[id]; const x = possui(p, id); if (!h || !x || h.tipo !== 'Ativa') return [];
  const alt = (USOS_HAB[id] || []).filter(u => x.nv >= u.desde);
  let ops = alt.some(u => u.substitui) ? [] : [{ n: `${h.n} (${h.acao})`, pm: h.pm }];
  ops = ops.concat(alt.map(u => ({ n: u.n, pm: u.pm })));
  const enc = possui(p, 'ele7');
  if (h.t === 'elementos' && id !== 'ele7' && enc) ops = ops.concat(ops.filter(o => o.pm > 0).map(o => ({ n: `${o.n} · com Encarnação Elemental ativa (metade)`, pm: Math.ceil(o.pm / 2) })));
  return ops;
}
function usarHabilidade(id) {
  const p = P(); const h = HAB[id]; const x = possui(p, id); const ops = formasUso(p, id); if (!ops.length) return;
  const corpo = abrirModal(`⚡ ${h.n}`, `<div class="intro"><p><b>Ação:</b> ${esc(h.acao)} · <b>Frequência:</b> ${esc(h.freq || 'À vontade')} · nível ${x.nv}</p>
    <p class="dica">A ficha desconta o custo e registra no histórico. O efeito e a frequência são aplicados na mesa (veja o texto abaixo).</p></div>
    ${ops.length > 1 ? `<label class="campo" style="max-width:420px"><span>Forma de uso</span><select id="hu-op">${ops.map((o, k) => `<option value="${k}">${esc(o.n)} · ${o.pm} PM</option>`).join('')}</select></label>` : ''}
    <div id="hu-pag" style="margin-top:10px"></div>
    <details style="margin-top:10px"><summary class="dica">Texto da habilidade</summary>${habCard(h)}</details>`,
    [{ label: 'Cancelar', cls: 'btn-sec' }], { ajuda: 'usarHab' });
  const op = () => ops[ops.length > 1 ? Number($('#hu-op').value) : 0];
  const desenhar = () => {
    const { ops: pg, pm, pv } = opcoesPagamento(p, op().pm);
    $('#hu-pag').innerHTML = `<p class="dica">Custo: <b>${op().pm} PM</b> · você tem ${pm} PM e ${pv} PV.</p>` +
      pg.map(o => o.modo === 'nao' ? `<p class="no-ok">${esc(o.txt)}</p>` : `<button class="btn ${o.modo === 'pm' || o.modo === 'livre' ? 'btn-ok' : 'btn-sec'}" data-pagar="${o.modo}" style="margin:4px 6px 4px 0">${esc(o.txt)}</button>`).join('');
  };
  corpo.addEventListener('change', e => { if (e.target.id === 'hu-op') desenhar(); });
  corpo.addEventListener('click', e => {
    const b = e.target.closest('[data-pagar]'); if (!b) return;
    const o = op(); pagarCusto(p, o.pm, `Usou ${o.n.startsWith(h.n + ' (') ? h.n : h.n + ': ' + o.n} (nv${x.nv})`, b.dataset.pagar);
    fecharModal(); renderFichaDinamico(); sistema(h.n, 'HABILIDADE');
  });
  desenhar();
}

/* ---------- Despertar: botão Usar ---------- */
function usosDespertar(p) {
  const dsp = DESP[p.despertar.id]; if (!dsp) return [];
  const nv = p.despertar.nv, forma = nv >= 5 && (Number(p.nivel) || 1) >= 20;
  return (USOS_DESP[dsp.id] || []).map((u, i) => ({ ...u, i, forma: !!u.forma, custo: u.pmRank ? null : (nv >= 5 && u.pm5 != null ? u.pm5 : u.pm),
    acaoR: nv >= 5 && u.acao5 ? u.acao5 : u.acao, livre: (u.desde || 1) <= nv && (!u.forma || forma), temForma: forma }));
}
function usosHTML(p) {
  if (!DESP[p.despertar.id]) return '';
  const us = usosDespertar(p);
  if (!us.length) return '<p class="dica" style="margin:6px 0 0">Este Despertar não tem uso ativo: os efeitos são passivos (a ficha já soma o que é número).</p>';
  return `<div class="desp-usos">${us.map(u => {
    const trava = u.livre ? '' : u.forma ? 'Libera com a Forma Evoluída (Despertar nv5 e Nível 20)' : `Libera no nv${u.desde} do Despertar`;
    return `<button class="btn mini ${u.livre ? 'btn-ok' : 'btn-sec'}" data-act="desp-usar" data-i="${u.i}" ${u.livre ? '' : 'disabled'} title="${esc(trava || u.acaoR + ' · ' + u.freq)}">⚡ ${esc(u.n)} <span class="du-c">${u.pmRank ? (u.temForma ? '0 PM' : '2 PM/Rank') : u.custo + ' PM'}</span></button>`;
  }).join('')}</div>`;
}
function usarDespertar(i) {
  const p = P(); const u = usosDespertar(p).find(x => x.i === Number(i)); if (!u || !u.livre) return;
  const custoRank = k => u.temForma ? 0 : 2 * (k + 1);
  const corpo = abrirModal(`⚡ ${u.n}`, `<div class="intro"><p><b>Ação:</b> ${esc(u.acaoR)} · <b>Frequência:</b> ${esc(u.freq)}</p>
    <p class="dica">O que o poder faz está no texto do Despertar (abaixo). A ficha desconta o custo e registra no histórico; a frequência e o efeito são aplicados na mesa.</p></div>
    ${u.pmRank ? `<label class="campo" style="max-width:280px"><span>Rank da Sombra invocada</span><select id="du-rk">${RANK_ORDEM.map((r, k) => `<option value="${k}">${r} · ${custoRank(k)} PM</option>`).join('')}</select></label>` : ''}
    <div id="du-pag" style="margin-top:10px"></div>
    <details style="margin-top:10px"><summary class="dica">Texto do Despertar</summary>${despCard(DESP[p.despertar.id])}</details>`,
    [{ label: 'Cancelar', cls: 'btn-sec' }], { ajuda: 'usarDesp' });
  const custo = () => u.pmRank ? custoRank(Number($('#du-rk').value)) : u.custo;
  const desenhar = () => {
    const { ops, pm, pv } = opcoesPagamento(p, custo());
    $('#du-pag').innerHTML = `<p class="dica">Custo: <b>${custo()} PM</b> · você tem ${pm} PM e ${pv} PV.</p>` +
      ops.map(o => o.modo === 'nao' ? `<p class="no-ok">${esc(o.txt)}</p>` : `<button class="btn ${o.modo === 'pm' || o.modo === 'livre' ? 'btn-ok' : 'btn-sec'}" data-pagar="${o.modo}" style="margin:4px 6px 4px 0">${esc(o.txt)}</button>`).join('');
  };
  corpo.addEventListener('change', e => { if (e.target.id === 'du-rk') desenhar(); });
  corpo.addEventListener('click', e => {
    const b = e.target.closest('[data-pagar]'); if (!b) return;
    const rot = `Usou ${u.n} (Despertar)${u.pmRank ? ' · Sombra Rank ' + RANK_ORDEM[Number($('#du-rk').value)] : ''}`;
    pagarCusto(p, custo(), rot, b.dataset.pagar); fecharModal(); renderFichaDinamico(); sistema(u.n, 'DESPERTAR');
  });
  desenhar();
}

/* ---------- Loja do Sistema ---------- */
const LOJA_CONS = ['Poção de Cura', 'Poção de Mana', 'Antídoto', 'Pedra de Retorno', 'Pó de Purificação', 'Pergaminho de Selo'];
const LOJA_CATS = [['consumivel', '🧪 Consumíveis'], ['arma', '⚔ Armas'], ['armadura', '🛡 Armaduras e escudo'], ['acessorio', '💍 Acessórios']];
const lojaEstado = { aba: 'comprar', cat: 'consumivel', rank: null };
function lojaOfertas(cat) {
  if (cat === 'consumivel') return LOJA_CONS.map(n => ({ cat, base: n, nome: n, sub: CONSUMIVEIS.find(c => c[0] === n)[1] }));
  if (cat === 'arma') return ARMAS.map(a => ({ cat, base: a.n, nome: a.n, sub: `${a.dano} · ${a.a}${a.tags ? ' · ' + a.tags : ''}` }));
  if (cat === 'armadura') return [...ARMADURAS.map(a => ({ cat: 'armadura', base: a.tipo, nome: a.n, sub: `${a.tipo} · Defender +${a.def}${a.esq ? ' · Esquivar ' + a.esq : ''}` })), { cat: 'escudo', base: 'Escudo', nome: 'Escudo', sub: 'Uma mão · Defender +2 + Bônus de Rank' }];
  return ACESSORIOS.map(b => ({ cat: 'acessorio', base: b, nome: b, sub: 'Comum: 1 afixo sorteado · Incomum: 2 afixos sorteados' }));
}
const precoCompra = (cat, rank, rar) => cat === 'consumivel' ? Math.round(PRECO_BASE[rank] / 5) : PRECO_BASE[rank] * (rar === 'Incomum' ? 2 : 1);
function precoVendaUn(it) {
  if (it.mat === 'nucleo') return 0;
  if (it.mat === 'cristal') return it.precoUn || Math.round(PRECO_BASE[it.rank] / 5); // cristais: valor cheio da tabela
  if (it.precoUn) return Math.floor(it.precoUn / 2);
  if (it.preco) return Math.floor(it.preco / 2);
  if (EQUIPAVEL.includes(it.cat) && PRECO_BASE[it.rank]) { const r = RARIDADES.find(z => z.n === it.rar); return Math.floor(PRECO_BASE[it.rank] * (r ? r.mult : 1) / 2); }
  if (it.cat === 'consumivel' && LOJA_CONS.some(n => it.nome.startsWith(n)) && PRECO_BASE[it.rank]) return Math.floor(PRECO_BASE[it.rank] / 10);
  return 0;
}
function modalLoja() {
  const p = P(); const rkMax = rankDoNivel(Number(p.nivel) || 1);
  if (!lojaEstado.rank || RANK_ORDEM.indexOf(lojaEstado.rank) > RANK_ORDEM.indexOf(rkMax)) lojaEstado.rank = rkMax;
  const corpo = abrirModal('🛒 Loja do Sistema', '<div id="lj"></div>', [{ label: 'Fechar', cls: 'btn-sec' }], { ajuda: 'loja', largo: true });
  const ouro = () => Number(P().ouro) || 0;
  const desenhar = () => {
    const q = P(); const rk = lojaEstado.rank;
    let h = `<div class="lj-topo"><span class="ah-ph">Ouro <b>${ouro().toLocaleString('pt-BR')}</b></span>
      <span class="lj-abas"><button class="arv-btn ${lojaEstado.aba === 'comprar' ? 'ativo' : ''}" data-lj-aba="comprar">Comprar</button><button class="arv-btn ${lojaEstado.aba === 'vender' ? 'ativo' : ''}" data-lj-aba="vender">Vender</button></span></div>`;
    if (lojaEstado.aba === 'comprar') {
      h += `<div class="lj-filtro"><label class="campo"><span>Rank (até o seu: ${rkMax})</span><select id="lj-rk">${RANK_ORDEM.slice(0, RANK_ORDEM.indexOf(rkMax) + 1).map(r => `<option ${r === rk ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
        <div class="ah-tabs">${LOJA_CATS.map(([id, n]) => `<button class="arv-btn ${lojaEstado.cat === id ? 'ativo' : ''}" data-lj-cat="${id}">${n}</button>`).join('')}</div>
        <div class="lj-lista">${lojaOfertas(lojaEstado.cat).map((o, k) => {
          const pc = precoCompra(o.cat, rk, 'Comum'), pi = precoCompra(o.cat, rk, 'Incomum');
          const bt = (rar, pr) => `<button class="btn mini ${ouro() >= pr ? 'btn-ok' : 'btn-sec'}" data-lj-comprar="${k}" data-rar="${rar}" ${ouro() >= pr ? '' : 'disabled'}>${rar} · ${pr.toLocaleString('pt-BR')}</button>`;
          return `<div class="lj-l"><span class="lj-n"><b>${esc(o.nome)}</b> <span class="rk rk-${rk}">${rk}</span><span class="dica">${esc(o.sub)}</span></span><span class="lj-b">${o.cat === 'consumivel'
            ? `${numInp('', 1, { min: 1, max: 99, id: 'lj-q' + k, cls: 'mini' })}<button class="btn mini ${ouro() >= pc ? 'btn-ok' : 'btn-sec'}" data-lj-comprar="${k}" data-rar="Comum" ${ouro() >= pc ? '' : 'disabled'}>Comprar · ${pc.toLocaleString('pt-BR')} cada</button>`
            : bt('Comum', pc) + bt('Incomum', pi)}</span></div>`;
        }).join('')}</div>
        <p class="dica">Itens novos, com Refino +0. Afixos são sorteados na compra (acessórios têm 1 afixo a mais). Pergaminhos de Habilidade, Elixires, Núcleos, Chaves de Instância e Cristais não são vendidos.</p>`;
    } else {
      const lista = q.itens.filter(i => !i.equip);
      h += lista.length ? `<div class="lj-lista">${lista.map(it => {
        const un = precoVendaUn(it); const qt = Number(it.qtd) || 1;
        return `<div class="lj-l"><span class="lj-n"><b style="color:${it.cor}">${esc(it.nome)}${qt > 1 ? ' ×' + qt : ''}</b><span class="dica">${it.rar} · Rank ${it.rank}${un ? ` · ${un.toLocaleString('pt-BR')} Ouro${qt > 1 ? ' cada' : ''}${it.mat === 'cristal' ? ' (valor da tabela)' : ' (metade do preço)'}` : ''}</span></span><span class="lj-b">${un
          ? `${qt > 1 ? numInp('', qt, { min: 1, max: qt, id: 'lj-v' + it.uid, cls: 'mini' }) : ''}<button class="btn mini btn-ok" data-lj-vender="${it.uid}">Vender</button>`
          : `<span class="dica">${it.mat === 'nucleo' ? 'Núcleos vão a leilão da Associação (com o Mestre)' : 'A Loja não compra este item'}</span>`}</span></div>`;
      }).join('')}</div><p class="dica">Itens equipados não aparecem: desequipe antes de vender.</p>` : '<p class="vazio-msg">Nada no Inventário para vender.</p>';
    }
    $('#lj').innerHTML = h;
  };
  corpo.addEventListener('change', e => { if (e.target.id === 'lj-rk') { lojaEstado.rank = e.target.value; desenhar(); } });
  corpo.addEventListener('click', e => {
    const ab = e.target.closest('[data-lj-aba]'); if (ab) { lojaEstado.aba = ab.dataset.ljAba; desenhar(); return; }
    const ct = e.target.closest('[data-lj-cat]'); if (ct) { lojaEstado.cat = ct.dataset.ljCat; desenhar(); return; }
    const cb = e.target.closest('[data-lj-comprar]');
    if (cb) {
      const o = lojaOfertas(lojaEstado.cat)[Number(cb.dataset.ljComprar)]; const rk = lojaEstado.rank; const rar = cb.dataset.rar;
      let it, total;
      if (o.cat === 'consumivel') { const n = Math.max(1, Math.min(99, Number($('#lj-q' + cb.dataset.ljComprar).value) || 1)); it = consumivel(o.base, rk); it.qtd = n; total = precoCompra('consumivel', rk) * n; }
      else { it = montarItem(o.cat, o.base, rk, RARIDADES.find(z => z.n === rar)); total = precoCompra(o.cat, rk, rar); }
      if (ouro() < total) { toast('Ouro insuficiente.'); return; }
      guardarItem(P(), it, { msg: `Comprou ${it.nome}${it.qtd > 1 ? ' ×' + it.qtd : ''} por ${total.toLocaleString('pt-BR')} Ouro`, antes: q => { q.ouro = (Number(q.ouro) || 0) - total; } });
      desenhar(); return;
    }
    const vb = e.target.closest('[data-lj-vender]');
    if (vb) {
      const q = P(); const it = q.itens.find(i => i.uid === vb.dataset.ljVender); if (!it) return;
      const qt = Number(it.qtd) || 1; const inp = $('#lj-v' + it.uid); const n = inp ? Math.max(1, Math.min(qt, Number(inp.value) || 1)) : 1; const total = precoVendaUn(it) * n;
      mudar(`Vendeu ${it.nome} ×${n} por ${total.toLocaleString('pt-BR')} Ouro`, z => { const y = z.itens.find(i => i.uid === it.uid); if (n >= (Number(y.qtd) || 1)) z.itens = z.itens.filter(i => i !== y); else y.qtd = (Number(y.qtd) || 1) - n; z.ouro = (Number(z.ouro) || 0) + total; });
      sistema(`+${total.toLocaleString('pt-BR')} Ouro`, 'VENDA'); renderFichaDinamico(); desenhar();
    }
  });
  desenhar();
}

/* =========================================================
   COMPARTILHAR — link com os dados, WhatsApp, Telegram (bot)
   ========================================================= */
const URL_PUBLICA = 'https://maickon.github.io/-SISTEMA-DESPERTAR/';
const urlBase = () => location.protocol === 'https:' ? location.origin + location.pathname : URL_PUBLICA;
const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = str => { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
async function codificar(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if (window.CompressionStream) { try { const st = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw')); return 'z' + b64u(new Uint8Array(await new Response(st).arrayBuffer())); } catch (e) { } }
  return 'j' + b64u(bytes);
}
async function decodificar(code) {
  let bytes = unb64u(code.slice(1));
  if (code[0] === 'z') { const st = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')); bytes = new Uint8Array(await new Response(st).arrayBuffer()); }
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function linkDe(k, d0) { return urlBase() + '#d=' + await codificar({ v: 1, k, d: d0 }); }
const limparItem = it => { const c = clone(it); delete c.uid; delete c.equip; delete c.rolRar; return c; };
function normalizarItem(raw) { const it = Object.assign(itemBase(raw.cat || 'outro', raw.nome || 'Item'), clone(raw)); it.uid = uid(); it.equip = false; ['linhas', 'afixos', 'selos'].forEach(k => { if (!Array.isArray(it[k])) it[k] = []; }); return it; }
function itemTexto(it) {
  const preco = precoItem(it); const L = [`⚔ ${it.nome}${it.qtd > 1 ? ' ×' + it.qtd : ''}`, `${it.rar} · Rank ${it.rank}${it.cat === 'arma' ? (it.maos === 2 ? ' · duas mãos' : ' · uma mão') : ''}${it.refino ? ' · Refino +' + it.refino : ''}${preco ? ' · ' + preco.toLocaleString('pt-BR') + ' Ouro' : ''}`];
  it.linhas.forEach(l => L.push(l)); it.afixos.forEach(a => L.push(`• ${a.n}: ${a.t}`));
  if (it.selos.length) L.push(`🔒 ${it.selos.length} Selo(s) oculto(s): abrem com Sincronia 3 / 8 / 15 (Sincronia atual: ${it.sinc || 0}).`);
  return L.join('\n');
}
function pacoteTexto(pk) {
  const L = [`📦 ${pk.titulo || 'Recompensas'}`];
  if (pk.xp || pk.ouro) L.push(`${pk.xp ? `+${pk.xp} XP` : ''}${pk.xp && pk.ouro ? ' · ' : ''}${pk.ouro ? `+${Number(pk.ouro).toLocaleString('pt-BR')} Ouro` : ''} (por Jogador)`);
  pk.itens.forEach(it => L.push('', itemTexto(it))); return L.join('\n');
}
const waUrl = (texto, link) => `https://wa.me/?text=${encodeURIComponent(texto + '\n\n📥 Abrir no DESPERTAR: ' + link)}`;
const tgShareUrl = (texto, link) => `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(texto)}`;
function compartilharItem(it, opc = {}) { modalCompartilhar({ titulo: `📤 Enviar: ${it.nome}`, texto: itemTexto(it), k: 'item', d: limparItem(it), ...opc }); }
function compartilharFicha(p) { modalCompartilhar({ titulo: `📤 Compartilhar ficha: ${p.nome}`, texto: fichaTexto(p), k: 'ficha', d: semSnaps(p), aviso: 'Quem abrir o link pode importar uma cópia desta ficha (o Mestre, por exemplo, para acompanhar). Mudanças feitas lá não voltam para cá.' }); }
function modalCompartilhar(cfg) {
  let link = null; let removido = false; const tg = tgCfg();
  const corpo = abrirModal(cfg.titulo, `${cfg.aviso ? `<p class="dica" style="margin-top:0">${cfg.aviso}</p>` : ''}
    <div class="campo"><span>Texto (para ficha de papel)</span><textarea class="share-txt" readonly>${esc(cfg.texto)}</textarea></div>
    <div class="campo" style="margin-top:8px"><span>Link (abre no navegador e guarda na ficha)</span><div class="lado"><input type="text" id="sh-link" readonly value="gerando…"><button class="btn mini btn-sec" data-sh="link">Copiar link</button></div></div>
    <div class="acoes"><button class="btn btn-sec" data-sh="txt">📋 Copiar texto</button><button class="btn btn-sec" data-sh="wa">💬 WhatsApp</button><button class="btn btn-sec" data-sh="tgs">✈ Telegram (escolher conversa)</button></div>
    <div class="evo" style="margin-top:12px"><div class="evo-t">BOT DO TELEGRAM${ajudaBtn('telegram', 'in')}</div>
      ${tg.token ? (tg.destinos.length ? `<div class="tg-dest">${tg.destinos.map((d0, i) => `<label class="chk"><input type="checkbox" data-dst="${i}"> ${d0.tipo === 'privado' ? '👤' : d0.tipo === 'canal' ? '📣' : '👥'} ${esc(d0.nome)}</label>`).join('')}</div>
        <div class="acoes"><button class="btn btn-ok" data-sh="bot">Enviar pelo bot</button><button class="btn btn-sec mini" data-sh="cfg">⚙ Destinos</button></div><div id="sh-bot-res" class="dica"></div>`
        : `<p class="dica">Bot configurado, mas sem destinos.</p><button class="btn btn-sec mini" data-sh="cfg">⚙ Adicionar destinos</button>`)
        : `<p class="dica">Configure um bot para mandar direto num canal, grupo ou no privado de cada jogador.</p><button class="btn btn-sec mini" data-sh="cfg">⚙ Configurar bot</button>`}</div>
    ${cfg.remover ? `<label class="chk" style="margin-top:10px"><input type="checkbox" id="sh-rem"> Tirar o item da minha ficha depois de enviar (entregar a outro jogador)</label>` : ''}`,
    [...(cfg.voltar ? [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: cfg.voltar }] : []), { label: 'Fechar', cls: 'btn-sec' }], { ajuda: 'compartilhar' });
  linkDe(cfg.k, cfg.d).then(l => { link = l; const el = $('#sh-link'); if (el) el.value = l; });
  const depoisDeEnviar = () => { if (cfg.remover && !removido && $('#sh-rem') && $('#sh-rem').checked) { removido = true; cfg.remover(); toast('Item retirado da sua ficha.'); } };
  corpo.addEventListener('click', async e => {
    const b = e.target.closest('[data-sh]'); if (!b) return; const a = b.dataset.sh;
    if (!link && a !== 'txt' && a !== 'cfg') { toast('Gerando o link, tente de novo.'); return; }
    if (a === 'link') copiar(link);
    if (a === 'txt') copiar(cfg.texto);
    if (a === 'wa') { window.open(waUrl(cfg.texto, link), '_blank', 'noopener'); depoisDeEnviar(); }
    if (a === 'tgs') { window.open(tgShareUrl(cfg.texto, link), '_blank', 'noopener'); depoisDeEnviar(); }
    if (a === 'cfg') modalTelegram(() => modalCompartilhar(cfg));
    if (a === 'bot') {
      const dst = $$('[data-dst]', corpo).filter(x => x.checked).map(x => tg.destinos[Number(x.dataset.dst)]);
      if (!dst.length) { toast('Marque pelo menos um destino.'); return; }
      b.disabled = true; $('#sh-bot-res').textContent = 'Enviando…';
      const res = await tgEnviar(dst, cfg.texto, link); b.disabled = false;
      $('#sh-bot-res').innerHTML = res.map(r => `<div class="${r.ok ? 'ok' : 'no-ok'}">${r.ok ? '✓' : '✗'} ${esc(r.nome)}${r.ok ? '' : ': ' + esc(r.erro)}</div>`).join('');
      if (res.some(r => r.ok)) { sistema(`Enviado pelo bot para ${res.filter(r => r.ok).length} destino(s).`, 'TELEGRAM'); depoisDeEnviar(); }
    }
  });
}

/* ---------- bot do Telegram (a chave fica só neste navegador) ---------- */
const TG_KEY = 'despertar.telegram';
function tgCfg() { try { const c = JSON.parse(lsGet(TG_KEY) || 'null'); if (c && typeof c === 'object') return { token: c.token || '', bot: c.bot || '', destinos: Array.isArray(c.destinos) ? c.destinos : [] }; } catch (e) { } return { token: '', bot: '', destinos: [] }; }
function tgSalvar(c) { lsSet(TG_KEY, JSON.stringify(c)); renderTgResumo(); }
async function tgApi(token, metodo, params = {}) {
  // formulário simples (sem cabeçalhos extras): o navegador não faz pré-verificação CORS
  const body = new URLSearchParams(); for (const k in params) body.append(k, typeof params[k] === 'object' ? JSON.stringify(params[k]) : String(params[k]));
  let r; try { r = await fetch(`https://api.telegram.org/bot${encodeURIComponent(token).replace(/%3A/gi, ':')}/${metodo}`, { method: 'POST', body }); } catch (e) { throw new Error('sem conexão com o Telegram'); }
  let j; try { j = await r.json(); } catch (e) { throw new Error('resposta inválida do Telegram'); }
  if (!j.ok) throw new Error(j.description || 'erro do Telegram'); return j.result;
}
const tgEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function tgEnviar(destinos, texto, link) {
  const cfg = tgCfg(); const linhas = texto.split('\n'); let html = `<b>${tgEsc(linhas[0])}</b>\n${tgEsc(linhas.slice(1).join('\n'))}`;
  if (html.length > 3500) html = html.slice(0, 3500) + '\n…';
  const kb = []; if (link.length < 2000) kb.push([{ text: '📥 Abrir no DESPERTAR', url: link }]);
  const wa = waUrl(texto, link); if (wa.length < 2000) kb.push([{ text: '💬 Mandar no WhatsApp', url: wa }]);
  const out = [];
  for (const d0 of destinos) {
    const base = { chat_id: d0.id, parse_mode: 'HTML', disable_web_page_preview: true };
    try { await tgApi(cfg.token, 'sendMessage', { ...base, text: html, ...(kb.length ? { reply_markup: { inline_keyboard: kb } } : {}) }); out.push({ nome: d0.nome, ok: true }); }
    catch (e) {
      try { await tgApi(cfg.token, 'sendMessage', { ...base, text: html + `\n\n📥 Abrir no DESPERTAR:\n${tgEsc(link)}` }); out.push({ nome: d0.nome, ok: true }); }
      catch (e2) { out.push({ nome: d0.nome, ok: false, erro: /chat not found|bot was blocked|have no rights|initiate/i.test(e2.message) ? `${e2.message} (o jogador precisa abrir o bot e tocar em Iniciar; em canais, o bot precisa ser administrador)` : e2.message }); }
    }
  }
  return out;
}
/* confere chave, chat, permissão de administrador e envio, explicando cada falha */
async function tgDiagnostico(cfg, d0) {
  const out = []; const id = String(d0.id).trim();
  let me; try { me = await tgApi(cfg.token, 'getMe'); out.push({ ok: true, txt: `Chave válida: bot <b>@${esc(me.username)}</b>.` }); }
  catch (e) { out.push({ ok: false, txt: `A chave do bot não funciona (${esc(e.message)}). Copie de novo o token do @BotFather, sem espaços, e clique em Testar.` }); return out; }
  if (/^https?:|t\.me\//i.test(id) || /\s/.test(id) || (!/^@/.test(id) && !/^-?\d+$/.test(id))) {
    out.push({ ok: false, txt: `O ID "${esc(id)}" não é válido. Use <b>@nome_do_canal</b> (canal público) ou o número que começa com <b>-100</b> (canal privado). Nome de exibição e link de convite não servem.` }); return out; }
  let chat; try { chat = await tgApi(cfg.token, 'getChat', { chat_id: id }); out.push({ ok: true, txt: `Chat encontrado: <b>${esc(chat.title || chat.first_name || id)}</b> (${chat.type === 'channel' ? 'canal' : chat.type === 'private' ? 'privado' : 'grupo'}).` }); }
  catch (e) { out.push({ ok: false, txt: /not found/i.test(e.message)
      ? `O Telegram não achou "${esc(id)}" para este bot. Causas comuns: o bot ainda não foi adicionado ao canal; o canal é <b>privado</b> e você usou @nome (privado só aceita o número -100…); ou houve erro de digitação. Dica: com o bot já administrador, poste qualquer mensagem no canal e use <b>Buscar contatos</b> para pegar o ID certo.`
      : `Não consegui abrir o chat: ${esc(e.message)}` }); return out; }
  if (chat.type !== 'private') {
    try { const m = await tgApi(cfg.token, 'getChatMember', { chat_id: id, user_id: me.id });
      if (chat.type === 'channel') {
        if (m.status !== 'administrator' && m.status !== 'creator') out.push({ ok: false, txt: `O bot está no canal como "<b>${esc(m.status)}</b>". Em canais, só administradores podem publicar: abra o canal → Administradores → Adicionar administrador → escolha o bot.` });
        else if (m.can_post_messages === false) out.push({ ok: false, txt: 'O bot é administrador, mas sem a permissão <b>Publicar mensagens</b>. Edite o administrador e ligue essa opção.' });
        else out.push({ ok: true, txt: 'O bot é administrador e pode publicar.' });
      } else if (m.status === 'left' || m.status === 'kicked') out.push({ ok: false, txt: 'O bot não está mais neste grupo. Adicione-o de novo.' });
      else if (m.status === 'restricted' && m.can_send_messages === false) out.push({ ok: false, txt: 'O bot está no grupo, mas proibido de mandar mensagens.' });
      else out.push({ ok: true, txt: `O bot está no grupo (${esc(m.status)}).` });
    } catch (e) { out.push({ ok: false, txt: `Não consegui ver as permissões do bot: ${esc(e.message)}` }); }
  }
  try { await tgApi(cfg.token, 'sendMessage', { chat_id: id, text: '[ SISTEMA ] Teste de conexão do DESPERTAR: este chat recebe mensagens.' }); out.push({ ok: true, txt: 'Mensagem de teste enviada. Confira no Telegram.' }); }
  catch (e) { out.push({ ok: false, txt: `O envio falhou: ${esc(e.message)}${/initiate|blocked/i.test(e.message) ? '. O jogador precisa abrir o bot e tocar em Iniciar (ou desbloqueá-lo).' : ''}` }); }
  return out;
}
function modalTelegram(voltar) {
  const cfg = tgCfg(); let achados = [];
  const tipoIcone = t => t === 'privado' ? '👤' : t === 'canal' ? '📣' : '👥';
  const montar = () => `<details class="intro"${cfg.token ? '' : ' open'}><summary><b>Como configurar</b></summary>${AJUDA.telegram.txt}</details>
    <div class="campo" style="margin-top:10px"><span>Chave do bot (token do @BotFather)</span><div class="lado"><input type="password" id="tg-token" value="${esc(cfg.token)}" placeholder="123456789:AAH…" autocomplete="off" spellcheck="false"><button class="btn mini btn-sec" data-tg="testar">Testar</button></div></div>
    <div id="tg-info" class="dica">${cfg.bot ? `Bot conectado: <b>@${esc(cfg.bot)}</b>. Link para os jogadores iniciarem o bot: <a href="https://t.me/${esc(cfg.bot)}" target="_blank" rel="noopener">t.me/${esc(cfg.bot)}</a> <button class="btn mini btn-sec" data-tg="copiar-bot">Copiar</button>` : ''}</div>
    <h4 style="margin:14px 0 6px">Destinos (${cfg.destinos.length})</h4>
    <div class="lista-f">${cfg.destinos.length ? cfg.destinos.map((d0, i) => `<div class="lin"><span class="icone-item" style="--cor:var(--brilho)">${tipoIcone(d0.tipo)}</span><span class="meio"><span class="t1">${esc(d0.nome)}</span><span class="t2">${esc(d0.tipo)} · ${esc(d0.id)}</span></span><span class="dir"><button class="btn mini btn-sec" data-tg="teste" data-i="${i}">Diagnosticar</button><button class="btn-ghost" data-tg="del" data-i="${i}" aria-label="Remover">✕</button></span></div><div class="tg-diag" id="tg-diag-${i}"></div>`).join('') : '<p class="vazio-msg">Nenhum destino ainda.</p>'}</div>
    <div class="acoes"><button class="btn mini" data-tg="buscar" ${cfg.token ? '' : 'disabled'}>🔎 Buscar contatos</button></div>
    <div id="tg-achados">${achados.length ? `<div class="dica" style="margin:6px 0">Encontrados (quem falou com o bot ou onde ele está):</div><div class="lista-f">${achados.map((a, i) => { const ja = cfg.destinos.some(d0 => String(d0.id) === String(a.id));
      return `<div class="lin"><span class="icone-item" style="--cor:var(--ok)">${tipoIcone(a.tipo)}</span><span class="meio"><span class="t1">${esc(a.nome)}</span><span class="t2">${esc(a.tipo)} · ${esc(a.id)}</span></span><span class="dir">${ja ? '<span class="equip-tag">adicionado</span>' : `<button class="btn mini btn-ok" data-tg="add" data-i="${i}">Adicionar</button>`}</span></div>`; }).join('')}</div>` : ''}</div>
    <details style="margin-top:12px"><summary class="dica">Adicionar à mão</summary><div class="campos" style="margin-top:8px">
      <label class="campo"><span>Nome</span><input type="text" id="tg-n" placeholder="ex.: Mesa de sábado"></label><label class="campo"><span>ID do chat ou @canal</span><input type="text" id="tg-id" placeholder="-100123… ou @meucanal"></label>
      <label class="campo"><span>Tipo</span><select id="tg-tp"><option value="privado">Jogador (privado)</option><option value="grupo">Grupo</option><option value="canal">Canal</option></select></label></div>
      <button class="btn mini btn-sec" data-tg="add-man" style="margin-top:8px">Adicionar</button></details>
    <p class="dica" style="margin-top:12px">🔒 A chave fica guardada só neste navegador e nunca vai junto das fichas exportadas ou compartilhadas.</p>`;
  const corpo = abrirModal('✈ Bot do Telegram', montar(), [...(voltar ? [{ label: '← Voltar', cls: 'btn-sec', fechar: false, onClick: voltar }] : []), { label: 'Fechar', cls: 'btn-sec' }], { ajuda: 'telegram' });
  const redesenhar = () => { const y = corpo.scrollTop; corpo.innerHTML = montar(); corpo.scrollTop = y; };
  const info = (msg, ok) => { const el = $('#tg-info'); if (el) el.innerHTML = `<span class="${ok ? 'ok' : 'no-ok'}">${msg}</span>`; };
  corpo.addEventListener('change', e => { if (e.target.id === 'tg-token') { cfg.token = e.target.value.trim(); cfg.bot = ''; tgSalvar(cfg); redesenhar(); } });
  corpo.addEventListener('click', async e => {
    const b = e.target.closest('[data-tg]'); if (!b) return; const a = b.dataset.tg;
    if (a === 'testar') { const t = $('#tg-token').value.trim(); if (!t) return toast('Cole a chave do bot.'); cfg.token = t; info('Testando…', true);
      try { const me = await tgApi(t, 'getMe'); cfg.bot = me.username; tgSalvar(cfg); redesenhar(); toast(`Conectado: @${me.username}`); } catch (err) { cfg.bot = ''; tgSalvar(cfg); info(`Não funcionou: ${esc(err.message)}`, false); } }
    if (a === 'copiar-bot') copiar(`https://t.me/${cfg.bot}`);
    if (a === 'buscar') { info('Buscando…', true);
      try { const ups = await tgApi(cfg.token, 'getUpdates', { allowed_updates: ['message', 'channel_post', 'my_chat_member', 'chat_member'] }); const mapa = new Map();
        for (const u of ups) for (const k of ['message', 'edited_message', 'channel_post', 'edited_channel_post', 'my_chat_member', 'chat_member']) { const ch = u[k] && u[k].chat; if (ch) mapa.set(String(ch.id), { id: String(ch.id), nome: ch.title || [ch.first_name, ch.last_name].filter(Boolean).join(' ') || ch.username || String(ch.id), tipo: ch.type === 'private' ? 'privado' : ch.type === 'channel' ? 'canal' : 'grupo' }); }
        achados = [...mapa.values()]; redesenhar(); if (!achados.length) info('Nada encontrado. Peça aos jogadores para mandar /start ao bot e poste algo no canal; depois busque de novo. (O Telegram só guarda as mensagens das últimas 24 horas.)', false);
      } catch (err) { info(`Erro: ${esc(err.message)}`, false); } }
    if (a === 'add') { const x = achados[Number(b.dataset.i)]; if (x) { cfg.destinos.push(x); tgSalvar(cfg); redesenhar(); } }
    if (a === 'del') { cfg.destinos.splice(Number(b.dataset.i), 1); tgSalvar(cfg); redesenhar(); }
    if (a === 'add-man') { const id = $('#tg-id').value.trim(); if (!id) return toast('Informe o ID ou @canal.'); cfg.destinos.push({ id, nome: $('#tg-n').value.trim() || id, tipo: $('#tg-tp').value }); tgSalvar(cfg); redesenhar(); }
    if (a === 'teste') { const i = Number(b.dataset.i); const el = $('#tg-diag-' + i); b.disabled = true; el.innerHTML = '<div class="dica">Verificando…</div>';
      const passos = await tgDiagnostico(cfg, cfg.destinos[i]); b.disabled = false;
      el.innerHTML = passos.map(x => `<div class="${x.ok ? 'ok' : 'no-ok'}">${x.ok ? '✓' : '✗'} ${x.txt}</div>`).join(''); }
  });
}
function renderTgResumo() {
  const el = $('#tg-resumo'); if (!el) return; const c = tgCfg();
  el.innerHTML = c.token ? `<p>${c.bot ? `Bot <b>@${esc(c.bot)}</b>` : 'Chave salva (ainda não testada)'} · <b>${c.destinos.length}</b> destino(s)${c.destinos.length ? ': ' + c.destinos.map(d0 => esc(d0.nome)).join(', ') : ''}</p>` : '<p class="dica">Bot ainda não configurado. Os links e o WhatsApp funcionam sem ele.</p>';
}

/* ---------- receber dados por link ---------- */
function seletorFicha(valor, onChange) { return selBusca({ valor, opcoes: FICHAS.map(f => ({ v: f.id, l: f.nome || 'Sem nome', s: `nv ${f.nivel}${f.jogador ? ' · ' + f.jogador : ''}` })), onChange }); }
function modalReceberItem(raw) {
  const it = normalizarItem(raw); let alvo = ATUAL; const eqv = EQUIPAVEL.includes(it.cat);
  const montar = () => { const p = FICHAS.find(f => f.id === alvo);
    return `<p class="dica" style="margin-top:0">Alguém enviou este item para você. Escolha em qual ficha guardar.</p>${itemCard(it)}
      <div class="campo" style="margin-top:10px"><span>Guardar na ficha</span>${seletorFicha(alvo, v => { alvo = v; corpo.innerHTML = montar(); })}</div>
      ${eqv ? efeitosHTML(prever(p, c => { const x = clone(it); c.itens.push(x); equiparMut(c, x.uid, true); }), `Se equipar em "${p.nome}"`) : ''}<p class="dica">Inventário de ${esc(p.nome)}: ${naMochila(p)}/${CAP_INV}</p>`; };
  const receber = eq => { const p = FICHAS.find(f => f.id === alvo); if (alvo !== ATUAL) trocarFicha(alvo); abrirAba('ficha'); guardarItem(p, clone(it), { equipar: eq, msg: 'Item recebido' }); };
  const corpo = abrirModal('📥 Item recebido', montar(), [{ label: 'Recusar', cls: 'btn-sec' }, { label: 'Guardar no inventário', cls: 'btn-ok', onClick: () => receber(false) }, ...(eqv ? [{ label: 'Guardar e equipar', cls: 'btn-ok', onClick: () => receber(true) }] : [])]);
}
function modalReceberFicha(raw) {
  const f = normalizar(clone(raw)); f.hist = []; const existe = FICHAS.find(x => x.id === f.id); const c = computar(f);
  abrirModal('📥 Ficha recebida', `<div class="ficha-item"><div><div class="t1">${esc(f.nome || 'Sem nome')}</div><div class="t2">Nível ${f.nivel} · Rank ${c.rank}${DESP[f.despertar.id] ? ' · ' + DESP[f.despertar.id].n : ''}${f.jogador ? ' · ' + esc(f.jogador) : ''}</div></div></div>
    <p class="dica">${existe ? `Você já tem esta ficha neste navegador ("${esc(existe.nome)}"). <b>Atualizar</b> troca a sua cópia pela versão do link.` : 'Ela será guardada como uma ficha nova neste navegador.'}</p>`, [
    { label: 'Cancelar', cls: 'btn-sec' },
    ...(existe ? [{ label: 'Importar como cópia', cls: 'btn-sec', onClick: () => { imp(true); } }] : []),
    { label: existe ? 'Atualizar minha cópia' : 'Importar ficha', cls: 'btn-ok', onClick: () => { imp(false); } }]);
  async function imp(copia) {
    if (copia || !existe) { if (copia) f.id = uid(); f.criado = Date.now(); FICHAS.push(f); } else FICHAS[FICHAS.indexOf(existe)] = f;
    await Armazem.salvar(f); trocarFicha(f.id); abrirAba('ficha'); sistema(`Ficha recebida: ${f.nome}`);
  }
}
function modalReceberPacote(pk) {
  const itens = (pk.itens || []).map(normalizarItem); let alvo = ATUAL; const marc = new Set(itens.map(i => i.uid)); let somar = true;
  const montar = () => `<p class="dica" style="margin-top:0">O Mestre enviou um pacote de recompensas. Marque o que é seu.</p><p class="res-g" style="font-size:20px">📦 ${esc(pk.titulo || 'Recompensas')}</p>
    ${pk.xp || pk.ouro ? `<label class="chk"><input type="checkbox" id="pk-xp" ${somar ? 'checked' : ''}> Somar ${pk.xp ? `<b>+${pk.xp} XP</b>` : ''} ${pk.ouro ? `<b>+${Number(pk.ouro).toLocaleString('pt-BR')} Ouro</b>` : ''} na ficha</label>` : ''}
    <div class="itens" style="margin-top:10px">${itens.map(it => itemCard(it, `<label class="chk"><input type="checkbox" data-pk="${it.uid}" ${marc.has(it.uid) ? 'checked' : ''}> Ficar com este</label>`)).join('')}</div>
    <div class="campo" style="margin-top:12px"><span>Guardar na ficha</span>${seletorFicha(alvo, v => { alvo = v; corpo.innerHTML = montar(); })}</div>`;
  const corpo = abrirModal('📥 Pacote recebido', montar(), [{ label: 'Cancelar', cls: 'btn-sec' }, { label: 'Receber', cls: 'btn-ok', onClick: () => {
    const p = FICHAS.find(f => f.id === alvo); const pega = itens.filter(i => marc.has(i.uid));
    mudar(`Pacote recebido: ${pk.titulo || 'recompensas'}`, q => { if (somar) { q.xp = (Number(q.xp) || 0) + (Number(pk.xp) || 0); q.ouro = (Number(q.ouro) || 0) + (Number(pk.ouro) || 0); } pega.forEach(i => empilhar(q, clone(i))); }, p);
    if (alvo !== ATUAL) trocarFicha(alvo); abrirAba('ficha'); sistema(`Pacote recebido: ${pega.length} item(ns)${somar && pk.xp ? `, +${pk.xp} XP` : ''}`, 'RECOMPENSA'); setTimeout(() => checarCapacidade(p), 80);
  } }], { largo: true });
  corpo.addEventListener('change', e => { const c = e.target.closest('[data-pk]'); if (c) { if (c.checked) marc.add(c.dataset.pk); else marc.delete(c.dataset.pk); } if (e.target.id === 'pk-xp') somar = e.target.checked; });
}
async function verificarLink() {
  const m = /(?:^|[#&?])d=([A-Za-z0-9_-]+)/.exec(location.hash.slice(1) + '&' + location.search.slice(1)); if (!m) return;
  history.replaceState(null, '', location.pathname);
  let dados; try { dados = await decodificar(m[1]); } catch (e) { toast('Link inválido ou incompleto.'); return; }
  if (!dados || !dados.k) return toast('Link sem dados reconhecíveis.');
  if (dados.k === 'item') modalReceberItem(dados.d); else if (dados.k === 'ficha') modalReceberFicha(dados.d); else if (dados.k === 'pacote') modalReceberPacote(dados.d);
}

/* ---------- gerenciar fichas ---------- */
function modalFichas() {
  let confirmar = null;
  const montar = () => `<div class="ficha-lista">${FICHAS.slice().sort((a, b) => (b.criado || 0) - (a.criado || 0)).map(f => { const dsp = DESP[f.despertar.id];
    return `<div class="ficha-item ${f.id === ATUAL ? 'atual' : ''}"><div><div class="t1">${esc(f.nome || 'Sem nome')}</div>
      <div class="t2">Nível ${f.nivel} · Rank ${rankDoNivel(Number(f.nivel) || 1)}${dsp ? ' · ' + dsp.n : ''}${f.jogador ? ' · ' + esc(f.jogador) : ''}</div></div>
      <div class="dir">${f.id === ATUAL ? '<span class="equip-tag">aberta</span>' : `<button class="btn mini" data-f="abrir" data-id="${f.id}">Abrir</button>`}
      <button class="btn mini btn-sec" data-f="dup" data-id="${f.id}">Duplicar</button><button class="btn mini btn-sec" data-f="link" data-id="${f.id}">📤 Link</button><button class="btn mini btn-sec" data-f="exp" data-id="${f.id}">Exportar</button>
      <button class="btn mini btn-perigo" data-f="del" data-id="${f.id}">${confirmar === f.id ? 'Confirmar?' : 'Apagar'}</button></div></div>`; }).join('')}</div>
    <p class="dica" style="margin-top:12px">As fichas ficam salvas no banco de dados deste navegador (IndexedDB${Armazem.modo === 'idb' ? '' : ' indisponível: usando modo simples'}). Exporte ou compartilhe por link para levar a outro aparelho.</p>
    <input type="file" id="mf-imp" accept=".json,application/json" hidden multiple>`;
  const corpo = abrirModal(`Fichas (${FICHAS.length})`, montar(), [
    { label: 'Importar JSON', cls: 'btn-sec', fechar: false, onClick: () => $('#mf-imp').click() },
    { label: 'Exportar todas', cls: 'btn-sec', fechar: false, onClick: () => baixar(FICHAS.map(semSnaps), 'despertar-fichas.json') },
    { label: '＋ Nova ficha', cls: 'btn-ok', onClick: async () => { const n = novoPers(); FICHAS.push(n); await Armazem.salvar(n); trocarFicha(n.id); abrirAba('ficha'); setTimeout(modalGuia, 300); } }]);
  const redesenhar = () => { corpo.innerHTML = montar(); $('#modal-titulo').textContent = `Fichas (${FICHAS.length})`; };
  corpo.addEventListener('change', async e => {
    if (e.target.id !== 'mf-imp') return; let n = 0;
    for (const f of e.target.files) { try { const dados = JSON.parse(await f.text()); for (const raw of (Array.isArray(dados) ? dados : [dados])) { const fx = normalizar(raw); fx.id = uid(); fx.criado = Date.now(); FICHAS.push(fx); await Armazem.salvar(fx); n++; } } catch (err) { toast('Arquivo inválido: ' + f.name); } }
    if (n) { toast(`${n} ficha(s) importada(s).`); redesenhar(); }
  });
  corpo.addEventListener('click', async e => {
    const b = e.target.closest('[data-f]'); if (!b) return; const f = FICHAS.find(x => x.id === b.dataset.id); if (!f) return;
    if (b.dataset.f === 'abrir') { trocarFicha(f.id); fecharModal(); renderFicha(); }
    if (b.dataset.f === 'dup') { const c = semSnaps(f); c.id = uid(); c.nome += ' (cópia)'; c.criado = Date.now(); FICHAS.push(c); await Armazem.salvar(c); redesenhar(); }
    if (b.dataset.f === 'link') compartilharFicha(f);
    if (b.dataset.f === 'exp') baixar(semSnaps(f), `${(f.nome || 'cacador').replace(/[^\w\-]+/g, '_')}.json`);
    if (b.dataset.f === 'del') {
      if (confirmar !== f.id) { confirmar = f.id; redesenhar(); return; }
      FICHAS = FICHAS.filter(x => x.id !== f.id); await Armazem.apagar(f.id);
      if (!FICHAS.length) { const n = novoPers(); FICHAS.push(n); await Armazem.salvar(n); }
      if (!P()) trocarFicha(FICHAS[0].id);
      confirmar = null; redesenhar(); renderFicha();
    }
  });
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
  $('#btn-imprimir-livro').addEventListener('click', () => { abrirAba('livro'); document.body.classList.remove('imprimir-ficha'); $$('#livro details').forEach(x => { x.open = true; }); setTimeout(() => window.print(), 100); });
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimir-ficha'));
  $('#modal-x').addEventListener('click', fecharModal);
  $('#modal-fundo').addEventListener('mousedown', e => { if (e.target.id === 'modal-fundo') fecharModal(); });
  window.addEventListener('hashchange', verificarLink);

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
  $('#s-item').addEventListener('click', () => { pacoteInfo = null; gerarItensMestre(); });
  $('#s-portal').addEventListener('click', gerarPortal);
  $('#s-enc').addEventListener('click', gerarEncontro);
  $('#s-dado').addEventListener('click', () => rolarDado($('#s-dado-exp').value));
  $('#s-dado-exp').addEventListener('keydown', e => { if (e.key === 'Enter') rolarDado(e.target.value); });
  $('#s-dado-limpar').addEventListener('click', () => { rolarDado.h = []; desenharDados(); });
  $$('[data-d]').forEach(b => b.addEventListener('click', () => { $('#s-dado-exp').value = b.dataset.d; rolarDado(b.dataset.d); }));
  $('#tg-config').addEventListener('click', () => modalTelegram());
  $('#s-item-pacote').addEventListener('click', () => { if (!itensMestre.length) return; const pk = { titulo: pacoteInfo ? pacoteInfo.titulo : 'Saque', xp: pacoteInfo ? pacoteInfo.xp : 0, ouro: pacoteInfo ? pacoteInfo.ouro : 0, itens: itensMestre.map(limparItem) };
    modalCompartilhar({ titulo: '📦 Enviar pacote', texto: pacoteTexto(pk), k: 'pacote', d: pk, aviso: 'Cada jogador abre o link e escolhe o que fica na própria ficha.' }); });
  $('#aba-sorteios').addEventListener('click', e => {
    const add = e.target.closest('[data-mestre-add]');
    if (add) { const it = itensMestre[Number(add.dataset.mestreAdd)]; if (it) { guardarItem(P(), clone(it), { msg: 'Item recebido do Mestre' }); add.disabled = true; } }
    const env = e.target.closest('[data-mestre-env]');
    if (env) { const it = itensMestre[Number(env.dataset.mestreEnv)]; if (it) compartilharItem(it); }
    const loot = e.target.closest('[data-portal-loot]');
    if (loot) { const [rk, bn] = loot.dataset.portalLoot.split('|'); $('#s-item-rank').value = rk; $('#s-item-tipo').value = 'aleatorio'; $('#s-item-qtd').value = 2;
      const s = $('#s-item-bonus'); if (![...s.options].some(o => o.value === bn)) s.insertAdjacentHTML('beforeend', `<option value="${bn}">Chefe deste Portal (+${bn})</option>`);
      s.value = bn; pacoteInfo = ultimoPortal; gerarItensMestre(); $('#o-item').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
  });
  renderTgResumo();

  // ficha: barra
  $('#f-gerenciar').addEventListener('click', modalFichas);
  $('#f-mais').addEventListener('click', modalMais);
  document.addEventListener('click', e => {
    const m = e.target.closest('[data-modal]'); if (!m) return;
    ({ atrib: modalAtrib, desp: modalDesp, aval: () => modalAval(), nivel: modalNivel, item: modalGerarItem, portal: modalPortalConcluido })[m.dataset.modal]();
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
    if (path === 'nivel') { ficha.querySelectorAll('[data-bind^="pericias."]').forEach(i => { i.max = 2 + Math.floor((Number(v) || 1) / 2); }); }
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
      mudar(`Despertar ${DESP[p.despertar.id].n}: nível ${nv}`, q => { q.despertar.nv = nv; }); renderFichaDinamico();
    }
    if (a === 'desp-info') abrirModal(DESP[p.despertar.id].n, despCard(DESP[p.despertar.id]) + efeitosHTML(inverter(prever(p, z => { z.despertar = { id: '', nv: 1 }; })), 'Efeito atual na ficha'), [{ label: 'Fechar', cls: 'btn-sec' }], { ajuda: 'despertar' });
    if (a === 'hab-info') modalHab(b.dataset.id);
    if (a === 'hab-mais') { acaoHab(b.dataset.id, 'subir'); renderFichaDinamico(); }
    if (a === 'hab-menos') { acaoHab(b.dataset.id, 'descer'); renderFichaDinamico(); }
    if (a === 'hab-add') modalAddHab();
    if (a === 'item-info') modalItem(b.dataset.uid);
    if (a === 'item-equip') alternarEquip(p, b.dataset.uid);
    if (a === 'item-usar') usarItem(b.dataset.uid);
    if (a === 'item-custom') modalItemProprio();
    if (a === 'loja') modalLoja();
    if (a === 'desp-usar') usarDespertar(b.dataset.i);
    if (a === 'hab-usar') usarHabilidade(b.dataset.id);
    if (a === 'ir') abrirAba(b.dataset.aba);
  });
}

/* =========================================================
   APLICATIVO (PWA): funciona offline e pode ser instalado
   ========================================================= */
let pedidoInstalar = null;
const instalado = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const ehIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
function atualizarBotaoInstalar() { const b = $('#btn-instalar'); if (b) b.hidden = instalado() || !(pedidoInstalar || ehIOS()); }
function modalInstalar() {
  if (instalado()) { abrirModal('📲 Aplicativo', '<p class="ok">O DESPERTAR já está instalado e aberto como aplicativo.</p>', [{ label: 'Fechar', cls: 'btn-sec' }]); return; }
  if (pedidoInstalar) {
    pedidoInstalar.prompt();
    pedidoInstalar.userChoice.then(r => { if (r.outcome === 'accepted') sistema('DESPERTAR instalado. Procure o ícone na tela inicial.', 'APLICATIVO'); pedidoInstalar = null; atualizarBotaoInstalar(); });
    return;
  }
  const ios = ehIOS();
  abrirModal('📲 Instalar o DESPERTAR', `<div class="intro"><p>Instalado, o DESPERTAR ganha um ícone na tela inicial, abre em tela cheia como um aplicativo e <b>funciona sem internet</b>. As fichas continuam guardadas no aparelho.</p></div>
    ${ios ? `<p><b>No iPhone ou iPad (Safari):</b></p><ol class="passos"><li>Toque no botão <b>Compartilhar</b> <span class="tag">⬆︎</span> na barra do Safari.</li><li>Role a lista e toque em <b>Adicionar à Tela de Início</b>.</li><li>Confirme em <b>Adicionar</b>.</li></ol><p class="dica">Em outros navegadores do iPhone (Chrome, Edge), a opção fica no mesmo menu de compartilhar. Se não aparecer, abra este endereço no Safari.</p>`
      : `<p><b>No Android (Chrome):</b> toque no menu <b>⋮</b> e escolha <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p><p><b>No computador (Chrome ou Edge):</b> clique no ícone de instalar na barra de endereço, ou no menu → <b>Instalar DESPERTAR</b>.</p><p class="dica">Se a opção não aparecer, recarregue a página uma vez com internet.</p>`}`,
    [{ label: 'Entendi', cls: 'btn' }]);
}
function iniciarPWA() {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); pedidoInstalar = e; atualizarBotaoInstalar(); });
  window.addEventListener('appinstalled', () => { pedidoInstalar = null; atualizarBotaoInstalar(); });
  $('#btn-instalar').addEventListener('click', modalInstalar);
  atualizarBotaoInstalar();
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => { });
}

/* =========================================================
   INÍCIO
   ========================================================= */
(async () => {
  montarLivro();
  ligar();
  await carregar();
  let aba = 'livro'; try { aba = sessionStorage.getItem('despertar.aba') || 'livro'; } catch (e) { }
  const abaUrl = new URLSearchParams(location.search).get('aba'); // atalhos do app instalado
  if (abaUrl && $(`.aba[data-aba="${CSS.escape(abaUrl)}"]`)) { aba = abaUrl; history.replaceState(null, '', location.pathname + location.hash); }
  if (aba !== 'livro') abrirAba(aba);
  iniciarPWA();
  await verificarLink();
  window.__despertar = { computar, P, FICHAS: () => FICHAS, modo: () => Armazem.modo, codificar, decodificar, linkDe, guardarItem, criarMat, gerarItem, itemBase, armaComum, renderFicha };
})();
})();
