# HugMe · Resposta privada RA (bookmarklet)

Favorito que lê uma planilha `.xlsx` no navegador e envia, um ticket por vez, a resposta privada padrão pelo HugMe, usando a sessão já autenticada.

## Arquivos

| Arquivo | Para quê |
|---|---|
| `dist/instalar-hugme-resposta-privada.html` | **Instalador.** Abra no navegador e arraste o botão para a barra de favoritos. |
| `dist/bookmarklet-url.txt` | A mesma URL `javascript:` do favorito, para instalação manual. |
| `src/bookmarklet.js` | Código-fonte legível (o instalador é gerado a partir dele). |
| `build.cjs` | Gera o `dist/` a partir do `src/`: `node build.cjs`. |
| `docs/MAPA-JS.txt` | Transcrição literal do mapa com os quatro JS Paths. |
| `docs/mensagem-modelo.txt` | Texto literal da mensagem. Os testes conferem que o código usa exatamente este texto. |
| `tests/` | Página HugMe simulada, planilhas fictícias e testes automatizados. |

## Uso rápido

1. **Instalar:** abra `dist/instalar-hugme-resposta-privada.html` no Chrome ou Edge e arraste o botão “HugMe Resposta privada” para a barra de favoritos.
2. **Abrir o painel:** entre no HugMe (`app.hugme.com.br`) com seu login, abra a tela de tickets e clique no favorito. Arraste o painel pela barra superior; dois cliques na barra o devolvem ao canto direito.
3. **Importar:** em “1 · Planilha”, escolha o `.xlsx`. Confira a tabela de colunas: ela mostra a grafia encontrada no arquivo para C, Q, W e AA.
4. **Especialistas:** na seção “Especialistas”, digite cada nome e clique em “Adicionar”. Linhas com a coluna Tags vazia usam os nomes marcados; com mais de um marcado, os nomes se alternam em rodízio, na ordem da planilha. “Usar os marcados em todas as linhas” ignora a coluna Tags (útil para testar). Os nomes ficam salvos neste navegador.
5. **Conferir a prévia:** clique em cada linha para ver o texto completo. Linhas “Revisar especialista” precisam da escolha manual do especialista.
6. **Teste seguro no 1º ticket:** marque **“Parar antes de enviar”** e clique em “Preparar e parar antes do envio”. O robô abre o primeiro ticket da fila, preenche e confere a mensagem, destaca “Responder privado” em vermelho e encerra sem clicar. Isso vale mesmo com “Envio real” marcado. A trava fica salva até você desmarcá-la, e só pode ser desligada com a fila parada.
7. **Simular a fila toda:** deixe “Simulação” marcado e clique em “Simular fila”. O robô percorre todas as linhas, menos o clique em “Responder privado”. As linhas simuladas continuam disponíveis para o envio real.
8. **Enviar:** desmarque a trava, marque “Envio real” e clique em “Iniciar envio”. Pausar, Retomar e Parar funcionam a qualquer momento.

## Contrato da planilha

A leitura usa a **posição física** da célula (a referência `C5`, `Q5`…), mesmo com colunas vazias no meio. O arquivo nunca é alterado.

| Informado | Coluna | Grafia no arquivo de referência | Uso |
|---|---|---|---|
| Nome | Q | `Nome` | `[Nome do Cliente]` |
| Tags | AA | `Tags` | `{Especialista}`, nas duas posições |
| id origem | C | `Id Origem` (capitalização diferente) | pesquisa no acesso rápido |
| Telefone | W | `Telefones` (com “s”) | `{xx xxxx-xxxx}` |
| *(evidência)* | A | `Id HugMe` | confirma o ticket aberto |

- **Cabeçalho:** detectado automaticamente como a primeira linha com C, Q, W e AA preenchidas (linha 4 no arquivo de referência). Pode ser ajustado no painel.
- **Texto:** IDs e telefones são usados como texto. Números do Excel não viram notação científica, e um formato `00000000000` mantém o zero inicial. Só os espaços nas pontas são removidos.
- **Telefone com `;`:** o conteúdo da célula entra inteiro no placeholder, com 2, 3 ou mais números, na ordem original e com os espaços em volta do `;`, em uma única mensagem. Exemplo fictício: `no número 11900000010 ; 11900000011 ; 11900000012, sem sucesso.`
- **Tags vazia:** a linha fica em **Revisar especialista** até haver um nome marcado na lista ou escolhido na própria linha. Não é mais tratada como incompleta.
- **Tags:** um único nome vira o especialista, exatamente como está na célula. Com `;`, `,`, `|`, `/` ou quebra de linha, a linha fica em **Revisar especialista** e o operador escolhe. O robô nunca escolhe a primeira tag. Na planilha de referência só há tags simples, e “Quantidade de Tags” (Z) vale 0 mesmo com a tag preenchida, por isso Z não é usada como evidência.
- **Linha incompleta** (Nome, id origem ou Telefone vazio) e **id origem repetido** não entram na fila. A prévia mostra o motivo.

## Fluxo de cada linha

1. **Passo #1:** preenche `#input-id-reclamacao` com o id origem e pressiona Enter. O ticket só conta como confirmado quando a URL mostra o **Id HugMe da coluna A** e o conteúdo novo substituiu o anterior. Sem a coluna A, exige a URL nova e o id origem visível na tela.
2. **Passo #2:** clica em `li.btn_resp_privada_tiqt > a.pointer` e espera a área privada abrir.
3. **Passo #3:** clica no botão do path com `:nth-child(3)` (“Busca por contato”) e espera o modelo carregar no editor.
4. **Editor:** troca todo o texto do editor pela mensagem da linha, dispara `input`/`change`/`keyup`/`blur` (eventos que o `ng-model` do AngularJS escuta), relê o editor e compara com o modelo literal, inclusive os dois telefones.
5. **Passo #4** (só em Envio real): clica **uma vez** em “Responder privado”. Antes do clique, a linha é gravada como “Verificar envio”. Só vira “Enviado” quando o texto enviado aparece no ticket. Sem esse sinal no tempo limite, a linha fica em **Verificar envio** e a fila para. Ela nunca é reenviada sozinha.

Cada passo confere também o texto do elemento (“Resposta privada”, “Busca por contato”, “Responder privado”). Se o JS Path achar mais de um elemento visível, ou um texto diferente, nada é clicado e aparece um diagnóstico com linha, id e passo.

**Histórico:** fica no `localStorage` do HugMe, neste navegador. Ao retomar, linhas “Enviado” e “Verificar envio” ficam bloqueadas, e as pendentes seguem. Para uma linha em “Verificar envio”, confira o ticket e use “Conferi: foi enviado” ou “Conferi: NÃO foi enviado”.

## O que depende da sessão real do HugMe

Os testes rodaram numa página simulada com a mesma estrutura dos quatro JS Paths. Três pontos só podem ser confirmados no HugMe real:

| Ponto | Passo | O que o robô supõe | Captura, se falhar |
|---|---|---|---|
| Disparo da pesquisa | Passo #1 | Enter no `#input-id-reclamacao` abre o ticket e a URL mostra o Id HugMe | Gravação ou descrição do que acontece ao pesquisar; *outerHTML* do campo e do botão de pesquisa, se houver |
| Editor da mensagem | Editor (sem JS Path no mapa) | Há um único editor visível dentro de `ticket-view-response[type="'ra-private-reply'"]`. O `ng-disabled` do botão de envio (`tiqt.message === '<p><br></p>'`) mostra que é um editor de texto rico em HTML: o robô grava um parágrafo com as linhas separadas por `<br>`. Também aceita `textarea` | No HugMe: Resposta privada → botão direito no campo do texto → Inspecionar → no elemento: *Copy JS path* e *Copy outerHTML* |
| Sinal de sucesso | Passo #4 | O texto enviado aparece no ticket depois do clique | *outerHTML* do aviso ou da mensagem que aparece depois de um envio real |

Com a captura em mãos, os seletores do editor e do sinal de sucesso podem ser salvos em **Ajustes avançados**, sem mudar os quatro JS Paths.

## Testes

```bash
python3 tests/make-fixtures.py
```

```bash
node build.cjs && node tests/run-tests.cjs
```

O resultado fica em `tests/RESULTADOS.md`. Nenhuma mensagem real é enviada: o endereço `app.hugme.com.br` é interceptado e servido pela página `tests/mock-hugme.html`. Requer Node 18+ e Playwright.
