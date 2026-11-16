# Gera planilhas de teste com dados FICTICIOS, no mesmo layout do relatorio do HugMe
# (aba "Relatório de Tickets", titulo em A2, cabecalho na linha 4, dados a partir da linha 5).
# Uso: python3 tests/make-fixtures.py
import openpyxl, os
HEADERS = [["A", "Id HugMe"], ["B", "Origem"], ["C", "Id Origem"], ["D", "Data Reclamação"], ["E", "Status Hugme"], ["F", "Status RA"], ["G", "Arquivado ?"], ["H", "Título"], ["I", "Texto da Reclamação"], ["J", "Data Avaliacao"], ["K", "Motivo da Reclamação RA"], ["L", "Sentimento RA*"], ["M", "Você já entrou em contato com o nosso atendimento antes de abrir a reclamação?"], ["N", "Empresa parceira vinculada:"], ["O", "Descreva:"], ["P", "Qual é o assunto principal da sua manifestação?"], ["Q", "Nome"], ["R", "Nome social do consumidor"], ["S", "RG"], ["T", "CPF/CNPJ"], ["U", "Pessoa Física ou Jurídica?"], ["V", "Email"], ["W", "Telefones"], ["X", "Cidade"], ["Y", "Estado"], ["Z", "Quantidade de Tags"], ["AA", "Tags"], ["AB", "Resposta da empresa"], ["AC", "Data de Resposta"], ["AD", "Interações neste ticket"], ["AE", "Réplicas na reclamação RA"], ["AF", "Seu problema foi resolvido?"], ["AG", "Voltaria a fazer negócio?"], ["AH", "Nota"], ["AI", "Consideração Consumidor"], ["AJ", "Data Consideração Consumidor"], ["AK", "Consideração Empresa"], ["AL", "Data Consideração Empresa"], ["AM", "Tempo primeira resposta (privado)"], ["AN", "Tempo primeira resposta (público)"], ["AO", "Tempo Avaliação"], ["AP", "Comentários na reclamação*"], ["AQ", "Atribuido Para"], ["AR", "Quantidade de Atribuições"], ["AS", "Redistribuições"], ["AT", "Moderações neste ticket"], ["AU", "Mensagens internas neste ticket"], ["AV", "Quantidade de lembretes"], ["AW", "Data última réplica"], ["AX", "Data da última modificação"], ["AY", "Avaliacao Favoravel "], ["AZ", "Origem RA"], ["BA", "Data de Desativação RA"], ["BB", "Motivo de Desativação RA"], ["BC", "Avaliações desconsideradas RA"], ["BD", "Blackfriday RA"], ["BE", "Sentimento"], ["BF", "Lembretes"], ["BG", "Dados Complementares Consumidor"], ["BH", "Avaliado sem resposta RA"], ["BI", "Moderação status"], ["BJ", "Moderação motivo"], ["BK", "Moderação data de solicitação"], ["BL", "Moderação usuário que solicitou"], ["BM", "Moderação data da resposta"], ["BN", "Tipo Hugme"], ["BO", "Data fechamento"], ["BP", "Quantidade interações consumidor"], ["BQ", "Quantidade interações empresa"], ["BR", "Feed tipo"], ["BS", "Fonte informação tipo"], ["BT", "Histórico"], ["BU", "Canal"], ["BV", "RA Prime"], ["BW", "ID Reclame Aqui"], ["BX", "Última interação na mensagem privada"], ["BY", "Recebeu avaliação por WhatsApp"], ["BZ", "Avaliou por WhatsApp"], ["CA", "Categoria RA"], ["CB", "Problema RA"], ["CC", "Produto RA"]]
OUT = os.path.join(os.path.dirname(__file__), 'fixtures')

def base(title='Relatório de Tickets'):
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = title
    ws['A2'] = 'base de dados'
    for letter, name in HEADERS: ws[letter + '4'] = name
    return wb, ws

def put(ws, r, cells, full=True):
    # full=True preenche tambem colunas intermediarias; False deixa-as sem celula (colunas vazias no meio).
    if full:
        ws['B%d' % r] = 'ReclameAQUI'; ws['E%d' % r] = 'Novo'; ws['H%d' % r] = 'Titulo ficticio'; ws['Z%d' % r] = 0; ws['AQ%d' % r] = 'atribuido ficticio'
    for k, v in cells.items(): ws[k + str(r)] = v

os.makedirs(OUT, exist_ok=True)
wb, ws = base()
put(ws, 5, {'A': 900000001, 'C': '100000001', 'Q': 'Maria Teste Ficticia', 'W': '11900000001', 'AA': 'Joana Exemplo'})
put(ws, 6, {'A': 900000002, 'C': '100000002', 'Q': 'Carlos Ficticio', 'W': '11900000002;21900000003', 'AA': 'Joana Exemplo'})
put(ws, 7, {'A': 900000003, 'C': '100000003', 'Q': 'Lia Sem Colunas', 'W': '31900000004', 'AA': 'Paula Modelo'}, full=False)
put(ws, 8, {'A': 900000004, 'C': '100000004', 'Q': 'Rui Tags Ambiguas', 'W': '41900000005', 'AA': 'Joana Exemplo; Paula Modelo'})
put(ws, 9, {'A': 900000005, 'C': '100000005', 'Q': '', 'W': '51900000006', 'AA': 'Joana Exemplo'})
put(ws, 10, {'A': 900000006, 'C': '100000001', 'Q': 'Repetida Ficticia', 'W': '61900000007', 'AA': 'Joana Exemplo'})
ws['W11'] = 1190000008; ws['W11'].number_format = '00000000000'
put(ws, 11, {'A': 900000007, 'C': '100000007', 'Q': 'Numero Com Zero', 'AA': 'Paula Modelo'})
put(ws, 12, {'A': 900000008, 'C': '100000008', 'Q': 'Dolar $1 Ficticio', 'W': '71900000009', 'AA': 'Joana Exemplo'})
wb.save(os.path.join(OUT, 'casos.xlsx'))

wb, ws = base()
put(ws, 5, {'A': 900000101, 'C': '200000001', 'Q': 'Ana Fluxo', 'W': '11911110001', 'AA': 'Joana Exemplo'})
put(ws, 6, {'A': 900000102, 'C': '200000002', 'Q': 'Beto Fluxo', 'W': '11911110002;11911110003', 'AA': 'Paula Modelo'})
put(ws, 7, {'A': 900000103, 'C': '200000003', 'Q': 'Caio Fluxo', 'W': '11911110004', 'AA': 'Joana Exemplo'})
wb.save(os.path.join(OUT, 'fluxo.xlsx'))
print('fixtures geradas em', OUT)
