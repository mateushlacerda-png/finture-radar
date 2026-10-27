"""
Baixa a competência dos Dados Abertos do CNPJ (Receita Federal) e filtra em streaming,
sem carregar arquivo inteiro na memória.

Fonte: compartilhamento público da RFB (Nextcloud) em arquivos.receitafederal.gov.br,
pasta Dados/Cadastros/CNPJ/<competencia>/, acessado por WebDAV público.

Saída em .data/receita/<competencia>/:
  ESTABELE-filtrado.csv  só estabelecimentos ATIVOS com CNAE principal do catálogo do Radar
  EMPRESAS-filtrado.csv  só as empresas (CNPJ básico) desses estabelecimentos
  MUNICIPIOS.csv         tabela de municípios da Receita
  ESTABELE-base.csv      com --base-cnpjs: estabelecimentos NÃO ativos cujo CNPJ já está no banco
                         (para o importador tirar do Radar as empresas baixadas, suspensas ou inaptas)
Os zips ficam em .data/receita/<competencia>/zip/; com --apagar-zips, cada zip é apagado depois de lido
(o lote tem 6,8 GB; na máquina do GitHub Actions o disco é curto).

Uso: python -I scripts/receita-baixar-filtrar.py 2026-10 [--base-cnpjs arquivo.txt] [--apagar-zips]
"""
import os
import re
import subprocess
import sys
import zipfile

ARGS = sys.argv[1:]


def opcao(nome):
    return ARGS[ARGS.index(nome) + 1] if nome in ARGS else None


COMP = next((a for a in ARGS if re.fullmatch(r"\d{4}-\d{2}", a)), "2026-10")
APAGAR_ZIPS = "--apagar-zips" in ARGS
BASE_CNPJS = opcao("--base-cnpjs")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, ".data", "receita", COMP)
ZIPS = os.path.join(OUT, "zip")
TOKEN = "gn672Ad4CF8N6TK"  # token do link público da RFB (não é segredo: é o link aberto)
BASE = f"https://arquivos.receitafederal.gov.br/public.php/webdav/Dados/Cadastros/CNPJ/{COMP}/"

os.makedirs(ZIPS, exist_ok=True)

# CNAEs do catálogo (src/lib/cnaes.ts), no formato de 7 dígitos da Receita.
with open(os.path.join(ROOT, "src", "lib", "cnaes.ts"), encoding="utf-8") as f:
    CNAES = {re.sub(r"\D", "", c) for c in re.findall(r'code: "(\d{4}-\d/\d{2})"', f.read())}
print(f"{len(CNAES)} CNAEs no catálogo", flush=True)


def baixar(nome):
    destino = os.path.join(ZIPS, nome)
    if os.path.exists(destino) and zipfile.is_zipfile(destino):
        return destino
    print(f"baixando {nome}...", flush=True)
    tmp = destino + ".part"
    subprocess.run(
        ["curl", "-sS", "--fail", "--retry", "5", "--retry-delay", "10", "-C", "-", "-u", f"{TOKEN}:", "-o", tmp, BASE + nome],
        check=True,
    )
    os.replace(tmp, destino)
    return destino


def linhas(caminho_zip):
    with zipfile.ZipFile(caminho_zip) as z:
        membro = z.namelist()[0]
        with z.open(membro) as bruto:
            for b in bruto:
                yield b.decode("latin1")
    if APAGAR_ZIPS:
        os.remove(caminho_zip)


def campo(linha, i):
    # Campos entre aspas separados por ";". Só os primeiros campos importam aqui; split simples basta.
    partes = linha.split('";"')
    return partes[i].strip('"\r\n') if i < len(partes) else ""


# Tabelas pequenas
for nome, saida in [("Municipios.zip", "MUNICIPIOS.csv")]:
    with open(os.path.join(OUT, saida), "w", encoding="latin1", newline="") as f:
        for l in linhas(baixar(nome)):
            f.write(l)

# CNPJs que já estão no banco (exportados por scripts/receita-verificar.ts --exportar-cnpjs).
conhecidos = set()
if BASE_CNPJS:
    with open(BASE_CNPJS, encoding="utf-8") as f:
        conhecidos = {l.strip() for l in f if l.strip()}
    print(f"{len(conhecidos)} CNPJs já no banco", flush=True)
base_out = open(os.path.join(OUT, "ESTABELE-base.csv"), "a" if os.path.exists(os.path.join(OUT, "estab-feitos.txt")) else "w", encoding="latin1", newline="") if conhecidos else None

# Passada 1: estabelecimentos
basicos = set()
est_out = os.path.join(OUT, "ESTABELE-filtrado.csv")
feitos = os.path.join(OUT, "estab-feitos.txt")
ja = set(open(feitos).read().split()) if os.path.exists(feitos) else set()
modo = "a" if ja else "w"
with open(est_out, modo, encoding="latin1", newline="") as f:
    for i in range(10):
        nome = f"Estabelecimentos{i}.zip"
        if nome in ja:
            continue
        lidos = aceitos = saidas = 0
        for l in linhas(baixar(nome)):
            lidos += 1
            ativo = campo(l, 5) == "02"
            if ativo and campo(l, 11) in CNAES:
                f.write(l)
                aceitos += 1
            elif not ativo and base_out and (campo(l, 0) + campo(l, 1) + campo(l, 2)) in conhecidos:
                base_out.write(l)
                saidas += 1
        f.flush()
        if base_out:
            base_out.flush()
        with open(feitos, "a") as ff:
            ff.write(nome + "\n")
        print(f"{nome}: {lidos} lidos, {aceitos} aceitos, {saidas} já no banco e não ativos", flush=True)
if base_out:
    base_out.close()

with open(est_out, encoding="latin1") as f:
    for l in f:
        basicos.add(campo(l, 0))
print(f"{len(basicos)} CNPJs básicos a buscar em Empresas", flush=True)

# Passada 2: empresas
with open(os.path.join(OUT, "EMPRESAS-filtrado.csv"), "w", encoding="latin1", newline="") as f:
    for i in range(10):
        nome = f"Empresas{i}.zip"
        n = 0
        for l in linhas(baixar(nome)):
            if campo(l, 0) in basicos:
                f.write(l)
                n += 1
        print(f"{nome}: {n} empresas", flush=True)

print("FIM", flush=True)
