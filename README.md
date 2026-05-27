# Sistema de Gestão de Oficina

App local para oficina pequena, feito em Node.js + Express + SQLite + HTML/CSS/JS puro.

Esta versão mantém a sprint de confiabilidade já implementada e aplica uma sprint de UI/UX e responsividade, sem adicionar ERP gigante nem features fora do escopo.

## Como rodar no notebook

```bash
npm install
npm start
```

Depois acesse:

```txt
http://localhost:3001
```

A porta padrão desta revisão é `3001`. Você ainda pode trocar usando a variável `PORT`.

## Rodar em outra porta / rede local

No PowerShell:

```powershell
$env:HOST="0.0.0.0"; $env:PORT="3001"; npm start
```

No Prompt/cmd:

```bat
set HOST=0.0.0.0
set PORT=3001
npm start
```

No Linux/macOS:

```bash
HOST=0.0.0.0 PORT=3001 npm start
```

## Acessar pelo celular na mesma rede

1. Rode o app no notebook com `HOST=0.0.0.0`.
2. Descubra o IP do notebook.
   - Windows: `ipconfig`
   - procure por IPv4, algo como `192.168.0.25`.
3. No celular, conectado ao mesmo Wi-Fi, abra:

```txt
http://IP_DO_NOTE:3001
```

Exemplo:

```txt
http://192.168.0.25:3001
```

Use apenas em rede local. Não exponha a porta na internet.

## Backup manual

Na aba **Configurações**, clique em **Fazer backup agora**.

O backup é salvo em:

```txt
backups/
```

Formato:

```txt
oficina-backup-YYYY-MM-DD-HH-mm.db
```

O sistema mantém os backups mais recentes e registra erros em `logs/`.

## Restaurar backup manualmente

1. Feche o app.
2. Entre na pasta `backups/`.
3. Copie o arquivo de backup desejado.
4. Renomeie a cópia para `oficina.db`.
5. Substitua o `oficina.db` da raiz do projeto.
6. Abra o app novamente.

## GitHub / dados reais

Não suba dados reais para o GitHub.

O `.gitignore` deve proteger:

```txt
oficina.db
backups/
logs/
node_modules/
*.pdf
.env
```

## Fluxo principal de uso

```txt
Buscar placa
→ se existe, abrir veículo
→ se não existe, cadastrar
→ registrar serviço/KM/peças/valores
→ gerar WhatsApp/PDF se necessário
→ fechar serviço
→ consultar histórico
```

A OS aberta continua opcional. O serviço rápido continua sendo o fluxo principal.

## Checklist rápido de teste manual

- [ ] cadastrar veículo novo;
- [ ] buscar veículo existente;
- [ ] buscar placa inexistente;
- [ ] adicionar peça;
- [ ] remover peça;
- [ ] fechar serviço;
- [ ] consultar histórico;
- [ ] impedir KM menor;
- [ ] encaminhar orçamento;
- [ ] gerar PDF;
- [ ] WhatsApp de fechamento;
- [ ] pagamento parcial;
- [ ] pagamento total;
- [ ] impedir pagamento maior que restante;
- [ ] abrir pendências;
- [ ] fazer backup manual;
- [ ] consultar últimos erros;
- [ ] testar tema claro/escuro;
- [ ] testar em celular na LAN.

## Sprint atual de UI/UX

- Sidebar mais limpa no desktop.
- Bottom navigation no mobile.
- Oficina Hoje como cockpit principal.
- Serviço rápido em layout de duas colunas no desktop.
- Financeiro do serviço mais legível.
- Clientes em tabela no desktop e cards no mobile.
- Configurações organizadas por seções.
- Sem scroll horizontal global no mobile.
- Backend preparado para `HOST` e `PORT` via variável de ambiente.

## Polimento cirúrgico v1.1

- Tipografia ajustada para `Inter, system-ui` com pesos mais leves e legíveis.
- Sidebar ficou mais confortável, com botões mais altos e espaçados.
- Header do veículo voltou a ter placa no estilo Mercosul e bloco de contato integrado.
- Cadastro separa telefone em `DDI`, `DDD` e `Telefone / WhatsApp`.
- O backend mantém compatibilidade com `telefone_cliente` antigo e cria as colunas novas automaticamente:
  - `ddi_cliente`
  - `ddd_cliente`
  - `telefone_numero`
- WhatsApp usa helper central para montar o número internacional sem duplicar DDI.
- Histórico expandido recebeu blocos mais claros para serviço, peças e pagamento.
- Pendências mostram cliente, carro, telefone, placa, valores e ação de recebimento em card.
- Mobile mantém navegação inferior, sem scroll horizontal global.

## Logo da oficina e Ordem de Serviço

A aba **Configurações** permite enviar uma logo da oficina para ser usada na sidebar e na Ordem de Serviço imprimível.

Regras da logo:

- formatos aceitos: PNG, JPG/JPEG e WEBP;
- tamanho máximo: 2MB;
- arquivo salvo localmente em `uploads/logo-oficina.ext`;
- se não houver logo, o sistema usa o nome/descrição da oficina como fallback textual;
- a pasta `uploads/` não deve ser enviada com dados reais para o GitHub.

A Ordem de Serviço/PDF usa os dados cadastrados em **Configurações**:

- nome da oficina;
- descrição/subtítulo;
- telefone;
- CNPJ;
- endereço;
- bairro;
- cidade/UF;
- CEP;
- serviços exibidos no cabeçalho da OS.

O campo **Serviços exibidos no cabeçalho da OS** aceita uma linha por serviço. Se ficar vazio, o sistema usa uma lista padrão simples.

O PDF continua sendo gerado via HTML/impressão em A4. O navegador não anexa PDF automaticamente ao WhatsApp; o fluxo correto é gerar/imprimir/salvar o PDF e anexar manualmente, se necessário.


## Revisão técnica final pré-pull

Esta revisão removeu do pacote de entrega arquivos que não devem ir para o Git, como `.git/`, `oficina.db`, `logs/`, `backups/`, `node_modules/` e uploads reais.

Ajustes importantes desta revisão:

- `package.json` e `package-lock.json` foram realinhados.
- `sqlite3` foi atualizado para `^6.0.1` para melhor compatibilidade com Node moderno e correção de alertas de segurança.
- `multer` foi fixado em `^1.4.5-lts.2`.
- Porta padrão ajustada para `3001`, mantendo suporte a `HOST` e `PORT`.
- Scripts `.bat`/`.ps1` agora rodam `npm install` para garantir dependências após pull.
- `.gitignore` protege `*.db-wal`, `*.db-shm`, logs, backups, uploads reais, PDFs, `.env` e `node_modules/`.
- A logo no PDF usa URL absoluta para evitar falha de imagem na janela de impressão.

### Comandos recomendados no notebook servidor

```powershell
git pull
npm install
$env:HOST="0.0.0.0"; $env:PORT="3001"; npm start
```

Ou dê dois cliques em `INICIAR_OFICINA.bat`.

### Acesso pelo celular na LAN

Com o app rodando no notebook:

```txt
http://IP_DO_NOTE:3001
```

Use apenas em rede local. Não exponha a porta na internet.
