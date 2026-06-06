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
http://localhost:3000
```

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

## Sprint 1 — UI Notebook + Combustível + Multer 2.x

Esta sprint não muda o fluxo principal. Ela adiciona ajustes para notebook, campo de combustível e atualização segura do upload de logo.

### Densidade da interface

Na aba **Configurações**, existe a opção **Densidade da interface**:

- **Auto**: aplica modo compacto quando a tela for menor que 1366px de largura ou menor que 760px de altura.
- **Confortável**: mantém espaçamentos maiores.
- **Compacta**: reduz paddings, gaps e altura dos componentes sem deixar a fonte pequena demais.

A preferência fica salva no navegador em:

```txt
oficina_ui_density
```

### Campo Combustível

O cadastro de veículo agora possui o campo **Combustível**.

Opções atuais:

- Flex
- Gasolina
- Etanol/Álcool
- Diesel
- GNV
- Elétrico
- Híbrido
- Outro
- Não informado

O banco cria a coluna automaticamente se ela não existir:

```sql
combustivel TEXT DEFAULT 'Não informado'
```

O combustível aparece no header do veículo, na lista de clientes e na OS/PDF.

### Upload e Multer 2.x

O upload da logo usa `multer` 2.x.

Regras mantidas:

- aceita PNG, JPG/JPEG e WEBP;
- limite de 2MB;
- rejeita arquivos inválidos;
- salva apenas a logo em `uploads/logo-oficina.ext`;
- `uploads/` continua fora do Git, exceto `.gitkeep`.

### Teste rápido da sprint

- [ ] `npm install`
- [ ] `npm start`
- [ ] abrir `http://localhost:3001`
- [ ] testar densidade Auto/Confortável/Compacta
- [ ] recarregar e confirmar preferência salva
- [ ] cadastrar veículo com combustível
- [ ] abrir veículo e conferir combustível no header
- [ ] conferir combustível na lista de clientes
- [ ] gerar OS/PDF e conferir combustível
- [ ] upload de logo
- [ ] remover logo
- [ ] confirmar que não há scroll horizontal global em 1366x768 e 1280x720

