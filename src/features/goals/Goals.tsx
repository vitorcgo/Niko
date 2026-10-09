import { useEffect, useState } from "react";
import { Plus, Trash2, Target, Columns3, ImagePlus, Pencil, Gauge } from "lucide-react";
import { TabHeader } from "../../components/TabHeader";
import { Card, Button, Field, Modal, Progress, Empty, ConfirmModal } from "../../components/basics";
import { useOrganization } from "../../state/organization";
import { useRoutine, habitCompleted } from "../../state/routine";
import { usePomodoro } from "../../state/pomodoro";
import { useFinances } from "../../state/finances";
import { useStudies } from "../../state/studies";
import { useInterface } from "../../state/interface";
import { T } from "../../i18n/ptBR";
import { isValidDate, formatDateString, toISO } from "../../utils/dates";
import { readImageAsDataUrl, sumBy } from "../../utils/basics";
import { playSound } from "../../bridge/sounds";
import { EVENT_NEW } from "../../windows/desktop/useShortcuts";
import { addDays } from "date-fns";
import type { CardView, Goal, TypeGoal } from "../../types";

function useProgress() {
  const tasks = useRoutine((s) => s.tarefas);
  const habits = useRoutine((s) => s.habitos);
  const records = useRoutine((s) => s.registros);
  const sessions = usePomodoro((s) => s.sessoes);
  const savings = useFinances((s) => s.metasEconomia);
  return (m: Goal): { atual: number; alvo: number; rotulo: string } => {
    switch (m.tipo) {
      case "habito": {
        const h = habits.find((x) => x.id === m.vinculoId);
        if (!h) return { atual: 0, alvo: 100, rotulo: "0%" };
        const days = Array.from({ length: m.periodo === "ano" ? 365 : 90 }, (_, i) => toISO(addDays(new Date(), -i)));
        const pct = Math.round((days.filter((d) => habitCompleted(h, records[d]?.[h.id])).length / days.length) * 100);
        return { atual: pct, alvo: m.alvo, rotulo: `${pct}%` };
      }
      case "estudo": {
        const hours = sumBy(sessions.filter((s) => s.etapa === "foco" && s.situacao === "concluida" && s.materiaId === m.vinculoId), (s) => s.minutos) / 60;
        return { atual: hours, alvo: m.alvo, rotulo: `${hours.toFixed(1).replace(".", ",")} / ${m.alvo} h` };
      }
      case "financeira": {
        const e = savings.find((x) => x.id === m.vinculoId) ?? savings[0];
        if (!e) return { atual: 0, alvo: 100, rotulo: "0%" };
        const pct = e.alvo ? Math.round((e.guardado / e.alvo) * 100) : 0;
        return { atual: pct, alvo: 100, rotulo: `${pct}%` };
      }
      case "tarefas": {
        const enabled = tasks.filter((t) => t.metaId === m.id);
        const done = enabled.filter((t) => t.status === "concluida").length;
        return { atual: done, alvo: Math.max(1, enabled.length), rotulo: `${done} / ${enabled.length}` };
      }
      default:
        return { atual: m.atual, alvo: m.alvo, rotulo: `${m.atual} / ${m.alvo}` };
    }
  };
}

function FormGoal({ aberto: isOpen, aoFechar: onClose }: { aberto: boolean; aoFechar: () => void }) {
  const org = useOrganization();
  const habits = useRoutine((s) => s.habitos).filter((h) => !h.arquivado);
  const subjects = useStudies((s) => s.materias);
  const savings = useFinances((s) => s.metasEconomia);
  const [nameValue, setName] = useState("");
  const [pillarId, setPillarId] = useState("");
  const [type, setType] = useState<TypeGoal>("manual");
  const [target, setTarget] = useState("10");
  const [link, setLink] = useState("");
  const [period, setPeriod] = useState<"trimestre" | "ano">("trimestre");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setPillarId(org.pilares[0]?.id ?? "");
    setType("manual");
    setTarget("10");
    setLink("");
    setErrors({});
  }, [isOpen]);

  const optionsLink = type === "habito" ? habits.map((h) => ({ id: h.id, nome: h.nome })) : type === "estudo" ? subjects.map((m) => ({ id: m.id, nome: m.nome })) : type === "financeira" ? savings.map((e) => ({ id: e.id, nome: e.nome })) : [];

  return (
    <Modal aberto={isOpen} titulo={T.metas.novaMeta} aoFechar={onClose}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const newItems: Record<string, string> = {};
          if (!nameValue.trim()) newItems.nome = T.validacao.obrigatorio;
          if (!pillarId) newItems.pilar = T.validacao.obrigatorio;
          const a = Number(target);
          if (["manual", "estudo", "habito"].includes(type) && (!Number.isFinite(a) || a <= 0 || a > 100000)) newItems.alvo = T.validacao.entre(1, 100000);
          if (optionsLink.length > 0 && !link) newItems.vinculo = T.validacao.obrigatorio;
          if (["habito", "estudo", "financeira"].includes(type) && optionsLink.length === 0) newItems.vinculo = T.metas.semVinculo;
          setErrors(newItems);
          if (Object.keys(newItems).length) return;
          org.createGoal({ nome: nameValue, pilarId: pillarId, tipo: type, alvo: type === "habito" ? Math.min(100, a) : a || 100, atual: 0, vinculoId: link || undefined, periodo: period });
          onClose();
        }}
      >
        <Field id="mt-nome" rotulo={T.metas.nome} obrigatorio erro={errors.nome}>
          <input id="mt-nome" className="campo" value={nameValue} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="formulario-linha">
          <Field id="mt-pilar" rotulo={T.metas.pilar} obrigatorio erro={errors.pilar}>
            <select id="mt-pilar" className="seletor" value={pillarId} onChange={(e) => setPillarId(e.target.value)}>
              {org.pilares.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </Field>
          <Field id="mt-periodo" rotulo={T.metas.periodo}>
            <select id="mt-periodo" className="seletor" value={period} onChange={(e) => setPeriod(e.target.value as "trimestre" | "ano")}>
              <option value="trimestre">{T.metas.trimestre}</option>
              <option value="ano">{T.metas.ano}</option>
            </select>
          </Field>
        </div>
        <div className="formulario-linha">
          <Field id="mt-tipo" rotulo={T.metas.tipo}>
            <select id="mt-tipo" className="seletor" value={type} onChange={(e) => { setType(e.target.value as TypeGoal); setLink(""); }}>
              {(Object.keys(T.metas.tipos) as TypeGoal[]).map((t) => <option key={t} value={t}>{T.metas.tipos[t]}</option>)}
            </select>
          </Field>
          {["manual", "estudo", "habito"].includes(type) && (
            <Field id="mt-alvo" rotulo={type === "estudo" ? T.metas.alvoHoras : type === "habito" ? T.metas.alvoPct : T.metas.alvo} obrigatorio erro={errors.alvo}>
              <input id="mt-alvo" className="campo" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d]/g, ""))} />
            </Field>
          )}
        </div>
        {optionsLink.length > 0 || errors.vinculo ? (
          <Field id="mt-vinc" rotulo={T.metas.vinculo} obrigatorio erro={errors.vinculo}>
            <select id="mt-vinc" className="seletor" value={link} onChange={(e) => setLink(e.target.value)}>
              <option value="">{T.financas.escolha}</option>
              {optionsLink.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </Field>
        ) : null}
        {type === "tarefas" && <p className="campo-dica">{T.metas.metaDeTarefas}</p>}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{T.geral.criar}</Button>
        </div>
      </form>
    </Modal>
  );
}

function FormView({ aberto: isOpen, aoFechar: onClose }: { aberto: boolean; aoFechar: () => void }) {
  const create = useOrganization((s) => s.createView);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [state, setState] = useState<CardView["estado"]>("planejada");
  const [deadline, setDeadline] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDescription("");
      setDeadline("");
      setImage(undefined);
      setErrors({});
    }
  }, [isOpen]);

  return (
    <Modal aberto={isOpen} titulo={T.metas.novoCartaoVisao} aoFechar={onClose}>
      <form
        className="formulario"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const newItems: Record<string, string> = {};
          if (!title.trim()) newItems.titulo = T.validacao.obrigatorio;
          if (deadline && !isValidDate(deadline)) newItems.prazo = T.validacao.dataInvalida;
          setErrors((x) => ({ ...newItems, imagem: x.imagem ?? "" }));
          if (Object.keys(newItems).length) return;
          create({ titulo: title.trim().slice(0, 80), descricao: description.trim().slice(0, 300), estado: state, prazo: deadline || undefined, imagem: image });
          onClose();
        }}
      >
        <Field id="v-titulo" rotulo={T.estudos.tituloCartao} obrigatorio erro={errors.titulo}>
          <input id="v-titulo" className="campo" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field id="v-desc" rotulo={T.financas.descricao}>
          <textarea id="v-desc" className="area-texto" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="formulario-linha">
          <Field id="v-estado" rotulo={T.metas.estado}>
            <select id="v-estado" className="seletor" value={state} onChange={(e) => setState(e.target.value as CardView["estado"])}>
              {(Object.keys(T.metas.estados) as CardView["estado"][]).map((s) => <option key={s} value={s}>{T.metas.estados[s]}</option>)}
            </select>
          </Field>
          <Field id="v-prazo" rotulo={T.financas.prazo} erro={errors.prazo}>
            <input id="v-prazo" type="date" className="campo" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
        </div>
        <Field id="v-img" rotulo={T.metas.imagem} erro={errors.imagem || undefined} dica={T.validacao.imagemInvalida}>
          <input
            id="v-img"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="campo"
            style={{ paddingTop: 6 }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                setImage(await readImageAsDataUrl(f));
                setErrors((x) => ({ ...x, imagem: "" }));
              } catch {
                setImage(undefined);
                setErrors((x) => ({ ...x, imagem: T.validacao.imagemInvalida }));
              }
            }}
          />
        </Field>
        {image && <img src={image} alt="" className="visao-previa" />}
        <div className="formulario-acoes">
          <Button onClick={onClose}>{T.geral.cancelar}</Button>
          <Button type="submit" variante="primario">{T.geral.criar}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function Goals() {
  const org = useOrganization();
  const tasks = useRoutine((s) => s.tarefas);
  const progress = useProgress();
  const notify = useInterface((s) => s.notify);
  const [newGoal, setNewGoal] = useState(false);
  const [newView, setNewView] = useState(false);
  const [newPillar, setNewPillar] = useState("");
  const [errorPillar, setErrorPillar] = useState("");
  const [updating, setUpdating] = useState<Goal | null>(null);
  const [value, setValue] = useState("");
  const [remove, setDelete] = useState<Goal | null>(null);

  useEffect(() => {
    const onNew = (e: Event) => {
      if ((e as CustomEvent).detail === "metas") setNewGoal(true);
    };
    window.addEventListener(EVENT_NEW, onNew);
    return () => window.removeEventListener(EVENT_NEW, onNew);
  }, []);

  const averages = org.metas.map((m) => {
    const p = progress(m);
    return Math.min(1, p.atual / Math.max(1, p.alvo));
  });
  const media = averages.length ? Math.round((averages.reduce((a, b) => a + b, 0) / averages.length) * 100) : 0;

  return (
    <>
      <TabHeader
        titulo={T.metas.titulo}
        subtitulo={T.metas.subtitulo}
        agente="organizador"
        acoes={
          <>
            <Button pequeno variante="primario" icone={<Plus size={13} />} onClick={() => setNewGoal(true)}>{T.metas.novaMeta}</Button>
            <Button pequeno icone={<ImagePlus size={13} />} onClick={() => setNewView(true)}>{T.metas.novoCartaoVisao}</Button>
          </>
        }
      />
      <div className="grade">
        <Card className="col-3"><span className="rotulo-secao">{T.metas.metasAtivas}</span><div className="numero-grande">{org.metas.length}</div></Card>
        <Card className="col-3"><span className="rotulo-secao">{T.metas.tarefasConcluidas}</span><div className="numero-grande">{tasks.filter((t) => t.status === "concluida").length}</div></Card>
        <Card className="col-3"><span className="rotulo-secao">{T.metas.pilares}</span><div className="numero-grande">{org.pilares.length}</div></Card>
        <Card className="col-3"><span className="rotulo-secao">{T.metas.progressoMedio}</span><div className="numero-grande">{media}%</div></Card>

        <Card className="col-8" titulo={T.metas.ativas} icone={<Target size={16} />}>
          {org.metas.length === 0 ? (
            <Empty icone={<Target size={28} />} titulo={T.metas.semMetas} acao={<Button variante="primario" onClick={() => setNewGoal(true)}>{T.metas.novaMeta}</Button>} />
          ) : (
            <div className="lista">
              {org.metas.map((m) => {
                const p = progress(m);
                const pct = Math.min(1, p.atual / Math.max(1, p.alvo));
                return (
                  <div key={m.id} className="lista-item" style={{ alignItems: "flex-start", padding: "12px 0" }}>
                    <div className="lista-item-principal" style={{ gap: 6 }}>
                      <div className="linha-entre">
                        <span>{m.nome}</span>
                        <span className="texto-2 numero" style={{ fontSize: 12 }}>{p.rotulo}</span>
                      </div>
                      <Progress valor={pct} nivel={pct >= 1 ? "sucesso" : undefined} rotulo={m.nome} />
                      <span className="lista-item-sub">{org.pilares.find((x) => x.id === m.pilarId)?.nome} . {T.metas.tipos[m.tipo]} . {m.periodo === "ano" ? T.metas.ano : T.metas.trimestre}</span>
                    </div>
                    <div className="linha" style={{ gap: 0 }}>
                      {m.tipo === "manual" && <Button pequeno soIcone variante="fantasma" icone={<Pencil size={13} />} aria-label={T.metas.atualizarValor} title={T.metas.atualizarValor} onClick={() => { setUpdating(m); setValue(String(m.atual)); }} />}
                      <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={13} />} aria-label={T.geral.excluir} onClick={() => setDelete(m)} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="col-4" titulo={T.metas.pilares} icone={<Columns3 size={16} />}>
          <div className="coluna" style={{ gap: 12 }}>
            {org.pilares.map((p) => (
              <div key={p.id} className="coluna" style={{ gap: 4 }}>
                <div className="linha-entre">
                  <span>{p.nome}</span>
                  <span className="linha" style={{ gap: 4 }}>
                    <span className="texto-3" style={{ fontSize: 11 }}>{org.metas.filter((m) => m.pilarId === p.id).length}</span>
                    <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={() => org.deletePillar(p.id)} />
                  </span>
                </div>
                <div className="linha">
                  <input type="range" min={0} max={10} step={1} value={p.nota} aria-label={`${T.metas.nota} ${p.nome}`} className="faixa" onChange={(e) => org.updatePillar(p.id, { nota: Number(e.target.value) })} />
                  <span className="numero" style={{ minWidth: 20, textAlign: "right" }}>{p.nota}</span>
                </div>
              </div>
            ))}
            <form
              className="linha"
              style={{ alignItems: "flex-start" }}
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!newPillar.trim()) return setErrorPillar(T.validacao.obrigatorio);
                org.createPillar(newPillar);
                setNewPillar("");
                setErrorPillar("");
              }}
            >
              <div className="campo-grupo" style={{ flex: 1 }}>
                <input className="campo" value={newPillar} maxLength={40} placeholder={T.metas.novoPilar} aria-label={T.metas.novoPilar} onChange={(e) => { setNewPillar(e.target.value); setErrorPillar(""); }} />
                {errorPillar && <span className="campo-erro">{errorPillar}</span>}
              </div>
              <Button type="submit" soIcone icone={<Plus size={14} />} aria-label={T.metas.novoPilar} />
            </form>
          </div>
        </Card>

        <Card className="col-12" titulo={T.metas.visao} icone={<ImagePlus size={16} />} acoes={<Button pequeno icone={<Plus size={13} />} onClick={() => setNewView(true)}>{T.metas.novoCartaoVisao}</Button>}>
          {org.visao.length === 0 ? <Empty titulo={T.metas.semVisao} /> : (
            <div className="grade-visao">
              {org.visao.map((v) => (
                <div key={v.id} className="cartao-visao">
                  {v.imagem ? <img src={v.imagem} alt="" /> : <div className="cartao-visao-sem-imagem"><Gauge size={24} /></div>}
                  <div className="coluna" style={{ gap: 4, padding: 12 }}>
                    <div className="linha-entre">
                      <b className="cortar">{v.titulo}</b>
                      <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={12} />} aria-label={T.geral.excluir} onClick={() => { org.deleteView(v.id); notify(T.geral.excluido); }} />
                    </div>
                    {v.descricao && <span className="texto-2" style={{ fontSize: 12 }}>{v.descricao}</span>}
                    <div className="linha" style={{ flexWrap: "wrap" }}>
                      <select className="seletor" style={{ height: 26, width: "auto", fontSize: 11 }} value={v.estado} aria-label={T.metas.estado} onChange={(e) => org.updateView(v.id, { estado: e.target.value as CardView["estado"] })}>
                        {(Object.keys(T.metas.estados) as CardView["estado"][]).map((s) => <option key={s} value={s}>{T.metas.estados[s]}</option>)}
                      </select>
                      {v.prazo && <span className="etiqueta">{formatDateString(v.prazo, "MMM yyyy")}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
      <FormGoal aberto={newGoal} aoFechar={() => setNewGoal(false)} />
      <FormView aberto={newView} aoFechar={() => setNewView(false)} />
      <Modal aberto={!!updating} titulo={T.metas.atualizarValor} aoFechar={() => setUpdating(null)}>
        {updating && (
          <form
            className="formulario"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              const n = Number(value.replace(",", "."));
              if (!Number.isFinite(n) || n < 0) return;
              org.registerProgress(updating.id, n);
              if (n >= updating.alvo) void playSound("proud", "personagens");
              setUpdating(null);
            }}
          >
            <Field id="mt-valor" rotulo={T.metas.atual} dica={`${T.metas.alvo}: ${updating.alvo}`}>
              <input id="mt-valor" className="campo" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.,]/g, ""))} />
            </Field>
            <div className="formulario-acoes">
              <Button onClick={() => setUpdating(null)}>{T.geral.cancelar}</Button>
              <Button type="submit" variante="primario">{T.geral.salvar}</Button>
            </div>
          </form>
        )}
      </Modal>
      <ConfirmModal aberto={!!remove} titulo={T.geral.confirmarExclusao} texto={remove?.nome ?? ""} aoFechar={() => setDelete(null)} aoConfirmar={() => remove && org.deleteGoal(remove.id)} />
    </>
  );
}
