const API = window.location.origin;

let veiculoAtual = null;
let listaPecas = [];
let timeoutAutoSave = null;
let restaurandoRascunho = false;
let bloqueandoAutoSave = false;

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

  // =========================
  // DADOS DO VEÍCULO
  // =========================

  document.getElementById('placa').value = data.placa || '';

  document.getElementById('nome_cliente').value = data.nome_cliente || '';

  document.getElementById('telefone_cliente').value =
    data.telefone_cliente || '';

  document.getElementById('modelo').value = data.modelo || '';

  document.getElementById('ano').value = data.ano || '';

  document.getElementById('perfil').value = data.perfil_tecnico || '';

  // =========================
  // LIMPA TELA SEM SAVE
  // =========================

  document.getElementById('servico').value = '';

  document.getElementById('km').value = data.km_atual || '';

  document.getElementById('valor_maodeobra').value = '';

  listaPecas = [];

  // NÃO chama renderizar ainda

  // =========================
  // RESTAURA RASCUNHO
  // =========================

  restaurarRascunho(data.placa);

  // =========================
  // SE NÃO EXISTIR RASCUNHO
  // =========================

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
  const placa = document.getElementById('placa').value;
  const ano = document.getElementById('ano').value;

  if (!placa) {
    mostrarStatus('Placa é obrigatória', 'alerta');
    return;
  }

  if (ano && ano.length !== 4) {
    mostrarStatus('Ano deve ter 4 dígitos', 'alerta');
    return;
  }

  const body = {
    placa: placa,
    nome_cliente: document.getElementById('nome_cliente').value,
    telefone_cliente: document.getElementById('telefone_cliente').value,
    modelo: document.getElementById('modelo').value,
    ano: parseInt(ano) || 0, // Garante que o ano vá como número
    perfil_tecnico: document.getElementById('perfil').value,
  };

  try {
    const response = await fetch(`${API}/veiculo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) throw new Error('Erro ao salvar');

    veiculoAtual = body;
    atualizarHeader(body);
    mostrarStatus('Cadastro salvo', 'sucesso');
    carregarClientes();
    trocarAbaDireta('servico');
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao salvar cadastro', 'erro');
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

  const kmValue = document.getElementById('km').value;
  const servicoDesc = document.getElementById('servico').value;

  const dadosServico = {
    placa: veiculoAtual.placa,
    km: parseInt(kmValue) || 0,
    servico: servicoDesc,
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

    mostrarStatus('Serviço fechado e KM atualizado!', 'sucesso');

    const key = getOrcamentoKey();

    if (key) {
      localStorage.removeItem(key);
    }

    localStorage.removeItem(chaveRascunho(veiculoAtual.placa));

    // Limpar campos de serviço
    // Limpar campos de serviço

    document.getElementById('servico').value = '';

    document.getElementById('km').value = veiculoAtual.km_atual || '';

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
        <div class="servico-item">
          Nenhuma pendência encontrada
        </div>
      `;
      return;
    }

    pendentes.forEach((item) => {
      const restante =
        Number(item.valor_total || 0) - Number(item.valor_pago || 0);

      container.innerHTML += `
        <div 
  class="servico-item pendencia-click"
  onclick="abrirPendencia(${item.id}, '${item.placa}')"
>

          <div class="historico-header">

            <div>
              <strong>${item.placa}</strong>
              <p>${item.servico || '-'}</p>
            </div>

            <div class="historico-header-right">
              <strong>
                R$ ${restante.toFixed(2)}
              </strong>
            </div>

          </div>

          <div class="historico-body active">

            <p>
              <strong>Total:</strong>
              R$ ${Number(item.valor_total).toFixed(2)}
            </p>

            <p>
              <strong>Pago:</strong>
              R$ ${Number(item.valor_pago).toFixed(2)}
            </p>

            <p>
              <strong>Status:</strong>
              ${item.status_pagamento}
            </p>

          </div>

        </div>
      `;
    });
  } catch (err) {
    console.error(err);

    mostrarStatus('Erro ao carregar pendências', 'erro');
  }
}
let recebimentoAtual = null;

function receberPagamento(id, restante, identificador) {
  recebimentoAtual = { id, restante };

  const info = document.getElementById('modal-info-cliente');
  const inputValor = document.getElementById('modal-valor');
  const modal = document.getElementById('modal-recebimento');

  if (info)
    info.innerText = `Receber de: ${identificador} • Restante: R$ ${restante.toFixed(2)}`;
  if (inputValor) inputValor.value = restante.toFixed(2);

  modal.style.display = 'flex'; // Garante que o display mude
  modal.classList.add('active');

  setTimeout(() => inputValor.select(), 100); // Seleciona o valor para facilitar a digitação
}

function fecharModalRecebimento() {
  document.getElementById('modal-recebimento').classList.remove('active');

  recebimentoAtual = null;
}

async function confirmarRecebimento() {
  if (!recebimentoAtual) return;

  const valorInput = document.getElementById('modal-valor');
  const valor = parseFloat(valorInput.value);

  if (isNaN(valor) || valor <= 0) {
    mostrarStatus('Por favor, digite um valor válido.', 'alerta');
    return;
  }

  try {
    // Enviando PUT para a rota /receber/:id
    const response = await fetch(`${API}/receber/${recebimentoAtual.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        valor_pago: valor, // Alinhado com o que o server.js espera
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      mostrarStatus(result.erro || 'Erro ao processar pagamento', 'erro');
      return;
    }

    // Sucesso
    fecharModalRecebimento();
    mostrarStatus('Pagamento registrado com sucesso!', 'sucesso');

    // Atualiza a lista de pendentes e o histórico
    carregarPendentes();
    if (veiculoAtual && veiculoAtual.placa) {
      carregarHistorico(veiculoAtual.placa);
    }
  } catch (err) {
    console.error('Erro na requisição:', err);
    mostrarStatus('Erro de conexão com o servidor.', 'erro');
  }
}

/* =========================
   WHATSAPP
========================= */
function gerarWhatsApp() {
  if (!veiculoAtual) {
    mostrarStatus('Nenhum veículo carregado', 'alerta');
    return;
  }

  const telefone = (veiculoAtual.telefone_cliente || '').replace(/\D/g, '');
  if (!telefone) {
    mostrarStatus('Telefone do cliente não encontrado', 'alerta');
    return;
  }

  const servico = document.getElementById('servico').value || 'Não informado';
  const total = parseFloat(document.getElementById('valor_total').value) || 0;

  let textoPecas =
    listaPecas.length > 0
      ? listaPecas
          .map((p) => `• ${p.nome} — R$ ${p.valor.toFixed(2)}`)
          .join('\n')
      : 'Nenhuma peça adicionada';

  const texto = `Olá ${veiculoAtual.nome_cliente || ''} 👋\n\nSeu veículo foi finalizado.\n\n🚗 ${veiculoAtual.placa} - ${veiculoAtual.modelo || ''}\n\n🔧 Serviço:\n${servico}\n\n🧩 Peças:\n${textoPecas}\n\n💰 Total: R$ ${total.toFixed(2)}\n\nObrigado pela preferência.`;

  window.open(
    `https://wa.me/55${telefone}?text=${encodeURIComponent(texto)}`,
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

function servicoRapido(texto) {
  document.getElementById('servico').value = texto;
  salvarRascunho();
  document.getElementById('servico').focus();
}

function toggleHistorico(index) {
  const body = document.getElementById(`historico-${index}`);
  const seta = document.getElementById(`seta-${index}`);
  if (body) {
    body.classList.toggle('active');
    seta.innerText = body.classList.contains('active') ? '▲' : '▼';
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
    event.target.classList.add('active');
  }
}

/* =========================
   CLIENTES
========================= */
async function carregarClientes() {
  try {
    const response = await fetch(`${API}/veiculos`);
    const clientes = await response.json();
    const lista = document.getElementById('lista-clientes');
    if (!lista) return;

    lista.innerHTML = '';
    clientes.forEach((cliente) => {
      lista.innerHTML += `
                <tr class="cliente-row" onclick="abrirCliente('${cliente.placa}')">
                    <td>${cliente.nome_cliente || '-'}</td>
                    <td>${cliente.placa || '-'}</td>
                    <td>${cliente.modelo || '-'}</td>
                    <td>${cliente.ano || '-'}</td>
                    <td>${cliente.perfil_tecnico || '-'}</td>
                    <td>${cliente.telefone_cliente || '-'}</td>
                </tr>
            `;
    });
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao carregar clientes', 'erro');
  }
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

async function abrirPendencia(idServico, placa) {
  try {
    // abre cliente
    await abrirCliente(placa);

    // vai pra aba histórico
    trocarAbaDireta('historico');

    // espera renderizar
    setTimeout(() => {
      const cards = document.querySelectorAll('.servico-item');

      cards.forEach((card) => {
        if (card.dataset.id == idServico) {
          const body = card.querySelector('.historico-body');

          if (body) {
            body.classList.add('active');
          }

          card.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });

          card.classList.add('highlight-pendente');

          setTimeout(() => {
            card.classList.remove('highlight-pendente');
          }, 3000);
        }
      });
    }, 300);
  } catch (err) {
    console.error(err);

    mostrarStatus('Erro ao abrir pendência', 'erro');
  }
}

// Filtro de busca de clientes
const buscaClienteInput = document.getElementById('busca_cliente');
if (buscaClienteInput) {
  buscaClienteInput.addEventListener('input', function () {
    const termo = this.value.toLowerCase();
    const linhas = document.querySelectorAll('#lista-clientes tr');
    linhas.forEach((linha) => {
      linha.style.display = linha.innerText.toLowerCase().includes(termo)
        ? 'table-row'
        : 'none';
    });
  });
}

// Seleciona o botão (quando você me passar o HTML, a gente ajusta o ID)
const btnTheme = document.getElementById('theme-switch');

// Função para alternar o tema
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Rodar ao carregar a página
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme');
  const checkbox = document.querySelector('#checkbox');

  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    if (checkbox) checkbox.checked = true; // Mantém o switch ligado
  }
});

/* =========================
   AUTOSAVE ORÇAMENTO
========================= */

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

// Inicialização
carregarClientes();
carregarPendentes();
