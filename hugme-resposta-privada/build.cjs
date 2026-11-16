// Gera dist/instalar-hugme-resposta-privada.html (favorito) e dist/bookmarklet-url.txt a partir de src/bookmarklet.js.
// Uso: node build.cjs
const fs = require('fs'), path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'src/bookmarklet.js'), 'utf8');
const version = (/v(\d+\.\d+)/.exec(src.split('\n')[0]) || [, '1.0'])[1];
// Camada 1 (URL javascript:): percent-encoding de todo o código. Camada 2 (atributo HTML): escape de & " ' < >.
const url = 'javascript:' + encodeURIComponent(src).replace(/'/g, '%27');
const attr = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instalar · HugMe Resposta privada</title>
<style>
body{background:#101722;color:#f0f4fa;font:16px/1.65 system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 16px}
small{color:#73dfc6;letter-spacing:.08em}h1{font-size:34px;line-height:1.2;letter-spacing:-1px;margin:.3em 0}h2{font-size:20px;margin-top:32px}
p,li{color:#c3cfdd}a.bm{color:#09271e;background:#73dfc6;display:inline-block;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none}
textarea{box-sizing:border-box;width:100%;height:120px;margin-top:12px;background:#0c1420;color:#e1e9f5;border:1px solid #44556c;padding:12px;border-radius:10px;font:12px ui-monospace,monospace}
details{border-top:1px solid #354253;margin-top:28px;padding-top:18px}summary{cursor:pointer}code{background:#1c2a3b;padding:1px 5px;border-radius:4px}
.warn{border-left:3px solid #ffcf6b;padding-left:12px}
a:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid #73dfc6;outline-offset:4px}
</style>
</head>
<body>
<small>RECLAME AQUI · HUGME · VERSÃO ${version}</small>
<h1>Resposta privada em lote, uma por ticket.</h1>
<p>Arraste o botão abaixo para a barra de favoritos. Depois abra o HugMe já autenticado e clique no favorito.</p>
<p><a class="bm" href="${attr(url)}">HugMe Resposta privada</a></p>

<h2>Como usar</h2>
<ol>
<li><b>Instalar:</b> arraste o botão para a barra de favoritos (Ctrl+Shift+B mostra a barra).</li>
<li><b>Abrir:</b> entre em <code>app.hugme.com.br</code> com seu login e abra qualquer tela de tickets. Clique no favorito: o painel aparece à direita.</li>
<li><b>Importar:</b> em “1 · Planilha”, escolha o arquivo <code>.xlsx</code>. A leitura acontece só no seu navegador. Confira na tabela de colunas a grafia encontrada para C, Q, W e AA.</li>
<li><b>Conferir a prévia:</b> clique em cada linha para ver a mensagem completa. Linhas “Revisar especialista” têm mais de um nome em Tags: escolha o especialista e clique em “Aplicar a esta linha”.</li>
<li><b>Teste seguro:</b> marque <b>“Parar antes de enviar”</b>. O robô prepara a mensagem no 1º ticket da fila, destaca “Responder privado” em vermelho e encerra sem clicar, mesmo no Envio real.</li>
<li><b>Simular:</b> com “Simulação” marcado, clique em “Simular fila”. O robô pesquisa o ticket, abre a Resposta privada, carrega “Busca por contato” e preenche o texto, mas não clica em “Responder privado”.</li>
<li><b>Enviar:</b> desmarque a trava, marque “Envio real” e clique em “Iniciar envio”. Um ticket por vez; use Pausar/Retomar/Parar quando quiser.</li>
</ol>
<p class="warn">Se aparecer “Verificar envio”, abra o ticket e confira se a resposta privada está lá. Depois use os botões do Histórico. O robô nunca reenvia essa linha sozinho.</p>

<details><summary>Instalação manual</summary>
<p>Crie um favorito qualquer, edite-o e substitua toda a URL pelo conteúdo abaixo, incluindo <code>javascript:</code>.</p>
<textarea readonly aria-label="URL do favorito">${attr(url)}</textarea>
</details>
</body>
</html>
`;
fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist/instalar-hugme-resposta-privada.html'), html);
fs.writeFileSync(path.join(__dirname, 'dist/bookmarklet-url.txt'), url + '\n');
console.log('dist/instalar-hugme-resposta-privada.html · URL do favorito: ' + url.length + ' caracteres');
