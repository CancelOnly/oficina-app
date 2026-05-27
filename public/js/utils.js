export const DDI_PADRAO = '55';
export const DDD_PADRAO = '54';

export function $(id) { return document.getElementById(id); }
export function limparPlaca(valor = '') { return String(valor).toUpperCase().replace(/[^A-Z0-9]/g, '').trim(); }
export function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor ?? '').trim();
  if (!texto) return 0;

  texto = texto
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');

  const temVirgula = texto.includes(',');
  const temPonto = texto.includes('.');

  // Formato brasileiro: 1.234,56 -> 1234.56
  if (temVirgula) {
    texto = texto.replace(/\./g, '').replace(',', '.');
    const n = Number(texto);
    return Number.isFinite(n) ? n : 0;
  }

  // Formato decimal do input type=number: 250.00 -> 250
  if (temPonto) {
    const partes = texto.split('.');
    const ultimo = partes[partes.length - 1];

    // Caso pareça milhar puro: 1.234 ou 12.345.678
    if (partes.length > 1 && ultimo.length === 3 && partes.every((p) => /^\d+$/.test(p))) {
      const n = Number(texto.replace(/\./g, ''));
      return Number.isFinite(n) ? n : 0;
    }

    const n = Number(texto);
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}
export function moeda(valor) { return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
export function escapeHTML(valor = '') {
  return String(valor).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}
export function apenasNumeros(valor = '') {
  return String(valor ?? '').replace(/\D/g, '');
}

export function dadosTelefoneVeiculo(veiculo = {}) {
  let ddi = apenasNumeros(veiculo.ddi_cliente || '') || DDI_PADRAO;
  let ddd = apenasNumeros(veiculo.ddd_cliente || '') || DDD_PADRAO;
  let numero = apenasNumeros(veiculo.telefone_numero || '');

  // Compatibilidade com banco antigo: telefone_cliente pode vir como 5554999999999, 54999999999 ou só 999999999.
  if (!numero && veiculo.telefone_cliente) {
    let legado = apenasNumeros(veiculo.telefone_cliente);
    if (legado.startsWith(ddi) && legado.length > ddi.length + 2) legado = legado.slice(ddi.length);
    if (legado.length >= 10) {
      ddd = legado.slice(0, 2) || ddd;
      numero = legado.slice(2);
    } else {
      numero = legado;
    }
  }

  return { ddi, ddd, numero };
}

export function montarTelefoneInternacional(veiculoOuTelefone = {}, dddFallback = DDD_PADRAO) {
  if (typeof veiculoOuTelefone === 'object' && veiculoOuTelefone !== null) {
    const tel = dadosTelefoneVeiculo(veiculoOuTelefone);
    if (!tel.numero) return '';
    return `${tel.ddi || DDI_PADRAO}${tel.ddd || dddFallback}${tel.numero}`;
  }

  let num = apenasNumeros(veiculoOuTelefone);
  if (!num) return '';
  if (num.length === 8 || num.length === 9) num = `${DDI_PADRAO}${dddFallback}${num}`;
  else if (num.length === 10 || num.length === 11) num = `${DDI_PADRAO}${num}`;
  return num;
}

export function telefoneWhatsapp(veiculoOuTelefone = '') {
  return montarTelefoneInternacional(veiculoOuTelefone);
}

export function formatarTelefoneExibicao(veiculo = {}) {
  const { ddi, ddd, numero } = dadosTelefoneVeiculo(veiculo);
  if (!numero) return '---';
  const local = numero.length === 9
    ? `${numero.slice(0, 5)}-${numero.slice(5)}`
    : numero.length === 8
      ? `${numero.slice(0, 4)}-${numero.slice(4)}`
      : numero;
  return `+${ddi} (${ddd}) ${local}`;
}
export function mostrarStatus(texto, tipo = 'sucesso') {
  const status = $('status');
  if (!status) return;
  status.innerText = texto;
  status.className = '';
  status.classList.add(`status-${tipo}`);
  status.style.display = 'block';
  clearTimeout(status._timeout);
  status._timeout = setTimeout(() => {
    status.style.display = 'none';
    status.innerText = '';
    status.className = '';
  }, 3000);
}
