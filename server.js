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
const OS_UPLOAD_DIR = path.join(UPLOAD_DIR, 'os');
const BACKUP_RETENTION = 60;

fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
fs.mkdirSync(OS_UPLOAD_DIR, { recursive: true });

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

const OS_ANEXO_MAX_SIZE = 5 * 1024 * 1024;
const OS_ANEXO_MAX_FILES = 12;
const OS_ANEXO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const OS_ANEXO_EXT_BY_MIME = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const uploadOSAnexos = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: OS_ANEXO_MAX_SIZE, files: OS_ANEXO_MAX_FILES },
  fileFilter: (_req, file, cb) => {
    if (!OS_ANEXO_MIMES.has(file.mimetype)) {
      return cb(new Error('Tipo de arquivo inválido. Use JPG, PNG ou WEBP.'));
    }
    cb(null, true);
  },
});

function safePathSegment(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'sem-numero';
}

function caminhoSeguroDentro(baseDir, relativePath = '') {
  const full = path.resolve(ROOT_DIR, relativePath);
  const base = path.resolve(baseDir);
  if (!full.startsWith(base + path.sep) && full !== base) return null;
  return full;
}

function nomeSeguroAnexo(servico, file, index = 0) {
  const ext = OS_ANEXO_EXT_BY_MIME[file.mimetype] || '.jpg';
  const base = safePathSegment(servico.numero_os || `servico-${servico.id}`);
  return `${base}-${Date.now()}-${index + 1}${ext}`;
}

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


function parseAnoOS(valor) {
  if (!valor) return new Date().getFullYear();
  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-/);
  if (iso) return Number(iso[1]) || new Date().getFullYear();
  const br = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) return Number(br[3]) || new Date().getFullYear();
  const d = new Date(texto);
  if (!Number.isNaN(d.getTime())) return d.getFullYear();
  return new Date().getFullYear();
}

function formatarNumeroOS(ano, sequencia) {
  return `${ano}-${String(sequencia).padStart(4, '0')}`;
}

async function proximoNumeroOS(ano = new Date().getFullYear()) {
  const anoNum = Number(ano) || new Date().getFullYear();
  const rowOrdens = await getAsync(`SELECT MAX(sequencia_os) AS max_seq FROM ordens_servico WHERE ano_os = ?`, [anoNum]);
  const rowServicos = await getAsync(`SELECT MAX(sequencia_os) AS max_seq FROM servicos WHERE ano_os = ?`, [anoNum]);
  const atual = Math.max(Number(rowOrdens?.max_seq || 0), Number(rowServicos?.max_seq || 0));
  const sequencia = atual + 1;
  return { ano_os: anoNum, sequencia_os: sequencia, numero_os: formatarNumeroOS(anoNum, sequencia) };
}

function migrarNumerosOS() {
  db.all(`
    SELECT 'servicos' AS origem, id, data AS data_ref, numero_os, ano_os, sequencia_os
    FROM servicos
  `, [], (err, rows = []) => {
    if (err) return logError('Erro ao mapear números de OS', { err: err.message });

    const usados = new Map();
    const pendentes = [];
    rows.forEach((row) => {
      const numero = String(row.numero_os || '').trim();
      const match = numero.match(/^(\d{4})-(\d{4})$/);
      if (match) {
        const ano = Number(match[1]);
        const seq = Number(match[2]);
        usados.set(ano, Math.max(usados.get(ano) || 0, seq));
        if (!row.ano_os || !row.sequencia_os) {
          db.run(`UPDATE ${row.origem} SET ano_os = ?, sequencia_os = ? WHERE id = ?`, [ano, seq, row.id]);
        }
      } else {
        pendentes.push(row);
      }
    });

    pendentes.sort((a, b) => {
      const da = parseAnoOS(a.data_ref) - parseAnoOS(b.data_ref);
      if (da) return da;
      const ta = String(a.data_ref || '').localeCompare(String(b.data_ref || ''));
      if (ta) return ta;
      const oa = a.origem.localeCompare(b.origem);
      if (oa) return oa;
      return Number(a.id) - Number(b.id);
    });

    pendentes.forEach((row) => {
      const ano = parseAnoOS(row.data_ref);
      const seq = (usados.get(ano) || 0) + 1;
      usados.set(ano, seq);
      const numero = formatarNumeroOS(ano, seq);
      db.run(`UPDATE ${row.origem} SET numero_os = ?, ano_os = ?, sequencia_os = ? WHERE id = ? AND (numero_os IS NULL OR numero_os = '')`, [numero, ano, seq, row.id], (updateErr) => {
        if (updateErr) logError('Erro ao preencher número de OS legado', { origem: row.origem, id: row.id, err: updateErr.message });
      });
    });

    if (pendentes.length) logInfo('Números de OS preenchidos em registros legados', { quantidade: pendentes.length });

    db.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_ordens_numero_os ON ordens_servico(numero_os) WHERE numero_os IS NOT NULL AND numero_os != ''`, (idxErr) => {
      if (idxErr) logError('Erro ao criar índice único numero_os em ordens', { err: idxErr.message });
    });
    db.run(`CREATE INDEX IF NOT EXISTS idx_servicos_numero_os ON servicos(numero_os)`, (idxErr) => {
      if (idxErr) logError('Erro ao criar índice numero_os em serviços', { err: idxErr.message });
    });
  });
}

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
      data TEXT,
      ordem_servico_id INTEGER,
      numero_os TEXT,
      ano_os INTEGER,
      sequencia_os INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ordens_servico (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      numero_os TEXT,
      ano_os INTEGER,
      sequencia_os INTEGER,
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

  function addServicoColumn(column, ddl) {
    db.run(`ALTER TABLE servicos ADD COLUMN ${column} ${ddl}`, (err) => {
      if (!err) return logInfo('Coluna adicionada', { table: 'servicos', column });
      if (!String(err.message || '').includes('duplicate column name')) {
        logError('Erro ao adicionar coluna', { table: 'servicos', column, err: err.message });
      }
    });
  }

  addServicoColumn('numero_os', 'TEXT');
  addServicoColumn('ano_os', 'INTEGER');
  addServicoColumn('sequencia_os', 'INTEGER');
  addServicoColumn('ordem_servico_id', 'INTEGER');

  function addOrdemColumn(column, ddl) {
    db.run(`ALTER TABLE ordens_servico ADD COLUMN ${column} ${ddl}`, (err) => {
      if (!err) return logInfo('Coluna adicionada', { table: 'ordens_servico', column });
      if (!String(err.message || '').includes('duplicate column name')) {
        logError('Erro ao adicionar coluna', { table: 'ordens_servico', column, err: err.message });
      }
    });
  }

  addOrdemColumn('numero_os', 'TEXT');
  addOrdemColumn('ano_os', 'INTEGER');
  addOrdemColumn('sequencia_os', 'INTEGER');

  db.run(`
    CREATE TABLE IF NOT EXISTS os_anexos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      os_id INTEGER NOT NULL,
      servico_id INTEGER NOT NULL,
      numero_os TEXT,
      filename TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      size_bytes INTEGER,
      relative_path TEXT NOT NULL,
      legenda TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )
  `);

  migrarNumerosOS();

  createIndex('idx_veiculos_placa', `CREATE INDEX IF NOT EXISTS idx_veiculos_placa ON veiculos(placa)`);
  createIndex('idx_servicos_placa', `CREATE INDEX IF NOT EXISTS idx_servicos_placa ON servicos(placa)`);
  createIndex('idx_servicos_data', `CREATE INDEX IF NOT EXISTS idx_servicos_data ON servicos(data)`);
  createIndex('idx_servicos_status_pagamento', `CREATE INDEX IF NOT EXISTS idx_servicos_status_pagamento ON servicos(status_pagamento)`);
  createIndex('idx_ordens_placa', `CREATE INDEX IF NOT EXISTS idx_ordens_placa ON ordens_servico(placa)`);
  createIndex('idx_ordens_status', `CREATE INDEX IF NOT EXISTS idx_ordens_status ON ordens_servico(status)`);
  createIndex('idx_ordens_data_abertura', `CREATE INDEX IF NOT EXISTS idx_ordens_data_abertura ON ordens_servico(data_abertura)`);
  createIndex('idx_ordens_ano_seq', `CREATE INDEX IF NOT EXISTS idx_ordens_ano_seq ON ordens_servico(ano_os, sequencia_os)`);
  createIndex('idx_servicos_ano_seq', `CREATE INDEX IF NOT EXISTS idx_servicos_ano_seq ON servicos(ano_os, sequencia_os)`);
  createIndex('idx_os_anexos_servico', `CREATE INDEX IF NOT EXISTS idx_os_anexos_servico ON os_anexos(servico_id)`);
  createIndex('idx_os_anexos_os', `CREATE INDEX IF NOT EXISTS idx_os_anexos_os ON os_anexos(os_id)`);
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
  let iniciouTransacao = false;
  try {
    const placa = limparPlaca(req.body.placa);
    if (!placa) return res.status(400).json({ erro: 'Placa obrigatória' });
    const total = numero(req.body.valor_total || 0);
    const pago = numero(req.body.valor_pago || 0);
    if (pago < 0 || pago > total) return res.status(400).json({ erro: 'Valor pago inválido para a OS' });
    const agora = dataBR();

    await runAsync('BEGIN IMMEDIATE');
    iniciouTransacao = true;

    // OS aberta é operacional/orçamento. Não consome numero_os formal.
    // O numero_os no padrão YYYY-0001 só é gerado no fechamento oficial do serviço.
    const result = await runAsync(
      `INSERT INTO ordens_servico (
        placa, status, km, servico, pecas_trocadas, valor_pecas, valor_maodeobra,
        valor_total, valor_pago, forma_pagamento, observacoes, data_abertura, data_atualizacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [placa, req.body.status || 'orcamento', parseInt(req.body.km) || 0, req.body.servico || '', req.body.pecas_trocadas || '[]', numero(req.body.valor_pecas || 0), numero(req.body.valor_maodeobra || 0), total, pago, req.body.forma_pagamento || 'pendente', req.body.observacoes || '', agora, agora]
    );
    await runAsync('COMMIT');
    iniciouTransacao = false;

    logInfo('OS aberta criada como orçamento/prévia', { id: result.lastID, placa });
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    if (iniciouTransacao) {
      try { await runAsync('ROLLBACK'); } catch (_) {}
    }
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
  let iniciouTransacao = false;
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
    const ordemId = req.body.ordem_servico_id ? Number(req.body.ordem_servico_id) : null;

    await runAsync('BEGIN IMMEDIATE');
    iniciouTransacao = true;

    let numeracao = null;
    if (ordemId) {
      const os = await getAsync(`SELECT id, numero_os, ano_os, sequencia_os FROM ordens_servico WHERE id = ?`, [ordemId]);
      if (os?.numero_os) {
        numeracao = { numero_os: os.numero_os, ano_os: os.ano_os || parseAnoOS(dataAtual), sequencia_os: os.sequencia_os || 0 };
      }
    }
    if (!numeracao) numeracao = await proximoNumeroOS(parseAnoOS(dataAtual));

    if (ordemId) {
      await runAsync(
        `UPDATE ordens_servico
         SET numero_os = COALESCE(NULLIF(numero_os, ''), ?),
             ano_os = COALESCE(ano_os, ?),
             sequencia_os = COALESCE(sequencia_os, ?),
             data_atualizacao = ?
         WHERE id = ?`,
        [numeracao.numero_os, numeracao.ano_os, numeracao.sequencia_os, dataAtual, ordemId]
      );
    }

    const result = await runAsync(
      `INSERT INTO servicos (
        placa, km, servico, pecas_trocadas, valor_pecas, valor_maodeobra,
        valor_total, valor_pago, forma_pagamento, status_pagamento, data,
        ordem_servico_id, numero_os, ano_os, sequencia_os
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [placaLimpa, kmNum, req.body.servico || '', req.body.pecas_trocadas || '[]', numero(req.body.valor_pecas || 0), numero(req.body.valor_maodeobra || 0), total, pago, req.body.forma_pagamento || 'pendente', status_pagamento, dataAtual, ordemId, numeracao.numero_os, numeracao.ano_os, numeracao.sequencia_os]
    );
    await runAsync(`UPDATE veiculos SET km_atual = ? WHERE placa = ?`, [kmNum, placaLimpa]);
    await runAsync('COMMIT');
    iniciouTransacao = false;

    logInfo('Serviço fechado', { id: result.lastID, numero_os: numeracao.numero_os, placa: placaLimpa, total, pago });
    res.json({ success: true, id: result.lastID, ...numeracao });
  } catch (err) {
    if (iniciouTransacao) {
      try { await runAsync('ROLLBACK'); } catch (_) {}
    }
    logError('Erro ao fechar serviço', { err: err.message });
    res.status(500).json({ erro: err.message });
  }
});

app.get('/servicos', async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT s.*, v.nome_cliente, v.telefone_cliente, v.ddi_cliente, v.ddd_cliente, v.telefone_numero,
             v.modelo, v.cor, v.combustivel, v.ano, v.km_atual
      FROM servicos s
      LEFT JOIN veiculos v ON v.placa = s.placa
      ORDER BY s.id DESC
    `);
    res.json(rows);
  } catch (err) {
    logError('Erro ao listar serviços globais', { err: err.message });
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


async function obterServicoParaAnexo(servicoId) {
  const id = Number(servicoId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return getAsync(`
    SELECT s.*, v.nome_cliente, v.modelo, v.ano, v.cor, v.combustivel
    FROM servicos s
    LEFT JOIN veiculos v ON v.placa = s.placa
    WHERE s.id = ?
  `, [id]);
}

async function listarAnexosServico(servicoId) {
  return allAsync(`
    SELECT id, os_id, servico_id, numero_os, filename, original_name, mime_type, size_bytes, legenda, created_at, updated_at
    FROM os_anexos
    WHERE servico_id = ?
    ORDER BY id ASC
  `, [servicoId]);
}

app.get(['/api/servicos/:id/anexos', '/api/os/:id/anexos'], async (req, res) => {
  try {
    const servico = await obterServicoParaAnexo(req.params.id);
    if (!servico) return res.status(404).json({ erro: 'Serviço/OS não encontrado' });
    const anexos = await listarAnexosServico(servico.id);
    res.json({ anexos, limite: OS_ANEXO_MAX_FILES });
  } catch (err) {
    logError('Erro ao listar anexos da OS', { id: req.params.id, err: err.message });
    res.status(500).json({ erro: 'Erro ao listar fotos da OS' });
  }
});

app.post(['/api/servicos/:id/anexos', '/api/os/:id/anexos'], (req, res) => {
  uploadOSAnexos.array('fotos', OS_ANEXO_MAX_FILES)(req, res, async (err) => {
    if (err) {
      const mensagem = err.code === 'LIMIT_FILE_SIZE'
        ? 'Cada foto deve ter no máximo 5MB.'
        : err.code === 'LIMIT_FILE_COUNT'
          ? `Envie no máximo ${OS_ANEXO_MAX_FILES} fotos por vez.`
          : err.message;
      logError('Erro no upload de fotos da OS', { id: req.params.id, err: mensagem });
      return res.status(400).json({ erro: mensagem });
    }

    const salvos = [];
    try {
      const servico = await obterServicoParaAnexo(req.params.id);
      if (!servico) return res.status(404).json({ erro: 'Serviço/OS não encontrado' });
      const files = Array.isArray(req.files) ? req.files : [];
      if (!files.length) return res.status(400).json({ erro: 'Nenhuma foto enviada' });

      const existentes = await getAsync(`SELECT COUNT(*) AS total FROM os_anexos WHERE servico_id = ?`, [servico.id]);
      const totalDepois = Number(existentes?.total || 0) + files.length;
      if (totalDepois > OS_ANEXO_MAX_FILES) {
        return res.status(400).json({ erro: `Limite de ${OS_ANEXO_MAX_FILES} fotos por OS atingido.` });
      }

      const pastaOS = safePathSegment(servico.numero_os || `servico-${servico.id}`);
      const destinoDir = path.join(OS_UPLOAD_DIR, pastaOS);
      fs.mkdirSync(destinoDir, { recursive: true });

      for (const [index, file] of files.entries()) {
        const ext = OS_ANEXO_EXT_BY_MIME[file.mimetype];
        if (!ext) throw new Error('Tipo de arquivo inválido. Use JPG, PNG ou WEBP.');
        const filename = nomeSeguroAnexo(servico, file, index);
        const destino = path.join(destinoDir, filename);
        fs.writeFileSync(destino, file.buffer);
        salvos.push(destino);
        const relativePath = path.relative(ROOT_DIR, destino).replace(/\\/g, '/');
        await runAsync(`
          INSERT INTO os_anexos (
            os_id, servico_id, numero_os, filename, original_name, mime_type,
            size_bytes, relative_path, legenda, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [servico.id, servico.id, servico.numero_os || '', filename, file.originalname || filename, file.mimetype, file.size, relativePath, '', new Date().toISOString()]);
      }

      logInfo('Fotos anexadas à OS', { servico_id: servico.id, numero_os: servico.numero_os, quantidade: files.length });
      res.json({ success: true, anexos: await listarAnexosServico(servico.id) });
    } catch (saveErr) {
      for (const full of salvos) {
        try { fs.unlinkSync(full); } catch (_) {}
      }
      logError('Erro ao salvar fotos da OS', { id: req.params.id, err: saveErr.message });
      res.status(500).json({ erro: 'Erro ao salvar fotos da OS' });
    }
  });
});

app.get(['/api/servicos/:id/anexos/:anexoId/file', '/api/os/:id/anexos/:anexoId/file'], async (req, res) => {
  try {
    const servico = await obterServicoParaAnexo(req.params.id);
    if (!servico) return res.status(404).send('Serviço/OS não encontrado');
    const anexo = await getAsync(`SELECT * FROM os_anexos WHERE id = ? AND servico_id = ?`, [req.params.anexoId, servico.id]);
    if (!anexo) return res.status(404).send('Foto não encontrada');
    const full = caminhoSeguroDentro(OS_UPLOAD_DIR, anexo.relative_path);
    if (!full || !fs.existsSync(full)) return res.status(404).send('Arquivo não encontrado');
    res.type(anexo.mime_type || 'image/jpeg');
    res.sendFile(full);
  } catch (err) {
    logError('Erro ao servir foto da OS', { id: req.params.id, anexo: req.params.anexoId, err: err.message });
    res.status(500).send('Erro ao abrir foto');
  }
});

app.delete(['/api/servicos/:id/anexos/:anexoId', '/api/os/:id/anexos/:anexoId'], async (req, res) => {
  try {
    const servico = await obterServicoParaAnexo(req.params.id);
    if (!servico) return res.status(404).json({ erro: 'Serviço/OS não encontrado' });
    const anexo = await getAsync(`SELECT * FROM os_anexos WHERE id = ? AND servico_id = ?`, [req.params.anexoId, servico.id]);
    if (!anexo) return res.status(404).json({ erro: 'Foto não encontrada' });
    const full = caminhoSeguroDentro(OS_UPLOAD_DIR, anexo.relative_path);
    await runAsync(`DELETE FROM os_anexos WHERE id = ? AND servico_id = ?`, [req.params.anexoId, servico.id]);
    if (full && fs.existsSync(full)) fs.unlinkSync(full);
    logInfo('Foto removida da OS', { servico_id: servico.id, anexo_id: req.params.anexoId });
    res.json({ success: true });
  } catch (err) {
    logError('Erro ao remover foto da OS', { id: req.params.id, anexo: req.params.anexoId, err: err.message });
    res.status(500).json({ erro: 'Erro ao remover foto' });
  }
});

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
