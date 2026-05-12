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
export function telefoneWhatsapp(tel = '') {
  let num = String(tel).replace(/\D/g, '');
  if (num.length === 8 || num.length === 9) num = `55${DDD_PADRAO}${num}`;
  else if (num.length === 10 || num.length === 11) num = `55${num}`;
  return num;
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
