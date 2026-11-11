/* =========================================================
   DESPERTAR — aplicação (livro, árvores, sorteios, ficha)
   ========================================================= */
(function () {
'use strict';

/* ---------------- utilidades ---------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const d = n => 1 + Math.floor(Math.random() * n);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const mod = v => Math.floor((Number(v) - 10) / 2);
const sinal = n => (n >= 0 ? '+' : '−') + Math.abs(n);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const HAB = Object.fromEntries(HABILIDADES.map(h => [h.id, h]));
const DESP = Object.fromEntries(DESPERTARES.map(x => [x.id, x]));
const ARV = Object.fromEntries(ARVORES.map(a => [a.id, a]));
const nomeAtr = id => (ATRIBUTOS.find(a => a.id === id) || {}).nome || id;

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* rolagem de expressão: "2d6+3-1d4" */
function rolarExp(exp) {
  const limpa = String(exp).toLowerCase().replace(/\s+/g, '');
  if (!/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(limpa)) return null;
  const termos = limpa.match(/[+-]?[^+-]+/g);
  let total = 0; const partes = [];
  for (const t of termos) {
    const s = t[0] === '-' ? -1 : 1; const corpo = t.replace(/^[+-]/, '');
    if (corpo.includes('d')) {
      let [q, f] = corpo.split('d'); q = Number(q || 1); f = Number(f);
      if (q > 200 || f < 1) return null;
      const rs = Array.from({ length: q }, () => d(f));
      const soma = rs.reduce((a, b) => a + b, 0); total += s * soma;
      partes.push(`${s < 0 ? '−' : ''}${q}d${f}[${rs.join(', ')}]`);
    } else { total += s * Number(corpo); partes.push(`${s < 0 ? '−' : '+'}${corpo}`); }
  }
  return { total, txt: partes.join(' ') };
}

/* ---------------- armazenamento ---------------- */
const CHAVE = 'despertar.fichas.v1';
let DB = { atual: null, lista: [] };
function carregar() {
  try { const raw = localStorage.getItem(CHAVE); if (raw) DB = JSON.parse(raw); } catch (e) { /* sem storage */ }
  if (!DB.lista || !DB.lista.length) { const p = novoPers(); DB = { atual: p.id, lista: [p] }; }
  if (!DB.lista.find(p => p.id === DB.atual)) DB.atual = DB.lista[0].id;
  DB.lista.forEach(normalizar);
}
let _saveT;
function salvar() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try { localStorage.setItem(CHAVE, JSON.stringify(DB)); $('#f-salvo').textContent = '✓ salvo neste navegador'; }
    catch (e) { $('#f-salvo').textContent = 'Armazenamento indisponível — use Exportar JSON'; }
  }, 250);
}
function novoPers() {
  return {
    id: uid(), nome: 'Novo Caçador', jogador: '', conceito: '', motivo: '', nivel: 1, xp: 0, rankOficial: 'E', potencial: 'Normal', ouro: 100,
    atr: { FOR: 10, AGI: 10, VIT: 10, INT: 10, PER: 10, PRE: 10 }, statusPend: 0,
    compPot: { ph: 0, st: 0 }, compDesp: { ph: 0, st: 0 }, phNiveis: 0, phExtra: 0,
    pericias: {}, despertar: { id: '', nv: 1 }, habs: [], pvAtual: null, pmAtual: null,
    bonus: { pv: 0, pm: 0, def: 0, esq: 0, atk: 0, dano: 0, rd: 0, desl: 0, ini: 0 },
    armadura: { tipo: 'Leve', rank: 'E', refino: 0 }, escudo: { tem: false, rank: 'E', refino: 0 },
    armas: [{ nome: 'Espada', dano: '1d8', atr: 'FOR', rank: 'E', refino: 0, atk: 0, dmg: 0 }],
    itens: [], condicoes: '', notas: ''
  };
}
function normalizar(p) {
  const base = novoPers();
  for (const k in base) if (p[k] === undefined) p[k] = base[k];
  for (const k in base.bonus) if (p.bonus[k] === undefined) p.bonus[k] = 0;
  for (const k in base.atr) if (p.atr[k] === undefined) p.atr[k] = 10;
  return p;
}
const P = () => DB.lista.find(p => p.id === DB.atual);

/* ---------------- regras calculadas ---------------- */
function rankDoNivel(n) { let r = 'E'; for (const k of RANK_ORDEM) if (n >= RANKS[k].nivel) r = k; return r; }
function calc(p) {
  const n = Math.max(1, Number(p.nivel) || 1);
  const m = {}; for (const a of ATRIBUTOS) m[a.id] = mod(p.atr[a.id]);
  const b = p.bonus;
  const pvMax = 10 + m.VIT + (n - 1) * Math.max(1, 5 + m.VIT) + Number(b.pv || 0) + bonusPassivos(p).pv;
  const pmMax = 10 + m.INT + (n - 1) * Math.max(1, 4 + m.INT) + Number(b.pm || 0) + bonusPassivos(p).pm;
  const arm = ARMADURAS.find(a => a.tipo === p.armadura.tipo);
  const brArm = arm ? RANKS[p.armadura.rank].br : 0;
  const defArm = arm ? arm.def + brArm + Number(p.armadura.refino || 0) : 0;
  const penEsq = arm ? arm.esq : 0;
  const esc_ = p.escudo.tem ? 2 + RANKS[p.escudo.rank].br + Number(p.escudo.refino || 0) : 0;
  const rd = brArm + (p.escudo.tem ? RANKS[p.escudo.rank].br : 0) + Number(b.rd || 0);
  return {
    n, m, rank: rankDoNivel(n), pvMax, pmMax,
    desl: Math.max(1, 9 + Math.floor(m.AGI / 2) + Number(b.desl || 0)),
    acoes: 1 + Math.floor(n / 5),
    ini: m.AGI + Number(b.ini || 0),
    defender: n + m.FOR + defArm + esc_ + Number(b.def || 0),
    esquivar: n + m.AGI + penEsq + Number(b.esq || 0),
    defPassiva: 10 + defArm,
    rd,
    xpProx: n * 10,
    periciaMax: 2 + Math.floor(n / 2),
    periciaTotal: 4 + 2 * (n - 1)
  };
}
/* bônus automáticos simples de passivas de PV/PM */
function bonusPassivos(p) {
  let pv = 0, pm = 0; const n = Number(p.nivel) || 1;
  for (const x of p.habs) {
    if (x.id === 'bas6') pv += x.nv * n;
    if (x.id === 'aur5') { pv += 5 * x.nv; pm += 5 * x.nv; }
    if (x.id === 'aur2') pm += 5 * x.nv;
    if (x.id === 'bas1' && x.nv >= 5) pv += 10;
  }
  return { pv, pm };
}
function afinidades(p) { const dsp = DESP[p.despertar.id]; return dsp ? dsp.afin : []; }
function custoAquis(h, p) { const c = RANKS[h.r].custo; return p && afinidades(p).includes(h.t) ? Math.max(1, c - 1) : c; }
function phRecebidos(p) { return 3 + Number(p.compPot.ph || 0) + Number(p.compDesp.ph || 0) + Number(p.phNiveis || 0) + Number(p.phExtra || 0); }
function despGratis(p) { return Math.min(5, Math.floor((Number(p.nivel) || 1) / 5)); }
function phGasto(p) {
  let g = 0;
  for (const x of p.habs) {
    const h = HAB[x.id]; if (!h) continue;
    if (!x.gratis) g += custoAquis(h, p);
    for (let k = 2; k <= x.nv; k++) g += k;
  }
  if (p.despertar.id) {
    const free = despGratis(p);
    for (let k = 2 + free; k <= p.despertar.nv; k++) g += k;
  }
  return g;
}
const phDisp = p => phRecebidos(p) - phGasto(p);
function possui(p, id) { return p.habs.find(x => x.id === id); }
function checarReq(h, p) {
  const c = calc(p); const out = [];
  out.push({ ok: c.n >= RANKS[h.r].nivel, txt: `Nível ${RANKS[h.r].nivel}` });
  const atrs = h.attr.split('/');
  out.push({ ok: atrs.some(a => Number(p.atr[a]) >= RANKS[h.r].attr), txt: `${atrs.join(' ou ')} ${RANKS[h.r].attr}` });
  if (h.pre.length) {
    const res = h.pre.map(([id, nv]) => { const x = possui(p, id); return { ok: !!x && x.nv >= nv, txt: `${HAB[id].n} nv${nv}` }; });
    if (h.preAny) out.push({ ok: res.some(r => r.ok), txt: 'Um entre: ' + res.map(r => r.txt).join(' / ') });
    else out.push(...res);
  }
  return out;
}
const reqOk = (h, p) => checarReq(h, p).every(r => r.ok);

/* ---------------- textos de habilidade ---------------- */
function reqTexto(h) {
  const partes = [`${h.attr.split('/').join(' ou ')} ${RANKS[h.r].attr}`];
  if (h.pre.length) {
    const ps = h.pre.map(([id, nv]) => `${HAB[id].n} nv${nv}`);
    partes.push(h.preAny ? 'um entre: ' + ps.join(' / ') : ps.join(' · '));
  }
  partes.push(`Nível ${RANKS[h.r].nivel}`);
  return partes.join(' · ');
}
function habCard(h, extra = '') {
  const a = ARV[h.t];
  return `<div class="hab-card" style="--cor:${a.cor}" data-hab="${h.id}">
    <div class="hab-topo"><span class="rk rk-${h.r}">${h.r}</span><strong>${esc(h.n)}</strong>
      <span class="hab-tipo">${h.tipo}${h.acao !== '—' ? ' · ' + h.acao : ''}${h.pm ? ' · ' + h.pm + ' PM' : ''}</span></div>
    <div class="hab-req">${a.icone} ${a.nome} · Aquisição ${RANKS[h.r].custo} PH · Requisitos: ${esc(reqTexto(h))}</div>
    <div class="hab-meta">Alcance: ${esc(h.alc)} · Duração: ${esc(h.dur)}${h.freq ? ' · <b>' + esc(h.freq) + '</b>' : ''}</div>
    <p><b>Efeito:</b> ${esc(h.ef)}</p>
    <p><b>Por nível:</b> ${esc(h.esc)}</p>
    <p><b>Nível 3:</b> ${esc(h.m3)}</p>
    <p><b>Nível 5:</b> ${esc(h.m5)}</p>${extra}</div>`;
}
function despCard(x, extra = '') {
  const r = RARIDADE_DESPERTAR[x.rar];
  const faixa = x.d[0] === x.d[1] ? String(x.d[0]).padStart(2, '0') : `${String(x.d[0]).padStart(2, '0')}–${String(x.d[1]).padStart(2, '0')}`;
  return `<div class="desp-card" style="--cor:${r.cor}">
    <div class="hab-topo"><span class="desp-d">${faixa}</span><strong>${esc(x.n)}</strong><span class="hab-tipo" style="color:${r.cor}">${x.rar}</span></div>
    <div class="hab-req">Afinidades: ${x.afin.map(a => ARV[a].icone + ' ' + ARV[a].nome).join(' · ')}</div>
    <p><i>${esc(x.desc)}</i></p>
    <p><b>Efeito:</b> ${esc(x.ef)}</p>
    <p><b>Por nível:</b> ${esc(x.esc)}</p>
    <p><b>Nível 3:</b> ${esc(x.m3)}</p>
    <p><b>Nível 5:</b> ${esc(x.m5)}</p>
    <p class="forma"><b>Forma Evoluída:</b> ${esc(x.forma)}</p>${extra}</div>`;
}

/* =========================================================
   LIVRO
   ========================================================= */
function montarLivro() {
  $('#cat-atributos').innerHTML = ATRIBUTOS.map(a => `<div class="caixa attr-card"><b>${a.nome} (${a.id})</b><p>${a.desc}</p></div>`).join('');
  $('#cat-pericias').innerHTML = PERICIAS.map(p => `<div>${p.n}<span>${p.a}</span></div>`).join('');
  $('#cat-condicoes').innerHTML = CONDICOES.map(([n, t]) => `<div><b>${n}.</b> ${t}</div>`).join('');
  $('#tab-req-rank').innerHTML = RANK_ORDEM.map(r => `<tr><td><span class="rk rk-${r}">${r}</span></td><td>${RANKS[r].nivel}</td><td>${RANKS[r].attr}</td><td>${RANKS[r].custo} PH</td></tr>`).join('');

  // despertares por raridade
  const grupos = ['Comum', 'Raro', 'Épico', 'Lendário', 'Anomalia'];
  $('#cat-despertares').innerHTML = grupos.map(g => {
    const r = RARIDADE_DESPERTAR[g]; const lista = DESPERTARES.filter(x => x.rar === g);
    return `<div class="desp-grupo" style="color:${r.cor}">${g} <span class="tag">${r.txt}</span></div>` + lista.map(x => despCard(x)).join('');
  }).join('');

  // árvores
  $('#cat-habilidades').innerHTML = ARVORES.map(a => `<div class="arvore-cat">
      <h3 style="color:${a.cor}"><span class="ic">${a.icone}</span> ${a.nome} <span class="tag">${a.atr}</span></h3>
      <p class="arvore-desc">${a.desc}</p>
      ${RANK_ORDEM.flatMap(r => HABILIDADES.filter(h => h.t === a.id && h.r === r)).map(h => habCard(h)).join('')}
    </div>`).join('');

  // armas
  $('#cat-armas').innerHTML = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Arma</th><th>Dano</th><th>Alcance</th><th>Atributo</th><th>Propriedades</th></tr></thead><tbody>
    ${ARMAS.map(a => `<tr><td>${a.n}</td><td>${a.dano}</td><td>${a.alc}</td><td>${a.a}</td><td>${a.tags || '—'}</td></tr>`).join('')}</tbody></table></div>`;
  $('#tab-raridades').innerHTML = RARIDADES.map(r => `<tr><td>${r.max > 200 ? r.min + '+' : r.min + '–' + r.max}</td><td style="color:${r.cor};font-weight:700">${r.n}</td><td>${r.afx}</td><td>${r.selos}</td><td>×${r.mult}</td></tr>`).join('');
  const lst = arr => '<ul>' + arr.map(([p, s, t]) => `<li><b>${p}</b> / <i>${s}</i>: ${t}</li>`).join('') + '</ul>';
  $('#cat-afixos').innerHTML = `<div class="afixos-grade">
      <div class="caixa"><h4>Afixos de Arma</h4>${lst(AFIXOS.arma)}</div>
      <div class="caixa"><h4>Afixos de Armadura e Escudo</h4>${lst(AFIXOS.armadura)}</div>
      <div class="caixa"><h4>Afixos de Acessório</h4>${lst(AFIXOS.acessorio)}<p class="dica">Acessórios recebem +1 afixo além do indicado pela raridade.</p></div>
    </div>
    <h4 style="margin-top:16px">Selos (propriedades ocultas, d12)</h4>
    <div class="tabela-wrap"><table class="tabela"><tbody>${SELOS.map(([n, t], i) => `<tr><td>${i + 1}</td><th>${n}</th><td>${t}</td></tr>`).join('')}</tbody></table></div>`;
  $('#cat-consumiveis').innerHTML = `<div class="tabela-wrap"><table class="tabela"><tbody>${CONSUMIVEIS.map(([n, t]) => `<tr><th>${n}</th><td>${t}</td></tr>`).join('')}</tbody></table></div>`;

  // portal
  const t12 = (titulo, arr, f = x => x) => `<div class="caixa"><h4>${titulo}</h4><ol>${arr.map(x => `<li>${f(x)}</li>`).join('')}</ol></div>`;
  $('#cat-portal').innerHTML = `
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>d100</th><th>Rank</th><th>Nível das ameaças</th></tr></thead><tbody>
      ${PORTAL_RANK.map((r, i) => `<tr><td>${(i ? PORTAL_RANK[i - 1].max + 1 : 1)}–${r.max}</td><td><span class="rk rk-${r.r}">${r.r}</span></td><td>${PORTAL_NIVEL[r.r][0]}–${PORTAL_NIVEL[r.r][1]} (Chefe +2)</td></tr>`).join('')}</tbody></table></div>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>d20</th><th>Tipo</th><th>Efeito</th><th>XP ×</th><th>Raridade +</th></tr></thead><tbody>
      ${PORTAL_TIPO.map((t, i) => `<tr><td>${(i ? PORTAL_TIPO[i - 1].max + 1 : 1)}${t.max !== (i ? PORTAL_TIPO[i - 1].max + 1 : 1) ? '–' + t.max : ''}</td><th>${t.n}</th><td>${t.d}</td><td>×${t.xp}</td><td>+${t.raridade}</td></tr>`).join('')}</tbody></table></div>
    <div class="grade-2">
      ${t12('Ambiente (d12)', PORTAL_AMBIENTE)}
      ${t12('Criaturas (d12)', PORTAL_CRIATURAS, x => `<b>${x[0]}</b>: ${x[1]}`)}
      ${t12('Título do Chefe (d12)', CHEFE_TITULO)}
      ${t12('Epíteto do Chefe (d12)', CHEFE_EPITETO)}
      ${t12('Complicação (d12)', PORTAL_COMPLICACAO)}
    </div>`;

  renderAmeacas();
  $('#amea-nivel').addEventListener('input', renderAmeacas);

  // bestiário
  $('#cat-bestiario').innerHTML = BESTIARIO.map(b => {
    const s = statsAmeaca(b.L, b.cat);
    return `<div class="hab-card" style="--cor:${RANKS[b.r].cor}">
      <div class="hab-topo"><span class="rk rk-${b.r}">${b.r}</span><strong>${b.n}</strong><span class="hab-tipo">${b.cat} · Nível ${b.L}</span></div>
      <div class="hab-meta">PV ${s.pv} · Ataque +${s.atk} · Reação +${s.reac}${b.cat === 'Lacaio' ? ' (Defesa Fixa ' + s.defFixa + ')' : ''} · Dano ${s.dano} · Ações ${s.acoes} · RD ${s.rd} · CD ${s.cd} · Resistências +${s.res}</div>
      <p>${b.tr}</p></div>`;
  }).join('');

  // sumário
  const sum = $('#sumario');
  sum.innerHTML = '<a href="#" data-topo>Capa</a>' + $$('.cap').map(c => {
    const h2 = $('h2', c); const subs = $$('h3', c);
    subs.forEach((h, i) => { if (!h.id) h.id = c.id + '-' + i; });
    return `<a href="#${c.id}" data-cap="${c.id}">${h2.textContent}</a>` + (c.id === 'c-arvores' || c.id === 'c-despertares' ? '' : subs.map(h => `<a class="sub" href="#${h.id}">${h.textContent}</a>`).join(''));
  }).join('');
  $('[data-topo]', sum).addEventListener('click', e => { e.preventDefault(); window.scrollTo({ top: 0 }); });
  const obs = new IntersectionObserver(ents => {
    ents.forEach(en => { if (en.isIntersecting) { $$('.sumario a').forEach(a => a.classList.toggle('atual', a.dataset.cap === en.target.id)); } });
  }, { rootMargin: '-10% 0px -80% 0px' });
  $$('.cap').forEach(c => obs.observe(c));
}
function renderAmeacas() {
  const L = Math.max(1, Math.min(40, Number($('#amea-nivel').value) || 1));
  const cats = ['Lacaio', 'Soldado', 'Elite', 'Chefe'];
  const linha = c => { const s = statsAmeaca(L, c); return `<tr><th>${c}</th><td>${s.pv}</td><td>+${s.atk}</td><td>+${s.reac}${c === 'Lacaio' ? ' (fixa ' + s.defFixa + ')' : ''}</td><td>${s.dano}</td><td>${s.acoes}</td><td>${s.rd}</td><td>${s.cd}</td><td>+${s.res}</td></tr>`; };
  let html = `<div class="tabela-wrap"><table class="tabela"><thead><tr><th>Nível ${L}</th><th>PV</th><th>Ataque</th><th>Reação</th><th>Dano</th><th>Ações</th><th>RD</th><th>CD</th><th>Resist.</th></tr></thead><tbody>${cats.map(linha).join('')}</tbody></table></div>`;
  // tabela completa compacta (útil na impressão)
  const rows = []; for (let l = 1; l <= 30; l++) {
    const S = cats.map(c => statsAmeaca(l, c));
    rows.push(`<tr><td>${l}</td><td>+${S[0].atk}</td><td>+${S[0].reac}</td><td>${S[0].cd}</td><td>${S.map(s => s.pv).join(' / ')}</td><td>${S.map(s => s.dano).join(' / ')}</td><td>${S.slice(1).map(s => s.acoes).join(' / ')}</td></tr>`);
  }
  html += `<details><summary class="dica">Tabela completa, níveis 1–30 (Lacaio / Soldado / Elite / Chefe)</summary><div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Nv</th><th>Atq</th><th>Reação</th><th>CD</th><th>PV L/S/E/C</th><th>Dano L/S/E/C</th><th>Ações S/E/C</th></tr></thead><tbody>${rows.join('')}</tbody></table></div></details>`;
  $('#tab-ameacas').innerHTML = html;
}

/* =========================================================
   ABAS
   ========================================================= */
let arvAtual = ARVORES[0].id, habSel = null;
function abrirAba(nome) {
  $$('.aba').forEach(b => b.classList.toggle('ativa', b.dataset.aba === nome));
  $$('.painel').forEach(p => p.classList.toggle('ativo', p.id === 'aba-' + nome));
  if (nome === 'arvores') renderArvore();
  if (nome === 'ficha') renderFicha();
  try { sessionStorage.setItem('despertar.aba', nome); } catch (e) { }
  window.scrollTo({ top: 0 });
}

/* =========================================================
   ÁRVORES
   ========================================================= */
function renderArvoreLista() {
  $('#arv-lista').innerHTML = ARVORES.map(a => `<button class="arv-btn ${a.id === arvAtual ? 'ativo' : ''}" style="--cor:${a.cor}" data-arv="${a.id}">${a.icone} ${a.nome}</button>`).join('');
}
function estadoNo(h, p) {
  const x = possui(p, h.id);
  if (x) return 'possui';
  return reqOk(h, p) ? 'disponivel' : 'bloqueado';
}
function renderArvore() {
  renderArvoreLista();
  const p = P(); const a = ARV[arvAtual]; const afin = afinidades(p);
  $('#arv-pers').innerHTML = `Ficha: <b>${esc(p.nome)}</b> · Nível ${p.nivel} · PH disponíveis: <b>${phDisp(p)}</b>`;
  let html = `<h2 class="arv-titulo" style="color:${a.cor}">${a.icone} ${a.nome} <span class="tag">${a.atr}</span>${afin.includes(a.id) ? '<span class="tag" style="color:var(--ouro)">★ Afinidade do Despertar (−1 PH)</span>' : ''}</h2>
    <p class="arv-sub">${a.desc}</p>
    <div class="legenda"><span class="l-pos">Possui</span><span class="l-disp">Requisitos cumpridos</span><span class="l-bloq">Bloqueada</span></div>`;
  for (const r of RANK_ORDEM) {
    const hs = HABILIDADES.filter(h => h.t === a.id && h.r === r);
    if (!hs.length) continue;
    html += `<div class="arv-linha"><div class="arv-rank"><span class="rk rk-${r}">${r}</span>Nv ${RANKS[r].nivel}+<br>${RANKS[r].custo} PH</div><div class="arv-nos">` +
      hs.map(h => {
        const x = possui(p, h.id); const est = estadoNo(h, p);
        return `<div class="no ${est} ${afin.includes(h.t) ? 'afim' : ''} ${habSel === h.id ? 'sel' : ''}" style="--cor:${a.cor}" data-no="${h.id}">
          <div class="no-n">${esc(h.n)}</div><div class="no-t">${h.tipo}${h.pm ? ' · ' + h.pm + ' PM' : ''}</div>
          <div class="no-pips">${[1, 2, 3, 4, 5].map(i => `<i class="${x && x.nv >= i ? 'on' : ''}"></i>`).join('')}</div></div>`;
      }).join('') + `</div></div>`;
  }
  const mapa = $('#arv-mapa'); mapa.innerHTML = html + '<svg class="linhas"></svg>';
  aplicarBusca();
  requestAnimationFrame(desenharLinhas);
  if (habSel && HAB[habSel] && HAB[habSel].t === a.id) renderDetalhe(habSel);
  else $('#arv-detalhe').innerHTML = '<p class="dica">Clique numa habilidade para ver os detalhes e comprar ou evoluir na ficha atual.</p>';
}
function desenharLinhas() {
  const mapa = $('#arv-mapa'); const svg = $('svg.linhas', mapa); if (!svg) return;
  const base = mapa.getBoundingClientRect();
  svg.setAttribute('width', mapa.scrollWidth); svg.setAttribute('height', mapa.scrollHeight);
  const a = ARV[arvAtual]; let out = '';
  for (const h of HABILIDADES.filter(h => h.t === arvAtual)) {
    const alvo = $(`[data-no="${h.id}"]`, mapa); if (!alvo || alvo.classList.contains('oculto')) continue;
    for (const [pid] of h.pre) {
      const orig = $(`[data-no="${pid}"]`, mapa); if (!orig || orig.classList.contains('oculto')) continue;
      const r1 = orig.getBoundingClientRect(), r2 = alvo.getBoundingClientRect();
      const x1 = r1.left + r1.width / 2 - base.left + mapa.scrollLeft, y1 = r1.bottom - base.top;
      const x2 = r2.left + r2.width / 2 - base.left + mapa.scrollLeft, y2 = r2.top - base.top;
      const my = (y1 + y2) / 2;
      const ativo = habSel && (habSel === h.id || habSel === pid);
      out += `<path d="M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}" fill="none" stroke="${a.cor}" stroke-opacity="${ativo ? 0.95 : 0.35}" stroke-width="${ativo ? 2.5 : 1.5}" ${h.preAny ? 'stroke-dasharray="5 4"' : ''}/>`;
    }
  }
  svg.innerHTML = out;
}
function aplicarBusca() {
  const q = $('#arv-busca').value.trim().toLowerCase();
  $$('.no').forEach(n => { const h = HAB[n.dataset.no]; n.classList.toggle('oculto', !!q && !(h.n + ' ' + h.ef).toLowerCase().includes(q)); });
}
function renderDetalhe(id) {
  const h = HAB[id]; const p = P(); const x = possui(p, id);
  const reqs = checarReq(h, p); const ok = reqs.every(r => r.ok);
  const custo = x ? (x.nv < 5 ? x.nv + 1 : null) : custoAquis(h, p);
  const disp = phDisp(p);
  let acoes = '';
  if (!x) {
    acoes += `<button class="btn btn-ok" data-acao="comprar" ${!ok || disp < custo ? 'disabled' : ''}>Adquirir (${custo} PH)</button>`;
    acoes += `<button class="btn btn-sec" data-acao="gratis" title="Recebida pela Avaliação do Sistema, Pergaminho ou Missão">Receber grátis</button>`;
  } else {
    if (x.nv < 5) acoes += `<button class="btn btn-ok" data-acao="subir" ${disp < custo ? 'disabled' : ''}>Evoluir para nv${x.nv + 1} (${custo} PH)</button>`;
    acoes += `<button class="btn btn-sec" data-acao="descer">${x.nv > 1 ? 'Reduzir nível' : 'Remover'}</button>`;
  }
  const status = `<div class="det-status">${x ? `<b>Na ficha: nível ${x.nv}${x.gratis ? ' (aquisição grátis)' : ''}</b><br>` : ''}
    ${reqs.map(r => `<span class="${r.ok ? 'ok' : 'no-ok'}">${r.ok ? '✓' : '✗'} ${esc(r.txt)}</span>`).join('<br>')}
    <br><span class="dica">PH disponíveis: ${disp}</span></div>`;
  $('#arv-detalhe').innerHTML = habCard(h) + status + `<div class="det-acoes" data-id="${id}">${acoes}</div>`;
}
function acaoHab(id, acao) {
  const p = P(); const h = HAB[id]; let x = possui(p, id);
  if (acao === 'comprar') {
    if (!reqOk(h, p)) return toast('Requisitos não cumpridos.');
    if (phDisp(p) < custoAquis(h, p)) return toast('PH insuficientes.');
    p.habs.push({ id, nv: 1, gratis: false }); toast(`[SISTEMA] Habilidade adquirida: ${h.n}`);
  } else if (acao === 'gratis') {
    if (x) return toast('Você já possui esta habilidade.');
    p.habs.push({ id, nv: 1, gratis: true }); toast(`[SISTEMA] Habilidade recebida: ${h.n}`);
  } else if (acao === 'subir') {
    if (!x || x.nv >= 5) return;
    if (phDisp(p) < x.nv + 1) return toast('PH insuficientes.');
    x.nv++; toast(`[SISTEMA] ${h.n} alcançou o nível ${x.nv}!`);
  } else if (acao === 'descer') {
    if (!x) return;
    if (x.nv > 1) x.nv--; else p.habs = p.habs.filter(y => y.id !== id);
  }
  salvar();
}

/* =========================================================
   SORTEIOS
   ========================================================= */
function janela(titulo, corpo) { return `<div class="res"><div class="res-t">[ ${titulo} ]</div>${corpo}</div>`; }

function sortearAtributos() {
  const dp = d(6); const pot = dp <= 2 ? { n: 'Fraco', b: 6, st: 6, ph: 2 } : dp <= 4 ? { n: 'Normal', b: 8, st: 3, ph: 1 } : { n: 'Forte', b: 10, st: 0, ph: 0 };
  const vals = {}; const rol = {};
  ATRIBUTOS.forEach(a => { const r1 = d(6), r2 = d(6); rol[a.id] = [r1, r2]; vals[a.id] = pot.b + r1 + r2; });
  sortearAtributos.ult = { pot, vals };
  $('#o-atrib').innerHTML = janela('STATUS', `<p>Potencial: <b>${pot.n}</b> (1d6 = ${dp}) · base ${pot.b}${pot.st ? ` · compensação +${pot.st} Status, +${pot.ph} PH` : ''}</p>
    <div class="atrib-res">${ATRIBUTOS.map(a => `<div><small>${a.id}</small><b>${vals[a.id]}</b><small>${sinal(mod(vals[a.id]))} · [${rol[a.id].join('+')}]</small></div>`).join('')}</div>
    <div class="acoes"><button class="btn mini" data-aplicar="atrib">Aplicar à ficha atual</button></div>`);
}
function sortearDespertar() {
  const r = d(100); const x = DESPERTARES.find(z => r >= z.d[0] && r <= z.d[1]);
  sortearDespertar.ult = x;
  $('#o-desp').innerHTML = janela(`d100 = ${r}`, despCard(x, `<div class="acoes"><button class="btn mini" data-aplicar="desp">Aplicar à ficha atual</button></div>`));
}
function sortearAvaliacao() {
  const rk = $('#s-aval-rank').value; const p = P();
  let pool = HABILIDADES.filter(h => h.r === rk && !possui(p, h.id));
  if (pool.length < 3) pool = HABILIDADES.filter(h => h.r === rk);
  const ops = shuffle(pool).slice(0, 3);
  $('#o-aval').innerHTML = janela('AVALIAÇÃO DO SISTEMA', `<p>Escolha uma recompensa. Ela será adicionada gratuitamente à ficha <b>${esc(p.nome)}</b>.</p>
    <div class="aval-ops">${ops.map(h => `<div class="aval-op" data-escolher="${h.id}">${habCard(h)}</div>`).join('')}</div>`);
}
function subirNivel() {
  const rolar = () => { const a = d(6); if (a === 1) { const b = d(6); return { v: b, txt: `1 → rerrolado ${b}` }; } return { v: a, txt: String(a) }; };
  const st = rolar(), ph = rolar(); const p = P(); const antes = Number(p.nivel) || 1;
  p.nivel = antes + 1; p.statusPend = Number(p.statusPend || 0) + st.v; p.phNiveis = Number(p.phNiveis || 0) + ph.v;
  const c = calc(p); const m = c.m;
  let extra = '';
  if (p.nivel % 5 === 0 && p.nivel <= 25) extra = `<p style="color:var(--ouro)"><b>RANK ${rankDoNivel(p.nivel)} ALCANÇADO!</b> Faça a Avaliação do Sistema (Rank ${rankDoNivel(p.nivel)}) e evolua seu Despertar em +1 nível grátis.</p>`;
  $('#o-nivel').innerHTML = janela('NÍVEL AUMENTADO', `<p class="res-g">Nível ${antes} → ${p.nivel}</p>
    <p>Pontos de Status: <b>+${st.v}</b> <span class="dica">(${st.txt})</span> · PH: <b>+${ph.v}</b> <span class="dica">(${ph.txt})</span> · Perícia: <b>+2</b></p>
    <p>PV +${Math.max(1, 5 + m.VIT)} · PM +${Math.max(1, 4 + m.INT)} · Aplicado à ficha <b>${esc(p.nome)}</b>.</p>${extra}`);
  if (extra) $('#s-aval-rank').value = rankDoNivel(p.nivel);
  salvar();
}

/* ---------- gerador de itens ---------- */
const GENERO = {
  'Adaga': 'f', 'Espada Curta': 'f', 'Katana': 'f', 'Espada': 'f', 'Espada Pesada': 'f', 'Machado': 'm', 'Machado Pesado': 'm', 'Lança': 'f',
  'Martelo': 'm', 'Martelo Pesado': 'm', 'Manoplas': 'f', 'Foice': 'f', 'Cajado': 'm', 'Arco': 'm', 'Arco Longo': 'm', 'Besta': 'f',
  'Facas de Arremesso': 'f', 'Traje de Combate': 'm', 'Couraça de Couro de Besta': 'f', 'Armadura de Placas': 'f', 'Escudo': 'm',
  'Anel': 'm', 'Colar': 'm', 'Brinco': 'm', 'Bracelete': 'm', 'Cinto': 'm', 'Manto': 'm', 'Botas': 'f', 'Luvas': 'f'
};
const PLURAL = new Set(['Manoplas', 'Facas de Arremesso', 'Botas', 'Luvas']);
function flex(adj, base) {
  const g = GENERO[base] || 'm'; let a = adj;
  if (g === 'm') { if (/ora$/.test(a)) a = a.replace(/ora$/, 'or'); else if (/a$/.test(a)) a = a.replace(/a$/, 'o'); }
  else { if (/o$/.test(a)) a = a.replace(/o$/, 'a'); else if (/or$/.test(a)) a += 'a'; }
  if (PLURAL.has(base)) { if (/[aeiou]$/.test(a)) a += 's'; else if (/il$/.test(a)) a = a.replace(/il$/, 'eis'); else if (/l$/.test(a)) a = a.replace(/l$/, 'is'); else if (/[rz]$/.test(a)) a += 'es'; }
  return a;
}
function rolarRaridade(bonus) { const v = d(100) + bonus; return { v, r: RARIDADES.find(r => v >= r.min && v <= r.max) || RARIDADES[RARIDADES.length - 1] }; }
function rolarConsumivel(rank, bonus) {
  const pesos = [['Poção de Cura', 30], ['Poção de Mana', 20], ['Antídoto', 10], ['Pedra de Retorno', 8], ['Cristal de Mana', 15], ['Pergaminho de Habilidade', 6],
    ['Elixir de Despertar', 2], ['Pó de Purificação', 4], ['Pergaminho de Selo', 5], ['Núcleo de Chefe', bonus >= 10 ? 6 : 0]];
  const tot = pesos.reduce((a, [, w]) => a + w, 0); let r = Math.random() * tot; let nome = pesos[0][0];
  for (const [n, w] of pesos) { if ((r -= w) < 0) { nome = n; break; } }
  const desc = CONSUMIVEIS.find(c => c[0] === nome)[1]; const br = RANKS[rank].br;
  const it = { uid: uid(), cat: 'consumivel', nome: `${nome} (Rank ${rank})`, rank, rar: 'Comum', cor: '#9aa5b1', linhas: [desc], afixos: [], selos: [], sinc: 0, refino: 0 };
  if (nome === 'Poção de Cura') it.linhas = [`Recupera ${2 + 2 * br}d8 PV.`];
  if (nome === 'Poção de Mana') it.linhas = [`Recupera ${2 + 2 * br}d6 PM.`];
  if (nome === 'Cristal de Mana') { const q = d(6); it.nome = `${q}× Cristal de Mana (Rank ${rank})`; it.qtd = q; }
  if (nome === 'Pergaminho de Habilidade') { const h = pick(HABILIDADES.filter(x => x.r === rank)); it.nome = `Pergaminho: ${h.n}`; it.linhas = [`Ensina ${h.n} (${ARV[h.t].nome}, Rank ${rank}) sem custo de aquisição.`, desc]; it.ensina = h.id; }
  if (nome === 'Elixir de Despertar') { it.rar = 'Épico'; it.cor = '#b06cff'; }
  if (nome === 'Núcleo de Chefe') { it.rar = 'Raro'; it.cor = '#4aa8ff'; }
  const venda = ['Pergaminho de Habilidade', 'Elixir de Despertar', 'Núcleo de Chefe'].includes(nome);
  it.preco = venda ? null : Math.round(PRECO_BASE[rank] / 5) * (it.qtd || 1);
  return it;
}
function gerarItem(rank, tipo, bonus) {
  if (tipo === 'aleatorio') { const t = d(20); tipo = t <= 8 ? 'arma' : t <= 11 ? 'armadura' : t === 12 ? 'escudo' : t <= 15 ? 'acessorio' : 'consumivel'; }
  if (tipo === 'consumivel') return rolarConsumivel(rank, bonus);
  const br = RANKS[rank].br; const X = 1 + br; const { v, r } = rolarRaridade(bonus);
  let base, linhas = [], reqAtr = null, catAfx = tipo === 'arma' ? 'arma' : tipo === 'acessorio' ? 'acessorio' : 'armadura';
  const it = { uid: uid(), cat: tipo, rank, rar: r.n, cor: r.cor, rolRar: v, sinc: 0, refino: 0 };
  if (tipo === 'arma') {
    const a = pick(ARMAS); base = a.n; reqAtr = a.a;
    Object.assign(it, { dano: a.dano, atr: a.a, br });
    linhas.push(`Dano ${a.dano} · Alcance ${a.alc} · ${a.a}${a.tags ? ' · ' + a.tags : ''}`);
    if (br) linhas.push(`Bônus de Rank: +${br} no ataque e +${2 * br} no dano.`);
  } else if (tipo === 'armadura') {
    const a = pick(ARMADURAS); base = a.n; reqAtr = a.tipo === 'Leve' ? null : 'FOR';
    Object.assign(it, { armTipo: a.tipo });
    linhas.push(`Armadura ${a.tipo} · Defender +${a.def + br}${a.esq ? ' · Esquivar ' + a.esq : ''} · RD ${br}`);
  } else if (tipo === 'escudo') {
    base = 'Escudo'; reqAtr = 'FOR';
    linhas.push(`Escudo · Defender +${2 + br} · RD ${br} · ocupa uma mão`);
  } else {
    base = pick(ACESSORIOS); linhas.push('Acessório');
  }
  const nAfx = r.afx + (tipo === 'acessorio' ? 1 : 0);
  const afx = shuffle(AFIXOS[catAfx]).slice(0, nAfx);
  const fx = t => t.replace(/Xd(\d+)/g, `${X}d$1`).replace(/(\d+)X/g, (m0, k) => String(Number(k) * X)).replace(/\bX\b/g, String(X));
  it.afixos = afx.map(([p, s, t]) => ({ n: p, s, t: fx(t) }));
  it.selos = shuffle(SELOS).slice(0, r.selos).map(([n, t]) => ({ n, t: fx(t), aberto: false }));
  // nome
  let nome = base;
  if (r.n === 'Relíquia') nome = `${base} ${pick(NOMES_RELIQUIA)}`;
  else if (afx.length === 1) nome = `${base} ${flex(afx[0][0], base)}`;
  else if (afx.length >= 2) nome = `${base} ${flex(afx[0][0], base)} ${afx[1][1]}`;
  it.nome = nome;
  if (r.n === 'Relíquia') linhas.push('Relíquia: usa sempre o Rank do portador. Possui uma Vontade (definida pelo Mestre).');
  if (reqAtr && br) linhas.push(`Requisito: ${reqAtr} ${10 + 4 * br}`);
  it.linhas = linhas;
  it.preco = PRECO_BASE[rank] * r.mult;
  return it;
}
function itemCard(it, controles = '') {
  return `<div class="item-card" style="--cor:${it.cor}">
    <div class="item-nome">${esc(it.nome)}</div>
    <div class="item-sub">${it.rar} · Rank ${it.rank}${it.rolRar ? ' · raridade ' + it.rolRar : ''}${it.preco ? ' · ' + it.preco.toLocaleString('pt-BR') + ' Ouro' : it.cat === 'consumivel' ? ' · não se vende' : ''}${it.refino ? ' · Refino +' + it.refino : ''}</div>
    ${it.linhas.map(l => `<div>${esc(l)}</div>`).join('')}
    ${it.afixos.length ? '<ul>' + it.afixos.map(a => `<li><b>${esc(a.n)}</b>: ${esc(a.t)}</li>`).join('') + '</ul>' : ''}
    ${it.selos.length ? `<details class="item-selos"><summary>${it.selos.length} Selo(s) oculto(s) — Sincronia 3 / 8 / 15</summary><ul>${it.selos.map((s, i) => `<li>${s.aberto ? '🔓' : '🔒'} <b>${esc(s.n)}</b> (Sinc. ${[3, 8, 15][i]}): ${esc(s.t)}</li>`).join('')}</ul></details>` : ''}
    ${controles}</div>`;
}
let itensGerados = [];
function gerarItens() {
  const rk = $('#s-item-rank').value, tp = $('#s-item-tipo').value, bn = Number($('#s-item-bonus').value), q = Math.max(1, Math.min(10, Number($('#s-item-qtd').value) || 1));
  itensGerados = Array.from({ length: q }, () => gerarItem(rk, tp, bn));
  $('#o-item').innerHTML = itensGerados.map((it, i) => itemCard(it, `<div class="acoes"><button class="btn mini" data-item-add="${i}">+ Inventário da ficha</button></div>`)).join('');
}

/* ---------- gerador de portal ---------- */
function gerarPortal() {
  let rk = $('#s-portal-rank').value; let rolRk = null;
  if (!rk) { rolRk = d(100); rk = PORTAL_RANK.find(r => rolRk <= r.max).r; }
  const td = d(20); const tipo = PORTAL_TIPO.find(t => td <= t.max);
  let nota = '';
  if (tipo.n === 'Portal Instável') { const v2 = d(100); const r2 = PORTAL_RANK.find(r => v2 <= r.max).r; if (RANK_ORDEM.indexOf(r2) > RANK_ORDEM.indexOf(rk)) { nota = ` (medido como ${rk}, real: ${r2})`; rk = r2; } else nota = ' (a segunda rolagem não superou)'; }
  const [lo, hi] = PORTAL_NIVEL[rk]; const L = lo + Math.floor(Math.random() * (hi - lo + 1)); const LB = L + 2;
  const amb = pick(PORTAL_AMBIENTE); const cri = pick(PORTAL_CRIATURAS); const chefe = `${pick(CHEFE_TITULO)} ${pick(CHEFE_EPITETO)}`;
  const comp = pick(PORTAL_COMPLICACAO);
  const xp = Math.round(5 * LB * tipo.xp); const ouro = 4 * PRECO_BASE[rk];
  const sb = (c, l) => { const s = statsAmeaca(l, c); return `<tr><th>${c} (nv ${l})</th><td>${s.pv}</td><td>+${s.atk}</td><td>+${s.reac}${c === 'Lacaio' ? ' / ' + s.defFixa : ''}</td><td>${s.dano}</td><td>${s.acoes}</td><td>${s.rd}</td><td>${s.cd}</td></tr>`; };
  const prazo = tipo.n === 'Ruptura Iminente' ? `<p><b>Prazo até a ruptura:</b> ${d(6) * 4} horas.</p>` : '';
  $('#o-portal').innerHTML = janela('PORTAL DETECTADO', `
    <p class="res-g"><span class="rk rk-${rk}">${rk}</span> ${tipo.n}${nota}</p>
    <p>${tipo.d}</p>${prazo}
    <p><b>Ambiente:</b> ${amb}${rolRk ? ` <span class="dica">(d100 Rank = ${rolRk})</span>` : ''}</p>
    <p><b>Criaturas:</b> ${cri[0]}: ${cri[1]}. Nível ${L}.</p>
    <p><b>Chefe:</b> ${chefe} (${cri[0]}), nível ${LB}. Segunda fase aos 50% dos PV.</p>
    <p><b>Complicação:</b> ${comp}</p>
    <div class="tabela-wrap"><table class="tabela"><thead><tr><th>Ameaça</th><th>PV</th><th>Atq</th><th>Reação</th><th>Dano</th><th>Ações</th><th>RD</th><th>CD</th></tr></thead><tbody>
      ${sb('Lacaio', L)}${sb('Soldado', L)}${sb('Elite', L + 1)}${sb('Chefe', LB)}</tbody></table></div>
    <p><b>Recompensas:</b> ${xp} XP por Jogador · ${ouro.toLocaleString('pt-BR')} Ouro por Jogador · 1 item por Elite, 2 itens do Chefe (raridade +${10 + tipo.raridade}).</p>
    <div class="acoes"><button class="btn mini" data-portal-loot="${rk}|${10 + tipo.raridade}">Gerar saque do Chefe</button></div>`);
}

function rolarDado(exp) {
  const r = rolarExp(exp);
  const o = $('#o-dado');
  if (!r) { o.innerHTML = janela('ERRO', '<p>Expressão inválida. Use algo como 2d6+3.</p>'); return; }
  const hist = (rolarDado.h = [(`<div class="dados-hist">${esc(exp)} → <b>${r.total}</b> <span class="dica">${esc(r.txt)}</span></div>`), ...(rolarDado.h || [])].slice(0, 8));
  o.innerHTML = janela('ROLAGEM', hist.join(''));
}

/* =========================================================
   FICHA
   ========================================================= */
function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
function setPath(o, path, v) { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; }
const inp = (path, tipo = 'text', extra = '') => { const v = getPath(P(), path); return `<input type="${tipo}" data-bind="${path}" value="${esc(v ?? '')}" ${extra}>`; };
const selRank = (path) => `<select data-bind="${path}">${RANK_ORDEM.map(r => `<option ${getPath(P(), path) === r ? 'selected' : ''}>${r}</option>`).join('')}</select>`;

function renderFichaLista() {
  $('#f-lista').innerHTML = DB.lista.map(p => `<option value="${p.id}" ${p.id === DB.atual ? 'selected' : ''}>${esc(p.nome || 'Sem nome')} (nv ${p.nivel})</option>`).join('');
}
function renderFicha() {
  renderFichaLista();
  const p = P();
  const despOpts = `<option value="">— nenhum —</option>` + DESPERTARES.map(x => `<option value="${x.id}" ${p.despertar.id === x.id ? 'selected' : ''}>${String(x.d[0]).padStart(2, '0')} · ${x.n} (${x.rar})</option>`).join('');
  $('#ficha').innerHTML = `
  <div class="f-bloco s8"><h3>JANELA DE STATUS <span id="f-rank"></span></h3>
    <div class="campos">
      <label class="campo">Nome${inp('nome')}</label>
      <label class="campo">Jogador(a)${inp('jogador')}</label>
      <label class="campo">Antes do despertar${inp('conceito')}</label>
      <label class="campo">Motivo${inp('motivo')}</label>
      <label class="campo">Nível${inp('nivel', 'number', 'min="1" max="60"')}</label>
      <label class="campo">XP <span id="f-xp"></span>${inp('xp', 'number', 'min="0"')}</label>
      <label class="campo">Potencial<select data-bind="potencial">${['Fraco', 'Normal', 'Forte'].map(o => `<option ${p.potencial === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
      <label class="campo">Rank oficial (Associação)${selRank('rankOficial')}</label>
      <label class="campo">Ouro${inp('ouro', 'number')}</label>
    </div>
  </div>
  <div class="f-bloco s4"><h3>DESPERTAR</h3>
    <select data-bind="despertar.id" data-rerender="1" style="width:100%">${despOpts}</select>
    <div id="f-desp"></div>
  </div>

  <div class="f-bloco s5"><h3>ATRIBUTOS <span class="ph-resumo">Pontos de Status livres: <input type="number" data-bind="statusPend" value="${p.statusPend}" style="width:60px"></span></h3>
    <div class="f-atribs">${ATRIBUTOS.map(a => `<div class="f-atr"><label title="${a.nome}">${a.id}</label>
      <input type="number" data-bind="atr.${a.id}" value="${p.atr[a.id]}"><div class="mod" id="f-mod-${a.id}"></div></div>`).join('')}</div>
  </div>
  <div class="f-bloco s7"><h3>COMBATE</h3>
    <div class="barra-rec"><span class="rot">PV</span><div class="barra"><i id="f-pv-b"></i></div>
      <button class="btn mini" data-rec="pv|-5">−5</button><button class="btn mini" data-rec="pv|-1">−1</button>
      <input type="number" id="f-pv" value=""><span id="f-pv-max"></span>
      <button class="btn mini" data-rec="pv|1">+1</button><button class="btn mini" data-rec="pv|5">+5</button><button class="btn mini" data-rec="pv|max">Máx</button></div>
    <div class="barra-rec"><span class="rot">PM</span><div class="barra pm"><i id="f-pm-b"></i></div>
      <button class="btn mini" data-rec="pm|-5">−5</button><button class="btn mini" data-rec="pm|-1">−1</button>
      <input type="number" id="f-pm" value=""><span id="f-pm-max"></span>
      <button class="btn mini" data-rec="pm|1">+1</button><button class="btn mini" data-rec="pm|5">+5</button><button class="btn mini" data-rec="pm|max">Máx</button></div>
    <div class="f-deriv" id="f-deriv"></div>
    <details style="margin-top:8px"><summary class="dica">Bônus manuais (habilidades passivas, itens, efeitos)</summary>
      <div class="campos" style="margin-top:6px">${[['pv', 'PV máx'], ['pm', 'PM máx'], ['def', 'Defender'], ['esq', 'Esquivar'], ['atk', 'Ataque'], ['dano', 'Dano'], ['rd', 'RD'], ['desl', 'Deslocamento'], ['ini', 'Iniciativa']]
        .map(([k, n]) => `<label class="campo">${n}${inp('bonus.' + k, 'number')}</label>`).join('')}</div>
      <p class="dica">Fortaleza Viva, Corpo de Mana, Circulação de Mana e Pele Resistente nv5 já somam PV/PM automaticamente.</p></details>
  </div>

  <div class="f-bloco"><h3>EQUIPAMENTO DE COMBATE</h3>
    <div class="campos">
      <label class="campo">Armadura<select data-bind="armadura.tipo"><option value="">Nenhuma</option>${ARMADURAS.map(a => `<option value="${a.tipo}" ${p.armadura.tipo === a.tipo ? 'selected' : ''}>${a.tipo} (${a.n})</option>`).join('')}</select></label>
      <label class="campo">Rank da armadura${selRank('armadura.rank')}</label>
      <label class="campo">Refino da armadura${inp('armadura.refino', 'number', 'min="0" max="10"')}</label>
      <label class="campo">Escudo<select data-bind="escudo.tem" data-bool="1"><option value="false" ${!p.escudo.tem ? 'selected' : ''}>Não</option><option value="true" ${p.escudo.tem ? 'selected' : ''}>Sim</option></select></label>
      <label class="campo">Rank do escudo${selRank('escudo.rank')}</label>
      <label class="campo">Refino do escudo${inp('escudo.refino', 'number', 'min="0" max="10"')}</label>
    </div>
    <div class="tabela-wrap" style="margin-top:10px"><table class="f-armas"><thead><tr><th>Arma</th><th>Dano</th><th>Atrib.</th><th>Rank</th><th>Refino</th><th>+Atq</th><th>+Dano</th><th>Ataque</th><th>Dano total</th><th></th></tr></thead>
      <tbody>${p.armas.map((a, i) => `<tr>
        <td>${inp(`armas.${i}.nome`)}</td><td style="width:70px">${inp(`armas.${i}.dano`)}</td>
        <td style="width:70px"><select data-bind="armas.${i}.atr">${ATRIBUTOS.map(x => `<option ${a.atr === x.id ? 'selected' : ''}>${x.id}</option>`).join('')}</select></td>
        <td style="width:60px">${selRank(`armas.${i}.rank`)}</td><td style="width:60px">${inp(`armas.${i}.refino`, 'number', 'min="0" max="10"')}</td>
        <td style="width:56px">${inp(`armas.${i}.atk`, 'number')}</td><td style="width:56px">${inp(`armas.${i}.dmg`, 'number')}</td>
        <td class="calc" id="f-arma-atk-${i}"></td><td class="calc" id="f-arma-dmg-${i}"></td>
        <td><button class="btn mini btn-perigo" data-arma-del="${i}">✕</button></td></tr>`).join('')}</tbody></table></div>
    <button class="btn mini" id="f-arma-add" style="margin-top:6px">+ Arma</button>
  </div>

  <div class="f-bloco s7"><h3>HABILIDADES <span class="ph-resumo" id="f-ph"></span></h3>
    <div class="campos" style="margin-bottom:8px">
      <label class="campo">PH de subidas de nível${inp('phNiveis', 'number', 'min="0"')}</label>
      <label class="campo">PH extras (missões etc.)${inp('phExtra', 'number')}</label>
    </div>
    <div id="f-habs"></div>
    <button class="btn mini" data-ir="arvores" style="margin-top:8px">Abrir Árvores para comprar</button>
  </div>
  <div class="f-bloco s5"><h3>PERÍCIAS <span class="ph-resumo" id="f-per-res"></span></h3>
    <div class="f-pericias">${PERICIAS.map(pc => `<div class="f-per"><span>${pc.n} <small class="dica">${pc.a}</small></span>
      <input type="number" min="0" data-bind="pericias.${pc.n}" value="${p.pericias[pc.n] || 0}"><b id="f-per-${pc.n.replace(/\s/g, '')}"></b></div>`).join('')}</div>
  </div>

  <div class="f-bloco f-itens"><h3>INVENTÁRIO <button class="btn mini" data-ir="sorteios">Gerar itens</button></h3>
    <div id="f-itens"></div>
  </div>
  <div class="f-bloco s6"><h3>CONDIÇÕES ATIVAS</h3><textarea data-bind="condicoes" placeholder="Ex.: Envenenado (1d6, 2 rodadas)">${esc(p.condicoes)}</textarea></div>
  <div class="f-bloco s6"><h3>NOTAS</h3><textarea data-bind="notas" placeholder="Contatos, guilda, missões do Sistema…">${esc(p.notas)}</textarea></div>`;
  renderFichaDinamico();
  renderItens();
}
function renderFichaDinamico() {
  const p = P(); const c = calc(p);
  if (!$('#f-rank')) return;
  $('#f-rank').innerHTML = `<span class="rk rk-${c.rank}">${c.rank}</span>`;
  $('#f-xp').textContent = `(próximo: ${c.xpProx})`;
  ATRIBUTOS.forEach(a => { $('#f-mod-' + a.id).textContent = sinal(c.m[a.id]); });
  // recursos
  const pv = p.pvAtual == null ? c.pvMax : p.pvAtual, pm = p.pmAtual == null ? c.pmMax : p.pmAtual;
  const fpv = $('#f-pv'), fpm = $('#f-pm');
  if (document.activeElement !== fpv) fpv.value = pv;
  if (document.activeElement !== fpm) fpm.value = pm;
  $('#f-pv-max').textContent = '/ ' + c.pvMax; $('#f-pm-max').textContent = '/ ' + c.pmMax;
  $('#f-pv-b').style.width = Math.max(0, Math.min(100, pv / c.pvMax * 100)) + '%';
  $('#f-pv-b').style.background = pv <= 0 ? 'var(--perigo)' : pv <= c.pvMax / 2 ? 'var(--ouro)' : 'var(--ok)';
  $('#f-pm-b').style.width = Math.max(0, Math.min(100, pm / c.pmMax * 100)) + '%';
  const estado = pv <= -c.pvMax ? '<b style="color:var(--perigo)">MORTO</b>' : pv <= 0 ? '<b style="color:var(--perigo)">Incapacitado</b>' : '';
  $('#f-deriv').innerHTML = [
    ['Deslocamento', c.desl + ' m', `Corrida ${c.desl * 4} m`], ['Ações Principais', c.acoes, ''], ['Iniciativa', sinal(c.ini), ''],
    ['Defender', sinal(c.defender), ''], ['Esquivar', sinal(c.esquivar), ''], ['RD', c.rd, ''], ['Defesa Passiva', c.defPassiva, ''],
    ['Ataque desarmado', sinal(c.n + c.m.FOR + Number(p.bonus.atk || 0)), `1d4${sinal(c.m.FOR + Math.floor(c.n / 2) + Number(p.bonus.dano || 0))}`],
    ...ATRIBUTOS.map(a => [`Resist. ${a.id}`, sinal(c.n + c.m[a.id]), `CD ${10 + c.n + c.m[a.id]}`])
  ].map(([n, v, s]) => `<div>${n}<b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`).join('') + (estado ? `<div>Estado<b>${estado}</b></div>` : '');
  // armas
  p.armas.forEach((a, i) => {
    const br = RANKS[a.rank] ? RANKS[a.rank].br : 0; const m = c.m[a.atr] || 0; const ref = Number(a.refino || 0);
    const atk = c.n + m + br + ref + Number(a.atk || 0) + Number(p.bonus.atk || 0);
    const dm = m + Math.floor(c.n / 2) + 2 * br + ref + Number(a.dmg || 0) + Number(p.bonus.dano || 0);
    const ea = $('#f-arma-atk-' + i), ed = $('#f-arma-dmg-' + i);
    if (ea) ea.textContent = 'd20' + sinal(atk); if (ed) ed.textContent = (a.dano || '—') + sinal(dm);
  });
  // perícias
  let gastoPer = 0;
  PERICIAS.forEach(pc => { const g = Number(p.pericias[pc.n] || 0); gastoPer += g; const el = $('#f-per-' + pc.n.replace(/\s/g, '')); if (el) el.textContent = sinal(c.m[pc.a] + g); });
  $('#f-per-res').innerHTML = `Pontos: <b>${gastoPer}</b> / ${c.periciaTotal} · grau máx ${c.periciaMax}`;
  // PH
  const rec = phRecebidos(p), gas = phGasto(p);
  $('#f-ph').innerHTML = `PH: recebidos ${rec} · gastos ${gas} · disponíveis <b>${rec - gas}</b>`;
  // despertar
  const dsp = DESP[p.despertar.id];
  $('#f-desp').innerHTML = dsp ? `<div class="hab-topo" style="margin-top:8px"><strong style="color:${RARIDADE_DESPERTAR[dsp.rar].cor}">${esc(dsp.n)}</strong>
      <span class="hab-tipo"><span style="display:inline-flex;gap:6px;align-items:center"><button class="btn mini" data-desp="-1">−</button><b>nv ${p.despertar.nv}</b><button class="btn mini" data-desp="1">+</button></span></span></div>
    <div class="dica">Afinidades: ${dsp.afin.map(a => ARV[a].nome).join(', ')} · níveis grátis por Rank: ${despGratis(p)}</div>
    <p style="font-size:13px;margin:6px 0"><b>Efeito:</b> ${esc(dsp.ef)}</p><p style="font-size:13px;margin:6px 0"><b>Por nível:</b> ${esc(dsp.esc)}</p>
    ${p.despertar.nv >= 3 ? `<p style="font-size:13px;margin:6px 0"><b>Nv3:</b> ${esc(dsp.m3)}</p>` : ''}
    ${p.despertar.nv >= 5 ? `<p style="font-size:13px;margin:6px 0"><b>Nv5:</b> ${esc(dsp.m5)}</p>` : ''}
    ${p.despertar.nv >= 5 && c.n >= 20 ? `<p class="forma" style="font-size:13px"><b>Forma Evoluída:</b> ${esc(dsp.forma)}</p>` : ''}` : '<p class="dica">Role seu Despertar na aba Sorteios ou escolha acima.</p>';
  // habilidades
  const ordem = p.habs.slice().sort((a, b) => RANK_ORDEM.indexOf(HAB[a.id].r) - RANK_ORDEM.indexOf(HAB[b.id].r) || HAB[a.id].t.localeCompare(HAB[b.id].t));
  $('#f-habs').innerHTML = ordem.length ? ordem.map(x => {
    const h = HAB[x.id]; const a = ARV[h.t];
    const marcos = (x.nv >= 3 ? ` <b>Nv3:</b> ${esc(h.m3)}` : '') + (x.nv >= 5 ? ` <b>Nv5:</b> ${esc(h.m5)}` : '');
    return `<div class="f-hab"><span class="rk rk-${h.r}">${h.r}</span>
      <span class="n" style="color:${a.cor}">${a.icone} ${esc(h.n)} <small class="dica">${h.tipo}${h.acao !== '—' ? ' · ' + h.acao : ''}${h.pm ? ' · ' + h.pm + ' PM' : ''}${x.gratis ? ' · grátis' : ''}</small></span>
      <span class="ctl"><button class="btn mini" data-hab-ctl="${x.id}|descer">−</button><b>nv${x.nv}</b><button class="btn mini" data-hab-ctl="${x.id}|subir" ${x.nv >= 5 ? 'disabled' : ''}>+</button><button class="btn mini btn-sec" data-ver-hab="${x.id}" title="Ver na árvore">↗</button></span>
      <span class="d">${esc(h.ef)} <i>Por nível:</i> ${esc(h.esc)}${marcos}</span></div>`;
  }).join('') : '<p class="dica">Nenhuma habilidade ainda. Use a Avaliação do Sistema (Sorteios) ou compre nas Árvores.</p>';
}
function renderItens() {
  const p = P(); if (!$('#f-itens')) return;
  atualizarSelos(p);
  $('#f-itens').innerHTML = p.itens.length ? `<div class="saida itens" style="margin:0">${p.itens.map((it, i) => itemCard(it, `<div class="f-item-ctl">
      ${it.cat !== 'consumivel' && it.cat !== 'acessorio' ? `Refino <input type="number" min="0" max="10" data-bind="itens.${i}.refino" value="${it.refino || 0}">` : ''}
      ${it.selos && it.selos.length ? `Sincronia <input type="number" min="0" data-bind="itens.${i}.sinc" value="${it.sinc || 0}">` : ''}
      ${it.cat === 'arma' ? `<button class="btn mini" data-equipar="${i}">Equipar como arma</button>` : ''}
      ${it.ensina ? `<button class="btn mini" data-ler="${i}">Ler pergaminho</button>` : ''}
      <button class="btn mini btn-perigo" data-item-del="${i}">Descartar</button></div>`)).join('')}</div>` : '<p class="dica">Inventário vazio.</p>';
}
function atualizarSelos(p) {
  p.itens.forEach(it => { (it.selos || []).forEach((s, i) => { s.aberto = Number(it.sinc || 0) >= [3, 8, 15][i]; }); });
}

/* =========================================================
   EVENTOS
   ========================================================= */
function ligar() {
  // abas
  $$('.aba').forEach(b => b.addEventListener('click', () => abrirAba(b.dataset.aba)));
  document.addEventListener('click', e => {
    const ir = e.target.closest('[data-ir]'); if (ir) abrirAba(ir.dataset.ir);
  });
  // imprimir
  $('#btn-imprimir-livro').addEventListener('click', () => { document.body.classList.remove('imprimir-ficha'); $$('details').forEach(x => x.open = true); window.print(); });
  $('#f-imprimir').addEventListener('click', () => { document.body.classList.add('imprimir-ficha'); window.print(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('imprimir-ficha'));

  // árvores
  $('#arv-lista').addEventListener('click', e => { const b = e.target.closest('[data-arv]'); if (!b) return; arvAtual = b.dataset.arv; habSel = null; renderArvore(); });
  $('#arv-mapa').addEventListener('click', e => { const n = e.target.closest('[data-no]'); if (!n) return; habSel = n.dataset.no; $$('.no').forEach(x => x.classList.toggle('sel', x === n)); renderDetalhe(habSel); desenharLinhas(); });
  $('#arv-detalhe').addEventListener('click', e => { const b = e.target.closest('[data-acao]'); if (!b) return; acaoHab(b.parentElement.dataset.id, b.dataset.acao); renderArvore(); });
  $('#arv-busca').addEventListener('input', () => { aplicarBusca(); desenharLinhas(); });
  window.addEventListener('resize', () => { if ($('#aba-arvores').classList.contains('ativo')) desenharLinhas(); });

  // sorteios
  const rkOpts = RANK_ORDEM.map(r => `<option>${r}</option>`).join('');
  $('#s-aval-rank').innerHTML = rkOpts; $('#s-item-rank').innerHTML = rkOpts; $('#s-portal-rank').innerHTML += rkOpts;
  $('#s-atrib').addEventListener('click', sortearAtributos);
  $('#s-desp').addEventListener('click', sortearDespertar);
  $('#s-aval').addEventListener('click', sortearAvaliacao);
  $('#s-nivel').addEventListener('click', subirNivel);
  $('#s-item').addEventListener('click', gerarItens);
  $('#s-portal').addEventListener('click', gerarPortal);
  $('#s-dado').addEventListener('click', () => rolarDado($('#s-dado-exp').value));
  $('#s-dado-exp').addEventListener('keydown', e => { if (e.key === 'Enter') rolarDado(e.target.value); });
  $$('[data-d]').forEach(b => b.addEventListener('click', () => { $('#s-dado-exp').value = b.dataset.d; rolarDado(b.dataset.d); }));

  $('#aba-sorteios').addEventListener('click', e => {
    const ap = e.target.closest('[data-aplicar]');
    if (ap) {
      const p = P();
      if (ap.dataset.aplicar === 'atrib' && sortearAtributos.ult) {
        const { pot, vals } = sortearAtributos.ult;
        p.atr = { ...vals }; p.potencial = pot.n;
        p.statusPend = Number(p.statusPend || 0) - Number(p.compPot.st || 0) + pot.st; p.compPot = { ph: pot.ph, st: pot.st };
        toast(`Atributos aplicados a ${p.nome}.`);
      }
      if (ap.dataset.aplicar === 'desp' && sortearDespertar.ult) {
        const x = sortearDespertar.ult; const r = RARIDADE_DESPERTAR[x.rar];
        p.despertar = { id: x.id, nv: 1 };
        p.statusPend = Number(p.statusPend || 0) - Number(p.compDesp.st || 0) + r.status; p.compDesp = { ph: r.ph, st: r.status };
        toast(`Despertar aplicado: ${x.n}`);
      }
      salvar();
    }
    const esc_ = e.target.closest('[data-escolher]');
    if (esc_) {
      const p = P(); const id = esc_.dataset.escolher;
      if (possui(p, id)) return toast('A ficha já possui esta habilidade.');
      p.habs.push({ id, nv: 1, gratis: true }); salvar();
      $('#o-aval').innerHTML = janela('RECOMPENSA RECEBIDA', `<p>Você obteve a habilidade <b>${esc(HAB[id].n)}</b>.</p>`);
    }
    const add = e.target.closest('[data-item-add]');
    if (add) { const it = itensGerados[Number(add.dataset.itemAdd)]; if (it) { P().itens.push(JSON.parse(JSON.stringify(it))); salvar(); toast(`[SISTEMA] Item obtido: ${it.nome}`); add.disabled = true; } }
    const loot = e.target.closest('[data-portal-loot]');
    if (loot) {
      const [rk, bn] = loot.dataset.portalLoot.split('|');
      $('#s-item-rank').value = rk; $('#s-item-tipo').value = 'aleatorio'; $('#s-item-qtd').value = 2;
      const sel = $('#s-item-bonus'); if (![...sel.options].some(o => o.value === bn)) sel.insertAdjacentHTML('beforeend', `<option value="${bn}">Chefe deste Portal (+${bn})</option>`);
      sel.value = bn; gerarItens(); $('#o-item').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // ficha: barra
  $('#f-lista').addEventListener('change', e => { DB.atual = e.target.value; salvar(); renderFicha(); });
  $('#f-novo').addEventListener('click', () => { const p = novoPers(); DB.lista.push(p); DB.atual = p.id; salvar(); renderFicha(); });
  $('#f-dup').addEventListener('click', () => { const c = JSON.parse(JSON.stringify(P())); c.id = uid(); c.nome += ' (cópia)'; DB.lista.push(c); DB.atual = c.id; salvar(); renderFicha(); });
  $('#f-apagar').addEventListener('click', () => {
    if (!confirm(`Apagar a ficha "${P().nome}"? Isso não pode ser desfeito.`)) return;
    DB.lista = DB.lista.filter(p => p.id !== DB.atual); if (!DB.lista.length) DB.lista.push(novoPers()); DB.atual = DB.lista[0].id; salvar(); renderFicha();
  });
  $('#f-exportar').addEventListener('click', () => {
    const p = P(); const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${(p.nome || 'cacador').replace(/[^\w\-]+/g, '_')}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('#f-importar').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    const r = new FileReader(); r.onload = () => {
      try { const p = normalizar(JSON.parse(r.result)); p.id = uid(); DB.lista.push(p); DB.atual = p.id; salvar(); renderFicha(); toast('Ficha importada.'); }
      catch (err) { toast('Arquivo inválido.'); }
    }; r.readAsText(f); e.target.value = '';
  });

  // ficha: campos
  const ficha = $('#ficha');
  ficha.addEventListener('input', e => {
    const el = e.target;
    if (el.id === 'f-pv' || el.id === 'f-pm') { P()[el.id === 'f-pv' ? 'pvAtual' : 'pmAtual'] = Number(el.value); salvar(); renderFichaDinamico(); return; }
    const path = el.dataset.bind; if (!path) return;
    let v = el.value;
    if (el.dataset.bool) v = v === 'true';
    else if (el.type === 'number') v = el.value === '' ? 0 : Number(el.value);
    setPath(P(), path, v);
    salvar();
    if (path === 'nome' || path === 'nivel') renderFichaLista();
    if (el.dataset.rerender) { if (path === 'despertar.id') P().despertar.nv = 1; renderFicha(); return; }
    if (path.startsWith('itens.')) return; // atualiza ao sair do campo (change)
    renderFichaDinamico();
  });
  ficha.addEventListener('change', e => { const pth = e.target.dataset.bind || ''; if (pth.startsWith('itens.')) renderItens(); });
  ficha.addEventListener('click', e => {
    const p = P(); const c = calc(p); const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.rec) {
      const [k, v] = t.dataset.rec.split('|'); const key = k === 'pv' ? 'pvAtual' : 'pmAtual'; const max = k === 'pv' ? c.pvMax : c.pmMax;
      const cur = p[key] == null ? max : p[key];
      p[key] = v === 'max' ? max : Math.min(max, cur + Number(v)); salvar(); renderFichaDinamico();
    }
    if (t.dataset.desp) {
      const nv = p.despertar.nv + Number(t.dataset.desp); if (nv < 1 || nv > 5) return;
      if (Number(t.dataset.desp) > 0) { const free = despGratis(p); const custo = nv - 1 <= free ? 0 : nv; if (phDisp(p) < custo) return toast('PH insuficientes.'); }
      p.despertar.nv = nv; salvar(); renderFichaDinamico();
    }
    if (t.dataset.habCtl) { const [id, ac] = t.dataset.habCtl.split('|'); acaoHab(id, ac); renderFichaDinamico(); }
    if (t.dataset.verHab) { const h = HAB[t.dataset.verHab]; arvAtual = h.t; habSel = h.id; abrirAba('arvores'); }
    if (t.id === 'f-arma-add') { p.armas.push({ nome: 'Nova arma', dano: '1d6', atr: 'FOR', rank: 'E', refino: 0, atk: 0, dmg: 0 }); salvar(); renderFicha(); }
    if (t.dataset.armaDel) { p.armas.splice(Number(t.dataset.armaDel), 1); salvar(); renderFicha(); }
    if (t.dataset.itemDel) { if (!confirm('Descartar este item?')) return; p.itens.splice(Number(t.dataset.itemDel), 1); salvar(); renderFicha(); }
    if (t.dataset.equipar) {
      const it = p.itens[Number(t.dataset.equipar)];
      p.armas.push({ nome: it.nome, dano: it.dano, atr: it.atr, rank: it.rank, refino: it.refino || 0, atk: 0, dmg: 0 }); salvar(); renderFicha(); toast('Arma equipada (afixos: some manualmente em +Atq/+Dano).');
    }
    if (t.dataset.ler) {
      const i = Number(t.dataset.ler); const it = p.itens[i];
      if (possui(p, it.ensina)) return toast('Você já possui esta habilidade.');
      if (c.n < RANKS[HAB[it.ensina].r].nivel) return toast(`Requer nível ${RANKS[HAB[it.ensina].r].nivel}.`);
      p.habs.push({ id: it.ensina, nv: 1, gratis: true }); p.itens.splice(i, 1); salvar(); renderFicha(); toast(`[SISTEMA] Habilidade aprendida: ${HAB[it.ensina].n}`);
    }
  });
}

/* ---------------- início ---------------- */
carregar();
montarLivro();
ligar();
let abaIni = 'livro'; try { abaIni = sessionStorage.getItem('despertar.aba') || 'livro'; } catch (e) { }
if (abaIni !== 'livro') abrirAba(abaIni);
})();
