/* ==========================================================
   HORA DO REMÉDIO – script.js
   Sem backend: os dados ficam no localStorage do navegador.
   Este arquivo é carregado em TODAS as páginas.
   ========================================================== */


/* ==========================================================
   1. DADOS E VARIÁVEIS GLOBAIS
   ========================================================== */

// Cores disponíveis para a caixinha (n = nome, c = código da cor)
const CORES = [
    { n: 'Vermelho', c: '#dc3545' },
    { n: 'Azul',     c: '#0d6efd' },
    { n: 'Verde',    c: '#198754' },
    { n: 'Amarelo',  c: '#e0a800' },
    { n: 'Roxo',     c: '#6f42c1' },
    { n: 'Laranja',  c: '#fd7e14' }
];

// Dias da semana (índice 0 = domingo, igual ao Date.getDay())
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// Dados salvos no navegador
let remedios = JSON.parse(localStorage.getItem('remedios') || '[]');  // lista de remédios
let tomados  = JSON.parse(localStorage.getItem('tomados')  || '{}');  // chave: "idDoRemedio-data"

// Estado do alarme
let soneca = {};     // horário adiado de cada remédio (por id)
let timer  = null;   // setInterval que repete o aviso
let ctx    = null;   // contexto de áudio (Web Audio API)
let atual  = null;   // remédio que está tocando agora


/* ==========================================================
   2. FUNÇÕES UTILITÁRIAS
   ========================================================== */

// Atalho para document.getElementById
const $ = id => document.getElementById(id);

// Data de hoje no formato AAAA-MM-DD
const hojeStr = () => new Date().toLocaleDateString('sv');

// Grava remédios e tomados no localStorage
const salvar = () => {
    localStorage.setItem('remedios', JSON.stringify(remedios));
    localStorage.setItem('tomados', JSON.stringify(tomados));
};

// Converte o código da cor no nome (ex.: "#dc3545" -> "Vermelho")
const corNome = c => (CORES.find(o => o.c === c) || {}).n || '';


/* ==========================================================
   3. TELA DE ALARME (injetada em todas as páginas)
   ========================================================== */

document.body.insertAdjacentHTML('beforeend', `
    <div id="alarme" role="alertdialog">
        <div class="grande pisca">⏰</div>
        <div class="grande">💊</div>
        <div class="display-4 fw-bold" id="alNome"></div>
        <div class="display-5 mb-4" id="alHora"></div>
        <button class="btn btn-light btn-lg fs-2 px-5 py-3 mb-3" id="btnTomei">✅ JÁ TOMEI</button>
        <button class="btn btn-outline-light btn-lg" id="btnSoneca">😴 Lembrar em 10 minutos</button>
    </div>
`);


/* ==========================================================
   4. FORMULÁRIO DE CADASTRO (só existe em cadastro.html)
   ========================================================== */

if ($('form')) {

    // Botões dos dias da semana (todos marcados por padrão)
    $('dias').innerHTML = DIAS.map((d, i) => `
        <input type="checkbox" class="btn-check" id="d${i}" value="${i}" checked>
        <label class="btn btn-outline-success btn-lg" for="d${i}">${d}</label>
    `).join('');

    // Bolinhas de cor (a primeira vem selecionada)
    $('cores').innerHTML = CORES.map((o, i) => `
        <input type="radio" class="cor-radio d-none" name="cor" id="c${i}" value="${o.c}" ${i == 0 ? 'checked' : ''}>
        <label class="cor-op" for="c${i}" style="background:${o.c}" title="${o.n}"></label>
    `).join('');

    // Ao salvar o formulário
    $('form').addEventListener('submit', e => {
        e.preventDefault();

        // Dias marcados
        const dias = [...document.querySelectorAll('#dias input:checked')].map(x => +x.value);
        if (!dias.length) {
            alert('Escolha pelo menos um dia.');
            return;
        }

        // Cria o remédio
        remedios.push({
            id:   Date.now(),
            nome: $('nome').value.trim(),
            hora: $('hora').value,
            dias: dias,
            cor:  document.querySelector('input[name=cor]:checked').value
        });

        // Ordena por horário, salva, limpa o formulário e atualiza a lista
        remedios.sort((a, b) => a.hora.localeCompare(b.hora));
        salvar();
        e.target.reset();
        desenhar();
    });
}


/* ==========================================================
   5. LISTA DE REMÉDIOS
   ========================================================== */

// Monta os cartões na div #lista
//  - cadastro.html: mostra TODOS (com dias da semana e botão apagar)
//  - index.html:    mostra só os de HOJE (com ✅ nos já tomados)
function desenhar() {
    if (!$('lista')) return;

    const todos = !!$('form');
    const dow   = new Date().getDay();
    const h     = hojeStr();
    const itens = todos ? remedios : remedios.filter(r => r.dias.includes(dow));

    if (!itens.length) {
        $('lista').innerHTML = '<p class="text-muted">Nenhum remédio para mostrar. Vá em Cadastro.</p>';
        return;
    }

    $('lista').innerHTML = itens.map(r => {
        const ok  = !todos && tomados[r.id + '-' + h];
        const sub = todos ? r.dias.map(d => DIAS[d]).join(' ') : corNome(r.cor);
        const botaoApagar = todos
            ? `<button class="btn btn-outline-danger" onclick="apagar(${r.id})" aria-label="Apagar ${r.nome}">🗑️</button>`
            : '';

        return `
            <div class="col-md-6 col-lg-4">
                <div class="card card-remedio h-100 shadow-sm" style="border-color:${r.cor}">
                    <div class="card-body d-flex align-items-center gap-3">
                        <span class="bolinha" style="background:${r.cor}">${ok ? '✅' : '💊'}</span>
                        <div class="flex-grow-1">
                            <div class="fw-bold fs-2">${r.hora}</div>
                            <div>${r.nome}</div>
                            <div class="small text-muted">${sub}</div>
                        </div>
                        ${botaoApagar}
                    </div>
                </div>
            </div>`;
    }).join('');
}

// Apaga um remédio (chamada pelo onclick do botão 🗑️)
function apagar(id) {
    if (confirm('Apagar este remédio?')) {
        remedios = remedios.filter(r => r.id !== id);
        salvar();
        desenhar();
    }
}


/* ==========================================================
   6. RELÓGIO E VERIFICAÇÃO DO ALARME
   ========================================================== */

// Roda a cada 5 segundos
function tique() {
    const d  = new Date();
    const hm = d.toTimeString().slice(0, 5);   // "HH:MM"

    // Atualiza o relógio e a data (só existem em index.html)
    if ($('relogio')) {
        $('relogio').textContent = hm;
        $('data').textContent = d.toLocaleDateString('pt-BR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long'
        });
    }

    // Se já tem alarme tocando, não faz mais nada
    if (atual) return;

    // Procura um remédio de hoje, ainda não tomado, cujo horário
    // (ou horário da soneca) seja igual ao horário atual
    const h = hojeStr();
    const r = remedios.find(r =>
        r.dias.includes(d.getDay()) &&
        !tomados[r.id + '-' + h] &&
        hm === (soneca[r.id] || r.hora)
    );

    if (r) tocar(r);
}


/* ==========================================================
   7. ALARME: TELA, SOM E VOZ
   ========================================================== */

// Exibe a tela do alarme e começa a repetir o aviso
function tocar(r) {
    atual = r;
    $('alarme').style.background = r.cor;
    $('alNome').textContent = r.nome;
    $('alHora').textContent = 'Hora de tomar: ' + r.hora;
    $('alarme').classList.add('ativo');

    bip();
    timer = setInterval(bip, 4000);   // repete a cada 4 segundos
}

// Toca 3 bipes (Web Audio API) e fala o nome e a cor do remédio
function bip() {
    try {
        ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();

        [0, 0.3, 0.6].forEach(t => {
            const osc  = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.frequency.value = 880;
            osc.connect(gain);
            gain.connect(ctx.destination);

            gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);

            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.25);
        });
    } catch (e) {
        // Navegador sem suporte a áudio: ignora
    }

    // Voz (Speech Synthesis)
    if (atual && 'speechSynthesis' in window) {
        const fala = new SpeechSynthesisUtterance(
            'Hora do remédio. ' + atual.nome + '. Cor ' + corNome(atual.cor)
        );
        fala.lang = 'pt-BR';
        speechSynthesis.cancel();
        speechSynthesis.speak(fala);
    }
}

// Para o som e a voz e esconde a tela do alarme
function fechar() {
    clearInterval(timer);
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    $('alarme').classList.remove('ativo');
    atual = null;
}


/* ==========================================================
   8. BOTÕES DO ALARME
   ========================================================== */

// ✅ JÁ TOMEI: marca como tomado hoje
$('btnTomei').onclick = () => {
    tomados[atual.id + '-' + hojeStr()] = true;
    delete soneca[atual.id];
    salvar();
    fechar();
    desenhar();
};

// 😴 Lembrar em 10 minutos
$('btnSoneca').onclick = () => {
    soneca[atual.id] = new Date(Date.now() + 600000).toTimeString().slice(0, 5);
    fechar();
};

// 🔔 Ativar alarme: toca um bipe de teste (o navegador só libera áudio após um clique)
$('ativarSom').onclick = () => {
    bip();
    $('ativarSom').textContent = '🔔 Alarme ativado';
};


/* ==========================================================
   9. INICIALIZAÇÃO
   ========================================================== */

desenhar();                // mostra a lista
tique();                   // verifica o alarme já ao abrir a página
setInterval(tique, 5000);  // e continua verificando a cada 5 segundos
