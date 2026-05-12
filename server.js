const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function numero(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  let texto = String(valor ?? '').trim().replace(/R\$\s?/gi, '').replace(/\s/g, '');
  if (!texto) return 0;
  if (texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
    const n = Number(texto);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(texto);
  return Number.isFinite(n) ? n : 0;
}

/* =========================
   SQLITE CONFIG
========================= */
const db = new sqlite3.Database('./oficina.db');

/* =========================
   TABELAS (Com coluna km_atual)
========================= */
db.serialize(() => {
  // VEÍCULOS
  db.run(`
    CREATE TABLE IF NOT EXISTS veiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placa TEXT UNIQUE,
      nome_cliente TEXT,
      telefone_cliente TEXT,
      modelo TEXT,
      cor TEXT,
      ano INTEGER,
      perfil_tecnico TEXT,
      km_atual INTEGER DEFAULT 0
    )
  `);

  db.all(`PRAGMA table_info(veiculos)`, [], (err, cols) => {
    if (!err && Array.isArray(cols) && !cols.some((c) => c.name === 'cor')) {
      db.run(`ALTER TABLE veiculos ADD COLUMN cor TEXT`, (alterErr) => {
        if (alterErr) console.error('Erro ao adicionar coluna cor:', alterErr.message);
      });
    }
  });

  // SERVIÇOS
  db.run(`
  CREATE TABLE IF NOT EXISTS servicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    placa TEXT,

    km INTEGER,

    servico TEXT,

    pecas_trocadas TEXT,

    valor_pecas REAL DEFAULT 0,

    valor_maodeobra REAL DEFAULT 0,

    valor_total REAL DEFAULT 0,

    valor_pago REAL DEFAULT 0,

    forma_pagamento TEXT,

    status_pagamento TEXT DEFAULT 'pendente',

    data TEXT
  )
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placa TEXT,
      status TEXT DEFAULT 'orcamento',
      km INTEGER,
      servico TEXT,
      pecas_trocadas TEXT,
      valor_pecas REAL DEFAULT 0,
      valor_maodeobra REAL DEFAULT 0,
      valor_total REAL DEFAULT 0,
      valor_pago REAL DEFAULT 0,
      forma_pagamento TEXT DEFAULT 'pendente',
      observacoes TEXT,
      data_abertura TEXT,
      data_atualizacao TEXT,
      data_fechamento TEXT
    )
  `);
});

/* =========================
   ROTAS DE VEÍCULO
========================= */

// BUSCAR VEÍCULO POR PLACA
app.get('/veiculo/:placa', (req, res) => {
  const placa = req.params.placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  db.get(`SELECT * FROM veiculos WHERE placa = ?`, [placa], (err, row) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!row) return res.status(404).json({ erro: 'Veículo não encontrado' });
    res.json(row);
  });
});

// LISTAR TODOS OS VEÍCULOS (CLIENTES)
app.get('/veiculos', (req, res) => {
  const sql = `
    SELECT v.*, 
    (SELECT data FROM servicos WHERE placa = v.placa ORDER BY id DESC LIMIT 1) as data_ultimo_servico
    FROM veiculos v
    ORDER BY v.nome_cliente ASC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

// CADASTRAR OU EDITAR VEÍCULO
app.post('/veiculo', (req, res) => {
  const { placa, nome_cliente, telefone_cliente, modelo, cor, ano, perfil_tecnico } =
    req.body;
  const placaLimpa = placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  db.run(
    `INSERT INTO veiculos (placa, nome_cliente, telefone_cliente, modelo, cor, ano, perfil_tecnico)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(placa) DO UPDATE SET
      nome_cliente = excluded.nome_cliente,
      telefone_cliente = excluded.telefone_cliente,
      modelo = excluded.modelo,
      cor = excluded.cor,
      ano = excluded.ano,
      perfil_tecnico = excluded.perfil_tecnico`,
    [
      placaLimpa,
      nome_cliente,
      telefone_cliente,
      modelo,
      cor || '',
      parseInt(ano) || 0,
      perfil_tecnico,
    ],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ success: true });
    }
  );
});


/* =========================
   ROTAS DE OS ABERTAS
========================= */

function limparPlaca(valor = '') {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function calcularStatusPagamento(total, pago) {
  if (pago >= total && total > 0) return 'pago';
  if (pago > 0) return 'parcial';
  return 'pendente';
}

app.get('/ordens-servico', (req, res) => {
  const sql = `
    SELECT os.*, v.nome_cliente, v.telefone_cliente, v.modelo, v.cor, v.ano, v.km_atual
    FROM ordens_servico os
    LEFT JOIN veiculos v ON v.placa = os.placa
    WHERE os.status NOT IN ('entregue', 'cancelado')
    ORDER BY os.id DESC
  `;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows || []);
  });
});

app.get('/ordens-servico/:id', (req, res) => {
  const sql = `
    SELECT os.*, v.nome_cliente, v.telefone_cliente, v.modelo, v.cor, v.ano, v.km_atual
    FROM ordens_servico os
    LEFT JOIN veiculos v ON v.placa = os.placa
    WHERE os.id = ?
  `;
  db.get(sql, [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ erro: err.message });
    if (!row) return res.status(404).json({ erro: 'OS não encontrada' });
    res.json(row);
  });
});

app.post('/ordens-servico', (req, res) => {
  const placa = limparPlaca(req.body.placa);
  if (!placa) return res.status(400).json({ erro: 'Placa obrigatória' });

  const total = numero(req.body.valor_total || 0);
  const pago = numero(req.body.valor_pago || 0);
  const agora = new Date().toLocaleDateString('pt-BR');

  db.run(
    `INSERT INTO ordens_servico (
      placa, status, km, servico, pecas_trocadas, valor_pecas, valor_maodeobra,
      valor_total, valor_pago, forma_pagamento, observacoes, data_abertura, data_atualizacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      placa,
      req.body.status || 'orcamento',
      parseInt(req.body.km) || 0,
      req.body.servico || '',
      req.body.pecas_trocadas || '[]',
      numero(req.body.valor_pecas || 0),
      numero(req.body.valor_maodeobra || 0),
      total,
      pago,
      req.body.forma_pagamento || 'pendente',
      req.body.observacoes || '',
      agora,
      agora,
    ],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ success: true, id: this.lastID });
    }
  );
});

app.put('/ordens-servico/:id', (req, res) => {
  const total = numero(req.body.valor_total || 0);
  const pago = numero(req.body.valor_pago || 0);
  const agora = new Date().toLocaleDateString('pt-BR');

  db.run(
    `UPDATE ordens_servico SET
      status = ?, km = ?, servico = ?, pecas_trocadas = ?, valor_pecas = ?,
      valor_maodeobra = ?, valor_total = ?, valor_pago = ?, forma_pagamento = ?,
      observacoes = ?, data_atualizacao = ?
     WHERE id = ?`,
    [
      req.body.status || 'orcamento',
      parseInt(req.body.km) || 0,
      req.body.servico || '',
      req.body.pecas_trocadas || '[]',
      numero(req.body.valor_pecas || 0),
      numero(req.body.valor_maodeobra || 0),
      total,
      pago,
      req.body.forma_pagamento || 'pendente',
      req.body.observacoes || '',
      agora,
      req.params.id,
    ],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      if (this.changes === 0) return res.status(404).json({ erro: 'OS não encontrada' });
      res.json({ success: true });
    }
  );
});

app.put('/ordens-servico/:id/status', (req, res) => {
  const status = String(req.body.status || '').trim();
  const permitidos = ['orcamento', 'em_andamento', 'aguardando_peca', 'pronto', 'entregue', 'cancelado'];
  if (!permitidos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });

  const agora = new Date().toLocaleDateString('pt-BR');
  const fechamento = ['entregue', 'cancelado'].includes(status) ? agora : null;
  db.run(
    `UPDATE ordens_servico SET status = ?, data_atualizacao = ?, data_fechamento = COALESCE(?, data_fechamento) WHERE id = ?`,
    [status, agora, fechamento, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      if (this.changes === 0) return res.status(404).json({ erro: 'OS não encontrada' });
      res.json({ success: true });
    }
  );
});

/* =========================
   ROTAS DE SERVIÇO
========================= */

// SALVAR SERVIÇO E ATUALIZAR KM_ATUAL
app.post('/servico', (req, res) => {
  const {
    placa,
    km,
    servico,
    pecas_trocadas,
    valor_pecas,
    valor_maodeobra,
    valor_total,
    valor_pago,
    forma_pagamento,
  } = req.body;
  const placaLimpa = placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  const dataAtual = new Date().toLocaleDateString('pt-BR');
  const kmNum = parseInt(km) || 0;

  let status_pagamento = 'pendente';

  const total = numero(valor_total || 0);
  const pago = numero(valor_pago || 0);

  if (pago >= total && total > 0) {
    status_pagamento = 'pago';
  } else if (pago > 0) {
    status_pagamento = 'parcial';
  }

  // Primeiro insere o histórico de serviço
  db.run(
    `INSERT INTO servicos (
  placa,
  km,
  servico,
  pecas_trocadas,
  valor_pecas,
  valor_maodeobra,
  valor_total,
  valor_pago,
  forma_pagamento,
  status_pagamento,
  data
)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      placaLimpa,
      kmNum,
      servico,
      pecas_trocadas,
      numero(valor_pecas) || 0,
      numero(valor_maodeobra) || 0,
      numero(valor_total) || 0,

      pago,

      forma_pagamento || 'pendente',

      status_pagamento,

      dataAtual,
    ],
    function (err) {
      if (err) {
        console.error(err);
        return res.status(500).json({ erro: err.message });
      }

      // Depois atualiza o KM na ficha principal do carro
      db.run(
        `UPDATE veiculos SET km_atual = ? WHERE placa = ?`,
        [kmNum, placaLimpa],
        (errUpdate) => {
          if (errUpdate)
            console.error('Erro ao atualizar km_atual:', errUpdate);
          res.json({ success: true, id: this.lastID });
        }
      );
    }
  );
});

// HISTÓRICO DE SERVIÇOS POR PLACA
app.get('/servicos/:placa', (req, res) => {
  const placa = req.params.placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();
  db.all(
    `SELECT * FROM servicos WHERE placa = ? ORDER BY id DESC`,
    [placa],
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

// LISTAR SERVIÇOS PENDENTES
app.get('/pendentes', (req, res) => {
  db.all(
    `
    SELECT * FROM servicos
    WHERE status_pagamento != 'pago'
    ORDER BY id DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          erro: err.message,
        });
      }

      res.json(rows);
    }
  );
});

app.put('/receber/:id', (req, res) => {
  const id = req.params.id;

  const valorRecebido = numero(req.body.valor || req.body.valor_pago || 0);
  if (valorRecebido <= 0) {
    return res.status(400).json({
      erro: 'Valor inválido',
    });
  }

  db.get(`SELECT * FROM servicos WHERE id = ?`, [id], (err, servico) => {
    if (err) {
      return res.status(500).json({
        erro: err.message,
      });
    }

    if (!servico) {
      return res.status(404).json({
        erro: 'Serviço não encontrado',
      });
    }

    const total = numero(servico.valor_total || 0);
    const pagoAtual = numero(servico.valor_pago || 0);
    const restante = Math.max(0, total - pagoAtual);

    if (valorRecebido > restante) {
      return res.status(400).json({
        erro: `Valor recebido maior que o restante da OS. Restante: R$ ${restante.toFixed(2)}`,
        restante,
      });
    }

    const novoValorPago = pagoAtual + valorRecebido;

    let novoStatus = 'pendente';

    if (novoValorPago >= total) {
      novoStatus = 'pago';
    } else if (novoValorPago > 0) {
      novoStatus = 'parcial';
    }

    db.run(
      `
        UPDATE servicos
        SET
          valor_pago = ?,
          status_pagamento = ?
        WHERE id = ?
      `,
      [novoValorPago, novoStatus, id],
      function (errUpdate) {
        if (errUpdate) {
          return res.status(500).json({
            erro: errUpdate.message,
          });
        }

        res.json({
          success: true,
        });
      }
    );
  });
});

// Rota de Financeiro - Dashboard por período e forma de pagamento
app.get('/estatisticas', (req, res) => {
  const periodo = req.query.periodo || 'semanal';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const diasPeriodo = periodo === 'diario' ? 1 : periodo === 'mensal' ? 30 : 7;
  const inicio = new Date(hoje);
  inicio.setDate(hoje.getDate() - (diasPeriodo - 1));

  const labels = [];
  const diasSemana = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  for (let i = 0; i < diasPeriodo; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    labels.push({
      key: d.toISOString().slice(0, 10),
      dia: d.toLocaleDateString('pt-BR'),
      dia_curto: periodo === 'mensal' ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}` : diasSemana[d.getDay()],
      faturado: 0,
      recebido: 0,
      servicos: 0,
    });
  }

  function parseDataBR(valor) {
    if (!valor) return null;
    const [dd, mm, yyyy] = String(valor).split('/').map(Number);
    if (!dd || !mm || !yyyy) return null;
    const d = new Date(yyyy, mm - 1, dd);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  db.all(`SELECT * FROM servicos ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });

    const resumo = { faturamento: 0, recebido: 0, pendente: 0 };
    const formas = { dinheiro: 0, pix: 0, cartao: 0, misto: 0, pendente: 0, outros: 0 };
    const porDia = new Map(labels.map((d) => [d.key, d]));
    let servicos = 0;

    rows.forEach((item) => {
      const dataServico = parseDataBR(item.data);
      if (!dataServico || dataServico < inicio || dataServico > hoje) return;

      const total = Number(item.valor_total || 0);
      const pago = Number(item.valor_pago || 0);
      const pendente = Math.max(0, total - pago);
      const forma = String(item.forma_pagamento || 'pendente').toLowerCase();
      const key = dataServico.toISOString().slice(0, 10);
      const dia = porDia.get(key);

      resumo.faturamento += total;
      resumo.recebido += pago;
      resumo.pendente += pendente;
      servicos += 1;

      if (formas[forma] !== undefined) formas[forma] += pago;
      else formas.outros += pago;

      if (dia) {
        dia.faturado += total;
        dia.recebido += pago;
        dia.servicos += 1;
      }
    });

    const semanasMap = new Map();
    labels.forEach((label, idx) => {
      const semanaIndex = Math.floor(idx / 7) + 1;
      const key = `semana-${semanaIndex}`;
      if (!semanasMap.has(key)) {
        semanasMap.set(key, {
          label: `Semana ${semanaIndex}`,
          faturado: 0,
          recebido: 0,
          pendente: 0,
          servicos: 0,
        });
      }
      const semana = semanasMap.get(key);
      semana.faturado += Number(label.faturado || 0);
      semana.recebido += Number(label.recebido || 0);
      semana.servicos += Number(label.servicos || 0);
      semana.pendente += Math.max(0, Number(label.faturado || 0) - Number(label.recebido || 0));
    });

    const painel = {
      servicos,
      ticket_medio: servicos ? resumo.faturamento / servicos : 0,
      percentual_pendente: resumo.faturamento ? (resumo.pendente / resumo.faturamento) * 100 : 0,
    };

    res.json({
      resumo,
      formas,
      painel,
      grafico: labels,
      semanas: Array.from(semanasMap.values()),
    });
  });
});

/* =========================
   PAGAR PENDÊNCIA
========================= */

app.put('/servico/:id/pagamento', (req, res) => {
  const { id } = req.params;

  const { valor_pago, forma_pagamento } = req.body;

  db.get(`SELECT * FROM servicos WHERE id = ?`, [id], (err, servico) => {
    if (err) {
      return res.status(500).json({ erro: err.message });
    }

    if (!servico) {
      return res.status(404).json({ erro: 'Serviço não encontrado' });
    }

    const pagoAtual = numero(servico.valor_pago || 0);

    const novoPagamento = numero(valor_pago || 0);

    const valorTotal = numero(servico.valor_total || 0);
    const restante = Math.max(0, valorTotal - pagoAtual);

    if (novoPagamento <= 0) {
      return res.status(400).json({ erro: 'Valor inválido' });
    }

    if (novoPagamento > restante) {
      return res.status(400).json({
        erro: `Valor recebido maior que o restante da OS. Restante: R$ ${restante.toFixed(2)}`,
        restante,
      });
    }

    const totalPago = pagoAtual + novoPagamento;

    let status_pagamento = 'pendente';

    if (totalPago >= valorTotal) {
      status_pagamento = 'pago';
    } else if (totalPago > 0) {
      status_pagamento = 'parcial';
    }

    db.run(
      `
        UPDATE servicos
        SET
          valor_pago = ?,
          forma_pagamento = ?,
          status_pagamento = ?
        WHERE id = ?
        `,
      [totalPago, forma_pagamento, status_pagamento, id],
      function (errUpdate) {
        if (errUpdate) {
          return res.status(500).json({
            erro: errUpdate.message,
          });
        }

        res.json({
          success: true,
          total_pago: totalPago,
          status_pagamento,
        });
      }
    );
  });
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em: http://localhost:${PORT}`);
});
