const API = window.location.origin;

let veiculoAtual = null;
let listaPecas = [];

/* =========================
   STATUS
========================= */

function mostrarStatus(texto, tipo = 'sucesso') {
  const status = document.getElementById('status');

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
  document.querySelectorAll('.aba').forEach((aba) => {
    aba.classList.remove('active');
  });

  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.remove('active');
  });

  document.getElementById(`aba-${nome}`).classList.add('active');

  if (event) {
    event.target.classList.add('active');
  } else {
    const btn = document.querySelector(`[data-aba="${nome}"]`);

    if (btn) {
      btn.classList.add('active');
    }
  }
}

function trocarAbaDireta(nome) {
  trocarAba(nome);
}

/* =========================
   LIMPAR
========================= */

function limparCampos() {
  document.getElementById('nome_cliente').value = '';
  document.getElementById('telefone_cliente').value = '';
  document.getElementById('modelo').value = '';
  document.getElementById('ano').value = '';
  document.getElementById('perfil').value = '';
  document.getElementById('servico').value = '';
  document.getElementById('km').value = '';
  document.getElementById('topbar').classList.remove('active');

  listaPecas = [];
  renderizarPecas();

  document.getElementById('historico').innerHTML = '';
}

/* =========================
   HEADER
========================= */

function atualizarHeader(data) {
  const topbar = document.getElementById('topbar');

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
  const placa = document
    .getElementById('buscar_placa')
    .value.toUpperCase()
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

    if (!response.ok) {
      mostrarStatus('Erro ao buscar veículo', 'erro');
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
   ABRIR VEÍCULO
========================= */

function abrirVeiculo(data) {
  atualizarHeader(data);

  document.getElementById('placa').value = data.placa || '';
  document.getElementById('nome_cliente').value = data.nome_cliente || '';
  document.getElementById('telefone_cliente').value =
    data.telefone_cliente || '';
  document.getElementById('modelo').value = data.modelo || '';
  document.getElementById('ano').value = data.ano || '';
  document.getElementById('perfil').value = data.perfil_tecnico || '';
  document.getElementById('km').value = data.km || '';
  const campoKm = document.getElementById('km');
  if (campoKm) campoKm.value = data.km_atual || '';
  carregarHistorico(data.placa);
}

/* =========================
   CADASTRO
========================= */

async function salvarCadastro() {
  const body = {
    placa: document.getElementById('placa').value,
    nome_cliente: document.getElementById('nome_cliente').value,
    telefone_cliente: document.getElementById('telefone_cliente').value,
    modelo: document.getElementById('modelo').value,
    ano: document.getElementById('ano').value,
    perfil_tecnico: document.getElementById('perfil').value,
  };
  const ano = document.getElementById('ano').value;

  if (ano && (ano.length < 4 || ano.length > 4)) {
    mostrarStatus('Ano inválido', 'alerta');
    return;
  }

  try {
    const response = await fetch(`${API}/veiculo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      mostrarStatus('Erro ao salvar cadastro', 'erro');
      return;
    }

    veiculoAtual = body;

    atualizarHeader(body);

    mostrarStatus('Cadastro salvo', 'sucesso');
    carregarClientes();

    trocarAbaDireta('servico');
  } catch (err) {
    console.error(err);
    mostrarStatus('Servidor offline', 'erro');
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

  document.getElementById('valor_pecas').value = total.toFixed(2);

  document.getElementById('valor_pecas_display').innerText =
    'R$ ' + total.toFixed(2);

  calcularTotal();
}

/* =========================
   TOTAL
========================= */

function calcularTotal() {
  const pecas = parseFloat(document.getElementById('valor_pecas').value) || 0;
  const mao = parseFloat(document.getElementById('valor_maodeobra').value) || 0;

  const total = (pecas + mao).toFixed(2);

  document.getElementById('valor_total').value = total;

  document.getElementById('valor_total_display').innerText = 'R$ ' + total;
}

document.getElementById('valor_pecas').addEventListener('input', calcularTotal);
document
  .getElementById('valor_maodeobra')
  .addEventListener('input', calcularTotal);

/* =========================
   SERVIÇO
========================= */

async function fecharServico() {
  if (!veiculoAtual) {
    mostrarStatus('Nenhum veículo selecionado', 'alerta');
    return;
  }

  try {
    const response = await fetch(`${API}/servico`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        placa: veiculoAtual.placa,
        km: document.getElementById('km').value,
        servico: document.getElementById('servico').value,
        pecas_trocadas: JSON.stringify(listaPecas),
        valor_pecas:
          parseFloat(document.getElementById('valor_pecas').value) || 0,
        valor_maodeobra:
          parseFloat(document.getElementById('valor_maodeobra').value) || 0,
        valor_total:
          parseFloat(document.getElementById('valor_total').value) || 0,
      }),
    });

    let result;

    try {
      result = await response.json();
    } catch (e) {
      mostrarStatus('Resposta inválida do servidor', 'erro');
      return;
    }

    if (!response.ok) {
      mostrarStatus(result.erro || 'Erro ao salvar serviço', 'erro');
      return;
    }

    mostrarStatus('Serviço fechado', 'sucesso');

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

    historico.innerHTML = '';

    if (servicos.length === 0) {
      historico.innerHTML = `
        <div class="servico-item">
          Nenhum serviço encontrado
        </div>
      `;

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
      } catch {}

      historico.innerHTML += `
        <div class="servico-item">

          <!-- CABEÇALHO -->

          <div
            class="historico-header"
            onclick="toggleHistorico(${index})"
          >

            <div>

              <strong>${item.data}</strong>

              <p>
                ${item.servico || 'Sem descrição'}
              </p>

            </div>

            <div class="historico-header-right">

              <strong>
                R$ ${Number(item.valor_total || 0).toFixed(2)}
              </strong>

              <span id="seta-${index}">
                ▼
              </span>

            </div>

          </div>

          <!-- CONTEÚDO -->

          <div
            class="historico-body"
            id="historico-${index}"
          >

            <p>
              <strong>KM:</strong>
              ${item.km || 0}
            </p>

            <div class="historico-servico-box">

              <strong>Serviço</strong>

              <p>
                ${item.servico || '-'}
              </p>

            </div>

            <div class="historico-servico-box">

              <strong>Peças</strong>

              ${pecasHTML}

            </div>

            <div class="historico-valores">

              <div>
                <span>Peças</span>

                <strong>
                  R$ ${Number(item.valor_pecas || 0).toFixed(2)}
                </strong>
              </div>

              <div>
                <span>Mão de obra</span>

                <strong>
                  R$ ${Number(item.valor_maodeobra || 0).toFixed(2)}
                </strong>
              </div>

              <div class="historico-total">

                <span>Total</span>

                <strong>
                  R$ ${Number(item.valor_total || 0).toFixed(2)}
                </strong>

              </div>

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

  const maoDeObra =
    parseFloat(document.getElementById('valor_maodeobra').value) || 0;

  const valorPecas =
    parseFloat(document.getElementById('valor_pecas').value) || 0;

  const total = parseFloat(document.getElementById('valor_total').value) || 0;

  /* LISTA DE PEÇAS */

  let textoPecas = 'Nenhuma peça adicionada';

  if (listaPecas.length > 0) {
    textoPecas = listaPecas
      .map((p) => `• ${p.nome} — R$ ${p.valor.toFixed(2)}`)
      .join('\n');
  }

  const texto = `
Olá ${veiculoAtual.nome_cliente || ''} 👋

Seu veículo foi finalizado com sucesso.

🚗 Veículo:
${veiculoAtual.placa} - ${veiculoAtual.modelo || ''}

🔧 Serviço realizado:
${servico}

🧩 Peças utilizadas:
${textoPecas}

💰 Valores:

Peças:
R$ ${valorPecas.toFixed(2)}

Mão de obra:
R$ ${maoDeObra.toFixed(2)}

Total:
R$ ${total.toFixed(2)}

Obrigado pela preferência.
`;

  const link = `https://wa.me/55${telefone}?text=${encodeURIComponent(texto)}`;

  window.open(link, '_blank');
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
   ENTER BUSCA E PEÇAS
========================= */

document.getElementById('buscar_placa').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') buscarVeiculo();
});

document
  .getElementById('peca_valor')
  .addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      adicionarPeca();
    }
  });

function servicoRapido(texto) {
  document.getElementById('servico').value = texto;
  document.getElementById('servico').focus();
}

function toggleHistorico(index) {
  const body = document.getElementById(`historico-${index}`);

  const seta = document.getElementById(`seta-${index}`);

  body.classList.toggle('active');

  if (body.classList.contains('active')) {
    seta.innerText = '▲';
  } else {
    seta.innerText = '▼';
  }
}

/* =========================
   SEÇÕES GLOBAIS
========================= */

function trocarSecao(nome, event = null) {
  document.querySelectorAll('.secao-global').forEach((secao) => {
    secao.classList.remove('active');
  });

  document.querySelectorAll('.sidebar-btn').forEach((btn) => {
    btn.classList.remove('active');
  });

  document.getElementById(`secao-${nome}`).classList.add('active');

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

    lista.innerHTML = '';

    clientes.forEach((cliente) => {
      lista.innerHTML += `
    <tr
      class="cliente-row"
      onclick="abrirCliente('${cliente.placa}')"
    >

      <td>
        ${cliente.nome_cliente || '-'}
      </td>

      <td>
        ${cliente.placa || '-'}
      </td>

      <td>
        ${cliente.modelo || '-'}
      </td>
      
      <td>
          ${cliente.ano || '-'}
      </td>

      <td>
          ${cliente.perfil_tecnico || '-'}
      </td>
      
      <td>
        ${cliente.telefone_cliente || '-'}
      </td>

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

    document.querySelectorAll('.sidebar-btn').forEach((btn) => {
      btn.classList.remove('active');
    });

    document.querySelector('.sidebar-btn').classList.add('active');

    trocarAbaDireta('servico');

    mostrarStatus('Cliente carregado', 'sucesso');
  } catch (err) {
    console.error(err);

    mostrarStatus('Erro ao abrir cliente', 'erro');
  }
}

/* =========================
   BUSCA CLIENTES
========================= */

document.getElementById('busca_cliente').addEventListener('input', function () {
  const termo = this.value.toLowerCase();

  const linhas = document.querySelectorAll('#lista-clientes tr');

  linhas.forEach((linha) => {
    const texto = linha.innerText.toLowerCase();

    if (texto.includes(termo)) {
      linha.style.display = 'table-row';
    } else {
      linha.style.display = 'none';
    }
  });
});

/* carregar automaticamente */

carregarClientes();
