import { api } from './api.js';
import { state } from './state.js';
import { $, limparPlaca, numero, moeda, escapeHTML, telefoneWhatsapp, mostrarStatus, DDI_PADRAO, DDD_PADRAO, dadosTelefoneVeiculo, formatarTelefoneExibicao } from './utils.js';

function chaveRascunho(placa) { return `orcamento_${placa}`; }
function salvarAtalhos() { localStorage.setItem('config_atalhos', JSON.stringify(state.atalhos)); }

function trocarAba(nome) {
  document.querySelectorAll('.aba').forEach((aba) => aba.classList.remove('active'));
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('active'));
  $(`aba-${nome}`)?.classList.add('active');
  document.querySelector(`.tab[data-aba="${nome}"]`)?.classList.add('active');
  if (nome === 'historico' && state.veiculoAtual?.placa) carregarHistorico(state.veiculoAtual.placa);
  if (nome === 'servico') renderizarBotoesAtalho();
}

function trocarSecao(nome) {
  document.querySelectorAll('.secao-global').forEach((s) => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-btn').forEach((b) => b.classList.remove('active'));
  $(`secao-${nome}`)?.classList.add('active');
  document.querySelector(`.sidebar-btn[data-secao="${nome}"]`)?.classList.add('active');
  if (nome === 'clientes') carregarClientes();
  if (nome === 'pendentes') carregarPendentes();
  if (nome === 'servicos') carregarServicosGlobais();
  if (nome === 'financeiro') atualizarFinanceiro();
  if (nome === 'oficina') carregarOrdensAbertas();
}

function atualizarHeader(data) {
  const topbar = $('topbar');
  if (!topbar) return;
  if (!data) {
    topbar.classList.remove('active');
    $('headerPlaca').innerText = 'Nenhum veículo';
    $('headerModelo').innerText = '---';
    if ($('headerAno')) $('headerAno').innerText = 'Ano: ---';
    if ($('headerCor')) $('headerCor').innerText = 'Cor: ---';
    if ($('headerKm')) $('headerKm').innerText = 'KM: ---';
    if ($('headerCombustivel')) $('headerCombustivel').innerText = 'Combustível: ---';
    $('headerCliente').innerText = '---';
    $('headerTelefone').innerText = '---';
    return;
  }
  topbar.classList.add('active');
  $('headerPlaca').innerText = data.placa || '---';
  $('headerModelo').innerText = data.modelo || 'Modelo não informado';
  if ($('headerAno')) $('headerAno').innerText = `Ano: ${data.ano || '---'}`;
  if ($('headerCor')) $('headerCor').innerText = `Cor: ${data.cor || '---'}`;
  if ($('headerKm')) $('headerKm').innerText = `KM: ${data.km_atual || 0}`;
  if ($('headerCombustivel')) $('headerCombustivel').innerText = `Combustível: ${data.combustivel || 'Não informado'}`;
  $('headerCliente').innerText = data.nome_cliente || 'Cliente não informado';
  $('headerTelefone').innerText = formatarTelefoneExibicao(data);
}

function limparCamposCadastroServico() {
  ['placa','nome_cliente','modelo','cor','combustivel','ano','perfil','servico','km','valor_maodeobra','valor_pago','peca_nome','peca_valor'].forEach((id) => { const el = $(id); if (el) el.value = ''; });
  if ($('combustivel')) $('combustivel').value = 'Não informado';
  if ($('ddi_cliente')) $('ddi_cliente').value = DDI_PADRAO;
  $('ddd_cliente').value = DDD_PADRAO;
  $('tel_cliente').value = '';
  setFormaPagamento('pendente');
  state.listaPecas = [];
  state.editandoPecaIndex = null;
  atualizarBotaoPeca();
  renderizarPecas();
  $('historico').innerHTML = '';
}

function abrirVeiculo(data) {
  // Antes de trocar de carro, salva o rascunho do carro anterior e cancela
  // qualquer autosave pendente. Isso impede vazamento de peças entre placas.
  if (state.veiculoAtual?.placa) salvarRascunho(state.veiculoAtual.placa);
  cancelarAutoSavePendente();

  state.bloqueandoAutoSave = true;
  state.veiculoAtual = data;
  state.osAtual = null;
  atualizarBannerOS();
  atualizarHeader(data);

  $('placa').value = data.placa || '';
  $('nome_cliente').value = data.nome_cliente || '';
  const tel = dadosTelefoneVeiculo(data);
  if ($('ddi_cliente')) $('ddi_cliente').value = tel.ddi || DDI_PADRAO;
  $('ddd_cliente').value = tel.ddd || DDD_PADRAO;
  $('tel_cliente').value = tel.numero || '';
  $('modelo').value = data.modelo || '';
  if ($('cor')) $('cor').value = data.cor || '';
  if ($('combustivel')) $('combustivel').value = data.combustivel || 'Não informado';
  $('ano').value = data.ano || '';
  $('perfil').value = data.perfil_tecnico || '';

  limparFormularioServico();
  $('km').value = data.km_atual || '';

  restaurarRascunho(data.placa);
  if (!$('km').value || $('km').value === '0') $('km').value = data.km_atual || '';
  carregarHistorico(data.placa);
  state.bloqueandoAutoSave = false;
}

async function buscarVeiculo() {
  const placa = limparPlaca($('buscar_placa')?.value);
  if (!placa) return mostrarStatus('Digite uma placa', 'alerta');
  try {
    const data = await api.buscarVeiculo(placa);
    abrirVeiculo(data);
    trocarAba('servico');
    mostrarStatus('Veículo carregado', 'sucesso');
  } catch (err) {
    if (err.status === 404) {
      limparCamposCadastroServico();
      atualizarHeader(null);
      $('placa').value = placa;
      trocarAba('cadastro');
      mostrarStatus('Veículo não encontrado. Cadastre para continuar.', 'alerta');
    } else {
      console.error(err);
      mostrarStatus('Servidor offline ou erro ao buscar veículo', 'erro');
    }
  }
}

async function salvarCadastro() {
  const placa = limparPlaca($('placa').value);
  if (!placa) return mostrarStatus('A placa é obrigatória', 'alerta');
  const ddi = ($('ddi_cliente')?.value || DDI_PADRAO).replace(/\D/g, '') || DDI_PADRAO;
  const ddd = $('ddd_cliente').value.replace(/\D/g, '') || DDD_PADRAO;
  const tel = $('tel_cliente').value.replace(/\D/g, '');
  const dados = {
    placa,
    nome_cliente: $('nome_cliente').value.trim(),
    ddi_cliente: ddi,
    ddd_cliente: ddd,
    telefone_numero: tel,
    telefone_cliente: tel ? `${ddi}${ddd}${tel}` : '',
    modelo: $('modelo').value.trim(),
    cor: $('cor')?.value.trim() || '',
    combustivel: $('combustivel')?.value || 'Não informado',
    ano: parseInt($('ano').value) || 0,
    perfil_tecnico: $('perfil').value.trim(),
  };
  try {
    await api.salvarVeiculo(dados);
    const salvo = await api.buscarVeiculo(placa).catch(() => dados);
    abrirVeiculo(salvo);
    await carregarClientes();
    trocarAba('servico');
    $('servico')?.focus();
    mostrarStatus('Cadastro salvo', 'sucesso');
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao salvar cadastro', 'erro');
  }
}

function salvarRascunho(placaAlvo = state.veiculoAtual?.placa) {
  if (state.bloqueandoAutoSave || state.restaurandoRascunho || !placaAlvo) return;

  // Segurança importante: evita que um autosave atrasado de um carro
  // grave peças/orçamento no rascunho de outro carro recém-aberto.
  if (state.veiculoAtual?.placa !== placaAlvo) return;

  const dados = {
    servico: $('servico').value,
    km: $('km').value,
    valor_maodeobra: $('valor_maodeobra').value,
    valor_pago: $('valor_pago').value,
    forma_pagamento: getFormaPagamento(),
    listaPecas: [...state.listaPecas],
  };
  localStorage.setItem(chaveRascunho(placaAlvo), JSON.stringify(dados));
}
function autoSalvarRascunho() {
  const placaNoMomentoDaDigitacao = state.veiculoAtual?.placa;
  clearTimeout(state.timeoutAutoSave);
  state.timeoutAutoSave = setTimeout(() => {
    salvarRascunho(placaNoMomentoDaDigitacao);
  }, 400);
}
function cancelarAutoSavePendente() {
  clearTimeout(state.timeoutAutoSave);
  state.timeoutAutoSave = null;
}
function limparFormularioServico() {
  ['servico', 'valor_maodeobra', 'valor_pago', 'peca_nome', 'peca_valor'].forEach((id) => {
    const el = $(id);
    if (el) el.value = '';
  });
  if ($('forma_pagamento')) setFormaPagamento('pendente');
  state.listaPecas = [];
  renderizarPecas();
  calcularTotal();
}
function restaurarRascunho(placa) {
  const raw = localStorage.getItem(chaveRascunho(placa));
  if (!raw) return;
  try {
    state.restaurandoRascunho = true;
    const dados = JSON.parse(raw);
    $('servico').value = dados.servico || '';
    $('km').value = dados.km || $('km').value || '';
    $('valor_maodeobra').value = dados.valor_maodeobra || '';
    $('valor_pago').value = dados.valor_pago || '';
    setFormaPagamento(dados.forma_pagamento || 'pendente');
    state.listaPecas = Array.isArray(dados.listaPecas) ? dados.listaPecas : [];
    renderizarPecas();
    calcularTotal();
    setTimeout(() => { state.restaurandoRascunho = false; }, 100);
  } catch (err) { state.restaurandoRascunho = false; console.error(err); }
}
function limparRascunho() {
  cancelarAutoSavePendente();
  if (state.veiculoAtual?.placa) localStorage.removeItem(chaveRascunho(state.veiculoAtual.placa));
  $('servico').value = '';
  $('km').value = state.veiculoAtual?.km_atual || '';
  $('valor_maodeobra').value = '';
  $('valor_pago').value = '';
  setFormaPagamento('pendente');
  $('peca_nome').value = '';
  $('peca_valor').value = '';
  state.listaPecas = [];
  state.editandoPecaIndex = null;
  atualizarBotaoPeca();
  renderizarPecas();
  calcularTotal();
  mostrarStatus('Orçamento limpo', 'sucesso');
}


function abrirModalLimparOrcamento() {
  $('modal-confirmar-limpar')?.classList.add('active');
}

function fecharModalLimparOrcamento() {
  $('modal-confirmar-limpar')?.classList.remove('active');
}

function confirmarLimparOrcamento() {
  fecharModalLimparOrcamento();
  limparRascunho();
}

function atualizarBotaoPeca() {
  const btn = $('btn-adicionar-peca');
  if (!btn) return;
  const editando = Number.isInteger(state.editandoPecaIndex);
  btn.textContent = editando ? 'Salvar peça' : 'Adicionar';
  btn.classList.toggle('editing-piece', editando);
}

function cancelarEdicaoPeca() {
  state.editandoPecaIndex = null;
  $('peca_nome').value = '';
  $('peca_valor').value = '';
  atualizarBotaoPeca();
}

function adicionarPeca() {
  const nome = $('peca_nome').value.trim();
  const valor = numero($('peca_valor').value);
  if (!nome) return mostrarStatus('Digite o nome da peça', 'alerta');

  if (Number.isInteger(state.editandoPecaIndex) && state.listaPecas[state.editandoPecaIndex]) {
    state.listaPecas[state.editandoPecaIndex] = { nome, valor };
    mostrarStatus('Peça atualizada', 'sucesso');
  } else {
    state.listaPecas.push({ nome, valor });
  }

  cancelarEdicaoPeca();
  renderizarPecas();
  salvarRascunho();
}

function editarPeca(index) {
  const peca = state.listaPecas[index];
  if (!peca) return;
  state.editandoPecaIndex = index;
  $('peca_nome').value = peca.nome || '';
  $('peca_valor').value = numero(peca.valor).toFixed(2);
  atualizarBotaoPeca();
  $('peca_nome')?.focus();
}

function removerPeca(index) {
  state.listaPecas.splice(index, 1);
  if (state.editandoPecaIndex === index) cancelarEdicaoPeca();
  else if (Number.isInteger(state.editandoPecaIndex) && state.editandoPecaIndex > index) state.editandoPecaIndex -= 1;
  renderizarPecas();
  salvarRascunho();
}

function renderizarPecas() {
  const lista = $('lista_pecas');
  if (!lista) return;
  lista.innerHTML = '';
  let total = 0;
  state.listaPecas.forEach((p, i) => {
    total += numero(p.valor);
    const item = document.createElement('div');
    item.className = 'peca-item';
    item.innerHTML = `<div><strong>${escapeHTML(p.nome)}</strong><br><span>${moeda(p.valor)}</span></div>`;

    const actions = document.createElement('div');
    actions.className = 'peca-actions';

    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'peca-edit-btn';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => editarPeca(i));

    const btnRemover = document.createElement('button');
    btnRemover.type = 'button';
    btnRemover.className = 'peca-remove-btn';
    btnRemover.textContent = 'X';
    btnRemover.addEventListener('click', () => removerPeca(i));

    actions.appendChild(btnEditar);
    actions.appendChild(btnRemover);
    item.appendChild(actions);
    lista.appendChild(item);
  });
  $('valor_pecas').value = total.toFixed(2);
  $('valor_pecas_display').innerText = moeda(total);
  atualizarBotaoPeca();
  calcularTotal();
}
function calcularTotal() {
  const total = numero($('valor_pecas').value) + numero($('valor_maodeobra').value);
  $('valor_total').value = total.toFixed(2);
  $('valor_total_display').innerText = moeda(total);
  atualizarResumoPagamento();
  if (!state.bloqueandoAutoSave && !state.restaurandoRascunho) salvarRascunho();
}

function getFormaPagamento() {
  return $('forma_pagamento')?.value || 'pendente';
}

function setFormaPagamento(forma = 'pendente') {
  const valor = forma || 'pendente';
  const input = $('forma_pagamento');
  if (input) input.value = valor;
  document.querySelectorAll('.payment-choice[data-pagamento]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.pagamento === valor);
  });
  autoSalvarRascunho();
}

function atualizarResumoPagamento() {
  const total = numero($('valor_total')?.value);
  const pago = numero($('valor_pago')?.value);
  const falta = Math.max(0, total - pago);
  const pagoEl = $('payment-recebido-display');
  const faltaEl = $('payment-falta-display');
  if (pagoEl) pagoEl.innerText = moeda(pago);
  if (faltaEl) faltaEl.innerText = moeda(falta);
}

function dadosServicoAtual(status = 'orcamento') {
  return {
    placa: state.veiculoAtual?.placa,
    status,
    km: parseInt($('km').value) || 0,
    servico: $('servico').value.trim(),
    pecas_trocadas: JSON.stringify(state.listaPecas || []),
    valor_pecas: numero($('valor_pecas').value),
    valor_maodeobra: numero($('valor_maodeobra').value),
    valor_total: numero($('valor_total').value),
    valor_pago: numero($('valor_pago').value),
    forma_pagamento: getFormaPagamento(),
    observacoes: '',
  };
}

function numeroOSVisual(item = null) {
  const numero = item?.numero_os || item?.numeroOS || '';
  if (numero) return `OS Nº ${numero}`;
  if (item?.id) return `OS Nº ${String(item.id).padStart(6, '0')}`;
  return 'ORÇAMENTO / PRÉVIA';
}

function labelStatusOS(status = 'orcamento') {
  const mapa = {
    orcamento: 'Orçamento',
    em_andamento: 'Em andamento',
    aguardando_peca: 'Aguardando peça',
    pronto: 'Pronto',
    entregue: 'Entregue',
    cancelado: 'Cancelada',
  };
  return mapa[status] || status;
}

function atualizarBannerOS() {
  const banner = $('os-atual-banner');
  if (!banner) return;
  const os = state.osAtual;
  if (!os) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    $('btn-marcar-pronto')?.classList.add('hidden');
    $('btn-cancelar-os')?.classList.add('hidden');
    return;
  }
  banner.classList.remove('hidden');
  banner.innerHTML = `<div><strong>${escapeHTML(numeroOSVisual(os))} • ${labelStatusOS(os.status)}</strong><span>Esta OS está salva na Oficina Hoje. Ao fechar serviço, ela entra no histórico do veículo.</span></div><span class="os-status ${escapeHTML(os.status)}">${labelStatusOS(os.status)}</span>`;
  $('btn-marcar-pronto')?.classList.toggle('hidden', os.status === 'pronto');
  $('btn-cancelar-os')?.classList.remove('hidden');
}

function aplicarOrdemNoFormulario(os) {
  state.osAtual = os;
  $('servico').value = os.servico || '';
  $('km').value = os.km || state.veiculoAtual?.km_atual || '';
  $('valor_maodeobra').value = os.valor_maodeobra || '';
  $('valor_pago').value = os.valor_pago || '';
  setFormaPagamento(os.forma_pagamento || 'pendente');
  try { state.listaPecas = JSON.parse(os.pecas_trocadas || '[]'); } catch (_) { state.listaPecas = []; }
  renderizarPecas();
  calcularTotal();
  atualizarBannerOS();
}

async function carregarOrdensAbertas() {
  const lista = $('lista-os-abertas');
  if (!lista) return;
  try {
    const ordens = await api.listarOrdensAbertas();
    state.ordensAbertas = ordens;
    renderizarOrdensAbertas(ordens);
  } catch (err) {
    console.error(err);
    lista.innerHTML = '<div class="os-empty">Erro ao carregar OS abertas.</div>';
  }
}

function renderizarOrdensAbertas(ordens = []) {
  const lista = $('lista-os-abertas');
  const resumo = $('oficina-hoje-resumo');
  if (!lista) return;
  const contagem = ordens.reduce((acc, os) => { acc[os.status] = (acc[os.status] || 0) + 1; return acc; }, {});
  if (resumo) {
    resumo.innerHTML = `
      <div class="oficina-chip"><strong>${ordens.length}</strong> OS abertas</div>
      <div class="oficina-chip"><strong>${contagem.em_andamento || 0}</strong> em andamento</div>
      <div class="oficina-chip"><strong>${contagem.aguardando_peca || 0}</strong> aguardando peça</div>
      <div class="oficina-chip"><strong>${contagem.pronto || 0}</strong> prontas</div>
    `;
  }
  if (!ordens.length) {
    lista.innerHTML = '<div class="os-empty">Nenhum carro marcado como estando na oficina. Use “Manter na Oficina” na aba Serviço quando quiser acompanhar uma OS aberta.</div>';
    return;
  }
  lista.innerHTML = '';
  ordens.forEach((os) => {
    const card = document.createElement('article');
    card.className = 'os-card';
    const restante = Math.max(0, numero(os.valor_total) - numero(os.valor_pago));
    card.innerHTML = `
      <div class="os-card-header">
        <div><strong>${escapeHTML(os.placa || '-')}</strong><span>${escapeHTML(numeroOSVisual(os))} • ${escapeHTML(os.modelo || 'Veículo')} • ${escapeHTML(os.nome_cliente || 'Cliente')}</span></div>
        <span class="os-status ${escapeHTML(os.status)}">${labelStatusOS(os.status)}</span>
      </div>
      <div class="os-card-service">${escapeHTML(os.servico || 'Sem descrição do serviço')}</div>
      <div class="os-card-meta">
        <div><small>KM</small><strong>${escapeHTML(os.km || os.km_atual || '-')}</strong></div>
        <div><small>Total</small><strong>${moeda(os.valor_total || 0)}</strong></div>
        <div><small>Pago</small><strong>${moeda(os.valor_pago || 0)}</strong></div>
        <div><small>Falta</small><strong>${moeda(restante)}</strong></div>
      </div>
    `;
    const actions = document.createElement('div');
    actions.className = 'os-card-actions';
    const abrir = document.createElement('button'); abrir.type = 'button'; abrir.textContent = 'Abrir OS'; abrir.className = 'salvar'; abrir.addEventListener('click', () => abrirOrdemServico(os.id));
    const pronto = document.createElement('button'); pronto.type = 'button'; pronto.textContent = 'Pronto'; pronto.addEventListener('click', () => alterarStatusOS(os.id, 'pronto'));
    const espera = document.createElement('button'); espera.type = 'button'; espera.textContent = 'Aguardando peça'; espera.addEventListener('click', () => alterarStatusOS(os.id, 'aguardando_peca'));
    actions.append(abrir, pronto, espera);
    card.appendChild(actions);
    lista.appendChild(card);
  });
}

async function abrirOrdemServico(id) {
  try {
    const os = await api.buscarOrdemServico(id);
    const veiculo = await api.buscarVeiculo(os.placa);
    abrirVeiculo(veiculo);
    aplicarOrdemNoFormulario(os);
    trocarSecao('oficina');
    trocarAba('servico');
    mostrarStatus(`${numeroOSVisual(os)} aberta`, 'sucesso');
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao abrir OS', 'erro');
  }
}

async function salvarOrdemAberta(statusPreferido = null) {
  if (!state.veiculoAtual) return mostrarStatus('Nenhum veículo selecionado', 'alerta');
  const dados = dadosServicoAtual(statusPreferido || state.osAtual?.status || 'orcamento');
  if (!dados.km) return mostrarStatus('Informe a KM para manter a OS na oficina', 'alerta');
  if (!dados.servico && !dados.valor_total && !state.listaPecas.length) return mostrarStatus('Preencha algo do serviço antes de salvar a OS', 'alerta');
  try {
    if (state.osAtual?.id) {
      await api.atualizarOrdemServico(state.osAtual.id, dados);
      state.osAtual = { ...state.osAtual, ...dados };
      mostrarStatus('OS atualizada na Oficina Hoje', 'sucesso');
    } else {
      const result = await api.criarOrdemServico(dados);
      state.osAtual = { id: result.id, numero_os: result.numero_os, ano_os: result.ano_os, sequencia_os: result.sequencia_os, ...dados, ...state.veiculoAtual };
      mostrarStatus('OS mantida na Oficina Hoje', 'sucesso');
    }
    atualizarBannerOS();
    await carregarOrdensAbertas();
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao salvar OS', 'erro');
  }
}

async function alterarStatusOS(id, status) {
  try {
    await api.alterarStatusOrdemServico(id, status);
    if (state.osAtual?.id === Number(id)) {
      state.osAtual.status = status;
      atualizarBannerOS();
    }
    await carregarOrdensAbertas();
    mostrarStatus(`OS marcada como ${labelStatusOS(status)}`, 'sucesso');
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao alterar OS', 'erro');
  }
}

async function marcarOSPronta() {
  if (!state.osAtual?.id) return mostrarStatus('Nenhuma OS aberta carregada', 'alerta');
  await salvarOrdemAberta('pronto');
  await alterarStatusOS(state.osAtual.id, 'pronto');
}

async function cancelarOSAtual() {
  if (!state.osAtual?.id) return mostrarStatus('Nenhuma OS aberta carregada', 'alerta');
  const id = state.osAtual.id;
  try {
    await api.alterarStatusOrdemServico(id, 'cancelado');
    state.osAtual = null;
    atualizarBannerOS();
    await carregarOrdensAbertas();
    mostrarStatus('OS cancelada. O histórico do veículo não foi alterado.', 'sucesso');
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao cancelar OS', 'erro');
  }
}


function validarDadosParaFechamento() {
  if (!state.veiculoAtual) { mostrarStatus('Nenhum veículo selecionado', 'alerta'); return false; }
  const total = numero($('valor_total').value);
  if (total <= 0) { $('valor_maodeobra')?.focus(); mostrarStatus('O valor total não pode ser R$ 0,00', 'alerta'); return false; }
  if (temPecaDigitadaNaoAdicionada()) { abrirModalAlertaPeca(() => abrirModalFechamento(), 'Descartar peça e continuar'); return false; }
  const km = parseInt($('km').value) || 0;
  const kmAnterior = parseInt(state.veiculoAtual.km_atual) || 0;
  if (km <= 0) { $('km')?.focus(); mostrarStatus('Informe a KM atual', 'alerta'); return false; }
  if (km < kmAnterior) { mostrarStatus(`KM inválida! A última foi ${kmAnterior}.`, 'alerta'); return false; }
  return true;
}

function montarDadosFechamento() {
  const total = numero($('valor_total').value);
  return {
    placa: state.veiculoAtual.placa,
    km: parseInt($('km').value) || 0,
    servico: $('servico').value.trim(),
    pecas_trocadas: JSON.stringify(state.listaPecas),
    valor_pecas: numero($('valor_pecas').value),
    valor_maodeobra: numero($('valor_maodeobra').value),
    valor_total: total,
    valor_pago: numero($('valor_pago').value),
    forma_pagamento: getFormaPagamento(),
    ordem_servico_id: state.osAtual?.id || null,
  };
}

function abrirModalFechamento() {
  if (!validarDadosParaFechamento()) return;
  const dados = montarDadosFechamento();
  const restante = Math.max(0, numero(dados.valor_total) - numero(dados.valor_pago));
  const resumo = $('modal-fechamento-resumo');
  if (resumo) {
    resumo.innerHTML = `
      <div><span>Cliente:</span><strong>${escapeHTML(state.veiculoAtual?.nome_cliente || '-')}</strong></div>
      <div><span>Veículo:</span><strong>${escapeHTML([state.veiculoAtual?.placa, state.veiculoAtual?.modelo].filter(Boolean).join(' • ') || '-')}</strong></div>
      <div><span>Total:</span><strong>${moeda(dados.valor_total)}</strong></div>
      <div><span>Pago:</span><strong>${moeda(dados.valor_pago)}</strong></div>
      <div><span>Restante:</span><strong>${moeda(restante)}</strong></div>
      <div><span>Pagamento:</span><strong>${escapeHTML(dados.forma_pagamento || 'pendente')}</strong></div>
      <div class="modal-summary-wide"><span>Serviço:</span><strong>${escapeHTML(dados.servico || 'Sem descrição')}</strong></div>
      <div class="modal-summary-wide"><span>Peças:</span><strong>${state.listaPecas.length} item(ns)</strong></div>
    `;
  }
  $('modal-confirmar-fechamento')?.classList.add('active');
}

function fecharModalFechamento() { $('modal-confirmar-fechamento')?.classList.remove('active'); }

function fecharServico() {
  abrirModalFechamento();
}

async function executarFechamento({ enviarOS = false } = {}) {
  if (!validarDadosParaFechamento()) return;
  const dados = montarDadosFechamento();
  try {
    const result = await api.salvarServico(dados);
    const itemFechado = {
      ...dados,
      id: result?.id || null,
      data: new Date().toLocaleDateString('pt-BR'),
      numero_os: result?.numero_os || '',
      ano_os: result?.ano_os,
      sequencia_os: result?.sequencia_os,
    };

    if (state.osAtual?.id) {
      await api.alterarStatusOrdemServico(state.osAtual.id, 'entregue').catch(console.error);
      state.osAtual = null;
      atualizarBannerOS();
    }

    if (enviarOS) {
      abrirDocumentoOSPDF({ veiculo: state.veiculoAtual, servicoItem: itemFechado, pecas: state.listaPecas, finalizado: true });
      abrirWhatsAppOSFechada(itemFechado);
    }

    state.veiculoAtual.km_atual = dados.km;
    cancelarAutoSavePendente();
    localStorage.removeItem(chaveRascunho(state.veiculoAtual.placa));
    $('servico').value = '';
    $('valor_maodeobra').value = '';
    $('valor_pago').value = '';
    setFormaPagamento('pendente');
    $('peca_nome').value = '';
    $('peca_valor').value = '';
    state.listaPecas = [];
    state.editandoPecaIndex = null;
    atualizarBotaoPeca();
    renderizarPecas();
    $('km').value = dados.km;
    fecharModalFechamento();
    await Promise.all([carregarHistorico(state.veiculoAtual.placa), carregarClientes(), carregarPendentes(), carregarOrdensAbertas(), carregarServicosGlobais(false)]);
    trocarAba('historico');
    mostrarStatus(`Serviço fechado. ${numeroOSVisual(itemFechado)}`, 'sucesso');
  } catch (err) { console.error(err); mostrarStatus(err.message || 'Erro ao fechar serviço', 'erro'); }
}

function temPecaDigitadaNaoAdicionada() {
  return Boolean($('peca_nome')?.value.trim() || $('peca_valor')?.value.trim());
}

function abrirModalAlertaPeca(acaoAposDescartar = null, textoBotao = 'Descartar peça e continuar') {
  state.acaoAposAlertaPeca = typeof acaoAposDescartar === 'function' ? acaoAposDescartar : null;
  const nome = $('peca_nome')?.value.trim();
  const valor = $('peca_valor')?.value.trim();
  $('msg-alerta-peca').innerHTML = `Você digitou <strong>${escapeHTML(nome || 'uma peça')}</strong>${valor ? ` no valor de <strong>${escapeHTML(valor)}</strong>` : ''}, mas ainda não clicou em <strong>Adicionar Peça</strong>.<br><br>Deseja voltar para adicionar ou descartar esse campo e continuar?`;
  const btnContinuar = $('btn-limpar-peca-fechar');
  if (btnContinuar) {
    btnContinuar.textContent = textoBotao;
    btnContinuar.style.display = '';
  }
  $('modal-alerta-peca').classList.add('active');
}

function abrirModalPecasObrigatorias(acao = 'continuar') {
  state.acaoAposAlertaPeca = null;
  const nome = $('peca_nome')?.value.trim();
  const valor = $('peca_valor')?.value.trim();
  const btnContinuar = $('btn-limpar-peca-fechar');

  if (nome || valor) {
    $('msg-alerta-peca').innerHTML = `Você digitou <strong>${escapeHTML(nome || 'uma peça')}</strong>${valor ? ` no valor de <strong>${escapeHTML(valor)}</strong>` : ''}, mas ainda não clicou em <strong>Adicionar Peça</strong>.<br><br>Para ${escapeHTML(acao)}, primeiro clique em <strong>Adicionar Peça</strong>.`;
  } else {
    $('msg-alerta-peca').innerHTML = `Nenhuma peça foi adicionada ainda.<br><br>Para ${escapeHTML(acao)}, adicione pelo menos <strong>1 peça</strong> na lista de peças utilizadas.`;
  }

  if (btnContinuar) btnContinuar.style.display = 'none';
  $('modal-alerta-peca')?.classList.add('active');
}

function validarPecasObrigatorias(acao = 'continuar') {
  if (Array.isArray(state.listaPecas) && state.listaPecas.length > 0) return true;
  abrirModalPecasObrigatorias(acao);
  return false;
}

function fecharModalAlerta() {
  $('modal-alerta-peca').classList.remove('active');
  const btnContinuar = $('btn-limpar-peca-fechar');
  if (btnContinuar) btnContinuar.style.display = '';
  state.acaoAposAlertaPeca = null;
}

function limparCamposPecaEFechar() {
  $('peca_nome').value = '';
  $('peca_valor').value = '';
  const acao = state.acaoAposAlertaPeca;
  $('modal-alerta-peca').classList.remove('active');
  state.acaoAposAlertaPeca = null;
  if (typeof acao === 'function') setTimeout(acao, 50);
}

async function carregarHistorico(placa) {
  const historico = $('historico');
  if (!historico || !placa) return;
  try {
    const servicos = await api.listarHistorico(placa);
    historico.innerHTML = '';
    if (!servicos.length) { historico.innerHTML = '<div class="servico-item" style="padding:16px">Nenhum serviço encontrado</div>'; return; }
    servicos.forEach((item, index) => {
      const total = numero(item.valor_total), pago = numero(item.valor_pago), restante = Math.max(0, total - pago), status = item.status_pagamento || 'pendente';
      let pecasHTML = 'Nenhuma peça';
      try {
        const pecas = JSON.parse(item.pecas_trocadas || '[]');
        if (pecas.length) pecasHTML = pecas.map((p) => `<div class="historico-peca"><span>${escapeHTML(p.nome)}</span><strong>${moeda(p.valor)}</strong></div>`).join('');
      } catch (_) {}
      const el = document.createElement('div');
      el.className = 'servico-item';
      el.dataset.id = item.id;
      el.innerHTML = `
        <div class="historico-header history-polished-header" data-toggle-historico="${index}">
          <div class="history-head-left">
            <div class="history-meta-line"><span>${escapeHTML(item.data || '-')}</span><span class="badge-km">${escapeHTML(numeroOSVisual(item))}</span><span class="badge-km">📍 ${escapeHTML(item.km || 0)} KM</span></div>
            <p><strong>${escapeHTML(item.servico || 'Sem descrição')}</strong></p>
          </div>
          <div class="historico-header-right"><strong>${moeda(total)}</strong><span id="seta-${index}">ver detalhes ▼</span></div>
        </div>
        <div class="historico-body history-detail-grid" id="historico-${index}">
          <section class="history-detail-block history-description-block">
            <small>Serviço</small>
            <p>${escapeHTML(item.servico || 'Sem descrição')}</p>
          </section>
          <section class="history-detail-block">
            <small>Peças e componentes</small>
            <div class="history-parts-list">${pecasHTML}</div>
          </section>
          <section class="history-detail-block history-payment-block">
            <small>Pagamento</small>
            <div class="history-payment-grid">
              <div><span>OS</span><strong>${escapeHTML(numeroOSVisual(item))}</strong></div>
              <div><span>Situação</span><strong><span class="status-${escapeHTML(status)}">${escapeHTML(status.toUpperCase())}</span></strong></div>
              <div><span>Total</span><strong>${moeda(total)}</strong></div>
              <div><span>Pago</span><strong>${moeda(pago)}</strong></div>
              <div class="history-restante"><span>Restante</span><strong style="color:${restante > 0 ? '#ef4444' : 'inherit'}">${moeda(restante)}</strong></div>
              <div><span>Forma</span><strong>${escapeHTML(item.forma_pagamento || '-')}</strong></div>
            </div>
          </section>
        </div>`;
      const acoes = document.createElement('div');
      acoes.className = 'historico-acoes';

      const btnPdf = document.createElement('button');
      btnPdf.className = 'btn-secondary btn-pdf-historico';
      btnPdf.type = 'button';
      btnPdf.textContent = '📄 Gerar PDF / OS';
      btnPdf.addEventListener('click', () => gerarPDFHistorico(item));
      acoes.appendChild(btnPdf);

      if (status !== 'pago') {
        const btn = document.createElement('button');
        btn.className = 'btn-receber';
        btn.type = 'button';
        btn.textContent = '💰 Receber Pagamento';
        btn.addEventListener('click', () => receberPagamento(item.id, restante, item.placa));
        acoes.appendChild(btn);
      }

      el.appendChild(acoes);
      historico.appendChild(el);
    });
  } catch (err) { console.error(err); mostrarStatus('Erro ao carregar histórico', 'erro'); }
}
function toggleHistorico(index) {
  const body = $(`historico-${index}`), seta = $(`seta-${index}`);
  if (!body) return;
  const aberto = body.style.display === 'block' || body.classList.contains('active');
  body.style.display = aberto ? 'none' : 'block';
  body.classList.toggle('active', !aberto);
  if (seta) seta.textContent = aberto ? 'ver detalhes ▼' : 'fechar ▲';
}


function dataBRParaDate(valor = '') {
  const texto = String(valor || '').trim();
  let m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  m = texto.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

function dataLocalISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function selecionarFiltroArquivo(filtro = 'todos') {
  document.querySelectorAll('.servico-filter[data-servico-filtro]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.servicoFiltro === filtro);
  });
}

function limparPeriodoArquivo({ renderizar = true } = {}) {
  state.arquivoPeriodo = { tipo: null, mes: '', ano: '', inicio: '', fim: '', resumo: '' };
  const resumo = $('arquivo-periodo-resumo');
  if (resumo) { resumo.hidden = true; resumo.textContent = ''; }
  if ($('arquivo-periodo-mes')) $('arquivo-periodo-mes').value = '';
  if ($('arquivo-periodo-ano')) $('arquivo-periodo-ano').value = '';
  if ($('arquivo-periodo-inicio')) $('arquivo-periodo-inicio').value = '';
  if ($('arquivo-periodo-fim')) $('arquivo-periodo-fim').value = '';
  if (renderizar) renderizarServicosGlobais();
}

function aplicarTipoPeriodoArquivo(tipo = 'mes') {
  document.querySelectorAll('.arquivo-periodo-tipo').forEach((btn) => btn.classList.toggle('active', btn.dataset.periodoTipo === tipo));
  document.querySelectorAll('[data-periodo-campo]').forEach((el) => {
    const campo = el.dataset.periodoCampo;
    const mostrar = (tipo === 'mes' && campo === 'mes') || (tipo === 'ano' && campo === 'ano') || (tipo === 'personalizado' && (campo === 'inicio' || campo === 'fim'));
    el.hidden = !mostrar;
  });
}

function aplicarPeriodoArquivo() {
  const tipo = document.querySelector('.arquivo-periodo-tipo.active')?.dataset.periodoTipo || 'mes';
  let filtro = { tipo, mes: '', ano: '', inicio: '', fim: '', resumo: '' };
  if (tipo === 'mes') {
    filtro.mes = $('arquivo-periodo-mes')?.value || '';
    if (!filtro.mes) return mostrarStatus('Selecione um mês para filtrar o Arquivo', 'alerta');
    const [ano, mes] = filtro.mes.split('-');
    filtro.resumo = `Período: ${mes}/${ano}`;
  } else if (tipo === 'ano') {
    filtro.ano = String($('arquivo-periodo-ano')?.value || '').trim();
    if (!/^\d{4}$/.test(filtro.ano)) return mostrarStatus('Informe um ano válido', 'alerta');
    filtro.resumo = `Período: ${filtro.ano}`;
  } else {
    filtro.inicio = $('arquivo-periodo-inicio')?.value || '';
    filtro.fim = $('arquivo-periodo-fim')?.value || '';
    if (!filtro.inicio || !filtro.fim) return mostrarStatus('Informe data inicial e final', 'alerta');
    if (filtro.inicio > filtro.fim) return mostrarStatus('A data inicial não pode ser maior que a final', 'alerta');
    filtro.resumo = `Período: ${filtro.inicio.split('-').reverse().join('/')} até ${filtro.fim.split('-').reverse().join('/')}`;
  }
  state.arquivoPeriodo = filtro;
  const resumo = $('arquivo-periodo-resumo');
  if (resumo) { resumo.hidden = false; resumo.textContent = filtro.resumo; }
  selecionarFiltroArquivo('todos');
  renderizarServicosGlobais();
}

function servicoPassaPeriodoArquivo(item) {
  const filtro = state.arquivoPeriodo || {};
  if (!filtro.tipo) return true;
  const data = dataBRParaDate(item.data);
  if (!data) return false;
  if (filtro.tipo === 'mes') {
    const [ano, mes] = String(filtro.mes || '').split('-').map(Number);
    return data.getFullYear() === ano && data.getMonth() === mes - 1;
  }
  if (filtro.tipo === 'ano') return data.getFullYear() === Number(filtro.ano);
  const iso = dataLocalISO(data);
  return iso >= filtro.inicio && iso <= filtro.fim;
}

function servicoPassaFiltroRapido(item, filtro) {
  if (!filtro || filtro === 'todos') return true;
  const status = String(item.status_pagamento || '').toLowerCase();
  if (filtro === 'pendentes') return status !== 'pago';
  if (filtro === 'pagos') return status === 'pago';

  const data = dataBRParaDate(item.data);
  if (!data) return false;
  const hoje = new Date();
  if (filtro === 'hoje') {
    return data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth() && data.getDate() === hoje.getDate();
  }
  if (filtro === 'mes') {
    return data.getFullYear() === hoje.getFullYear() && data.getMonth() === hoje.getMonth();
  }
  return true;
}

function termoServicoGlobal(item) {
  let pecasTexto = '';
  try { pecasTexto = JSON.parse(item.pecas_trocadas || '[]').map((p) => p.nome).join(' '); } catch (_) {}
  return [
    item.numero_os,
    item.placa,
    item.nome_cliente,
    item.telefone_cliente,
    item.ddi_cliente,
    item.ddd_cliente,
    item.telefone_numero,
    item.modelo,
    item.ano,
    item.cor,
    item.combustivel,
    item.servico,
    pecasTexto,
    item.forma_pagamento,
    item.status_pagamento,
  ].filter(Boolean).join(' ').toLowerCase();
}

async function carregarServicosGlobais(mostrarErro = true) {
  const container = $('lista-servicos-global');
  if (!container) return;
  try {
    state.servicosCache = await api.listarServicos();
    renderizarServicosGlobais();
  } catch (err) {
    console.error(err);
    if (mostrarErro) mostrarStatus('Erro ao carregar Arquivo de Serviços', 'erro');
  }
}

function renderizarServicosGlobais() {
  const container = $('lista-servicos-global');
  if (!container) return;

  const termo = String($('busca_servicos')?.value || '').trim().toLowerCase();
  const filtro = document.querySelector('.servico-filter.active')?.dataset.servicoFiltro || 'todos';
  const itens = (state.servicosCache || []).filter((item) => {
    const passaTermo = !termo || termoServicoGlobal(item).includes(termo);
    return passaTermo && servicoPassaFiltroRapido(item, filtro) && servicoPassaPeriodoArquivo(item);
  });

  container.innerHTML = '';
  if (!itens.length) {
    container.innerHTML = '<div class="servico-item arquivo-empty">Nenhum serviço encontrado no Arquivo.</div>';
    return;
  }

  itens.forEach((item, index) => {
    const total = numero(item.valor_total);
    const pago = numero(item.valor_pago);
    const mao = numero(item.valor_maodeobra);
    const pecasTotal = numero(item.valor_pecas);
    const restante = Math.max(0, total - pago);
    const status = item.status_pagamento || 'pendente';
    let pecasHTML = 'Nenhuma peça';
    try {
      const pecas = JSON.parse(item.pecas_trocadas || '[]');
      if (pecas.length) pecasHTML = pecas.map((p) => `<div class="historico-peca"><span>${escapeHTML(p.nome)}</span><strong>${moeda(p.valor)}</strong></div>`).join('');
    } catch (_) {}

    const el = document.createElement('article');
    el.className = 'arquivo-card servico-item';
    el.dataset.id = item.id;
    el.innerHTML = `
      <div class="arquivo-card-header arquivo-compact-header">
        <div class="arquivo-main-info">
          <div class="history-meta-line"><span>${escapeHTML(item.data || '-')}</span><span class="badge-km">${escapeHTML(numeroOSVisual(item))}</span><span class="mini-plate">${escapeHTML(item.placa || '-')}</span></div>
          <h3>${escapeHTML(item.nome_cliente || 'Cliente não informado')}</h3>
          <p>${escapeHTML([item.modelo, item.ano, item.cor].filter(Boolean).join(' • ') || 'Veículo sem detalhes')}</p>
          <p class="arquivo-servico-resumo">${escapeHTML(item.servico || 'Serviço sem descrição')}</p>
        </div>
        <div class="arquivo-card-right">
          <strong>${moeda(total)}</strong>
          <small class="history-restante">Restante: ${moeda(restante)}</small>
          <span class="status-${escapeHTML(status)}">${escapeHTML(status.toUpperCase())}</span>
        </div>
      </div>
      <div class="arquivo-details history-detail-grid" id="arquivo-detalhe-${index}" hidden>
        <section class="history-detail-block history-description-block">
          <small>Cliente e veículo</small>
          <div class="history-payment-grid">
            <div><span>Cliente</span><strong>${escapeHTML(item.nome_cliente || '-')}</strong></div>
            <div><span>Telefone</span><strong>${escapeHTML(formatarTelefoneExibicao(item) || '-')}</strong></div>
            <div><span>Placa</span><strong>${escapeHTML(item.placa || '-')}</strong></div>
            <div><span>Modelo</span><strong>${escapeHTML([item.modelo, item.ano].filter(Boolean).join(' • ') || '-')}</strong></div>
            <div><span>Cor</span><strong>${escapeHTML(item.cor || '-')}</strong></div>
            <div><span>Combustível</span><strong>${escapeHTML(item.combustivel || 'Não informado')}</strong></div>
            <div><span>KM</span><strong>${escapeHTML(item.km || '-')}</strong></div>
            <div><span>OS</span><strong>${escapeHTML(numeroOSVisual(item))}</strong></div>
          </div>
        </section>
        <section class="history-detail-block history-description-block"><small>Serviço</small><p>${escapeHTML(item.servico || 'Sem descrição')}</p></section>
        <section class="history-detail-block"><small>Peças e componentes</small><div class="history-parts-list">${pecasHTML}</div></section>
        <section class="history-detail-block history-payment-block"><small>Pagamento</small><div class="history-payment-grid"><div><span>Mão de obra</span><strong>${moeda(mao)}</strong></div><div><span>Peças</span><strong>${moeda(pecasTotal)}</strong></div><div><span>Total</span><strong>${moeda(total)}</strong></div><div><span>Pago</span><strong>${moeda(pago)}</strong></div><div class="history-restante"><span>Restante</span><strong>${moeda(restante)}</strong></div><div><span>Forma</span><strong>${escapeHTML(item.forma_pagamento || '-')}</strong></div><div><span>Situação</span><strong><span class="status-${escapeHTML(status)}">${escapeHTML(status.toUpperCase())}</span></strong></div></div></section>
      </div>
      <div class="historico-acoes arquivo-acoes">
        <button type="button" class="btn-secondary arquivo-toggle">Ver detalhes</button>
        <button type="button" class="btn-secondary btn-pdf-historico arquivo-pdf">PDF da OS</button>
        ${status !== 'pago' ? '<button type="button" class="btn-receber arquivo-receber">Receber pagamento</button>' : ''}
        <button type="button" class="btn-secondary arquivo-abrir-veiculo">Abrir veículo</button>
      </div>
    `;

    el.querySelector('.arquivo-toggle')?.addEventListener('click', () => {
      const detail = el.querySelector(`#arquivo-detalhe-${index}`);
      if (!detail) return;
      detail.hidden = !detail.hidden;
      el.querySelector('.arquivo-toggle').textContent = detail.hidden ? 'Ver detalhes' : 'Fechar detalhes';
    });
    el.querySelector('.arquivo-pdf')?.addEventListener('click', () => gerarPDFHistorico(item));
    el.querySelector('.arquivo-receber')?.addEventListener('click', () => receberPagamento(item.id, restante, item.numero_os || item.placa));
    el.querySelector('.arquivo-abrir-veiculo')?.addEventListener('click', () => abrirPendencia(item.id, item.placa));
    container.appendChild(el);
  });
}

async function carregarPendentes() {
  const container = $('lista-pendentes');
  if (!container) return;
  try {
    const pendentes = await api.listarPendentes();
    container.innerHTML = '';
    if (!pendentes.length) { container.innerHTML = '<div class="servico-item" style="padding:20px;text-align:center">🎉 Nenhuma pendência encontrada!</div>'; return; }
    pendentes.forEach((item) => {
      const total = numero(item.valor_total), pago = numero(item.valor_pago), restante = Math.max(0, total - pago);
      const el = document.createElement('div');
      el.className = 'pendencia-card pendencia-click highlight-pendente';
      el.innerHTML = `
        <div class="pendencia-card-top">
          <span class="mini-plate">${escapeHTML(item.placa || '-')}</span>
          <span class="pendencia-date">${escapeHTML(item.data || '')} • ${escapeHTML(numeroOSVisual(item))}</span>
        </div>
        <div class="pendencia-client-line">
          <strong>${escapeHTML(item.nome_cliente || 'Cliente não informado')}</strong>
          <span>${escapeHTML([item.modelo, item.ano, item.cor].filter(Boolean).join(' • ') || 'Veículo sem detalhes')}</span>
        </div>
        <p class="pendencia-servico">${escapeHTML(item.servico || 'Serviço sem descrição')}</p>
        <div class="pendencia-values">
          <div><small>Total</small><strong>${moeda(total)}</strong></div>
          <div><small>Pago</small><strong>${moeda(pago)}</strong></div>
          <div class="pendencia-restante"><small>Falta pagar</small><strong>${moeda(restante)}</strong></div>
        </div>
        <div class="pendencia-actions-row">
          <span>${escapeHTML(formatarTelefoneExibicao(item))}</span>
          <button type="button" class="btn-receber pendencia-receber">Receber pagamento</button>
        </div>
        <small class="pendencia-open-hint">Clique no card para abrir no histórico do veículo.</small>`;
      el.addEventListener('click', () => abrirPendencia(item.id, item.placa));
      el.querySelector('.pendencia-receber')?.addEventListener('click', (e) => {
        e.stopPropagation();
        receberPagamento(item.id, restante, item.placa);
      });
      container.appendChild(el);
    });
  } catch (err) { console.error(err); mostrarStatus('Erro ao carregar pendências', 'erro'); }
}
function receberPagamento(id, restante, identificador) {
  state.recebimentoAtual = { id, restante };
  $('modal-info-cliente').innerText = `Receber de: ${identificador} • Restante: ${moeda(restante)}`;
  $('modal-valor').value = Number(restante || 0).toFixed(2);
  if ($('modal-recebimento-aviso')) $('modal-recebimento-aviso').innerText = `Não é permitido receber acima de ${moeda(restante)}.`;
  $('modal-recebimento').classList.add('active');
  setTimeout(() => $('modal-valor')?.select(), 100);
}
function fecharModalRecebimento() { $('modal-recebimento').classList.remove('active'); if ($('modal-recebimento-aviso')) $('modal-recebimento-aviso').innerText = ''; state.recebimentoAtual = null; }
async function confirmarRecebimento() {
  const valor = numero($('modal-valor').value);
  const id = state.recebimentoAtual?.id;
  const restante = numero(state.recebimentoAtual?.restante);

  if (!id || valor <= 0) return mostrarStatus('Dados inválidos para recebimento', 'alerta');
  if (valor > restante) {
    $('modal-valor').value = restante.toFixed(2);
    $('modal-recebimento-aviso').innerText = `O valor máximo para esta OS é ${moeda(restante)}.`;
    return mostrarStatus('Pagamento maior que o restante da OS', 'alerta');
  }

  try {
    await api.receberPagamento(id, valor);
    fecharModalRecebimento();
    await carregarPendentes();
    if (state.veiculoAtual?.placa) await carregarHistorico(state.veiculoAtual.placa);
    await carregarServicosGlobais(false);
    await atualizarFinanceiro();
    mostrarStatus(`Pagamento de ${moeda(valor)} registrado`, 'sucesso');
  } catch (err) { console.error(err); mostrarStatus(err.message || 'Erro ao receber pagamento', 'erro'); }
}
async function abrirPendencia(id, placa) {
  try {
    const data = await api.buscarVeiculo(placa);
    abrirVeiculo(data); trocarSecao('oficina'); trocarAba('historico');
    setTimeout(() => {
      const el = document.querySelector(`.servico-item[data-id="${id}"]`);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.border = '2px solid var(--accent-primary)'; }
    }, 400);
  } catch (err) { console.error(err); mostrarStatus('Erro ao abrir pendência', 'erro'); }
}

function renderizarBotoesAtalho() {
  const container = $('botoes-atalho-container');
  if (!container) return;

  container.innerHTML = '';
  state.atalhos.forEach((texto, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'atalho-wrapper';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-atalho';
    btn.textContent = texto;
    btn.addEventListener('click', () => servicoRapido(texto));

    const x = document.createElement('span');
    x.className = 'btn-remover-atalho';
    x.textContent = '×';
    x.title = `Remover atalho ${texto}`;
    x.addEventListener('click', (event) => {
      event.stopPropagation();
      removerAtalho(i);
    });

    wrap.append(btn, x);
    container.appendChild(wrap);
  });

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn-adicionar-atalho';
  add.textContent = '+ Novo';
  add.addEventListener('click', abrirModalNovoAtalho);
  container.appendChild(add);
}

function abrirModalNovoAtalho() {
  const modal = $('modal-novo-atalho');
  const input = $('modal-atalho-nome');
  if (!modal || !input) return;
  input.value = '';
  modal.classList.add('active');
  setTimeout(() => input.focus(), 80);
}
function fecharModalNovoAtalho() {
  $('modal-novo-atalho')?.classList.remove('active');
}
function confirmarNovoAtalho() {
  const input = $('modal-atalho-nome');
  const novo = input?.value.trim();
  if (!novo) return mostrarStatus('Digite o nome do atalho', 'alerta');
  const existe = state.atalhos.some((a) => a.toLowerCase() === novo.toLowerCase());
  if (existe) return mostrarStatus('Esse atalho já existe', 'alerta');
  state.atalhos.push(novo);
  salvarAtalhos();
  renderizarBotoesAtalho();
  fecharModalNovoAtalho();
  mostrarStatus('Atalho adicionado', 'sucesso');
}
function removerAtalho(index) { state.atalhos.splice(index, 1); salvarAtalhos(); renderizarBotoesAtalho(); mostrarStatus('Atalho removido', 'sucesso'); }
function servicoRapido(texto) {
  const campo = $('servico'); if (!campo) return;
  const atual = campo.value.trim();
  campo.value = atual ? `${atual}${atual.endsWith(',') ? ' ' : ', '}${texto}` : texto;
  campo.focus(); autoSalvarRascunho();
}

async function carregarClientes() {
  try { state.clientesCache = await api.listarVeiculos(); renderizarTabelaClientes(state.clientesCache); }
  catch (err) { console.error(err); mostrarStatus('Não foi possível carregar clientes', 'erro'); }
}
function renderizarTabelaClientes(lista) {
  const tbody = $('lista-clientes');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!lista.length) {
    const tr = document.createElement('tr');
    tr.className = 'cliente-row empty-row';
    tr.innerHTML = `<td data-label="Resultado" colspan="10">Nenhum cliente encontrado.</td>`;
    tbody.appendChild(tr);
    return;
  }

  const labels = ['Cliente', 'Placa', 'Modelo', 'Cor', 'Combustível', 'Ano', 'KM', 'Última visita', 'Perfil', 'Telefone'];

  lista.forEach((c) => {
    const tr = document.createElement('tr');
    tr.className = 'cliente-row';
    const valores = [
      `<strong>${escapeHTML(c.nome_cliente || '-')}</strong>`,
      `<span class="table-plate">${escapeHTML(c.placa || '-')}</span>`,
      escapeHTML(c.modelo || '-'),
      escapeHTML(c.cor || '-'),
      escapeHTML(c.combustivel || 'Não informado'),
      escapeHTML(c.ano || '-'),
      `${escapeHTML(c.km_atual || 0)} km`,
      escapeHTML(c.data_ultimo_servico || 'Sem registro'),
      escapeHTML(c.perfil_tecnico || '-'),
      escapeHTML(formatarTelefoneExibicao(c)),
    ];
    tr.innerHTML = valores.map((valor, index) => `<td data-label="${labels[index]}">${valor}</td>`).join('');
    tr.addEventListener('click', () => abrirCliente(c.placa));
    tbody.appendChild(tr);
  });
}
function ordenarClientes(coluna) {
  if (state.colunaAtual === coluna) state.ordemCrescente = !state.ordemCrescente; else { state.colunaAtual = coluna; state.ordemCrescente = true; }
  const lista = [...state.clientesCache].sort((a,b) => {
    let r = 0;
    if (coluna === 'ano' || coluna === 'km_atual') r = (parseInt(a[coluna])||0) - (parseInt(b[coluna])||0);
    else if (coluna === 'data_ultimo_servico') r = new Date((a.data_ultimo_servico || '01/01/1970').split('/').reverse().join('-')) - new Date((b.data_ultimo_servico || '01/01/1970').split('/').reverse().join('-'));
    else r = String(a[coluna] || '').localeCompare(String(b[coluna] || ''), 'pt-BR');
    return state.ordemCrescente ? r : -r;
  });
  renderizarTabelaClientes(lista);
}
async function abrirCliente(placa) { try { abrirVeiculo(await api.buscarVeiculo(placa)); trocarSecao('oficina'); trocarAba('servico'); mostrarStatus('Cliente carregado', 'sucesso'); } catch (err) { console.error(err); mostrarStatus('Erro ao abrir cliente', 'erro'); } }

async function atualizarFinanceiro() {
  try {
    const data = await api.estatisticas(state.periodoAtual);
    const resumo = data.resumo || {};
    const formas = data.formas || {};
    const painel = data.painel || {};
    const recebido = numero(resumo.recebido);
    const faturado = numero(resumo.faturamento);
    const pendente = Math.max(0, numero(resumo.pendente ?? (faturado - recebido)));
    const dinheiro = numero(formas.dinheiro);
    const pix = numero(formas.pix);
    const cartao = numero(formas.cartao);
    const misto = numero(formas.misto);
    const digital = pix + cartao + misto;
    const servicos = Number(painel.servicos || 0);
    const ticket = numero(painel.ticket_medio);
    const pendentePct = Math.round(numero(painel.percentual_pendente));

    setText('dash-faturamento', moeda(faturado));
    setText('dash-recebido', moeda(recebido));
    setText('dash-recebido-detail', moeda(recebido));
    setText('dash-pendente', moeda(pendente));
    setText('dash-pendente-detail', moeda(pendente));
    setText('dash-dinheiro', moeda(dinheiro));
    setText('dash-dinheiro-detail', moeda(dinheiro));
    setText('dash-digital', moeda(digital));
    setText('dash-pix-detail', moeda(pix));
    setText('dash-cartao-detail', moeda(cartao + misto));
    setText('dash-ticket-medio', `Ticket médio ${moeda(ticket)}`);
    setText('dash-servicos', String(servicos));
    setText('dash-pendente-percent', `${pendentePct}% em aberto`);
    setText('finance-periodo-label', labelPeriodo(state.periodoAtual));

    renderizarPerformanceFinanceira(data.grafico || [], data.semanas || [], recebido, servicos);
    renderizarBarrasPagamento({ dinheiro, pix, cartao, misto }, recebido);
    renderizarInsightsFinanceiros({ recebido, faturado, pendente, dinheiro, pix, cartao, misto, digital, servicos, ticket, pendentePct, painel, grafico: data.grafico || [], semanas: data.semanas || [] });
  } catch (err) {
    console.error(err);
    mostrarStatus('Erro ao carregar dashboard financeiro', 'erro');
  }
}
function setText(id, value) { const el = $(id); if (el) el.innerText = value; }
function labelPeriodo(periodo) {
  if (periodo === 'diario') return 'Hoje';
  if (periodo === 'mensal') return 'Mês atual';
  return 'Semana atual';
}
function mudarPeriodo(periodo, botao) {
  state.periodoAtual = periodo;
  document.querySelectorAll('.btn-filtro').forEach((b)=>b.classList.remove('active'));
  botao?.classList.add('active');
  atualizarFinanceiro();
}
function renderizarPerformanceFinanceira(dias, semanas, totalRecebido = 0, totalServicos = 0) {
  const container = $('finance-performance-content');
  if (!container) return;
  const title = $('finance-performance-title');
  const subtitle = $('finance-performance-subtitle');
  const best = $('finance-best-label');

  if (state.periodoAtual === 'diario') {
    if (title) title.innerText = 'Resumo de hoje';
    if (subtitle) subtitle.innerText = 'Total feito no dia, métodos de pagamento e quantidade de OS.';
    const hoje = dias[dias.length - 1] || {};
    if (best) best.innerText = `${totalServicos || 0} OS hoje`;
    container.className = 'today-summary-grid';
    container.innerHTML = `
      <div class="today-summary-main"><span>Recebido hoje</span><strong>${moeda(totalRecebido)}</strong><small>${totalServicos || 0} OS fechadas</small></div>
      <div class="today-summary-item"><span>Faturado</span><strong>${moeda(numero(hoje.faturado))}</strong></div>
      <div class="today-summary-item"><span>Recebido</span><strong>${moeda(numero(hoje.recebido))}</strong></div>
      <div class="today-summary-item"><span>OS</span><strong>${Number(hoje.servicos || 0)}</strong></div>
    `;
    return;
  }

  if (state.periodoAtual === 'mensal') {
    if (title) title.innerText = 'Desempenho mensal por semana';
    if (subtitle) subtitle.innerText = 'Quanto a oficina fez em cada semana do mês.';
    container.className = 'week-performance-list';
    const maior = Math.max(...semanas.map((s)=>numero(s.recebido)), 1);
    const melhor = semanas.reduce((acc, item) => numero(item.recebido) > numero(acc.recebido || 0) ? item : acc, {});
    if (best) best.innerText = melhor.label ? `Melhor: ${melhor.label}` : 'Melhor semana: —';
    container.innerHTML = semanas.map((s) => {
      const recebido = numero(s.recebido);
      const pct = Math.max(3, Math.round((recebido / maior) * 100));
      return `<div class="week-row"><div><strong>${escapeHTML(s.label)}</strong><span>${Number(s.servicos || 0)} OS • ${moeda(numero(s.pendente))} pendente</span></div><div class="week-row-bar"><b style="width:${pct}%"></b></div><strong>${moeda(recebido)}</strong></div>`;
    }).join('') || `<div class="empty-finance">Sem dados no mês</div>`;
    return;
  }

  if (title) title.innerText = 'Desempenho semanal';
  if (subtitle) subtitle.innerText = 'Quanto entrou em cada dia da semana.';
  container.className = 'desktop-bars';
  const max = Math.max(...dias.map((d)=>numero(d.recebido)), 1);
  const melhor = dias.reduce((acc, item) => numero(item.recebido) > numero(acc.recebido || 0) ? item : acc, {});
  if (best) best.innerText = melhor.dia_curto ? `Melhor dia: ${melhor.dia_curto}` : 'Melhor dia: —';
  container.innerHTML = dias.map((d) => {
    const valor = numero(d.recebido);
    const pct = Math.max(6, Math.round((valor / max) * 100));
    return `<div class="desktop-bar-item"><div class="bar-value">${moeda(valor)}</div><div class="desktop-bar-track"><b style="height:${pct}%"></b></div><strong>${escapeHTML(d.dia_curto || d.dia || '')}</strong><span>${Number(d.servicos || 0)} OS</span></div>`;
  }).join('') || `<div class="empty-finance">Sem ganhos na semana</div>`;
}
function renderizarBarrasPagamento(formas, totalRecebido = 0) {
  const container = $('finance-payment-bars');
  if (!container) return;
  const total = Math.max(totalRecebido, 1);
  const itens = [
    ['Dinheiro', formas.dinheiro || 0],
    ['Pix', formas.pix || 0],
    ['Cartão/Máquina', (formas.cartao || 0) + (formas.misto || 0)],
  ];
  container.innerHTML = itens.map(([nome, valor]) => {
    const pct = Math.round((numero(valor) / total) * 100);
    return `<div class="payment-bar-row"><div><span>${nome}</span><strong>${moeda(valor)}</strong></div><div class="payment-track"><b style="width:${Math.min(100, pct)}%"></b></div><small>${pct}% do recebido</small></div>`;
  }).join('');
}
function renderizarInsightsFinanceiros(info) {
  const el = $('finance-insights');
  if (!el) return;
  const formaMaisUsada = [
    ['Dinheiro', info.dinheiro],
    ['Pix', info.pix],
    ['Cartão/Máquina', info.cartao + info.misto],
  ].sort((a,b)=>numero(b[1])-numero(a[1]))[0];
  const mediaDiaria = state.periodoAtual === 'mensal' ? info.recebido / 30 : state.periodoAtual === 'semanal' ? info.recebido / 7 : info.recebido;
  el.innerHTML = `
    <div><span>Forma mais usada</span><strong>${formaMaisUsada?.[0] || '—'}</strong></div>
    <div><span>Média diária recebida</span><strong>${moeda(mediaDiaria || 0)}</strong></div>
    <div><span>Ticket médio por OS</span><strong>${moeda(info.ticket || 0)}</strong></div>
    <div><span>Pendência do período</span><strong>${info.pendentePct || 0}%</strong></div>
  `;
}
function renderizarMiniGanhos() { /* legado removido */ }
function renderizarGrafico() { /* dashboard desktop não usa Chart.js */ }

function lerConfigOficinaDoFormulario() {
  return {
    nome: $('config-oficina-nome')?.value.trim() || '',
    subtitulo: $('config-oficina-subtitulo')?.value.trim() || '',
    telefone: $('config-oficina-telefone')?.value.trim() || '',
    cnpj: $('config-oficina-cnpj')?.value.trim() || '',
    rua: $('config-oficina-rua')?.value.trim() || '',
    bairro: $('config-oficina-bairro')?.value.trim() || '',
    cidade: $('config-oficina-cidade')?.value.trim() || '',
    cep: $('config-oficina-cep')?.value.trim() || '',
    servicosCabecalho: $('config-oficina-servicos')?.value.trim() || '',
  };
}

function preencherConfigOficina() {
  const cfg = state.configOficina || {};
  if ($('config-oficina-nome')) $('config-oficina-nome').value = cfg.nome || '';
  if ($('config-oficina-subtitulo')) $('config-oficina-subtitulo').value = cfg.subtitulo || '';
  if ($('config-oficina-telefone')) $('config-oficina-telefone').value = cfg.telefone || '';
  if ($('config-oficina-cnpj')) $('config-oficina-cnpj').value = cfg.cnpj || '';
  if ($('config-oficina-rua')) $('config-oficina-rua').value = cfg.rua || '';
  if ($('config-oficina-bairro')) $('config-oficina-bairro').value = cfg.bairro || '';
  if ($('config-oficina-cidade')) $('config-oficina-cidade').value = cfg.cidade || '';
  if ($('config-oficina-cep')) $('config-oficina-cep').value = cfg.cep || '';
  if ($('config-oficina-servicos')) $('config-oficina-servicos').value = cfg.servicosCabecalho || '';
  aplicarIdentidadeOficina();
}

function salvarConfigOficina() {
  state.configOficina = lerConfigOficinaDoFormulario();
  localStorage.setItem('config_oficina', JSON.stringify(state.configOficina));
  const status = $('config-oficina-status');
  if (status) status.textContent = 'Informações salvas. Elas serão usadas nas próximas OS em PDF.';
  aplicarIdentidadeOficina();
  mostrarStatus('Configurações da oficina salvas', 'sucesso');
}


function aplicarIdentidadeOficina() {
  const cfg = state.configOficina || {};
  const nome = cfg.nome || 'Oficina';
  const subtitulo = cfg.subtitulo || 'Sistema local';
  const sidebarNome = $('sidebar-oficina-nome');
  const sidebarSubtitulo = $('sidebar-oficina-subtitulo');
  if (sidebarNome) sidebarNome.textContent = nome;
  if (sidebarSubtitulo) sidebarSubtitulo.textContent = subtitulo;
  aplicarLogoInterface();
}

function renderLogoMarkup(classe = 'logo-img') {
  if (state.logoOficina?.exists && state.logoOficina?.url) {
    return `<img class="${classe}" src="${state.logoOficina.url}" alt="Logo da oficina" />`;
  }
  const cfg = state.configOficina || {};
  return `<span class="logo-text-fallback"><strong>${escapeHTML(cfg.nome || 'Oficina')}</strong><small>${escapeHTML(cfg.subtitulo || 'Sistema local')}</small></span>`;
}

function aplicarLogoInterface() {
  const previewSidebar = $('sidebar-logo-preview');
  const previewConfig = $('config-logo-preview');
  const status = $('config-logo-status');
  const markupSidebar = renderLogoMarkup('sidebar-logo-img');
  const markupConfig = renderLogoMarkup('config-logo-img');
  if (previewSidebar) previewSidebar.innerHTML = markupSidebar;
  if (previewConfig) previewConfig.innerHTML = markupConfig;
  if (status) {
    status.textContent = state.logoOficina?.exists
      ? 'Logo carregada. Ela será usada na sidebar e na próxima OS em PDF.'
      : 'Nenhuma logo enviada. A OS usará o nome da oficina como fallback.';
  }
}

async function carregarLogoOficina() {
  try {
    const data = await api.consultarLogo();
    state.logoOficina = data || { exists: false, url: null };
  } catch (err) {
    console.error(err);
    state.logoOficina = { exists: false, url: null };
  }
  aplicarLogoInterface();
}

async function enviarLogoOficina() {
  const input = $('config-logo-input');
  const arquivo = input?.files?.[0];
  if (!arquivo) return mostrarStatus('Selecione uma imagem de logo primeiro', 'alerta');
  const tipos = ['image/png', 'image/jpeg', 'image/webp'];
  if (!tipos.includes(arquivo.type)) return mostrarStatus('Use PNG, JPG/JPEG ou WEBP', 'alerta');
  if (arquivo.size > 2 * 1024 * 1024) return mostrarStatus('A logo deve ter no máximo 2MB', 'alerta');
  try {
    const data = await api.enviarLogo(arquivo);
    state.logoOficina = data || { exists: false, url: null };
    if (input) input.value = '';
    aplicarLogoInterface();
    mostrarStatus('Logo da oficina atualizada', 'sucesso');
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao enviar logo', 'erro');
  }
}

async function removerLogoOficina() {
  try {
    await api.removerLogo();
    state.logoOficina = { exists: false, url: null };
    aplicarLogoInterface();
    mostrarStatus('Logo removida', 'sucesso');
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao remover logo', 'erro');
  }
}

async function carregarStatusBackup() {
  const ultimo = $('backup-ultimo');
  const pasta = $('backup-pasta');
  try {
    const data = await api.statusBackup();
    if (pasta) pasta.textContent = `Pasta: ${data.backup_dir || 'backups/'}`;
    if (ultimo) {
      if (data.last_backup) {
        const dt = new Date(data.last_backup.created_at);
        const quando = Number.isNaN(dt.getTime()) ? data.last_backup.created_at : dt.toLocaleString('pt-BR');
        ultimo.textContent = `${data.last_backup.file} • ${quando}`;
      } else {
        ultimo.textContent = 'Nenhum backup encontrado';
      }
    }
  } catch (err) {
    console.error(err);
    if (ultimo) ultimo.textContent = 'Não foi possível consultar backup';
  }
}

async function fazerBackupAgora() {
  const btn = $('btn-fazer-backup');
  const textoOriginal = btn?.textContent;
  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Fazendo backup...';
    }
    const data = await api.fazerBackup();
    mostrarStatus('Backup criado com sucesso', 'sucesso');
    await carregarStatusBackup();
    await carregarUltimosErros();
    const ultimo = $('backup-ultimo');
    if (ultimo && data.backup?.file) ultimo.textContent = data.backup.file;
  } catch (err) {
    console.error(err);
    mostrarStatus(err.message || 'Erro ao criar backup', 'erro');
    await carregarUltimosErros();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = textoOriginal || 'Fazer backup agora';
    }
  }
}

async function carregarUltimosErros() {
  const lista = $('lista-ultimos-erros');
  if (!lista) return;
  try {
    const data = await api.ultimosErros();
    const erros = Array.isArray(data.errors) ? data.errors : [];
    if (!erros.length) {
      lista.innerHTML = '<div class="empty-log">Nenhum erro registrado.</div>';
      return;
    }
    lista.innerHTML = erros.slice(0, 8).map((erro) => {
      const dataErro = erro.ts ? new Date(erro.ts).toLocaleString('pt-BR') : '-';
      return `<div class="log-item"><strong>${escapeHTML(dataErro)}</strong><span>${escapeHTML(erro.message || 'Erro')}</span></div>`;
    }).join('');
  } catch (err) {
    console.error(err);
    lista.innerHTML = '<div class="empty-log">Não foi possível carregar os erros.</div>';
  }
}

function abrirWhatsRapido() {
  if (!state.veiculoAtual) return mostrarStatus('Nenhum veículo carregado', 'alerta');
  const tel = telefoneWhatsapp(state.veiculoAtual);
  if (!tel) return mostrarStatus('Telefone não encontrado', 'alerta');
  window.open(`https://wa.me/${tel}`, '_blank');
}

function normalizarPecasPDF(pecasInput = state.listaPecas) {
  if (Array.isArray(pecasInput)) return pecasInput;
  try {
    const parsed = JSON.parse(pecasInput || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function linhasPecasParaPDF(pecasInput = state.listaPecas, minimoLinhas = 10) {
  const linhas = [...normalizarPecasPDF(pecasInput)];
  while (linhas.length < minimoLinhas) linhas.push({ nome: '', valor: '' });
  return linhas.slice(0, Math.max(minimoLinhas, linhas.length)).map((p) => `
    <tr>
      <td class="os-qtd">${p.nome ? '1' : '&nbsp;'}</td>
      <td>${escapeHTML(p.nome || '')}</td>
      <td class="os-valor">${p.nome ? moeda(p.valor) : ''}</td>
    </tr>
  `).join('');
}

function servicosCabecalhoPDF() {
  const cfg = state.configOficina || {};
  const linhas = String(cfg.servicosCabecalho || '')
    .split('\n')
    .map((linha) => linha.trim())
    .filter(Boolean);
  const fallback = ['Mecânica geral', 'Revisões', 'Freios', 'Suspensão', 'Injeção eletrônica'];
  return (linhas.length ? linhas : fallback)
    .slice(0, 8)
    .map((item) => `<li>${escapeHTML(item)}</li>`)
    .join('');
}

function numeroOSAtual() {
  return numeroOSVisual(state.osAtual || state.ordemServicoAtual || null);
}

function numeroOrcamentoVisual() {
  return 'ORÇAMENTO / PRÉVIA\nSem número definitivo';
}

function numeroOSDocumento(item = null, finalizado = false) {
  const numero = item?.numero_os || item?.numeroOS || '';
  if (numero) return `OS Nº ${numero}`;
  if (finalizado && item?.id) return `OS Nº #${String(item.id).padStart(6, '0')}`;
  return 'ORÇAMENTO / PRÉVIA';
}

function tituloDocumentoOS(item = null, finalizado = false) {
  const numero = item?.numero_os || item?.numeroOS || '';
  if (finalizado || numero) return 'ORDEM DE SERVIÇO';
  return 'ORÇAMENTO / PRÉVIA';
}

function subtituloDocumentoOS(item = null, finalizado = false) {
  const numero = item?.numero_os || item?.numeroOS || '';
  if (numero) return `OS Nº ${numero}`;
  if (finalizado && item?.id) return `OS Nº #${String(item.id).padStart(6, '0')}`;
  return 'Prévia sem número definitivo';
}

function logoPDFMarkup() {
  const cfg = state.configOficina || {};
  if (state.logoOficina?.exists && state.logoOficina?.url) {
    const logoUrl = new URL(state.logoOficina.url, window.location.origin).href;
    return `<img class="os-logo-img" src="${logoUrl}" alt="Logo da oficina" />`;
  }
  return `<div class="os-logo-text"><strong>${escapeHTML(cfg.nome || 'OFICINA')}</strong><small>${escapeHTML(cfg.subtitulo || 'Mecânica Multimarcas')}</small></div>`;
}

function abrirDocumentoOSPDF({ veiculo, servicoItem, pecas, finalizado = false }) {
  const totalPecas = numero(servicoItem.valor_pecas);
  const mao = numero(servicoItem.valor_maodeobra);
  const total = numero(servicoItem.valor_total);
  const pago = numero(servicoItem.valor_pago);
  const restante = Math.max(0, total - pago);
  const dataAgora = new Date();
  const dataAtual = servicoItem.data || dataAgora.toLocaleDateString('pt-BR');
  const horaAtual = dataAgora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const servico = String(servicoItem.servico || '').trim();
  const cfg = state.configOficina || {};
  const endereco = [cfg.rua, cfg.bairro].filter(Boolean).join(' • ');
  const cidadeCep = [cfg.cidade, cfg.cep ? `CEP: ${cfg.cep}` : ''].filter(Boolean).join(' • ');
  const docInfo = [cfg.cnpj ? `CNPJ: ${cfg.cnpj}` : '', cfg.telefone ? `Fone: ${cfg.telefone}` : ''].filter(Boolean).join(' • ');
  const numeroDocumento = numeroOSDocumento(servicoItem, finalizado);
  const tituloDocumento = tituloDocumentoOS(servicoItem, finalizado);
  const subtituloDocumento = subtituloDocumentoOS(servicoItem, finalizado);
  const formaPagamento = servicoItem.forma_pagamento || getFormaPagamento();
  const km = servicoItem.km || $('km')?.value || veiculo?.km_atual || '';
  const numeroLimpo = String(numeroDocumento || '').replace(/^OS Nº\s*/, '');
  const campoDocumentoCliente = (finalizado || servicoItem.numero_os)
    ? `<div class="os-field"><span class="os-label">OS Nº</span>${escapeHTML(numeroLimpo)}</div>`
    : `<div class="os-field"><span class="os-label">Documento</span>Prévia sem número definitivo</div>`;

  const win = window.open('', '_blank', 'width=900,height=1100');
  if (!win) return mostrarStatus('Permita pop-ups para gerar a OS', 'alerta');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHTML(tituloDocumento)} - ${escapeHTML(veiculo?.placa || '')}</title>
  <style>
    :root { --ink:#111827; --line:#111827; --muted:#4b5563; --paper:#fff; --soft:#f3f4f6; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #e5e7eb; color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
    .os-page { width: 210mm; min-height: 297mm; margin: 0 auto; padding: 10mm; background: var(--paper); }
    .os-frame { border: 2px solid var(--line); }
    .os-top { display: grid; grid-template-columns: 1.35fr .95fr; border-bottom: 2px solid var(--line); }
    .os-brand { padding: 12px 14px; border-right: 2px solid var(--line); min-height: 126px; }
    .os-logo-wrap { min-height: 58px; display:flex; align-items:center; gap: 10px; }
    .os-logo-img { max-width: 220px; max-height: 58px; object-fit: contain; display:block; }
    .os-logo-text strong { display:block; font-size: 27px; font-weight: 900; letter-spacing: .4px; line-height: 1; }
    .os-logo-text small { display:block; margin-top:4px; font-size: 12px; font-weight: 700; color: var(--muted); }
    .os-company { margin-top: 10px; font-size: 12px; line-height: 1.35; }
    .os-title { padding: 12px 14px; }
    .os-title h1 { margin: 0 0 5px; font-size: 22px; text-align: center; letter-spacing:.4px; }
    .os-number { text-align:center; font-size: 13px; font-weight: 900; margin-bottom: 4px; }
    .os-date { text-align:center; font-size: 11px; font-weight: 700; color: var(--muted); margin-bottom: 7px; }
    .os-title ul { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.35; }
    .os-line-grid { display: grid; grid-template-columns: 1.25fr .85fr; }
    .os-field { min-height: 34px; padding: 5px 8px; border-bottom: 2px solid var(--line); border-right: 2px solid var(--line); font-size: 13px; }
    .os-field:nth-child(2n) { border-right: 0; }
    .os-label { font-weight: 800; font-size: 10px; text-transform: uppercase; color: var(--muted); margin-right: 6px; }
    .os-car-grid { display: grid; grid-template-columns: 1fr 1fr 1fr .75fr; }
    .os-car-grid .os-field { border-right: 2px solid var(--line); }
    .os-car-grid .os-field:nth-child(4n) { border-right: 0; }
    .os-section-title { border-bottom: 2px solid var(--line); padding: 7px; text-align:center; font-weight: 900; letter-spacing:.5px; background: var(--soft); }
    table { width: 100%; border-collapse: collapse; }
    .os-table th, .os-table td { border-bottom: 1px solid var(--line); border-right: 1px solid var(--line); height: 28px; padding: 4px 6px; font-size: 13px; }
    .os-table th { background: var(--soft); font-size: 11px; text-transform: uppercase; }
    .os-table th:last-child, .os-table td:last-child { border-right: 0; }
    .os-qtd { width: 38px; text-align:center; }
    .os-valor { width: 98px; text-align:right; }
    .os-service-text { white-space: pre-wrap; line-height: 1.35; }
    .os-bottom { display: grid; grid-template-columns: 1.85fr .9fr; border-top: 2px solid var(--line); }
    .os-obs { min-height: 150px; padding: 8px; border-right: 2px solid var(--line); }
    .os-auth { margin-top: 28px; font-size: 11px; line-height: 1.4; max-width: 92%; }
    .os-sign { margin-top: 34px; text-align:center; font-size: 12px; }
    .os-sign-line { border-top: 1px solid var(--line); width: 78%; margin: 0 auto 6px; }
    .os-totals { display: grid; grid-template-columns: 1fr 1fr; align-content:start; }
    .os-total-row { display: contents; }
    .os-total-row span, .os-total-row strong { padding: 8px 9px; border-bottom: 1px solid var(--line); font-size: 12px; }
    .os-total-row strong { text-align:right; border-left: 1px solid var(--line); }
    .os-grand span, .os-grand strong { font-size: 15px; font-weight: 900; border-bottom: 2px solid var(--line); background: var(--soft); }
    .os-payment-note { grid-column: 1 / -1; padding: 8px 9px; font-size: 11px; color: var(--muted); line-height:1.35; }
    .os-footer { margin-top: 9px; font-size: 10px; color: var(--muted); display:flex; justify-content:space-between; }
    @media print { body { background:#fff; } .os-page { margin:0; width: auto; min-height: auto; padding: 8mm; } @page { size: A4 portrait; margin: 0; } }
  </style>
</head>
<body>
  <div class="os-page">
    <div class="os-frame">
      <div class="os-top">
        <div class="os-brand">
          <div class="os-logo-wrap">${logoPDFMarkup()}</div>
          <div class="os-company">
            ${escapeHTML(endereco || 'Endereço não informado')}<br />
            ${escapeHTML(cidadeCep || '')}<br />
            ${escapeHTML(docInfo || '')}
          </div>
        </div>
        <div class="os-title">
          <h1>${escapeHTML(tituloDocumento)}</h1>
          <div class="os-number">${escapeHTML(subtituloDocumento)}</div>
          <div class="os-date">DATA: ${escapeHTML(dataAtual)}</div>
          <ul>${servicosCabecalhoPDF()}</ul>
        </div>
      </div>

      <div class="os-line-grid">
        <div class="os-field"><span class="os-label">Nome</span>${escapeHTML(veiculo?.nome_cliente || '')}</div>
        <div class="os-field"><span class="os-label">Fone</span>${escapeHTML(formatarTelefoneExibicao(veiculo || {}))}</div>
        <div class="os-field"><span class="os-label">CPF/CNPJ</span></div>
        ${campoDocumentoCliente}
      </div>

      <div class="os-car-grid">
        <div class="os-field"><span class="os-label">Tipo/Modelo</span>${escapeHTML(veiculo?.modelo || '')}</div>
        <div class="os-field"><span class="os-label">Cor</span>${escapeHTML(veiculo?.cor || '')}</div>
        <div class="os-field"><span class="os-label">Placa</span>${escapeHTML(veiculo?.placa || servicoItem.placa || '')}</div>
        <div class="os-field"><span class="os-label">Ano</span>${escapeHTML(veiculo?.ano || '')}</div>
        <div class="os-field"><span class="os-label">Data</span>${escapeHTML(dataAtual)}</div>
        <div class="os-field"><span class="os-label">Quilometragem</span>${escapeHTML(km)}</div>
        <div class="os-field"><span class="os-label">Combustível</span>${escapeHTML(veiculo?.combustivel || 'Não informado')}</div>
        <div class="os-field"><span class="os-label">Mecânico</span></div>
      </div>

      <div class="os-section-title">SERVIÇOS E PEÇAS A EXECUTAR</div>
      <table class="os-table">
        <thead><tr><th class="os-qtd">Qtd.</th><th>Descrição</th><th class="os-valor">Valor</th></tr></thead>
        <tbody>
          <tr><td class="os-qtd">-</td><td class="os-service-text">${escapeHTML(servico || 'Serviço não informado')}</td><td class="os-valor">${mao ? moeda(mao) : ''}</td></tr>
          ${linhasPecasParaPDF(pecas)}
        </tbody>
      </table>

      <div class="os-bottom">
        <div class="os-obs">
          <strong>OBS.:</strong>
          <div class="os-auth">Declaro estar ciente e autorizo a execução dos serviços e troca das peças descritas nesta Ordem de Serviço.</div>
          <div class="os-sign">
            <div class="os-sign-line"></div>
            SERVIÇOS E PEÇAS A SEREM TROCADAS<br />COM AUTORIZAÇÃO DO CLIENTE
          </div>
        </div>
        <div class="os-totals">
          <div class="os-total-row"><span>M.O. Mecânica</span><strong>${moeda(mao)}</strong></div>
          <div class="os-total-row"><span>Peças</span><strong>${moeda(totalPecas)}</strong></div>
          <div class="os-total-row os-grand"><span>TOTAL</span><strong>${moeda(total)}</strong></div>
          <div class="os-payment-note">Pago: ${moeda(pago)}<br />Restante: ${moeda(restante)}<br />Forma: ${escapeHTML(formaPagamento || '-')}</div>
        </div>
      </div>
    </div>
    <div class="os-footer"><span>Gerado pelo Sistema Oficina</span><span>${escapeHTML(numeroDocumento)} • ${escapeHTML(dataAtual)} ${horaAtual}</span></div>
  </div>
  <script>window.onload = () => setTimeout(() => window.print(), 650);<\/script>
</body>
</html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  mostrarStatus('OS aberta para impressão/PDF', 'sucesso');
}

function gerarPDFOrdemServico() {
  if (!state.veiculoAtual) return mostrarStatus('Nenhum veículo carregado', 'alerta');
  if (!validarPecasObrigatorias('gerar o orçamento em PDF')) return;
  const item = {
    id: null,
    numero_os: '',
    data: new Date().toLocaleDateString('pt-BR'),
    placa: state.veiculoAtual.placa,
    km: $('km').value || state.veiculoAtual.km_atual || '',
    servico: $('servico').value.trim(),
    pecas_trocadas: JSON.stringify(state.listaPecas),
    valor_pecas: numero($('valor_pecas').value),
    valor_maodeobra: numero($('valor_maodeobra').value),
    valor_total: numero($('valor_total').value),
    valor_pago: numero($('valor_pago').value),
    forma_pagamento: getFormaPagamento(),
  };
  abrirDocumentoOSPDF({ veiculo: state.veiculoAtual, servicoItem: item, pecas: state.listaPecas, finalizado: false });
}

function gerarPDFHistorico(item) {
  const veiculo = {
    ...(state.veiculoAtual || {}),
    ...Object.fromEntries(Object.entries({
      placa: item.placa,
      nome_cliente: item.nome_cliente,
      telefone_cliente: item.telefone_cliente,
      ddi_cliente: item.ddi_cliente,
      ddd_cliente: item.ddd_cliente,
      telefone_numero: item.telefone_numero,
      modelo: item.modelo,
      ano: item.ano,
      cor: item.cor,
      combustivel: item.combustivel,
      km_atual: item.km_atual || item.km,
    }).filter(([, v]) => v !== undefined && v !== null && v !== '')),
  };
  const pecas = normalizarPecasPDF(item.pecas_trocadas);
  abrirDocumentoOSPDF({ veiculo, servicoItem: item, pecas, finalizado: true });
}

function gerarWhatsApp() {
  if (!state.veiculoAtual) return mostrarStatus('Nenhum veículo carregado', 'alerta');
  if (!validarPecasObrigatorias('enviar o fechamento pelo WhatsApp')) return;
  const tel = telefoneWhatsapp(state.veiculoAtual);
  if (!tel) return mostrarStatus('Telefone não encontrado', 'alerta');
  const texto = `Olá ${state.veiculoAtual.nome_cliente || ''}! Seu veículo está pronto.\n${numeroOSAtual()}\nPlaca: ${state.veiculoAtual.placa}\nTotal: ${moeda(numero($('valor_total').value))}`;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
}
function montarMensagemOrcamento() {
  const pecas = state.listaPecas.length
    ? state.listaPecas.map((p)=>`• ${p.nome} — ${moeda(p.valor)}`).join('\n')
    : 'Nenhuma peça adicionada';
  return `📋 ORÇAMENTO PARA APROVAÇÃO

${numeroOrcamentoVisual()}
👤 Cliente: ${state.veiculoAtual.nome_cliente || '-'}
🚗 Veículo: ${state.veiculoAtual.modelo || '-'}
🎨 Cor: ${state.veiculoAtual.cor || '-'}
⛽ Combustível: ${state.veiculoAtual.combustivel || 'Não informado'}
🔖 Placa: ${state.veiculoAtual.placa}
🛣️ KM: ${$('km').value || '-'}

🔧 Serviço:
${$('servico').value || 'Não informado'}

🧩 Peças:
${pecas}

👨‍🔧 Mão de obra:
${moeda(numero($('valor_maodeobra').value))}

💰 TOTAL:
${moeda(numero($('valor_total').value))}

Aguardando aprovação para execução do serviço.`;
}

function enviarOrcamentoWhatsApp() {
  const tel = telefoneWhatsapp(state.veiculoAtual || {});
  if (!tel) return mostrarStatus('Telefone não encontrado', 'alerta');
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(montarMensagemOrcamento())}`, '_blank');
  mostrarStatus('Orçamento encaminhado', 'sucesso');
}

function abrirModalOrcamentoZero() {
  const modal = $('modal-orcamento-zero');
  const msg = $('modal-orcamento-zero-msg');
  const temTexto = Boolean($('servico')?.value.trim());
  if (msg) {
    msg.innerHTML = temTexto
      ? 'O orçamento está com total <strong>R$ 0,00</strong>. Confira mão de obra e peças antes de enviar.'
      : 'O orçamento está sem descrição, sem peças e sem valores. Deseja enviar mesmo assim?';
  }
  modal?.classList.add('active');
}

function fecharModalOrcamentoZero() { $('modal-orcamento-zero')?.classList.remove('active'); }
function confirmarEnvioOrcamentoZero() { fecharModalOrcamentoZero(); enviarOrcamentoWhatsApp(); }

function encaminharOrcamento() {
  if (!state.veiculoAtual) return mostrarStatus('Nenhum veículo carregado', 'alerta');
  if (!validarPecasObrigatorias('encaminhar o orçamento pelo WhatsApp')) return;
  const total = numero($('valor_total').value);
  const mao = numero($('valor_maodeobra').value);
  const pecas = numero($('valor_pecas').value);
  if (total <= 0 || (mao <= 0 && pecas <= 0)) {
    abrirModalOrcamentoZero();
    return;
  }

  // WhatsApp precisa ser a primeira janela aberta pelo clique do usuário.
  // Se o PDF abrir antes, alguns navegadores bloqueiam o WhatsApp como pop-up secundário.
  enviarOrcamentoWhatsApp();
  setTimeout(() => gerarPDFOrdemServico(), 250);
}
function abrirWhatsAppOSFechada(item = {}) {
  const tel = telefoneWhatsapp(state.veiculoAtual || {});
  if (!tel) return mostrarStatus('Telefone não encontrado para WhatsApp', 'alerta');
  const texto = `Olá ${state.veiculoAtual?.nome_cliente || ''}! Seu veículo está pronto.\n${numeroOSVisual(item)}\nPlaca: ${state.veiculoAtual?.placa || '-'}\nTotal: ${moeda(numero(item.valor_total))}\nRestante: ${moeda(Math.max(0, numero(item.valor_total) - numero(item.valor_pago)))}`;
  window.open(`https://wa.me/${tel}?text=${encodeURIComponent(texto)}`, '_blank');
}
function toggleTheme() { const isLight = document.body.classList.toggle('light-mode'); localStorage.setItem('theme', isLight ? 'light' : 'dark'); }


function densidadePreferida() {
  const valor = localStorage.getItem('oficina_ui_density') || 'auto';
  return ['auto', 'comfortable', 'compact'].includes(valor) ? valor : 'auto';
}

function modoDensidadeEfetivo(preferencia = densidadePreferida()) {
  if (preferencia === 'comfortable') return 'comfortable';
  if (preferencia === 'compact') return 'compact';
  return (window.innerWidth < 1366 || window.innerHeight < 760) ? 'compact' : 'comfortable';
}

function aplicarDensidade(preferencia = densidadePreferida()) {
  const efetiva = modoDensidadeEfetivo(preferencia);
  document.body.dataset.uiDensity = efetiva;
  document.body.dataset.uiDensityPreference = preferencia;
  document.querySelectorAll('.density-choice[data-density]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.density === preferencia);
  });
}

function definirDensidade(preferencia) {
  const valor = ['auto', 'comfortable', 'compact'].includes(preferencia) ? preferencia : 'auto';
  localStorage.setItem('oficina_ui_density', valor);
  aplicarDensidade(valor);
  mostrarStatus(`Densidade: ${valor === 'auto' ? 'Auto' : valor === 'compact' ? 'Compacta' : 'Confortável'}`, 'sucesso');
}

function bindEventos() {
  registrarNavegacaoBasica();
  $('btn-buscar-veiculo')?.addEventListener('click', buscarVeiculo);
  $('buscar_placa')?.addEventListener('input', (e) => { e.target.value = limparPlaca(e.target.value); });
  $('buscar_placa')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') buscarVeiculo(); });
  $('btn-salvar-cadastro')?.addEventListener('click', salvarCadastro);
  $('btn-adicionar-peca')?.addEventListener('click', adicionarPeca);
  $('peca_valor')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') adicionarPeca(); });
  $('btn-encaminhar-orcamento')?.addEventListener('click', encaminharOrcamento);
  $('btn-gerar-pdf')?.addEventListener('click', gerarPDFOrdemServico);
  $('btn-limpar-rascunho')?.addEventListener('click', abrirModalLimparOrcamento);
  $('btn-salvar-os')?.addEventListener('click', () => salvarOrdemAberta());
  $('btn-marcar-pronto')?.addEventListener('click', marcarOSPronta);
  $('btn-cancelar-os')?.addEventListener('click', cancelarOSAtual);
  $('btn-recarregar-os')?.addEventListener('click', carregarOrdensAbertas);
  $('btn-fechar-servico')?.addEventListener('click', fecharServico);
  $('btn-gerar-whatsapp')?.addEventListener('click', gerarWhatsApp);
  $('btn-whats-rapido')?.addEventListener('click', abrirWhatsRapido);
  $('checkbox')?.addEventListener('change', toggleTheme);
  $('btn-cancelar-recebimento')?.addEventListener('click', fecharModalRecebimento);
  $('btn-confirmar-recebimento')?.addEventListener('click', confirmarRecebimento);
  $('btn-cancelar-fechamento')?.addEventListener('click', fecharModalFechamento);
  $('btn-fechar-somente')?.addEventListener('click', () => executarFechamento({ enviarOS: false }));
  $('btn-fechar-enviar-os')?.addEventListener('click', () => executarFechamento({ enviarOS: true }));
  $('btn-cancelar-limpar')?.addEventListener('click', fecharModalLimparOrcamento);
  $('btn-confirmar-limpar')?.addEventListener('click', confirmarLimparOrcamento);
  $('btn-fechar-alerta')?.addEventListener('click', fecharModalAlerta);
  $('btn-limpar-peca-fechar')?.addEventListener('click', limparCamposPecaEFechar);
  $('btn-cancelar-atalho')?.addEventListener('click', fecharModalNovoAtalho);
  $('btn-confirmar-atalho')?.addEventListener('click', confirmarNovoAtalho);
  $('modal-atalho-nome')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmarNovoAtalho(); });
  $('btn-cancelar-orcamento-zero')?.addEventListener('click', fecharModalOrcamentoZero);
  $('btn-confirmar-orcamento-zero')?.addEventListener('click', confirmarEnvioOrcamentoZero);
  $('btn-salvar-config-oficina')?.addEventListener('click', salvarConfigOficina);
  $('btn-enviar-logo')?.addEventListener('click', enviarLogoOficina);
  $('btn-remover-logo')?.addEventListener('click', removerLogoOficina);
  $('config-logo-input')?.addEventListener('change', () => { const nome = $('config-logo-input')?.files?.[0]?.name; if (nome && $('config-logo-status')) $('config-logo-status').textContent = `Arquivo selecionado: ${nome}`; });
  document.querySelectorAll('.density-choice[data-density]').forEach((btn) => btn.addEventListener('click', () => definirDensidade(btn.dataset.density)));
  $('busca_servicos')?.addEventListener('input', renderizarServicosGlobais);
  document.querySelectorAll('.servico-filter[data-servico-filtro]').forEach((btn) => btn.addEventListener('click', () => {
    selecionarFiltroArquivo(btn.dataset.servicoFiltro || 'todos');
    if ((btn.dataset.servicoFiltro || 'todos') === 'todos') limparPeriodoArquivo({ renderizar: false });
    renderizarServicosGlobais();
  }));
  $('btn-toggle-periodo-arquivo')?.addEventListener('click', () => {
    const panel = $('arquivo-periodo-panel');
    if (panel) panel.hidden = !panel.hidden;
  });
  document.querySelectorAll('.arquivo-periodo-tipo[data-periodo-tipo]').forEach((btn) => btn.addEventListener('click', () => aplicarTipoPeriodoArquivo(btn.dataset.periodoTipo || 'mes')));
  $('btn-aplicar-periodo-arquivo')?.addEventListener('click', aplicarPeriodoArquivo);
  $('btn-limpar-periodo-arquivo')?.addEventListener('click', () => limparPeriodoArquivo());
  window.addEventListener('resize', () => aplicarDensidade(densidadePreferida()));
  $('btn-fazer-backup')?.addEventListener('click', fazerBackupAgora);
  document.querySelectorAll('.payment-choice[data-pagamento]').forEach((btn) => btn.addEventListener('click', () => setFormaPagamento(btn.dataset.pagamento)));
  setFormaPagamento(getFormaPagamento());
  $('historico')?.addEventListener('click', (e) => { const h = e.target.closest('[data-toggle-historico]'); if (h) toggleHistorico(h.dataset.toggleHistorico); });
  document.querySelectorAll('[data-sort]').forEach((th) => th.addEventListener('click', () => ordenarClientes(th.dataset.sort)));
  document.querySelectorAll('.btn-filtro[data-periodo]').forEach((btn) => btn.addEventListener('click', () => mudarPeriodo(btn.dataset.periodo, btn)));
  $('busca_cliente')?.addEventListener('input', function () { const termo = this.value.toLowerCase(); document.querySelectorAll('#lista-clientes tr').forEach((tr) => { tr.style.display = tr.innerText.toLowerCase().includes(termo) ? '' : 'none'; }); });
  ['servico','km','valor_pecas','valor_maodeobra','valor_pago'].forEach((id) => $(id)?.addEventListener('input', id === 'valor_maodeobra' || id === 'valor_pecas' || id === 'valor_pago' ? calcularTotal : autoSalvarRascunho));
  document.addEventListener('wheel', () => { if (document.activeElement?.type === 'number') document.activeElement.blur(); }, { passive: true });

  document.querySelectorAll('.modal-overlay').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return;
      modal.classList.remove('active');
      if (modal.id === 'modal-recebimento') state.recebimentoAtual = null;
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach((m) => m.classList.remove('active'));
  });
}


function registrarNavegacaoBasica() {
  document.querySelectorAll('.sidebar-btn[data-secao]').forEach((btn) => {
    if (btn.dataset.navBound === '1') return;
    btn.dataset.navBound = '1';
    btn.addEventListener('click', () => trocarSecao(btn.dataset.secao));
  });

  document.querySelectorAll('.tab[data-aba]').forEach((btn) => {
    if (btn.dataset.tabBound === '1') return;
    btn.dataset.tabBound = '1';
    btn.addEventListener('click', () => trocarAba(btn.dataset.aba));
  });
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    if (localStorage.getItem('theme') === 'light') {
      document.body.classList.add('light-mode');
      if ($('checkbox')) $('checkbox').checked = true;
    }
  } catch (err) {
    console.warn('Não foi possível carregar tema salvo', err);
  }

  try { aplicarDensidade(densidadePreferida()); } catch (err) { console.warn('Não foi possível aplicar densidade', err); }

  // Primeiro registra a navegação básica. Assim, mesmo que alguma rotina
  // secundária falhe, o app não fica preso na aba Buscar.
  try { registrarNavegacaoBasica(); } catch (err) { console.error('Erro na navegação básica', err); }

  try { bindEventos(); } catch (err) {
    console.error('Erro ao registrar eventos principais', err);
    mostrarStatus('Erro ao iniciar alguns botões. Veja o console.', 'erro');
  }

  const tarefasIniciais = [
    ['atalhos', () => renderizarBotoesAtalho()],
    ['clientes', () => carregarClientes()],
    ['pendentes', () => carregarPendentes()],
    ['financeiro', () => atualizarFinanceiro()],
    ['OS abertas', () => carregarOrdensAbertas()],
    ['banner OS', () => atualizarBannerOS()],
    ['config oficina', () => preencherConfigOficina()],
    ['logo oficina', () => carregarLogoOficina()],
    ['status backup', () => carregarStatusBackup()],
    ['logs erros', () => carregarUltimosErros()],
  ];

  tarefasIniciais.forEach(([nome, tarefa]) => {
    try { tarefa(); }
    catch (err) { console.error(`Erro ao iniciar ${nome}`, err); }
  });
});
