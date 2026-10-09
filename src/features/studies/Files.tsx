import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Eye, ExternalLink, File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, LoaderCircle, Presentation, ScanText, Search, Trash2, Upload } from "lucide-react";
import { Button, ConfirmModal, Modal, Empty, NoticeBanner } from "../../components/basics";
import { ZoneRelease, useDragFiles } from "../../components/ChatAttachments";
import { useInterface } from "../../state/interface";
import { useCommunication } from "../../state/communication";
import { sendToTeam, busy as chatBusy } from "../../state/chatting";
import { extractText, canExtractText, type TextExtracted } from "../../utils/fileReader";
import type { ActionAttachment } from "../../utils/chatFeatures";
import { playSound } from "../../bridge/sounds";
import { formatSize } from "../../utils/attachments";
import { formatDateString } from "../../utils/dates";
import { generateId } from "../../utils/basics";
import {
  openProgram, downloadFile, sendFile, deleteFile, getExtension, shapeView, readContent, listFiles, EXTENSIONS_ACCEPTED, LIMIT_FILE, type FileSubject,
} from "../../bridge/files";
import { T } from "../../i18n/ptBR";
import type { Subject } from "../../types";

type CodeError = keyof typeof T.estudos.arquivos.erros;

const LIMIT_TEXT = 2 * 1024 * 1024;

type CodeRead = keyof typeof T.estudos.arquivos.leitura;

function messageError(e: unknown, nameValue: string): string {
  const code = (e as Error)?.message ?? "";
  if (Object.hasOwn(T.estudos.arquivos.leitura, code)) return T.estudos.arquivos.leitura[code as CodeRead](nameValue);
  return (T.estudos.arquivos.erros[code as CodeError] ?? T.estudos.arquivos.erros.outro)(nameValue);
}

function describeOrigin(e: TextExtracted): string {
  const O = T.estudos.arquivos.origens;
  if (e.origem === "pdf") return O.pdf(e.paginas ?? 0);
  if (e.origem === "pdf_ocr") return O.pdf_ocr(e.paginas ?? 0, e.paginasLidasComOcr ?? 0);
  return O[e.origem];
}

function TextFile({ aberto: isOpen, aoFechar: onClose }: { aberto: { arquivo: FileSubject; extraido: TextExtracted } | null; aoFechar: () => void }) {
  const notify = useInterface((s) => s.notify);
  return (
    <Modal aberto={!!isOpen} titulo={isOpen ? T.estudos.arquivos.textoDe(isOpen.arquivo.nome) : ""} aoFechar={onClose} largo>
      {isOpen && (
        <div className="visualizador">
          <NoticeBanner>{describeOrigin(isOpen.extraido)}</NoticeBanner>
          <div className="visualizador-quadro" data-forma="texto">
            <pre className="visualizador-texto">{isOpen.extraido.texto}</pre>
          </div>
          <div className="formulario-acoes">
            <Button
              variante="primario"
              icone={<Copy size={14} />}
              onClick={() => {
                void navigator.clipboard.writeText(isOpen.extraido.texto).then(() => notify(T.estudos.arquivos.copiado));
              }}
            >
              {T.estudos.arquivos.copiar}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function IconFile({ extensao: extension }: { extensao: string }) {
  const shape = shapeView(extension);
  if (shape === "pdf" || shape === "texto" || ["doc", "docx", "odt", "rtf", "epub"].includes(extension)) return <FileText size={16} />;
  if (shape === "imagem") return <FileImage size={16} />;
  if (shape === "audio") return <FileAudio size={16} />;
  if (shape === "video") return <FileVideo size={16} />;
  if (["ppt", "pptx", "odp"].includes(extension)) return <Presentation size={16} />;
  if (["xls", "xlsx", "ods", "csv"].includes(extension)) return <FileSpreadsheet size={16} />;
  if (["zip", "rar", "7z"].includes(extension)) return <FileArchive size={16} />;
  return <File size={16} />;
}

interface Send {
  id: string;
  nome: string;
  tamanho: number;
}

function Viewer({ materiaId: subjectId, arquivo: file, aoFechar: onClose, aoBaixar: onDownload, aoAbrir: onOpen, aoVerTexto: onViewText }: { materiaId: string; arquivo: FileSubject | null; aoFechar: () => void; aoBaixar: (a: FileSubject) => void; aoAbrir: (a: FileSubject) => void; aoVerTexto: (a: FileSubject) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<{ conteudo: string; cortado: boolean } | null>(null);
  const [error, setError] = useState("");
  const shape = file ? shapeView(file.extensao) : "programa";

  useEffect(() => {
    setUrl(null);
    setText(null);
    setError("");
    if (!file || shape === "programa") return;
    let alive = true;
    let created: string | null = null;
    readContent(subjectId, file.id)
      .then(async (blob) => {
        if (!alive) return;
        if (shape === "texto") {
          const content = await blob.slice(0, LIMIT_TEXT).text();
          if (alive) setText({ conteudo: content, cortado: blob.size > LIMIT_TEXT });
          return;
        }
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch((e) => alive && setError(messageError(e, file.nome)));
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [file, shape, subjectId]);

  const loading = !error && shape !== "programa" && !url && !text;

  return (
    <Modal aberto={!!file} titulo={file?.nome ?? ""} aoFechar={onClose} largo>
      {file && (
        <div className="visualizador">
          <div className="visualizador-quadro" data-forma={shape}>
            {error && <NoticeBanner tipo="erro">{error}</NoticeBanner>}
            {loading && (
              <span className="visualizador-carregando">
                <LoaderCircle size={18} className="girando" />
                {T.estudos.arquivos.carregando}
              </span>
            )}
            {shape === "programa" && <Empty icone={<IconFile extensao={file.extensao} />} titulo={file.nome} texto={T.estudos.arquivos.semPrevia} />}
            {url && shape === "pdf" && <iframe src={url} title={file.nome} className="visualizador-pdf" />}
            {url && shape === "imagem" && <img src={url} alt={file.nome} className="visualizador-imagem" />}
            {url && shape === "video" && <video src={url} controls className="visualizador-midia" />}
            {url && shape === "audio" && <audio src={url} controls className="visualizador-audio" />}
            {text && (
              <>
                {text.cortado && <NoticeBanner>{T.estudos.arquivos.textoCortado}</NoticeBanner>}
                <pre className="visualizador-texto">{text.conteudo}</pre>
              </>
            )}
          </div>
          <div className="formulario-acoes">
            <span className="texto-3 empurrar">{formatSize(file.tamanho)}</span>
            {canExtractText(file.nome) && <Button icone={<ScanText size={14} />} onClick={() => onViewText(file)}>{T.estudos.arquivos.verTexto}</Button>}
            <Button icone={<ExternalLink size={14} />} onClick={() => onOpen(file)}>{T.estudos.arquivos.abrirNoPrograma}</Button>
            <Button variante="primario" icone={<Download size={14} />} onClick={() => onDownload(file)}>{T.estudos.arquivos.baixar}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export function Files({ materia: subject }: { materia: Subject }) {
  const notify = useInterface((s) => s.notify);
  const [files, setFiles] = useState<FileSubject[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failureList, setFailureList] = useState(false);
  const [sends, setSends] = useState<Send[]>([]);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<FileSubject | null>(null);
  const [deleting, setDeleting] = useState<FileSubject | null>(null);
  const area = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    try {
      setFiles(await listFiles(subject.id));
      setFailureList(false);
    } catch {
      setFailureList(true);
    } finally {
      setLoaded(true);
    }
  }, [subject.id]);

  useEffect(() => {
    setLoaded(false);
    setFiles([]);
    setSearch("");
    void reload();
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);

  const send = useCallback(
    (list: File[]) => {
      for (const file of list) {
        const extension = getExtension(file.name);
        if (!EXTENSIONS_ACCEPTED.includes(extension)) {
          notify(T.estudos.arquivos.erros.tipo_nao_suportado(file.name));
          void playSound("error", "avisos");
          continue;
        }
        if (file.size > LIMIT_FILE) {
          notify(T.estudos.arquivos.erros.arquivo_grande(file.name));
          void playSound("error", "avisos");
          continue;
        }
        if (file.size === 0) {
          notify(T.estudos.arquivos.erros.arquivo_vazio(file.name));
          continue;
        }
        const sendValue = { id: generateId(), nome: file.name, tamanho: file.size };
        setSends((e) => [...e, sendValue]);
        sendFile(subject.id, file)
          .then((newItem) => {
            setFiles((a) => [newItem, ...a.filter((x) => x.id !== newItem.id)]);
            void playSound("approve", "interface");
          })
          .catch((e) => {
            notify(messageError(e, file.name));
            void playSound("error", "avisos");
          })
          .finally(() => setSends((e) => e.filter((x) => x.id !== sendValue.id)));
      }
    },
    [notify, subject.id],
  );

  const dragging = useDragFiles(area, send);
  const navigateTo = useInterface((s) => s.navigateTo);
  const [actionsOpen, setActionsOpen] = useState<string | null>(null);
  const [reading, setReading] = useState<{ id: string; progresso: number } | null>(null);
  const [textOpen, setTextOpen] = useState<{ arquivo: FileSubject; extraido: TextExtracted } | null>(null);

  const analyze = useCallback(
    async (a: FileSubject, action: ActionAttachment) => {
      if (reading) return;
      if (action !== "extrair" && chatBusy()) {
        notify(T.estudos.arquivos.chatOcupado);
        return;
      }
      setReading({ id: a.id, progresso: 0 });
      try {
        const extracted = await extractText(await readContent(subject.id, a.id), a.nome, (p) => setReading({ id: a.id, progresso: p }));
        if (action === "extrair") {
          setTextOpen({ arquivo: a, extraido: extracted });
          return;
        }
        if (chatBusy()) {
          notify(T.estudos.arquivos.chatOcupado);
          return;
        }
        const conversation = useCommunication.getState().createConversation("tutor");
        void sendToTeam(conversation.id, "", [{ anexo: { nome: a.nome.slice(0, 120), tipo: a.extensao, tamanho: a.tamanho, texto: extracted.texto.slice(0, 60000) } }], { acaoAnexo: action });
        navigateTo("chat", { conversa: conversation.id });
        notify(T.estudos.arquivos.enviadoAoChat);
      } catch (e) {
        notify(messageError(e, a.nome));
        void playSound("error", "avisos");
      } finally {
        setReading(null);
        setActionsOpen(null);
      }
    },
    [notify, navigateTo, reading, subject.id],
  );

  const download = useCallback(
    (a: FileSubject) => {
      downloadFile(subject.id, a.id)
        .then((r) => notify(T.estudos.arquivos.baixado(r.caminho)))
        .catch((e) => notify(messageError(e, a.nome)));
    },
    [notify, subject.id],
  );

  const openValue = useCallback(
    (a: FileSubject) => {
      openProgram(subject.id, a.id).catch((e) => notify(messageError(e, a.nome)));
    },
    [notify, subject.id],
  );

  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return term ? files.filter((a) => a.nome.toLocaleLowerCase("pt-BR").includes(term)) : files;
  }, [files, search]);

  const total = files.reduce((s, a) => s + a.tamanho, 0);

  return (
    <div ref={area} className="coluna arquivos-materia">
      <ZoneRelease ativo={dragging} agente="tutor" texto={T.estudos.arquivos.solte} tipos={T.estudos.arquivos.tipos} />
      <div className="linha arquivos-topo">
        <Button variante="primario" icone={<Upload size={14} />} onClick={() => input.current?.click()}>{T.estudos.arquivos.adicionar}</Button>
        {files.length > 4 && (
          <label className="arquivos-busca">
            <Search size={14} />
            <input className="campo" value={search} placeholder={T.estudos.arquivos.buscar} aria-label={T.estudos.arquivos.buscar} onChange={(e) => setSearch(e.target.value)} />
          </label>
        )}
        {files.length > 0 && <span className="texto-3 empurrar">{T.estudos.arquivos.quantidade(files.length)} . {formatSize(total)}</span>}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={EXTENSIONS_ACCEPTED.map((e) => `.${e}`).join(",")}
          onChange={(e) => {
            send(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>
      <span className="campo-dica">{T.estudos.arquivos.dica}</span>
      {failureList && <NoticeBanner tipo="erro">{T.estudos.arquivos.falhaLista}</NoticeBanner>}

      {sends.length > 0 && (
        <div className="lista">
          {sends.map((e) => (
            <div key={e.id} className="lista-item arquivo-enviando">
              <LoaderCircle size={16} className="girando" />
              <div className="lista-item-principal">
                <span className="lista-item-titulo">{e.nome}</span>
                <span className="lista-item-sub">{T.estudos.arquivos.enviando} . {formatSize(e.tamanho)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {loaded && files.length === 0 && sends.length === 0 && !failureList ? (
        <Empty icone={<Upload size={28} />} titulo={T.estudos.arquivos.vazio} texto={T.estudos.arquivos.vazioDica} />
      ) : visible.length === 0 && search ? (
        <Empty icone={<Search size={28} />} titulo={T.estudos.arquivos.semResultado} />
      ) : (
        <div className="lista">
          {visible.map((a) => {
            const hasPreview = shapeView(a.extensao) !== "programa";
            return (
              <div key={a.id} className="arquivo-bloco">
              <div className="lista-item arquivo-item">
                <span className="arquivo-icone" data-extensao={a.extensao}>
                  <IconFile extensao={a.extensao} />
                </span>
                <button type="button" className="lista-item-principal arquivo-nome" onClick={() => (hasPreview ? setViewing(a) : openValue(a))} title={hasPreview ? T.estudos.arquivos.ver : T.estudos.arquivos.abrirNoPrograma}>
                  <span className="lista-item-titulo">{a.nome}</span>
                  <span className="lista-item-sub">
                    {a.extensao.toUpperCase()} . {formatSize(a.tamanho)} . {formatDateString(a.criadoEm, "d 'de' MMM yyyy")}
                  </span>
                </button>
                {hasPreview ? (
                  <Button pequeno soIcone variante="fantasma" icone={<Eye size={14} />} aria-label={T.estudos.arquivos.ver} title={T.estudos.arquivos.ver} onClick={() => setViewing(a)} />
                ) : (
                  <Button pequeno soIcone variante="fantasma" icone={<ExternalLink size={14} />} aria-label={T.estudos.arquivos.abrirNoPrograma} title={T.estudos.arquivos.abrirNoPrograma} onClick={() => openValue(a)} />
                )}
                {canExtractText(a.nome) &&
                  (reading?.id === a.id ? (
                    <span className="texto-3 arquivo-lendo">
                      <LoaderCircle size={13} className="girando" />
                      {T.estudos.arquivos.lendoPaginas(reading.progresso)}
                    </span>
                  ) : (
                    <Button pequeno soIcone variante={actionsOpen === a.id ? "secundario" : "fantasma"} icone={<ScanText size={14} />} aria-label={T.estudos.arquivos.analisarRotulo(a.nome)} title={T.estudos.arquivos.analisar} aria-expanded={actionsOpen === a.id} disabled={!!reading} onClick={() => setActionsOpen((x) => (x === a.id ? null : a.id))} />
                  ))}
                <Button pequeno soIcone variante="fantasma" icone={<Download size={14} />} aria-label={T.estudos.arquivos.baixar} title={T.estudos.arquivos.baixar} onClick={() => download(a)} />
                <Button pequeno soIcone variante="fantasma" icone={<Trash2 size={14} />} aria-label={T.estudos.arquivos.excluir} title={T.estudos.arquivos.excluir} onClick={() => setDeleting(a)} />
              </div>
              {actionsOpen === a.id && (
                <div className="arquivo-acoes" role="group" aria-label={T.estudos.arquivos.analisarRotulo(a.nome)}>
                  {(Object.keys(T.chat.anexos.acoes) as ActionAttachment[]).map((action) => (
                    <Button key={action} pequeno variante={action === "extrair" ? "fantasma" : "secundario"} disabled={!!reading} onClick={() => void analyze(a, action)}>
                      {T.chat.anexos.acoes[action]}
                    </Button>
                  ))}
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}

      <Viewer materiaId={subject.id} arquivo={viewing} aoFechar={() => setViewing(null)} aoBaixar={download} aoAbrir={openValue} aoVerTexto={(a) => { setViewing(null); void analyze(a, "extrair"); }} />
      <TextFile aberto={textOpen} aoFechar={() => setTextOpen(null)} />
      <ConfirmModal
        aberto={!!deleting}
        titulo={T.estudos.arquivos.excluir}
        texto={deleting ? T.estudos.arquivos.excluirTexto(deleting.nome) : ""}
        aoFechar={() => setDeleting(null)}
        aoConfirmar={() => {
          const target = deleting;
          if (!target) return;
          deleteFile(subject.id, target.id)
            .then(() => {
              setFiles((list) => list.filter((x) => x.id !== target.id));
              if (viewing?.id === target.id) setViewing(null);
              void playSound("slap", "interface");
            })
            .catch((e) => notify(messageError(e, target.nome)));
        }}
      />
    </div>
  );
}
