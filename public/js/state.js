function carregarAtalhosPadrao() {
  const padrao = ['Óleo', 'Revisão', 'Freios', 'Suspensão'];

  try {
    const raw = localStorage.getItem('config_atalhos');
    if (!raw) return padrao;

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return padrao;

    const limpos = parsed
      .map((item) => String(item || '').trim())
      .filter(Boolean);

    return limpos.length ? limpos : padrao;
  } catch (err) {
    console.warn('config_atalhos inválido. Restaurando padrão.', err);
    localStorage.setItem('config_atalhos', JSON.stringify(padrao));
    return padrao;
  }
}

function carregarConfigOficina() {
  const padrao = {
    nome: 'MC RACING',
    subtitulo: 'Mecânica Multimarcas',
    telefone: '(54) 99258-5505',
    cnpj: '',
    rua: '',
    bairro: '',
    cidade: 'Caxias do Sul',
    cep: '',
    servicosCabecalho: 'Mecânica geral\nRevisões\nFreios\nSuspensão\nInjeção eletrônica',
  };

  try {
    const raw = localStorage.getItem('config_oficina');
    if (!raw) return padrao;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return padrao;
    return { ...padrao, ...parsed };
  } catch (err) {
    console.warn('config_oficina inválido. Restaurando padrão.', err);
    localStorage.setItem('config_oficina', JSON.stringify(padrao));
    return padrao;
  }
}

export const state = {
  veiculoAtual: null,
  listaPecas: [],
  clientesCache: [],
  colunaAtual: '',
  ordemCrescente: true,
  periodoAtual: 'semanal',
  recebimentoAtual: null,
  restaurandoRascunho: false,
  bloqueandoAutoSave: false,
  timeoutAutoSave: null,
  atalhos: carregarAtalhosPadrao(),
  osAtual: null,
  ordensAbertas: [],
  acaoAposAlertaPeca: null,
  configOficina: carregarConfigOficina(),
  logoOficina: { exists: false, url: null },
};
