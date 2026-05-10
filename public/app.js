const API = window.location.origin;

let veiculoAtual = null;
let listaPecas = [];
let timeoutAutoSave = null;
let restaurandoRascunho = false;
let bloqueandoAutoSave = false;
let modalIdAtual = null;
let clientesCache = [];
let colunaAtual = '';
let ordemCrescente = true;
let botoesServicoRapido = JSON.parse(
  localStorage.getItem('config_atalhos')
) || ['Óleo', 'Revisão', 'Freios', 'Suspensão'];
const DDD_PADRAO = '54'; // Caxias do Sul
let meuGrafico = null;
let periodoAtual = 'semanal';
let recebimentoAtual = null;

/* =========================
   ORÇAMENTO / RASCUNHO
========================= */

function chaveRascunho(placa) {
  return `orcamento_${placa}`;
}

function getOrcamentoKey() {
  if (!veiculoAtual?.placa) return null;

  return chaveRascunho(veiculoAtual.placa);
}

function salvarRascunho() {
  if (bloqueandoAutoSave) return;
  if (restaurandoRascunho) return;
  if (!veiculoAtual?.placa) return;

  const dados = {
    servico: document.getElementById('servico').value,

    km: document.getElementById('km').value,

    valor_maodeobra: document.getElementById('valor_maodeobra').value,

    valor_pago: document.getElementById('valor_pago').value,

    forma_pagamento: document.getElementById('forma_pagamento').value,

    listaPecas,
  };

  localStorage.setItem(
    chaveRascunho(veiculoAtual.placa),
    JSON.stringify(dados)
  );

  console.log('SALVO:', chaveRascunho(veiculoAtual.placa), dados);
}

function restaurarRascunho(placa) {
  const raw = localStorage.getItem(chaveRascunho(placa));

  if (!raw) {
    console.log('SEM RASCUNHO:', placa);
    return;
  }

  try {
    restaurandoRascunho = true;

    const dados = JSON.parse(raw);

    document.getElementById('servico').value = dados.servico || '';

    document.getElementById('km').value = dados.km || '';

    document.getElementById('valor_maodeobra').value =
      dados.valor_maodeobra || '';

    document.getElementById('valor_pago').value = dados.valor_pago || '';

    document.getElementById('forma_pagamento').value =
      dados.forma_pagamento || 'pendente';

    listaPecas = dados.listaPecas || [];

    renderizarPecas();

    calcularTotal();

    console.log('RASCUNHO RESTAURADO:', dados);

    mostrarStatus('Rascunho restaurado', 'sucesso');

    setTimeout(() => {
      restaurandoRascunho = false;
    }, 100);
  } catch (err) {
    restaurandoRascunho = false;
    console.error(err);
  }
}

function limparRascunho() {
  if (!veiculoAtual?.placa) return;

  localStorage.removeItem(chaveRascunho(veiculoAtual.placa));

  document.getElementById('servico').value = '';

  document.getElementById('km').value = veiculoAtual.km_atual || '';

  document.getElementById('valor_maodeobra').value = '';

  document.getElementById('valor_pago').value = '';

  document.getElementById('forma_pagamento').value = 'pendente';

  listaPecas = [];

  renderizarPecas();

  calcularTotal();

  mostrarStatus('Orçamento limpo', 'sucesso');
}

function autoSalvarRascunho() {
  clearTimeout(timeoutAutoSave);

  timeoutAutoSave = setTimeout(() => {
    salvarRascunho();
  }, 500);
}

/* =========================
   STATUS
========================= */
function mostrarStatus(texto, tipo = 'sucesso') {
  const status = document.getElementById('status');
  if (!status) return;
  status.innerText = texto;
  status.className = '';
  status.classList.add(`status-${tipo}`);
  status.style.display = 'block';
  clearTimeout(status._timeout);
  status._timeout = setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}

/* =========================
   ABAS
========================= */
function trocarAba(nome, event = null) {
  document
    .querySelectorAll('.aba')
    .forEach((aba) => aba.classList.remove('active'));
  document
    .querySelectorAll('.tab')
    .forEach((tab) => tab.classList.remove('active'));

  const abaAlvo = document.getElementById(`aba-${nome}`);
  if (abaAlvo) abaAlvo.classList.add('active');

  if (nome === 'servico') {
    renderizarBotoesAtalho();
  }

  if (nome === 'dashboard') {
    atualizarDashboard();
  }

  if (event) {
    event.target.classList.add('active');
  } else {
    const btn = document.querySelector(`[data-aba="${nome}"]`);
    if (btn) btn.classList.add('active');
  }
}

function trocarAbaDireta(nome) {
  trocarAba(nome);
}

/* =========================
   LIMPAR (CORRIGIDO PARA NÃO DAR ERRO NULL)
========================= */
function limparCampos() {
  // Lista de IDs que realmente existem no seu HTML
  const campos = [
    'nome_cliente',
    'telefone_cliente',
    'modelo',
    'ano',
    'perfil',
    'servico',
    'km',
    'buscar_placa',
    'placa',
  ];

  campos.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = ''; // Só limpa se o elemento existir
  });

  const topbar = document.getElementById('topbar');
  if (topbar) topbar.classList.remove('active');

  listaPecas = [];
  renderizarPecas();

  const historico = document.getElementById('historico');
  if (historico) historico.innerHTML = '';
}

/* =========================
   HEADER
========================= */
function atualizarHeader(data) {
  const topbar = document.getElementById('topbar');
  if (!topbar) return;

  if (!data) {
    topbar.classList.remove('active');
    document.getElementById('headerPlaca').innerText = 'Nenhum veículo';
    document.getElementById('headerModelo').innerText = '---';
    document.getElementById('headerCliente').innerText = '---';
    document.getElementById('headerTelefone').innerText = '---';
    return;
  }

  topbar.classList.add('active');
  document.getElementById('headerPlaca').innerText = data.placa || '---';
  document.getElementById('headerModelo').innerText =
    `${data.modelo || '---'} • ${data.ano || '---'}`;
  document.getElementById('headerCliente').innerText =
    data.nome_cliente || '---';
  document.getElementById('headerTelefone').innerText =
    data.telefone_cliente || '---';
}

/* =========================
   BUSCAR
========================= */
async function buscarVeiculo() {
  const inputBusca = document.getElementById('buscar_placa');
  const placa = inputBusca.value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  if (!placa) {
    mostrarStatus('Digite uma placa', 'alerta');
    return;
  }

  try {
    const response = await fetch(`${API}/veiculo/${placa}`);

    if (response.status === 404) {
      limparCampos();
      atualizarHeader(null);
      document.getElementById('placa').value = placa;
      mostrarStatus('Veículo não encontrado', 'alerta');
      trocarAbaDireta('cadastro');
      return;
    }

    const data = await response.json();
    veiculoAtual = data;
    abrirVeiculo(data);
    mostrarStatus('Veículo carregado', 'sucesso');
    trocarAbaDireta('servico');
  } catch (err) {
    console.error(err);
    mostrarStatus('Servidor offline', 'erro');
  }
}

/* =========================
   ABRIR VEÍCULO (AJUSTADO PARA KM_ATUAL)
========================= */
function abrirVeiculo(data) {
  bloqueandoAutoSave = true;
  veiculoAtual = data;

  atualizarHeader(data);

  // Dados Cadastrais
  document.getElementById('placa').value = data.placa || '';
  document.getElementById('nome_cliente').value = data.nome_cliente || '';

  const dddCampo = document.getElementById('ddd_cliente');
  const telCampo = document.getElementById('tel_cliente');

  if (data.telefone_cliente) {
    let telLimpo = data.telefone_cliente.toString().replace(/^55/, '');
    dddCampo.value = telLimpo.substring(0, 2);
    telCampo.value = telLimpo.substring(2);
  } else {
    dddCampo.value = '54';
    telCampo.value = '';
  }

  document.getElementById('modelo').value = data.modelo || '';
  document.getElementById('ano').value = data.ano || '';
  document.getElementById('perfil').value = data.perfil_tecnico || '';

  // Limpa campos de serviço
  document.getElementById('servico').value = '';
  document.getElementById('valor_maodeobra').value = '';
  listaPecas = [];

  // PRIORIDADE: Primeiro coloca o KM do banco de dados
  const kmInput = document.getElementById('km');
  kmInput.value = data.km_atual || '';

  // RESTAURA RASCUNHO (Mas só muda o KM se o rascunho tiver um valor real)
  restaurarRascunho(data.placa);

  // Garantia: Se após restaurar o rascunho o KM ficou vazio, volta o KM do banco
  if (!kmInput.value || kmInput.value == '0') {
    kmInput.value = data.km_atual || '';
  }

  if (listaPecas.length === 0) {
    renderizarPecas();
    calcularTotal();
  }

  carregarHistorico(data.placa);
  bloqueandoAutoSave = false;
}

/* =========================
   CADASTRO (CORRIGIDO)
========================= */
async function salvarCadastro() {
  bloqueandoAutoSave = true;

  const placa = document.getElementById('placa').value.toUpperCase().trim();
  const nome = document.getElementById('nome_cliente').value.trim();
  const modelo = document.getElementById('modelo').value.trim();
  const ano = document.getElementById('ano').value;
  const perfil = document.getElementById('perfil').value;
  const dddRaw = document
    .getElementById('ddd_cliente')
    .value.replace(/\D/g, '');
  const telRaw = document
    .getElementById('tel_cliente')
    .value.replace(/\D/g, '');

  if (!placa) {
    mostrarStatus('A placa é obrigatória!', 'alerta');
    bloqueandoAutoSave = false;
    return;
  }

  const dadosVeiculo = {
    placa,
    nome_cliente: nome,
    telefone_cliente: telRaw ? `55${dddRaw}${telRaw}` : '',
    modelo,
    ano: parseInt(ano) || null,
    perfil_tecnico: perfil,
  };

  try {
    // 1. SALVA NO SERVIDOR
    const response = await fetch(`${API}/veiculo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dadosVeiculo),
    });

    if (response.ok) {
      // 2. ATUALIZA O ESTADO GLOBAL (Isso corrige o Header)
      veiculoAtual = dadosVeiculo;
      atualizarHeader(veiculoAtual);

      // 3. SINCRONIZA A LISTA DE CLIENTES
      await carregarClientes();

      mostrarStatus('Cadastro salvo no banco de dados!', 'sucesso');

      // 4. MUDA PARA A ABA DE SERVIÇO AUTOMATICAMENTE
      // Isso evita que o usuário fique travado na tela de cadastro
      setTimeout(() => {
        trocarAbaDireta('servico');
        // Foca no campo de serviço para agilizar o trabalho
        document.getElementById('servico').focus();
      }, 500);
    } else {
      mostrarStatus('Erro ao salvar no servidor', 'erro');
    }
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro de conexão', 'erro');
  } finally {
    bloqueandoAutoSave = false;
  }
}

// Função auxiliar para mostrar o status (opcional)
function mostrarStatus(msg) {
  const statusDiv = document.getElementById('status');
  if (statusDiv) {
    statusDiv.innerText = msg;
    statusDiv.classList.add('show');
    setTimeout(() => statusDiv.classList.remove('show'), 3000);
  }
}

/* =========================
   PEÇAS
========================= */
function adicionarPeca() {
  const nome = document.getElementById('peca_nome').value;
  const valor = parseFloat(document.getElementById('peca_valor').value) || 0;

  if (!nome) {
    mostrarStatus('Digite o nome da peça', 'alerta');
    return;
  }

  listaPecas.push({ nome, valor });
  renderizarPecas();
  salvarRascunho();
  document.getElementById('peca_nome').value = '';
  document.getElementById('peca_valor').value = '';
}

function removerPeca(index) {
  listaPecas.splice(index, 1);
  renderizarPecas();
  salvarRascunho();
}

function renderizarPecas() {
  const lista = document.getElementById('lista_pecas');
  if (!lista) return;

  lista.innerHTML = '';
  let total = 0;

  listaPecas.forEach((p, i) => {
    total += p.valor;
    lista.innerHTML += `
            <div class="peca-item">
                <div>
                    <strong>${p.nome}</strong><br>
                    R$ ${p.valor.toFixed(2)}
                </div>
                <button onclick="removerPeca(${i})">X</button>
            </div>
        `;
  });

  const inputValorPecas = document.getElementById('valor_pecas');
  if (inputValorPecas) inputValorPecas.value = total.toFixed(2);

  const displayPecas = document.getElementById('valor_pecas_display');
  if (displayPecas) displayPecas.innerText = 'R$ ' + total.toFixed(2);

  calcularTotal();
}

function validarKilometragem() {
  const kmInformado = parseInt(document.getElementById('km').value);
  const kmAnterior = parseInt(veiculoAtual?.km_atual) || 0;

  if (kmInformado < kmAnterior) {
    alert(
      `⚠️ Erro na KM! A última registrada foi ${kmAnterior} km. O valor atual não pode ser menor.`
    );
    return false;
  }
  return true;
}

/* =========================
   TOTAL
========================= */
function calcularTotal() {
  const vPecas = document.getElementById('valor_pecas');
  const vMao = document.getElementById('valor_maodeobra');

  const pecas = vPecas ? parseFloat(vPecas.value) || 0 : 0;
  const mao = vMao ? parseFloat(vMao.value) || 0 : 0;

  const total = (pecas + mao).toFixed(2);

  const elTotal = document.getElementById('valor_total');
  if (elTotal) elTotal.value = total;

  const displayTotal = document.getElementById('valor_total_display');
  if (displayTotal) displayTotal.innerText = 'R$ ' + total;

  if (!bloqueandoAutoSave && !restaurandoRascunho) {
    salvarRascunho();
  }
}

// Adiciona os ouvintes de evento apenas se os elementos existirem
const inputPecas = document.getElementById('valor_pecas');
const inputMao = document.getElementById('valor_maodeobra');
if (inputPecas) inputPecas.addEventListener('input', calcularTotal);
if (inputMao) inputMao.addEventListener('input', calcularTotal);

/* =========================
   SERVIÇO (CONECTADO COM O SERVER REFATORADO)
========================= */
async function fecharServico() {
  if (!veiculoAtual) {
    mostrarStatus('Nenhum veículo selecionado', 'alerta');
    return;
  }
  const valorTotal =
    parseFloat(document.getElementById('valor_total').value) || 0;

  if (valorTotal <= 0) {
    mostrarStatus('O valor total do serviço não pode ser R$ 0,00', 'alerta');
    document.getElementById('valor_maodeobra').focus();
    return;
  }

  const nPeca = document.getElementById('peca_nome').value.trim();
  const vPeca = document.getElementById('peca_valor').value.trim();

  if (nPeca !== '' || vPeca !== '') {
    const modalAlerta = document.getElementById('modal-alerta-peca');
    const msgAlerta = document.getElementById('msg-alerta-peca');
    msgAlerta.innerHTML = `Você digitou <strong>"${nPeca || 'uma peça'}"</strong> mas não clicou em adicionar.<br><br>Deseja voltar ou descartar essa peça e finalizar?`;
    modalAlerta.classList.add('active');
    modalAlerta.style.setProperty('display', 'flex', 'important');
    return;
  }

  const kmInput = document.getElementById('km');
  const kmInformado = parseInt(kmInput.value) || 0;
  const kmAnterior = parseInt(veiculoAtual.km_atual) || 0;

  // ==========================================
  // TRAVA DE SEGURANÇA REFORÇADA
  // ==========================================
  if (kmInformado <= 0) {
    mostrarStatus('Por favor, informe a KM atual!', 'alerta');
    kmInput.focus();
    return;
  }

  if (kmInformado < kmAnterior) {
    mostrarStatus(`KM inválida! A última foi ${kmAnterior}.`, 'alerta');
    return;
  }
  // ==========================================

  const dadosServico = {
    placa: veiculoAtual.placa,
    km: kmInformado,
    servico: document.getElementById('servico').value,
    pecas_trocadas: JSON.stringify(listaPecas),
    valor_pecas: parseFloat(document.getElementById('valor_pecas').value) || 0,
    valor_maodeobra:
      parseFloat(document.getElementById('valor_maodeobra').value) || 0,
    valor_total: parseFloat(document.getElementById('valor_total').value) || 0,
    valor_pago: parseFloat(document.getElementById('valor_pago').value) || 0,
    forma_pagamento:
      document.getElementById('forma_pagamento').value || 'pendente',
  };

  try {
    const response = await fetch(`${API}/servico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dadosServico),
    });

    const result = await response.json();

    if (!response.ok) {
      mostrarStatus(result.erro || 'Erro ao salvar serviço', 'erro');
      return;
    }

    // Sincroniza a nova KM
    veiculoAtual.km_atual = kmInformado;
    mostrarStatus('Serviço fechado e KM atualizado!', 'sucesso');

    carregarClientes();

    const key = getOrcamentoKey();
    if (key) localStorage.removeItem(key);
    localStorage.removeItem(chaveRascunho(veiculoAtual.placa));

    // Limpeza de campos
    document.getElementById('servico').value = '';
    document.getElementById('km').value = veiculoAtual.km_atual; // Mantém a nova KM no campo
    document.getElementById('valor_maodeobra').value = '';
    document.getElementById('valor_pago').value = '';
    document.getElementById('forma_pagamento').value = 'pendente';
    document.getElementById('peca_nome').value = '';
    document.getElementById('peca_valor').value = '';

    listaPecas = [];
    renderizarPecas();
    calcularTotal();
    carregarHistorico(veiculoAtual.placa);
    carregarPendentes();
    trocarAbaDireta('historico');
  } catch (err) {
    console.error(err);
    mostrarStatus('Servidor offline', 'erro');
  }
}

/* =========================
   HISTÓRICO 
========================= */
async function carregarHistorico(placa) {
  try {
    const response = await fetch(`${API}/servicos/${placa}`);
    const servicos = await response.json();
    const historico = document.getElementById('historico');
    if (!historico) return;

    historico.innerHTML = '';

    if (servicos.length === 0) {
      historico.innerHTML = `<div class="servico-item">Nenhum serviço encontrado</div>`;
      return;
    }

    servicos.forEach((item, index) => {
      let pecasHTML = 'Nenhuma peça';
      try {
        const pecas = JSON.parse(item.pecas_trocadas || '[]');
        if (pecas.length > 0) {
          pecasHTML = pecas
            .map(
              (p) => `
                        <div class="historico-peca">
                            <span>${p.nome}</span>
                            <strong>R$ ${Number(p.valor).toFixed(2)}</strong>
                        </div>
                    `
            )
            .join('');
        }
      } catch (e) {
        console.error('Erro ao ler peças:', e);
      }

      const total = Number(item.valor_total || 0);
      const pago = Number(item.valor_pago || 0);
      const restante = total - pago;
      const status = item.status_pagamento || 'pendente';

      // LÓGICA DO BOTÃO: Só aparece se o status NÃO for 'pago'
      let btnAcaoHTML = '';
      if (status !== 'pago') {
        btnAcaoHTML = `
          <div class="historico-acoes">
            <button
              class="btn-receber"
              onclick="receberPagamento(${item.id}, ${restante}, '${item.placa}')"
            >
              💰 Receber Pagamento
            </button>
          </div>
        `;
      }

      const formaFormatada = item.forma_pagamento
        ? item.forma_pagamento.charAt(0).toUpperCase() +
          item.forma_pagamento.slice(1)
        : '-';

      historico.innerHTML += `
    <div class="servico-item" data-id="${item.id}">
        <div class="historico-header" onclick="toggleHistorico(${index})">
            <div>
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 0.95rem; opacity: 0.85; font-weight: bold;">${item.data}</span>
                    <span class="badge-km" style="font-size: 0.85rem; padding: 4px 10px;">📍 ${item.km || 0} KM</span>
                </div>
                <p><strong style="font-size: 1.05rem;">${item.servico || 'Sem descrição'}</strong></p>
            </div>
            <div class="historico-header-right" style="text-align: right">
                <strong style="color: var(--accent-primary); display: block; font-size: 1.2rem;">R$ ${total.toFixed(2)}</strong>
                <span id="seta-${index}" style="font-size: 0.75rem; opacity: 0.6;">ver detalhes ▼</span>
            </div>
        </div>

        <div class="historico-body" id="historico-${index}" style="padding: 0 15px 15px 15px;">
            <div class="historico-servico-box" style="margin-top: 10px;">
                <small style="opacity: 0.6; display: block; margin-bottom: 8px; font-weight: bold;">PEÇAS E COMPONENTES</small>
                ${pecasHTML}
            </div>

            <div class="historico-financeiro">
                <div>
                    <small>Situação</small>
                    <div style="margin-top:4px;"><span class="status-${status}">${status.toUpperCase()}</span></div>
                </div>
                <div>
                    <small>Pago</small>
                    <strong style="display:block; margin-top:4px;">R$ ${pago.toFixed(2)}</strong>
                </div>
                <div>
                    <small>Restante</small>
                    <strong style="display:block; margin-top:4px; color: ${restante > 0 ? '#ef4444' : 'inherit'}">R$ ${restante.toFixed(2)}</strong>
                </div>
                <div>
                    <small>Forma</small>
                    <span style="display:block; margin-top:4px; font-size: 0.95rem; font-weight: 500;">${formaFormatada}</span>
                </div>
            </div>
        </div>

        ${btnAcaoHTML}
    </div>
`;
    });
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao carregar histórico', 'erro');
  }
}

async function carregarPendentes() {
  try {
    const response = await fetch(`${API}/pendentes`);
    const pendentes = await response.json();
    const container = document.getElementById('lista-pendentes');

    if (!container) return;
    container.innerHTML = '';

    if (pendentes.length === 0) {
      container.innerHTML = `
        <div class="servico-item" style="padding: 20px; text-align: center; color: var(--text-secondary);">
          🎉 Nenhuma pendência encontrada!
        </div>`;
      return;
    }

    pendentes.forEach((item) => {
      const total = Number(item.valor_total || 0);
      const pago = Number(item.valor_pago || 0);
      const restante = total - pago;

      // Usando a estrutura exata que o seu CSS (.servico-item, .historico-header) espera
      container.innerHTML += `
        <div class="servico-item pendencia-click highlight-pendente" 
             onclick="abrirPendencia(${item.id}, '${item.placa}')"
             style="margin-bottom: 12px;">
          
          <div class="historico-header">
            <div>
              <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 4px;">
                <span class="badge-km" style="background: var(--accent-primary); color: black;">${item.placa}</span>
                <span style="font-size: 0.8rem; opacity: 0.7;">${item.data || ''}</span>
              </div>
              <strong style="font-size: 1.05rem;">${item.servico || 'Serviço sem descrição'}</strong>
            </div>
            
            <div class="historico-header-right">
              <small style="display: block; font-size: 0.7rem; color: var(--text-secondary);">FALTA PAGAR</small>
              <strong style="color: #ef4444; font-size: 1.2rem;">R$ ${restante.toFixed(2)}</strong>
              <span style="font-size: 0.7rem; opacity: 0.6;">clique para abrir ▼</span>
            </div>
          </div>

          <div class="historico-body" style="padding: 0 15px 15px 15px; display: block; opacity: 0.8;">
             <div style="display: flex; justify-content: space-between; font-size: 0.85rem; border-top: 1px solid var(--border-color); pt-10px; margin-top: 10px; padding-top: 10px;">
                <span>Total: R$ ${total.toFixed(2)}</span>
                <span>Já pago: R$ ${pago.toFixed(2)}</span>
             </div>
          </div>
        </div>
      `;
    });
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao carregar pendências', 'erro');
  }
}

function receberPagamento(id, restante, identificador) {
  // CRÍTICO: Atualiza o ID para a OS que você acabou de clicar
  recebimentoAtual = { id: id, restante: restante };

  // Se você estiver usando modalIdAtual em vez de recebimentoAtual no confirmar:
  modalIdAtual = id;

  const info = document.getElementById('modal-info-cliente');
  const inputValor = document.getElementById('modal-valor');
  const modal = document.getElementById('modal-recebimento');

  if (info) {
    info.innerText = `Receber de: ${identificador} • Restante: R$ ${restante.toFixed(2)}`;
  }

  if (inputValor) {
    inputValor.value = restante.toFixed(2);
  }

  // Abre o modal
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  setTimeout(() => {
    if (inputValor) inputValor.select();
  }, 100);
}

function fecharModalRecebimento() {
  const modal = document.getElementById('modal-recebimento');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
  recebimentoAtual = null;
  modalIdAtual = null;
}

// Funções de controle do Modal
function fecharModalAlerta() {
  const modal = document.getElementById('modal-alerta-peca');
  modal.classList.remove('active');
  modal.style.setProperty('display', 'none', 'important');
}

function limparCamposPecaEFechar() {
  document.getElementById('peca_nome').value = '';
  document.getElementById('peca_valor').value = '';
  fecharModalAlerta();

  // Pequeno delay para o modal sumir antes de processar o fechamento
  setTimeout(() => {
    fecharServico();
  }, 50);
}

async function confirmarRecebimento() {
  const valorInput = document.getElementById('modal-valor');
  const valor = valorInput ? parseFloat(valorInput.value) : 0;
  const id = recebimentoAtual ? recebimentoAtual.id : null;

  if (!id || isNaN(valor) || valor <= 0) {
    mostrarStatus('Dados inválidos para recebimento', 'alerta');
    return;
  }

  try {
    const response = await fetch(`${API}/receber/${id}`, {
      method: 'PUT', // Conforme o seu server.js
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ valor: valor }),
    });

    if (response.ok) {
      // 1. Mostra o sucesso
      mostrarStatus(
        'Pagamento de R$ ' + valor.toFixed(2) + ' registrado!',
        'sucesso'
      );

      // 2. Fecha o modal imediatamente
      fecharModalRecebimento();

      // 3. ATUALIZAÇÃO CRÍTICA: Recarrega as listas do servidor
      // Isso vai fazer a pendência de 1200 virar 600 na tela
      carregarPendentes();

      if (veiculoAtual) {
        carregarHistorico(veiculoAtual.placa);
      }
    } else {
      const erroServidor = await response.json();
      mostrarStatus(erroServidor.erro || 'Erro ao processar pagamento', 'erro');
    }
  } catch (err) {
    console.error('Erro ao confirmar:', err);
    mostrarStatus('Erro de conexão com o servidor', 'erro');
  }
}

/* =========================
   WHATSAPP
========================= */
function formatarTelefoneBrasil(tel) {
  // Remove tudo que não for número
  let num = tel.replace(/\D/g, '');

  // Se o usuário digitou apenas o número (8 ou 9 dígitos), põe o 55 + DDD_PADRAO
  if (num.length === 8 || num.length === 9) {
    num = '55' + DDD_PADRAO + num;
  }
  // Se o usuário digitou com DDD (10 ou 11 dígitos), põe apenas o 55
  else if (num.length === 10 || num.length === 11) {
    num = '55' + num;
  }

  return num;
}

// Ajuste na sua função de salvarCadastro (trecho do body)
// ... dentro da salvarCadastro() ...
const body = {
  // ... outros campos ...
  telefone_cliente: formatarTelefoneBrasil(
    document.getElementById('telefone_cliente').value
  ),
  // ...
};

function gerarWhatsApp() {
  if (!veiculoAtual) return;

  // Como o telefone já foi salvo com 55 + DDD no banco, usamos direto
  const telefone = (veiculoAtual.telefone_cliente || '').replace(/\D/g, '');

  const servico = document.getElementById('servico').value;
  const total = document.getElementById('valor_total').value;

  const texto = `Olá ${veiculoAtual.nome_cliente}! Seu veículo está pronto.\nPlaca: ${veiculoAtual.placa}\nTotal: R$ ${total}`;

  window.open(
    `https://api.whatsapp.com/send?phone=${telefone}&text=${encodeURIComponent(texto)}`,
    '_blank'
  );
}

function encaminharOrcamento() {
  if (!veiculoAtual) {
    mostrarStatus('Nenhum veículo carregado', 'alerta');
    return;
  }

  const telefone = (veiculoAtual.telefone_cliente || '').replace(/\D/g, '');

  if (!telefone) {
    mostrarStatus('Telefone não encontrado', 'alerta');
    return;
  }

  const servico = document.getElementById('servico').value || 'Não informado';

  const maoDeObra =
    parseFloat(document.getElementById('valor_maodeobra').value) || 0;

  const total = parseFloat(document.getElementById('valor_total').value) || 0;

  const km = document.getElementById('km').value || '-';

  let textoPecas = 'Nenhuma peça adicionada';

  if (listaPecas.length > 0) {
    textoPecas = listaPecas
      .map((p) => `• ${p.nome} — R$ ${p.valor.toFixed(2)}`)
      .join('\n');
  }

  const texto = `
📋 ORÇAMENTO PARA APROVAÇÃO

👤 Cliente: ${veiculoAtual.nome_cliente || '-'}
🚗 Veículo: ${veiculoAtual.modelo || '-'}
🔖 Placa: ${veiculoAtual.placa}
🛣️ KM: ${km}

🔧 Serviço:
${servico}

🧩 Peças:
${textoPecas}

👨‍🔧 Mão de obra:
R$ ${maoDeObra.toFixed(2)}

💰 TOTAL:
R$ ${total.toFixed(2)}

Aguardando aprovação para execução do serviço.
`;

  window.open(
    `https://wa.me/55${telefone}?text=${encodeURIComponent(texto)}`,
    '_blank'
  );

  mostrarStatus('Orçamento encaminhado', 'sucesso');
}

function abrirWhatsRapido() {
  if (!veiculoAtual) {
    mostrarStatus('Nenhum veículo carregado', 'alerta');
    return;
  }
  const telefone = (veiculoAtual.telefone_cliente || '').replace(/\D/g, '');
  if (!telefone) {
    mostrarStatus('Telefone não encontrado', 'alerta');
    return;
  }
  window.open(`https://wa.me/55${telefone}`, '_blank');
}

/* =========================
   EVENTOS E UTILITÁRIOS
========================= */
document.getElementById('buscar_placa').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') buscarVeiculo();
});

document.getElementById('peca_valor').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') adicionarPeca();
});

/* =========================
   ATALHOS DE SERVIÇO (REWORK)
========================= */

function renderizarBotoesAtalho() {
  const container = document.getElementById('botoes-atalho-container');
  if (!container) return;

  container.innerHTML = `
    ${botoesServicoRapido
      .map(
        (servico, index) => `
      <div class="atalho-wrapper">
        <button type="button" class="btn-atalho" onclick="servicoRapido('${servico}')">
          ${servico}
        </button>
        <span class="btn-remover-atalho" onclick="removerAtalho(${index})">×</span>
      </div>
    `
      )
      .join('')}
    
    <button type="button" class="btn-adicionar-atalho" onclick="promptNovoAtalho()">
      + Novo
    </button>
  `;
}

function adicionarAtalho() {
  const input = document.getElementById('novo-atalho-nome');
  const novo = input.value.trim();
  if (!novo) return;

  botoesServicoRapido.push(novo);
  localStorage.setItem('config_atalhos', JSON.stringify(botoesServicoRapido));
  input.value = '';
  renderizarBotoesAtalho();
  mostrarStatus('Atalho adicionado!', 'sucesso');
}

// Abre o prompt simples direto na aba de serviço
function promptNovoAtalho() {
  const novo = prompt('Digite o nome do novo serviço (ex: Limpeza de Bico):');
  if (novo && novo.trim() !== '') {
    botoesServicoRapido.push(novo.trim());
    salvarEAtualizarAtalhos();
  }
}

// Remove e já atualiza a tela
function removerAtalho(index) {
  // Opcional: Adicione um confirm para evitar exclusão acidental
  botoesServicoRapido.splice(index, 1);
  salvarEAtualizarAtalhos();
}

// Centraliza o salvamento para evitar repetição de código
function salvarEAtualizarAtalhos() {
  localStorage.setItem('config_atalhos', JSON.stringify(botoesServicoRapido));
  renderizarBotoesAtalho();
  mostrarStatus('Atalhos atualizados!', 'sucesso');
}

// Lógica de acumulação (Sem apagar o que já existe)
function servicoRapido(texto) {
  const campoServico = document.getElementById('servico');
  if (!campoServico) return;

  const valorAtual = campoServico.value.trim();

  if (valorAtual === '') {
    campoServico.value = texto;
  } else {
    // Adiciona vírgula apenas se o último caractere não for uma vírgula
    const separador = valorAtual.endsWith(',') ? ' ' : ', ';
    campoServico.value = valorAtual + separador + texto;
  }

  autoSalvarRascunho(); // Chama seu auto-save existente
  campoServico.focus();
}

function pagarTudo() {
  const total = document.getElementById('valor_total').value;
  document.getElementById('valor_pago').value = total;
  autoSalvarRascunho();
}

function toggleHistorico(index) {
  const body = document.getElementById(`historico-${index}`);
  const seta = document.getElementById(`seta-${index}`);

  if (body.style.display === 'block') {
    body.style.display = 'none';
    seta.innerHTML = 'ver detalhes ▼'; // Garante que o texto volte
  } else {
    body.style.display = 'block';
    seta.innerHTML = 'fechar ▲';
  }
}

function trocarSecao(nome, event = null) {
  document
    .querySelectorAll('.secao-global')
    .forEach((s) => s.classList.remove('active'));
  document
    .querySelectorAll('.sidebar-btn')
    .forEach((b) => b.classList.remove('active'));

  const secao = document.getElementById(`secao-${nome}`);
  if (secao) secao.classList.add('active');

  if (event) {
    event.currentTarget.classList.add('active');
  }

  if (nome === 'pendentes') {
    carregarPendentes();
  }

  if (nome === 'clientes') {
    carregarClientes();
  }
  if (nome === 'financeiro') {
    atualizarFinanceiro();
  }
}

async function mudarPeriodo(periodo, botao) {
  periodoAtual = periodo;

  // Atualiza a classe ativa nos botões
  document
    .querySelectorAll('.btn-filtro')
    .forEach((btn) => btn.classList.remove('active'));
  botao.classList.add('active');

  // Chama a atualização dos dados
  await atualizarFinanceiro();
}

async function atualizarFinanceiro() {
  try {
    // Enviamos o período como parâmetro na URL
    const response = await fetch(`${API}/estatisticas?periodo=${periodoAtual}`);

    if (!response.ok) return;

    const data = await response.json();

    // 1. Atualiza os Cards
    const faturado = data.resumo.faturamento || 0;
    const recebido = data.resumo.recebido || 0;
    const pendente = Math.max(0, faturado - recebido);

    document.getElementById('dash-faturamento').innerText =
      faturado.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
    document.getElementById('dash-recebido').innerText =
      recebido.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
    document.getElementById('dash-pendente').innerText =
      pendente.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });

    // 2. Renderiza o Gráfico com os dados novos
    if (data.grafico) {
      renderizarGrafico(data.grafico);
    }
  } catch (err) {
    console.error('Erro ao carregar dashboard:', err);
  }
}

/* =========================
   DASHBOARD
========================= */

async function atualizarDashboard() {
  try {
    const response = await fetch(`${API}/estatisticas`);
    const data = await response.json();

    // 1. Preenche os Cards
    const faturado = data.resumo.faturamento || 0;
    const recebido = data.resumo.recebido || 0;
    const pendente = faturado - recebido;

    document.getElementById('dash-faturamento').innerText =
      faturado.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
    document.getElementById('dash-recebido').innerText =
      recebido.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });
    document.getElementById('dash-pendente').innerText =
      pendente.toLocaleString('pt-br', { style: 'currency', currency: 'BRL' });

    // 2. Renderiza o Gráfico
    renderizarGrafico(data.grafico);
  } catch (err) {
    console.error('Erro dashboard:', err);
  }
}

function renderizarGrafico(dados) {
  const canvas = document.getElementById('graficoGanhos');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Verifica se a variável global existe e destrói o gráfico anterior
  if (window.meuGrafico instanceof Chart) {
    window.meuGrafico.destroy();
  }

  window.meuGrafico = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dados.map((d) =>
        d.dia ? d.dia.split('-').reverse().slice(0, 2).join('/') : ''
      ),
      datasets: [
        {
          label: 'Ganhos por Dia',
          data: dados.map((d) => d.total_dia),
          backgroundColor: '#00ff80',
          borderRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { beginAtZero: true, grid: { color: '#333' } },
        x: { grid: { display: false } },
      },
      plugins: { legend: { display: false } },
    },
  });
}

/* =========================
   CLIENTES
========================= */
async function carregarClientes() {
  try {
    const response = await fetch(`${API}/veiculos`);

    if (!response.ok) {
      throw new Error(`Erro ao buscar veículos: ${response.statusText}`);
    }

    clientesCache = await response.json();

    renderizarTabelaClientes(clientesCache);

    console.log('Lista de clientes atualizada com sucesso.');
  } catch (err) {
    console.error('Falha na sincronização da lista de clientes:', err);
    if (typeof mostrarStatus === 'function') {
      mostrarStatus('Não foi possível carregar a lista de clientes', 'erro');
    }
  }
}

function renderizarTabelaClientes(lista) {
  const container = document.getElementById('lista-clientes');
  if (!container) return;

  container.innerHTML = '';
  lista.forEach((cliente) => {
    const dataUltimo = cliente.data_ultimo_servico || 'Sem registro';
    container.innerHTML += `
        <tr class="cliente-row" onclick="abrirCliente('${cliente.placa}')">
            <td><strong>${cliente.nome_cliente || '-'}</strong></td>
            <td>${cliente.placa || '-'}</td>
            <td>${cliente.modelo || '-'}</td>
            <td>${cliente.ano || '-'}</td>
            <td>${dataUltimo}</td> 
            <td>${cliente.perfil_tecnico || '-'}</td>
            <td>${cliente.telefone_cliente || '-'}</td>
        </tr>
    `;
  });
}

function ordenarClientes(coluna) {
  if (!clientesCache.length) return;

  // Inverte a ordem se clicar na mesma coluna, senão começa crescente
  if (colunaAtual === coluna) {
    ordemCrescente = !ordemCrescente;
  } else {
    colunaAtual = coluna;
    ordemCrescente = true;
  }

  // 1. Limpa as setas de todos os cabeçalhos primeiro
  document.querySelectorAll('th[onclick]').forEach((th) => {
    // Remove qualquer seta existente no texto
    th.innerText = th.innerText
      .replace(' ↑', '')
      .replace(' ↓', '')
      .replace(' ↕', '');
    // Adiciona o símbolo neutro de volta
    th.innerText += ' ↕';
  });

  // 2. Adiciona a seta correta na coluna ativa
  const thAtivo = document.querySelector(`th[onclick*="'${coluna}'"]`);
  if (thAtivo) {
    thAtivo.innerText = thAtivo.innerText.replace(' ↕', ''); // Tira o neutro
    thAtivo.innerText += ordemCrescente ? ' ↑' : ' ↓'; // Põe a direção
  }

  // 3. Lógica de ordenação (mesma de antes)
  const listaOrdenada = [...clientesCache].sort((a, b) => {
    let valA = a[coluna] ? a[coluna].toString().toLowerCase() : '';
    let valB = b[coluna] ? b[coluna].toString().toLowerCase() : '';
    let retorno = 0;

    if (coluna === 'ano') {
      retorno = (parseInt(a.ano) || 0) - (parseInt(b.ano) || 0);
    } else if (coluna === 'data_ultimo_servico') {
      const dateA = a.data_ultimo_servico
        ? new Date(a.data_ultimo_servico.split('/').reverse().join('-'))
        : new Date(0);
      const dateB = b.data_ultimo_servico
        ? new Date(b.data_ultimo_servico.split('/').reverse().join('-'))
        : new Date(0);
      retorno = dateA - dateB;
    } else {
      retorno = valA.localeCompare(valB);
    }

    return ordemCrescente ? retorno : retorno * -1;
  });

  renderizarTabelaClientes(listaOrdenada);
}

async function abrirCliente(placa) {
  try {
    const response = await fetch(`${API}/veiculo/${placa}`);
    const data = await response.json();
    veiculoAtual = data;
    abrirVeiculo(data);
    trocarSecao('oficina');

    // Ativa o primeiro botão da sidebar
    const firstBtn = document.querySelector('.sidebar-btn');
    if (firstBtn) {
      document
        .querySelectorAll('.sidebar-btn')
        .forEach((b) => b.classList.remove('active'));
      firstBtn.classList.add('active');
    }

    trocarAbaDireta('servico');
    mostrarStatus('Cliente carregado', 'sucesso');
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao abrir cliente', 'erro');
  }
}

async function abrirPendencia(id, placa) {
  try {
    // SALVA O ID E DADOS INICIAIS AQUI
    recebimentoAtual = { id: id };

    const response = await fetch(`${API}/veiculo/${placa}`);
    if (!response.ok) {
      mostrarStatus('Erro ao carregar veículo', 'erro');
      return;
    }

    const data = await response.json();
    veiculoAtual = data;
    abrirVeiculo(data);
    trocarSecao('oficina');

    // Ativa visualmente o botão da oficina na sidebar
    document
      .querySelectorAll('.sidebar-btn')
      .forEach((b) => b.classList.remove('active'));
    const btnOficina = document.querySelector('button[onclick*="oficina"]');
    if (btnOficina) btnOficina.classList.add('active');

    trocarAbaDireta('historico');

    // Scroll para a OS específica
    setTimeout(() => {
      const elementoOS = document.querySelector(
        `.servico-item[data-id="${id}"]`
      );
      if (elementoOS) {
        elementoOS.scrollIntoView({ behavior: 'smooth', block: 'center' });
        elementoOS.style.border = '2px solid var(--accent-primary)';
      }
    }, 500);
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao processar pendência', 'erro');
  }
}

// Filtro de busca de clientes
const buscaClienteInput = document.getElementById('busca_cliente');
if (buscaClienteInput) {
  buscaClienteInput.addEventListener('input', function () {
    const termo = this.value.toLowerCase();
    const linhas = document.querySelectorAll('#lista-clientes tr');

    linhas.forEach((linha) => {
      // O filtro agora lê tudo que está na linha (nome, placa, data...)
      const textoDaLinha = linha.innerText.toLowerCase();
      linha.style.display = textoDaLinha.includes(termo) ? 'table-row' : 'none';
    });
  });
}

/* =========================
   INICIALIZAÇÃO E EVENTOS PROTEGIDOS
========================= */

window.addEventListener('DOMContentLoaded', () => {
  // 1. Restaurar Tema (Dark/Light Mode)
  const savedTheme = localStorage.getItem('theme');
  const checkbox = document.querySelector('#checkbox');
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    if (checkbox) checkbox.checked = true;
  }

  // 2. Carregar Dados Iniciais
  carregarClientes();
  carregarPendentes();
  renderizarBotoesAtalho();

  // 3. Evento de ENTER na busca de placa (OFICINA)
  const campoBuscaPlaca = document.getElementById('buscar_placa');
  if (campoBuscaPlaca) {
    campoBuscaPlaca.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        // Proteção: só executa se o campo tiver valor
        if (campoBuscaPlaca.value.trim() !== '') {
          buscarVeiculo();
        }
      }
    });
  }

  // 4. Evento de Filtro de Busca (LISTA DE CLIENTES)
  const buscaClienteInput = document.getElementById('busca_cliente');
  if (buscaClienteInput) {
    buscaClienteInput.addEventListener('input', function () {
      const termo = this.value.toLowerCase();
      const linhas = document.querySelectorAll('#lista-clientes tr');

      linhas.forEach((linha) => {
        const textoDaLinha = linha.innerText.toLowerCase();
        // Usa display '' para evitar quebrar o layout da tabela (tr)
        linha.style.display = textoDaLinha.includes(termo) ? '' : 'none';
      });
    });
  }

  // 5. Atalho de ENTER para adicionar peça rápida
  const campoPecaValor = document.getElementById('peca_valor');
  if (campoPecaValor) {
    campoPecaValor.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        adicionarPeca();
      }
    });
  }
});

/* =========================
   AUTOSAVE E BLOQUEIOS
========================= */

// Aplica ouvintes apenas em elementos que existem no HTML atual
[
  'servico',
  'km',
  'valor_pecas',
  'valor_maodeobra',
  'valor_pago',
  'forma_pagamento',
].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('input', autoSalvarRascunho);
  }
});

// Impede que o scroll do rato altere valores numéricos (comum no campo KM)
document.addEventListener('wheel', function (event) {
  if (document.activeElement.type === 'number') {
    document.activeElement.blur();
  }
});

/* =========================
   FUNÇÕES DE TEMA
========================= */
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}
