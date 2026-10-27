"use client";

import { useEffect, useState } from "react";
import { CNAES, SETORES } from "@/lib/cnaes";
import { FAIXAS_FUNCIONARIOS, PORTES, REGIOES, SOLUCOES, UFS } from "@/lib/domain";
import type { Filters } from "@/lib/filters";
import { cx, Input, Label, Select } from "@/components/ui";
import { IconChevron } from "@/components/icons";

type Props = {
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  municipios: { uf: string; municipio: string }[];
  /** Competência da última atualização mensal; sem ela, o filtro de novas não aparece. */
  ultimaCompetencia?: string | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="px-4 py-3.5">
      <legend className="eyebrow float-left mb-2.5 w-full !text-[10px]">{title}</legend>
      <div className="clear-both space-y-2.5">{children}</div>
    </fieldset>
  );
}

/** Bloco que abre e fecha com altura animada (grid 0fr → 1fr), sem medir o conteúdo. */
function Collapsible({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(count > 0);
  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-ink/[0.03]"
      >
        <span className="flex items-center gap-2">
          {title}
          {count > 0 && <span className="rounded-full bg-orange px-1.5 text-[10px] font-semibold leading-4 text-white tabular">{count}</span>}
        </span>
        <IconChevron width={15} height={15} className={cx("text-muted transition-transform duration-200 ease-[var(--ease-out)]", open && "rotate-90")} />
      </button>
      <div className={cx("grid transition-[grid-template-rows] duration-300 ease-[var(--ease-out)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden" inert={!open}>
          {children}
        </div>
      </div>
    </div>
  );
}

function Chips<T extends string>({ options, value, onChange, label }: { options: Record<T, string>; value: T[]; onChange: (v: T[]) => void; label: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {(Object.entries(options) as [T, string][]).map(([k, v]) => {
        const on = value.includes(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])}
            className={cx(
              "pressable rounded-md border px-2 py-1 text-xs transition-[color,background-color,border-color,transform] duration-150",
              on ? "border-ink bg-ink text-cream" : "border-line bg-paper text-ink/80 hover:border-ink/40",
            )}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}

export function FilterPanel({ filters: f, onChange, municipios, ultimaCompetencia }: Props) {
  // Texto livre aplica com atraso, para não disparar busca a cada tecla.
  const [mun, setMun] = useState(f.municipio ?? "");
  // Filtro limpo de fora (ex.: "Limpar filtros") atualiza o campo; ajuste durante o render, sem efeito.
  const [prevMun, setPrevMun] = useState(f.municipio);
  if (prevMun !== f.municipio) {
    setPrevMun(f.municipio);
    setMun(f.municipio ?? "");
  }
  useEffect(() => {
    if ((f.municipio ?? "") === mun) return;
    const t = setTimeout(() => onChange({ municipio: mun || undefined }), 400);
    return () => clearTimeout(t);
  }, [mun]); // eslint-disable-line react-hooks/exhaustive-deps

  const munOptions = municipios.filter((m) => !f.uf.length || f.uf.includes(m.uf as never));
  const maisAtivos = [f.setor, f.cnae, f.porte.length || undefined, f.func.length || undefined, f.idadeMin, f.idadeMax, f.status, f.contato].filter((v) => v !== undefined).length;
  const scoreLabel = f.solucao ? SOLUCOES[f.solucao as keyof typeof SOLUCOES].curto : f.tipo === "parceiro" ? "Parceria" : "Geral";

  return (
    <div className="text-sm">
      <Section title="O essencial">
        {ultimaCompetencia && (
          <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-success/[0.07] px-3 py-2.5 text-sm">
            <input type="checkbox" checked={!!f.recentes} onChange={(e) => onChange({ recentes: e.target.checked ? "1" : undefined })} className="mt-0.5 size-4 accent-[var(--color-success)]" />
            <span>
              Só as novas na base
              <span className="block text-xs text-muted">Entraram com a atualização da Receita de {ultimaCompetencia}</span>
            </span>
          </label>
        )}
        <div>
          <Label htmlFor="f-sol">Solução de interesse</Label>
          <Select id="f-sol" value={f.solucao ?? ""} onChange={(e) => onChange({ solucao: e.target.value || undefined })}>
            <option value="">Qualquer solução</option>
            {Object.entries(SOLUCOES)
              .filter(([k]) => (f.tipo === "cliente" ? k !== "parceria" : f.tipo === "parceiro" ? k === "parceria" : true))
              .map(([k, s]) => (
                <option key={k} value={k}>{s.label}</option>
              ))}
          </Select>
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <Label htmlFor="f-score">Score {scoreLabel} mínimo</Label>
            <span className="font-display text-sm font-semibold tabular">{f.scoreMin ?? 0}</span>
          </div>
          <input
            id="f-score"
            type="range"
            min={0}
            max={100}
            step={5}
            value={f.scoreMin ?? 0}
            onChange={(e) => onChange({ scoreMin: Number(e.target.value) || undefined })}
            className="range w-full"
            style={{ "--fill": `${f.scoreMin ?? 0}%` } as React.CSSProperties}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="f-reg">Região</Label>
            <Select id="f-reg" value={f.regiao ?? ""} onChange={(e) => onChange({ regiao: e.target.value || undefined })}>
              <option value="">Todas</option>
              {Object.entries(REGIOES).map(([k, r]) => (
                <option key={k} value={k}>{r.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="f-uf">Estado</Label>
            <Select id="f-uf" value={f.uf[0] ?? ""} onChange={(e) => onChange({ uf: e.target.value ? [e.target.value as never] : [] })}>
              <option value="">Todos</option>
              {UFS.filter((u) => !f.regiao || REGIOES[f.regiao].ufs.includes(u)).map((u) => (
                <option key={u} value={u}>{u}</option>
              ))}
            </Select>
          </div>
        </div>
        <div>
          <Label htmlFor="f-mun">Cidade</Label>
          <Input id="f-mun" list="f-mun-list" value={mun} onChange={(e) => setMun(e.target.value)} placeholder="Ex.: Rio de Janeiro" />
          <datalist id="f-mun-list">
            {munOptions.map((m) => (
              <option key={m.uf + m.municipio} value={m.municipio}>{m.uf}</option>
            ))}
          </datalist>
        </div>
      </Section>

      <Collapsible title="Mais filtros" count={maisAtivos}>
      <Section title="Perfil da empresa">
        <div>
          <Label htmlFor="f-setor">Setor</Label>
          <Select id="f-setor" value={f.setor ?? ""} onChange={(e) => onChange({ setor: e.target.value || undefined, cnae: undefined })}>
            <option value="">Todos</option>
            {Object.entries(SETORES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="f-cnae">CNAE principal</Label>
          <Select id="f-cnae" value={f.cnae ?? ""} onChange={(e) => onChange({ cnae: e.target.value || undefined })}>
            <option value="">Todos</option>
            {CNAES.filter((c) => !f.setor || c.setor === f.setor).map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.descricao}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Porte (Receita)</Label>
          <Chips label="Porte" options={{ ME: "ME", EPP: "EPP", DEMAIS: "Médio/grande", NI: "Não inf." } as Record<keyof typeof PORTES, string>} value={f.porte} onChange={(v) => onChange({ porte: v })} />
        </div>
        <div>
          <Label>Funcionários (estimativa)</Label>
          <Chips label="Faixa de funcionários" options={FAIXAS_FUNCIONARIOS} value={f.func} onChange={(v) => onChange({ func: v })} />
        </div>
        <div>
          <Label>Tempo de atividade (anos)</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={100} aria-label="Mínimo de anos" placeholder="mín." value={f.idadeMin ?? ""} onChange={(e) => onChange({ idadeMin: e.target.value === "" ? undefined : Number(e.target.value) })} />
            <span className="text-muted">a</span>
            <Input type="number" min={0} max={100} aria-label="Máximo de anos" placeholder="máx." value={f.idadeMax ?? ""} onChange={(e) => onChange({ idadeMax: e.target.value === "" ? undefined : Number(e.target.value) })} />
          </div>
        </div>
      </Section>

      <Section title="Situação na prospecção">
        <Select aria-label="Situação na prospecção" value={f.status ?? "ativos"} onChange={(e) => onChange({ status: e.target.value === "ativos" ? undefined : (e.target.value as Filters["status"]) })}>
          <option value="ativos">Novas e prospectadas (sem descartadas)</option>
          <option value="novo">Só ainda não prospectadas</option>
          <option value="prospectado">Só já prospectadas</option>
          <option value="descartado">Só descartadas</option>
          <option value="todos">Todas</option>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={!!f.contato} onChange={(e) => onChange({ contato: e.target.checked ? "1" : undefined })} className="size-4 accent-[var(--color-orange)]" />
          Só com contato cadastral disponível
        </label>
      </Section>

      </Collapsible>
    </div>
  );
}
