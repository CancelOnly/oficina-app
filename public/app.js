const API = window.location.origin;

let veiculoAtual = null;
let listaPecas = [];

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
  atualizarHeader(data);

  // Preenche os campos de cadastro
  document.getElementById('placa').value = data.placa || '';
  document.getElementById('nome_cliente').value = data.nome_cliente || '';
  document.getElementById('telefone_cliente').value =
    data.telefone_cliente || '';
  document.getElementById('modelo').value = data.modelo || '';
  document.getElementById('ano').value = data.ano || '';
  document.getElementById('perfil').value = data.perfil_tecnico || '';

  // Preenche o KM atual na aba de serviço
  const campoKm = document.getElementById('km');
  if (campoKm) {
    campoKm.value = data.km_atual || '';
  }

  carregarHistorico(data.placa);
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
  document.getElementById('peca_nome').value = '';
  document.getElementById('peca_valor').value = '';
}

function removerPeca(index) {
  listaPecas.splice(index, 1);
  renderizarPecas();
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

    // Limpar campos de serviço
    document.getElementById('servico').value = '';
    listaPecas = [];
    renderizarPecas();

    carregarHistorico(veiculoAtual.placa);
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
      } catch (e) {}

      historico.innerHTML += `
                <div class="servico-item">
                    <div class="historico-header" onclick="toggleHistorico(${index})">
                        <div>
                            <strong>${item.data}</strong>
                            <p>${item.servico || 'Sem descrição'}</p>
                        </div>
                        <div class="historico-header-right">
                            <strong>R$ ${Number(item.valor_total || 0).toFixed(2)}</strong>
                            <span id="seta-${index}">▼</span>
                        </div>
                    </div>
                    <div class="historico-body" id="historico-${index}">
                        <p><strong>KM:</strong> ${item.km || 0}</p>
                        <div class="historico-servico-box">
                            <strong>Serviço</strong>
                            <p>${item.servico || '-'}</p>
                        </div>
                        <div class="historico-servico-box">
                            <strong>Peças</strong>
                            ${pecasHTML}
                        </div>
                        <div class="historico-valores">
                            <div><span>Peças</span><strong>R$ ${Number(item.valor_pecas || 0).toFixed(2)}</strong></div>
                            <div><span>Mão de obra</span><strong>R$ ${Number(item.valor_maodeobra || 0).toFixed(2)}</strong></div>
                            <div class="historico-total"><span>Total</span><strong>R$ ${Number(item.valor_total || 0).toFixed(2)}</strong></div>
                        </div>
                    </div>
                </div>
            `;
    });
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao carregar histórico', 'erro');
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

// Adiciona o evento de clique (ajustaremos conforme seu botão switch)
// btnTheme.addEventListener('click', toggleTheme);

// Inicialização
carregarClientes();
