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
   SQLITE
========================= */

const db = new sqlite3.Database('./oficina.db');

/* =========================
   TABELAS
========================= */

db.serialize(() => {
  /* VEÍCULOS */

  db.run(`
    CREATE TABLE IF NOT EXISTS veiculos (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      placa TEXT UNIQUE,

      nome_cliente TEXT,

      telefone_cliente TEXT,

      modelo TEXT,

      perfil_tecnico TEXT

    )
  `);

  /* SERVIÇOS */

  db.run(`
    CREATE TABLE IF NOT EXISTS servicos (

      id INTEGER PRIMARY KEY AUTOINCREMENT,

      placa TEXT,

      km INTEGER,

      servico TEXT,

      pecas_trocadas TEXT,

      valor_pecas REAL,

      valor_maodeobra REAL,

      valor_total REAL,

      data TEXT

    )
  `);
});

/* =========================
   BUSCAR VEÍCULO
========================= */

app.get('/veiculo/:placa', (req, res) => {
  const placa = req.params.placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  db.get(
    `
    SELECT * FROM veiculos
    WHERE placa = ?
    `,
    [placa],

    (err, row) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          erro: err.message,
        });
      }

      if (!row) {
        return res.status(404).json({
          erro: 'Veículo não encontrado',
        });
      }

      res.json(row);
    }
  );
});

/* =========================
   CADASTRAR / EDITAR VEÍCULO
========================= */

app.post('/veiculo', (req, res) => {
  const {
    placa,

    nome_cliente,

    telefone_cliente,

    modelo,

    perfil_tecnico,
  } = req.body;

  const placaLimpa = placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  db.run(
    `
    INSERT INTO veiculos
    (
      placa,
      nome_cliente,
      telefone_cliente,
      modelo,
      perfil_tecnico
    )

    VALUES (?, ?, ?, ?, ?)

    ON CONFLICT(placa)

    DO UPDATE SET

      nome_cliente =
      excluded.nome_cliente,

      telefone_cliente =
      excluded.telefone_cliente,

      modelo =
      excluded.modelo,

      perfil_tecnico =
      excluded.perfil_tecnico
    `,

    [placaLimpa, nome_cliente, telefone_cliente, modelo, perfil_tecnico],

    function (err) {
      if (err) {
        console.error(err);

        return res.status(500).json({
          erro: err.message,
        });
      }

      res.json({
        success: true,
      });
    }
  );
});

/* =========================
   SALVAR SERVIÇO
========================= */

app.post('/servico', (req, res) => {
  const {
    placa,

    km,

    servico,

    pecas_trocadas,

    valor_pecas,

    valor_maodeobra,

    valor_total,
  } = req.body;

  const placaLimpa = placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  const dataAtual = new Date().toLocaleDateString('pt-BR');

  db.run(
    `
    INSERT INTO servicos
    (
      placa,

      km,

      servico,

      pecas_trocadas,

      valor_pecas,

      valor_maodeobra,

      valor_total,

      data
    )

    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,

    [
      placaLimpa,

      km,

      servico,

      pecas_trocadas,

      valor_pecas,

      valor_maodeobra,

      valor_total,

      dataAtual,
    ],

    function (err) {
      if (err) {
        console.error(err);

        return res.status(500).json({
          erro: err.message,
        });
      }

      res.json({
        success: true,
      });
    }
  );
});

/* =========================
   HISTÓRICO
========================= */

app.get('/servicos/:placa', (req, res) => {
  const placa = req.params.placa
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .trim();

  db.all(
    `
    SELECT * FROM servicos

    WHERE placa = ?

    ORDER BY id DESC
    `,

    [placa],

    (err, rows) => {
      if (err) {
        console.error(err);

        return res.status(500).json({
          erro: err.message,
        });
      }

      res.json(rows);
    }
  );
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
    Servidor rodando:
    http://localhost:${PORT}
  `);
});
