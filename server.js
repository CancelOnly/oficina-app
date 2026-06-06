const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT_DIR = __dirname;
const DB_PATH = path.join(ROOT_DIR, 'oficina.db');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const BACKUP_DIR = path.join(ROOT_DIR, 'backups');
const LOG_DIR = path.join(ROOT_DIR, 'logs');
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const BACKUP_RETENTION = 60;

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(PUBLIC_DIR));

const LOGO_MAX_SIZE = 2 * 1024 * 1024;
const LOGO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const LOGO_EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const uploadLogo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_MIMES.has(file.mimetype)) {
      return cb(new Error('Tipo de arquivo inválido. Use PNG, JPG, JPEG ou WEBP.'));
    }
    cb(null, true);
  },
});

function logoAtual() {
  const candidatos = fs.readdirSync(UPLOAD_DIR)
    .filter((file) => /^logo-oficina\.(png|jpg|jpeg|webp)$/i.test(file))
    .map((file) => {
      const full = path.join(UPLOAD_DIR, file);
      const stat = fs.statSync(full);
      return { file, full, size: stat.size, updated_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
  return candidatos[0] || null;
}

function removerLogosAntigas() {
  fs.readdirSync(UPLOAD_DIR)
    .filter((file) => /^logo-oficina\.(png|jpg|jpeg|webp)$/i.test(file))
    .forEach((file) => {
      try { fs.unlinkSync(path.join(UPLOAD_DIR, file)); }
      catch (err) { logError('Erro ao remover logo antiga', { file, err: err.message }); }
    });
}

function dataArquivo(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}`;
}

function dataBR(date = new Date()) {
  return date.toLocaleDateString('pt-BR');
}

function agoraISO() {
  return new Date().toISOString();
}

function log(level, message, meta = {}) {
  const line = JSON.stringify({ ts: agoraISO(), level, message, ...meta });
  const file = path.join(LOG_DIR, `app-${new Date().toISOString().slice(0, 10)}.log`);
  fs.appendFile(file, `${line}\n`, (err) => {
    if (err) console.error('Falha ao gravar log:', err.message);
  });
  const out = `[${level.toUpperCase()}] ${message}`;
  if (level === 'error') console.error(out, meta);
  else console.log(out, meta);
}

function logInfo(message, meta) { log('info', message, meta); }
function logError(message, meta) { log('error', message, meta); }

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

function limparPlaca(valor = '') {
  return String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function calcularStatusPagamento(total, pago) {
  if (pago >= total && total > 0) return 'pago';
  if (pago > 0) return 'parcial';
  return 'pendente';
}

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function addColumnIfMissing(table, column, ddl) {
  db.all(`PRAGMA table_info(${table})`, [], (err, cols) => {
    if (err) return logError('Erro ao ler schema', { table, err: err.message });
    if (!cols.some((c) => c.name === column)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`, (alterErr) => {
        if (alterErr) logError('Erro ao adicionar coluna', { table, column, err: alterErr.message });
        else logInfo('Coluna adicionada', { table, column });
      });
    }
  });
}

function createIndex(name, sql) {
  db.run(sql, (err) => {
    if (err) logError('Erro ao criar índice', { name, err: err.message });
  });
}

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) logError('Erro ao conectar banco', { err: err.message });
  else logInfo('Banco conectado', { path: DB_PATH });
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS veiculos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      placa TEXT UNIQUE,
      nome_cliente TEXT,
      telefone_cliente TEXT,
      ddi_cliente TEXT DEFAULT '55',
      ddd_cliente TEXT DEFAULT '54',
      telefone_numero TEXT DEFAULT '',
      modelo TEXT,
      cor TEXT,
      combustivel TEXT DEFAULT 'Não informado',
      ano INTEGER,
      perfil_tecnico TEXT,
      km_atual INTEGER DEFAULT 0
    )
  `);

  // Migrations seguras e sequenciais para bancos antigos.
  // Importante: não usar setTimeout aqui. O SQLite precisa garantir que as colunas
  // existam antes de qualquer UPDATE/SELECT que use ddi_cliente, ddd_cliente ou telefone_numero.
  function addVeiculoColumn(column, ddl) {
    db.run(`ALTER TABLE veiculos ADD COLUMN ${column} ${ddl}`, (err) => {
      if (!err) return logInfo('Coluna adicionada', { table: 'veiculos', column });
      if (!String(err.message || '').includes('duplicate column name')) {
        logError('Erro ao adicionar coluna', { table: 'veiculos', column, err: err.message });
      }
    });
  }

  addVeiculoColumn('cor', 'TEXT');
  addVeiculoColumn('combustivel', "TEXT DEFAULT 'Não informado'");
  addVeiculoColumn('km_atual', 'INTEGER DEFAULT 0');
  addVeiculoColumn('ddi_cliente', "TEXT DEFAULT '55'");
  addVeiculoColumn('ddd_cliente', "TEXT DEFAULT '54'");
  addVeiculoColumn('telefone_numero', "TEXT DEFAULT ''");

  db.run(`
    UPDATE veiculos
    SET
      ddi_cliente = COALESCE(NULLIF(ddi_cliente, ''), '55'),
      ddd_cliente = COALESCE(NULLIF(ddd_cliente, ''), '54'),
      telefone_numero = COALESCE(telefone_numero, '')
  `, (err) => {
    if (err) logError('Erro ao normalizar telefones', { err: err.message });
  });

  db.run(`
    UPDATE veiculos
    SET combustivel = COALESCE(NULLIF(combustivel, ''), 'Não informado')
  `, (err) => {
    if (err) logError('Erro ao normalizar combustível', { err: err.message });
  });

  db.all(`SELECT id, telefone_cliente, ddi_cliente, ddd_cliente, telefone_numero FROM veiculos WHERE COALESCE(telefone_numero, '') = '' AND COALESCE(telefone_cliente, '') != ''`, [], (err, rows = []) => {
    if (err) return logError('Erro ao migrar telefones legados', { err: err.message });
    rows.forEach((row) => {
      let legado = String(row.telefone_cliente || '').replace(/\D/g, '');
      let ddi = String(row.ddi_cliente || '55').replace(/\D/g, '') || '55';
      let ddd = String(row.ddd_cliente || '54').replace(/\D/g, '') || '54';
      if (legado.startsWith(ddi) && legado.length > ddi.length + 2) legado = legado.slice(ddi.length);
      let numero = legado;
      if (legado.length >= 10) { ddd = legado.slice(0, 2); numero = legado.slice(2); }
      db.run(`UPDATE veiculos SET ddi_cliente = ?, ddd_cliente = ?, telefone_numero = ? WHERE id = ?`, [ddi, ddd, numero, row.id]);
    });
    if (rows.length) logInfo('Telefones legados migrados', { quantidade: rows.length });
  });

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

  createIndex('idx_veiculos_placa', `CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa)`);
  createIndex('idx_servicos_placa', `CREATE INDEX IF NOT EXISTS idx_servicos_placa ON servicos(placa)`);
  createIndex('idx_servicos_data', `CREATE INDEX IF NOT EXISTS idx_servicos_data ON servicos(data)`);
  createIndex('idx_servicos_status_pagamento', `CREATE INDEX IF NOT EXISTS idx_servicos_status_pagamento ON servicos(status_pagamento)`);
  createIndex('idx_ordens_placa', `CREATE INDEX IF NOT EXISTS idx_ordens_placa ON ordens_servico(placa)`);
  createIndex('idx_ordens_status', `CREATE INDEX IF NOT EXISTS idx_ordens_status ON ordens_servico(status)`);
  createIndex('idx_ordens_data_abertura', `CREATE INDEX IF NOT EXISTS idx_ordens_data_abertura ON ordens_servico(data_abertura)`);
});

async function fazerBackup() {
  const stamp = dataArquivo();
  const destino = path.join(BACKUP_DIR, `oficina-backup-${stamp}.db`);
  await new Promise((resolve, reject) => {
    db.serialize(() => {
      fs.copyFile(DB_PATH, destino, (err) => (err ? reject(err) : resolve()));
    });
  });

  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^oficina-backup-.*\.db$/.test(f))
    .map((file) => ({ file, full: path.join(BACKUP_DIR, file), mtime: fs.statSync(path.join(BACKUP_DIR, file)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);

  backups.slice(BACKUP_RETENTION).forEach((item) => {
    try { fs.unlinkSync(item.full); } catch (err) { logError('Erro ao limpar backup antigo', { file: item.file, err: err.message }); }
  });

  logInfo('Backup criado', { file: path.basename(destino) });
  return { file: path.basename(destino), path: destino, created_at: new Date().toISOString() };
}

function ultimoBackup() {
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((f) => /^oficina-backup-.*\.db$/.test(f))
    .map((file) => {
      const full = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(full);
      return { file, path: full, size: stat.size, created_at: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return backups[0] || null;
}

function ultimosErros(limit = 20) {
  const files = fs.readdirSync(LOG_DIR).filter((f) => /^app-.*\.log$/.test(f)).sort().reverse().slice(0, 7);
  const erros = [];
  for (const file of files) {
    const full = path.join(LOG_DIR, file);
    const lines = fs.readFileSync(full, 'utf8').split('\n').filter(Boolean).reverse();
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (item.level === 'error') erros.push(item);
      } catch (_) {}
      if (erros.length >= limit) return erros;
    }
  }
  return erros;
}

app.use((req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 500) logError('Erro HTTP', { method: req.method, path: req.path, status: res.statusCode });
  });
  next();
});


app.get('/api/logo', (req, res) => {
  try {
    const logo = logoAtual();
    if (!logo) return res.json({ exists: false, url: null });
    res.json({ exists: true, file: logo.file, size: logo.size, updated_at: logo.updated_at, url: `/api/logo/image?v=${encodeURIComponent(logo.updated_at)}` });
  } catch (err) {
    logError('Erro ao consultar logo', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/logo/image', (req, res) => {
  try {
    const logo = logoAtual();
    if (!logo) return res.status(404).send('Logo não encontrada');
    res.sendFile(logo.full);
  } catch (err) {
    logError('Erro ao servir logo', { err: err.message });
    res.status(500).send('Erro ao servir logo');
  }
});

app.post('/api/logo', (req, res) => {
  uploadLogo.single('logo')(req, res, (err) => {
    if (err) {
      const mensagem = err.code === 'LIMIT_FILE_SIZE'
        ? 'A logo deve ter no máximo 2MB.'
        : err.message;
      logError('Erro ao enviar logo', { err: mensagem });
      return res.status(400).json({ erro: mensagem });
    }
    try {
      if (!req.file) return res.status(400).json({ erro: 'Arquivo de logo não enviado' });
      const ext = LOGO_EXT_BY_MIME[req.file.mimetype];
      if (!ext) return res.status(400).json({ erro: 'Tipo de arquivo inválido' });
      removerLogosAntigas();
      const destino = path.join(UPLOAD_DIR, `logo-oficina${ext}`);
      fs.writeFileSync(destino, req.file.buffer);
      const logo = logoAtual();
      logInfo('Logo da oficina atualizada', { file: logo?.file, size: logo?.size });
      res.json({ success: true, exists: true, file: logo.file, size: logo.size, updated_at: logo.updated_at, url: `/api/logo/image?v=${encodeURIComponent(logo.updated_at)}` });
    } catch (saveErr) {
      logError('Erro ao salvar logo', { err: saveErr.message });
      res.status(500).json({ erro: saveErr.message });
    }
  });
});

app.delete('/api/logo', (req, res) => {
  try {
    removerLogosAntigas();
    logInfo('Logo da oficina removida');
    res.json({ success: true });
  } catch (err) {
    logError('Erro ao remover logo', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/veiculo/:placa', async (req, res) => {
  try {
    const placa = limparPlaca(req.params.placa);
    const row = await getAsync(`SELECT * FROM veiculos WHERE placa = ?`, [placa]);
    if (!row) return res.status(404).json({ erro: 'Veículo não encontrado' });
    res.json(row);
  } catch (err) {
    logError('Erro ao buscar veículo', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/veiculos', async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT v.*,
      (SELECT data FROM servicos WHERE placa = v.placa ORDER BY id DESC LIMIT 1) as data_ultimo_servico
      FROM veiculos v
      ORDER BY v.nome_cliente ASC
    `);
    res.json(rows);
  } catch (err) {
    logError('Erro ao listar veículos', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.post('/veiculo', async (req, res) => {
  try {
    const { nome_cliente, telefone_cliente, modelo, cor, combustivel, ano, perfil_tecnico } = req.body;
    const placaLimpa = limparPlaca(req.body.placa);
    if (!placaLimpa) return res.status(400).json({ erro: 'Placa obrigatória' });

    const ddi_cliente = String(req.body.ddi_cliente || '55').replace(/\D/g, '') || '55';
    const ddd_cliente = String(req.body.ddd_cliente || '54').replace(/\D/g, '') || '54';
    let telefone_numero = String(req.body.telefone_numero || '').replace(/\D/g, '');

    // Compatibilidade com frontend/DB antigo.
    if (!telefone_numero && telefone_cliente) {
      let legado = String(telefone_cliente || '').replace(/\D/g, '');
      if (legado.startsWith(ddi_cliente) && legado.length > ddi_cliente.length + 2) legado = legado.slice(ddi_cliente.length);
      telefone_numero = legado.length >= 10 ? legado.slice(2) : legado;
    }

    const telefoneCompat = telefone_numero ? `${ddi_cliente}${ddd_cliente}${telefone_numero}` : '';

    const existente = await getAsync(`SELECT id FROM veiculos WHERE placa = ?`, [placaLimpa]);
    await runAsync(
      `INSERT INTO veiculos (placa, nome_cliente, telefone_cliente, ddi_cliente, ddd_cliente, telefone_numero, modelo, cor, combustivel, ano, perfil_tecnico)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(placa) DO UPDATE SET
        nome_cliente = excluded.nome_cliente,
        telefone_cliente = excluded.telefone_cliente,
        ddi_cliente = excluded.ddi_cliente,
        ddd_cliente = excluded.ddd_cliente,
        telefone_numero = excluded.telefone_numero,
        modelo = excluded.modelo,
        cor = excluded.cor,
        combustivel = excluded.combustivel,
        ano = excluded.ano,
        perfil_tecnico = excluded.perfil_tecnico`,
      [placaLimpa, nome_cliente || '', telefoneCompat, ddi_cliente, ddd_cliente, telefone_numero, modelo || '', cor || '', combustivel || 'Não informado', parseInt(ano) || 0, perfil_tecnico || '']
    );
    logInfo(existente ? 'Veículo atualizado' : 'Veículo cadastrado', { placa: placaLimpa });
    res.json({ success: true });
  } catch (err) {
    logError('Erro ao salvar veículo', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/ordens-servico', async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT os.*, v.nome_cliente, v.telefone_cliente, v.ddi_cliente, v.ddd_cliente, v.telefone_numero, v.modelo, v.cor, v.combustivel, v.ano, v.km_atual
      FROM ordens_servico os
      LEFT JOIN veiculos v ON v.placa = os.placa
      WHERE os.status NOT IN ('entregue', 'cancelado', 'cancelada')
      ORDER BY os.id DESC
    `);
    res.json(rows);
  } catch (err) {
    logError('Erro ao listar OS abertas', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/ordens-servico/:id', async (req, res) => {
  try {
    const row = await getAsync(`
      SELECT os.*, v.nome_cliente, v.telefone_cliente, v.ddi_cliente, v.ddd_cliente, v.telefone_numero, v.modelo, v.cor, v.combustivel, v.ano, v.km_atual
      FROM ordens_servico os
      LEFT JOIN veiculos v ON v.placa = os.placa
      WHERE os.id = ?
    `, [req.params.id]);
    if (!row) return res.status(404).json({ erro: 'OS não encontrada' });
    res.json(row);
  } catch (err) {
    logError('Erro ao buscar OS', { id: req.params.id, err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.post('/ordens-servico', async (req, res) => {
  try {
    const placa = limparPlaca(req.body.placa);
    if (!placa) return res.status(400).json({ erro: 'Placa obrigatória' });
    const total = numero(req.body.valor_total || 0);
    const pago = numero(req.body.valor_pago || 0);
    if (pago < 0 || pago > total) return res.status(400).json({ erro: 'Valor pago inválido para a OS' });
    const agora = dataBR();
    const result = await runAsync(
      `INSERT INTO ordens_servico (
        placa, status, km, servico, pecas_trocadas, valor_pecas, valor_maodeobra,
        valor_total, valor_pago, forma_pagamento, observacoes, data_abertura, data_atualizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [placa, req.body.status || 'orcamento', parseInt(req.body.km) || 0, req.body.servico || '', req.body.pecas_trocadas || '[]', numero(req.body.valor_pecas || 0), numero(req.body.valor_maodeobra || 0), total, pago, req.body.forma_pagamento || 'pendente', req.body.observacoes || '', agora, agora]
    );
    logInfo('OS aberta criada', { id: result.lastID, placa });
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    logError('Erro ao criar OS', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.put('/ordens-servico/:id', async (req, res) => {
  try {
    const total = numero(req.body.valor_total || 0);
    const pago = numero(req.body.valor_pago || 0);
    if (pago < 0 || pago > total) return res.status(400).json({ erro: 'Valor pago inválido para a OS' });
    const agora = dataBR();
    const result = await runAsync(
      `UPDATE ordens_servico SET
        status = ?, km = ?, servico = ?, pecas_trocadas = ?, valor_pecas = ?,
        valor_maodeobra = ?, valor_total = ?, valor_pago = ?, forma_pagamento = ?,
        observacoes = ?, data_atualizacao = ?
       WHERE id = ?`,
      [req.body.status || 'orcamento', parseInt(req.body.km) || 0, req.body.servico || '', req.body.pecas_trocadas || '[]', numero(req.body.valor_pecas || 0), numero(req.body.valor_maodeobra || 0), total, pago, req.body.forma_pagamento || 'pendente', req.body.observacoes || '', agora, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ erro: 'OS não encontrada' });
    logInfo('OS atualizada', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    logError('Erro ao atualizar OS', { id: req.params.id, err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.put('/ordens-servico/:id/status', async (req, res) => {
  try {
    const status = String(req.body.status || '').trim();
    const permitidos = ['orcamento', 'em_andamento', 'aguardando_peca', 'pronto', 'entregue', 'cancelado', 'cancelada'];
    if (!permitidos.includes(status)) return res.status(400).json({ erro: 'Status inválido' });
    const statusBanco = status === 'cancelada' ? 'cancelado' : status;
    const agora = dataBR();
    const fechamento = ['entregue', 'cancelado'].includes(statusBanco) ? agora : null;
    const result = await runAsync(
      `UPDATE ordens_servico SET status = ?, data_atualizacao = ?, data_fechamento = COALESCE(?, data_fechamento) WHERE id = ?`,
      [statusBanco, agora, fechamento, req.params.id]
    );
    if (result.changes === 0) return res.status(404).json({ erro: 'OS não encontrada' });
    if (statusBanco === 'cancelado') logInfo('OS cancelada', { id: req.params.id });
    else if (statusBanco === 'entregue') logInfo('OS entregue', { id: req.params.id });
    else logInfo('Status de OS alterado', { id: req.params.id, status: statusBanco });
    res.json({ success: true });
  } catch (err) {
    logError('Erro ao alterar status OS', { id: req.params.id, err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.post('/servico', async (req, res) => {
  try {
    const placaLimpa = limparPlaca(req.body.placa);
    if (!placaLimpa) return res.status(400).json({ erro: 'Placa obrigatória' });
    const kmNum = parseInt(req.body.km) || 0;
    if (kmNum <= 0) return res.status(400).json({ erro: 'KM atual obrigatória' });
    const veiculo = await getAsync(`SELECT km_atual FROM veiculos WHERE placa = ?`, [placaLimpa]);
    const kmAnterior = parseInt(veiculo?.km_atual) || 0;
    if (kmAnterior > 0 && kmNum < kmAnterior) return res.status(400).json({ erro: `KM inválida. Última KM registrada: ${kmAnterior}` });

    const total = numero(req.body.valor_total || 0);
    const pago = numero(req.body.valor_pago || 0);
    if (total <= 0) return res.status(400).json({ erro: 'O valor total do serviço precisa ser maior que zero' });
    if (pago < 0) return res.status(400).json({ erro: 'Valor pago não pode ser negativo' });
    if (pago > total) return res.status(400).json({ erro: 'Valor pago não pode ser maior que o total' });

    const status_pagamento = calcularStatusPagamento(total, pago);
    const dataAtual = dataBR();
    const result = await runAsync(
      `INSERT INTO servicos (
        placa, km, servico, pecas_trocadas, valor_pecas, valor_maodeobra,
        valor_total, valor_pago, forma_pagamento, status_pagamento, data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [placaLimpa, kmNum, req.body.servico || '', req.body.pecas_trocadas || '[]', numero(req.body.valor_pecas || 0), numero(req.body.valor_maodeobra || 0), total, pago, req.body.forma_pagamento || 'pendente', status_pagamento, dataAtual]
    );
    await runAsync(`UPDATE veiculos SET km_atual = ? WHERE placa = ?`, [kmNum, placaLimpa]);
    logInfo('Serviço fechado', { id: result.lastID, placa: placaLimpa, total, pago });
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    logError('Erro ao fechar serviço', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/servicos/:placa', async (req, res) => {
  try {
    const placa = limparPlaca(req.params.placa);
    const rows = await allAsync(`SELECT * FROM servicos WHERE placa = ? ORDER BY id DESC`, [placa]);
    res.json(rows);
  } catch (err) {
    logError('Erro ao listar histórico', { placa: req.params.placa, err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/pendentes', async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT s.*, v.nome_cliente, v.telefone_cliente, v.ddi_cliente, v.ddd_cliente, v.telefone_numero, v.modelo, v.cor, v.combustivel, v.ano, v.km_atual
      FROM servicos s
      LEFT JOIN veiculos v ON v.placa = s.placa
      WHERE s.status_pagamento != 'pago'
      ORDER BY s.id DESC
    `);
    res.json(rows);
  } catch (err) {
    logError('Erro ao listar pendentes', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

async function receberPagamentoServico(id, valorRecebido, forma_pagamento = null) {
  if (valorRecebido <= 0) {
    const e = new Error('Valor inválido'); e.status = 400; throw e;
  }
  const servico = await getAsync(`SELECT * FROM servicos WHERE id = ?`, [id]);
  if (!servico) { const e = new Error('Serviço não encontrado'); e.status = 404; throw e; }
  const total = numero(servico.valor_total || 0);
  const pagoAtual = numero(servico.valor_pago || 0);
  const restante = Math.max(0, total - pagoAtual);
  if (valorRecebido > restante) {
    const e = new Error(`Valor recebido maior que o restante da OS. Restante: R$ ${restante.toFixed(2)}`);
    e.status = 400; e.restante = restante; throw e;
  }
  const novoValorPago = pagoAtual + valorRecebido;
  const novoStatus = calcularStatusPagamento(total, novoValorPago);
  await runAsync(
    `UPDATE servicos SET valor_pago = ?, status_pagamento = ?, forma_pagamento = COALESCE(?, forma_pagamento) WHERE id = ?`,
    [novoValorPago, novoStatus, forma_pagamento, id]
  );
  return { total_pago: novoValorPago, status_pagamento: novoStatus };
}

app.put('/receber/:id', async (req, res) => {
  try {
    const valorRecebido = numero(req.body.valor || req.body.valor_pago || 0);
    const result = await receberPagamentoServico(req.params.id, valorRecebido, req.body.forma_pagamento || null);
    logInfo('Pagamento recebido', { id: req.params.id, valor: valorRecebido });
    res.json({ success: true, ...result });
  } catch (err) {
    logError('Pagamento inválido/erro', { id: req.params.id, err: err.message });
    res.status(err.status || 500).json({ erro: err.message, restante: err.restante });
  }
});

app.put('/servico/:id/pagamento', async (req, res) => {
  try {
    const novoPagamento = numero(req.body.valor_pago || req.body.valor || 0);
    const result = await receberPagamentoServico(req.params.id, novoPagamento, req.body.forma_pagamento || null);
    logInfo('Pagamento recebido', { id: req.params.id, valor: novoPagamento });
    res.json({ success: true, ...result });
  } catch (err) {
    logError('Pagamento inválido/erro', { id: req.params.id, err: err.message });
    res.status(err.status || 500).json({ erro: err.message, restante: err.restante });
  }
});

function parseDataBR(valor) {
  if (!valor) return null;
  const [dd, mm, yyyy] = String(valor).split('/').map(Number);
  if (!dd || !mm || !yyyy) return null;
  const d = new Date(yyyy, mm - 1, dd);
  d.setHours(0, 0, 0, 0);
  return d;
}

app.get('/estatisticas', async (req, res) => {
  try {
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
    const rows = await allAsync(`SELECT * FROM servicos ORDER BY id DESC`);
    const resumo = { faturamento: 0, recebido: 0, pendente: 0 };
    const formas = { dinheiro: 0, pix: 0, cartao: 0, misto: 0, pendente: 0, outros: 0 };
    const porDia = new Map(labels.map((d) => [d.key, d]));
    let servicos = 0;

    rows.forEach((item) => {
      const dataServico = parseDataBR(item.data);
      if (!dataServico || dataServico < inicio || dataServico > hoje) return;
      const total = numero(item.valor_total || 0);
      const pago = numero(item.valor_pago || 0);
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
      if (!semanasMap.has(key)) semanasMap.set(key, { label: `Semana ${semanaIndex}`, faturado: 0, recebido: 0, pendente: 0, servicos: 0 });
      const semana = semanasMap.get(key);
      semana.faturado += numero(label.faturado);
      semana.recebido += numero(label.recebido);
      semana.servicos += Number(label.servicos || 0);
      semana.pendente += Math.max(0, numero(label.faturado) - numero(label.recebido));
    });

    const painel = {
      servicos,
      ticket_medio: servicos ? resumo.faturamento / servicos : 0,
      percentual_pendente: resumo.faturamento ? (resumo.pendente / resumo.faturamento) * 100 : 0,
    };
    res.json({ resumo, formas, painel, grafico: labels, semanas: Array.from(semanasMap.values()) });
  } catch (err) {
    logError('Erro ao carregar estatísticas', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.post('/api/backup', async (req, res) => {
  try {
    const backup = await fazerBackup();
    res.json({ success: true, backup });
  } catch (err) {
    logError('Erro de backup', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/backup/status', (req, res) => {
  try {
    res.json({ backup_dir: BACKUP_DIR, retention: BACKUP_RETENTION, last_backup: ultimoBackup() });
  } catch (err) {
    logError('Erro ao consultar status de backup', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/api/logs/errors', (req, res) => {
  try {
    res.json({ errors: ultimosErros(20) });
  } catch (err) {
    res.status(500).json({ erro: err.message });
  }
});

app.use((err, req, res, next) => {
  logError('Erro não tratado', { err: err.message, path: req.path });
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

app.listen(PORT, HOST, () => {
  logInfo('Servidor iniciado', { host: HOST, port: PORT, url: `http://localhost:${PORT}` });
  console.log(`Servidor rodando em: http://localhost:${PORT}`);
  console.log(`Acesso na rede local: http://IP_DO_NOTE:${PORT}`);
});
