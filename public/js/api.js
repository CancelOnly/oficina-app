const API = window.location.origin;

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok) {
    const err = new Error(data?.erro || `Erro HTTP ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}


async function requestForm(path, formData, options = {}) {
  const response = await fetch(`${API}${path}`, {
    method: options.method || 'POST',
    body: formData,
  });

  let data = null;
  try { data = await response.json(); } catch (_) {}

  if (!response.ok) {
    const err = new Error(data?.erro || `Erro HTTP ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const api = {
  buscarVeiculo: (placa) => request(`/veiculo/${placa}`),
  listarVeiculos: () => request('/veiculos'),
  salvarVeiculo: (dados) => request('/veiculo', { method: 'POST', body: JSON.stringify(dados) }),
  salvarServico: (dados) => request('/servico', { method: 'POST', body: JSON.stringify(dados) }),
  listarHistorico: (placa) => request(`/servicos/${placa}`),
  listarPendentes: () => request('/pendentes'),
  receberPagamento: (id, valor) => request(`/receber/${id}`, { method: 'PUT', body: JSON.stringify({ valor }) }),
  estatisticas: (periodo = 'semanal') => request(`/estatisticas?periodo=${periodo}`),
  listarOrdensAbertas: () => request('/ordens-servico'),
  buscarOrdemServico: (id) => request(`/ordens-servico/${id}`),
  criarOrdemServico: (dados) => request('/ordens-servico', { method: 'POST', body: JSON.stringify(dados) }),
  atualizarOrdemServico: (id, dados) => request(`/ordens-servico/${id}`, { method: 'PUT', body: JSON.stringify(dados) }),
  alterarStatusOrdemServico: (id, status) => request(`/ordens-servico/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  fazerBackup: () => request('/api/backup', { method: 'POST' }),
  statusBackup: () => request('/api/backup/status'),
  ultimosErros: () => request('/api/logs/errors'),
  consultarLogo: () => request('/api/logo'),
  enviarLogo: (arquivo) => { const form = new FormData(); form.append('logo', arquivo); return requestForm('/api/logo', form); },
  removerLogo: () => request('/api/logo', { method: 'DELETE' }),
};
