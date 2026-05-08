const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
      ano INTEGER,
      perfil_tecnico TEXT,
      km_atual INTEGER DEFAULT 0
    )
  `);

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
  db.all(
    `SELECT * FROM veiculos ORDER BY nome_cliente ASC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ erro: err.message });
      res.json(rows);
    }
  );
});

// CADASTRAR OU EDITAR VEÍCULO
app.post('/veiculo', (req, res) => {
  const { placa, nome_cliente, telefone_cliente, modelo, ano, perfil_tecnico } =
    req.body;
  const placaLimpa = placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  db.run(
    `INSERT INTO veiculos (placa, nome_cliente, telefone_cliente, modelo, ano, perfil_tecnico)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(placa) DO UPDATE SET
      nome_cliente = excluded.nome_cliente,
      telefone_cliente = excluded.telefone_cliente,
      modelo = excluded.modelo,
      ano = excluded.ano,
      perfil_tecnico = excluded.perfil_tecnico`,
    [
      placaLimpa,
      nome_cliente,
      telefone_cliente,
      modelo,
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

  const total = Number(valor_total || 0);
  const pago = Number(valor_pago || 0);

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
      parseFloat(valor_pecas) || 0,
      parseFloat(valor_maodeobra) || 0,
      parseFloat(valor_total) || 0,

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

app.post('/receber/:id', (req, res) => {
  const id = req.params.id;

  const valorRecebido = Number(req.body.valor || 0);

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

    const novoValorPago = Number(servico.valor_pago || 0) + valorRecebido;

    const total = Number(servico.valor_total || 0);

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

    const pagoAtual = Number(servico.valor_pago || 0);

    const novoPagamento = Number(valor_pago || 0);

    const totalPago = pagoAtual + novoPagamento;

    const valorTotal = Number(servico.valor_total || 0);

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
